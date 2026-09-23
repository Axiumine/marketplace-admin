import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { trackUnhandledRejections } from '../../helpers/rejections'
import { renderRoute } from '../../helpers/render'

/**
 * `LoginForm` calls `useNavigate`, so it needs a real router — rendered through the root route it
 * actually sits on, the same way `LoginPage.test.tsx` does, and signed out: the interesting default the
 * app renders this form under.
 */
describe('LoginForm', () => {
	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/', { token: null, session: null })

		expect(screen.getByRole('heading', { name: 'Login', level: 2 }).closest('form')).toMatchSnapshot()
	})

	// `result.data?.loginAdmin.accessToken` reads the mutation's answer through an optional chain
	// precisely because a response that carries `errors` and no `data` is the expected shape of a
	// failed login, not an exceptional one. Without the `?.` this line throws instead of reading
	// `undefined`, inside the async submit handler that `onSubmit={(event) => { void onSubmit(event) }}`
	// never awaits — a throw there is a promise rejection nothing on screen ever shows, so the only way
	// to see it is to catch it the way Node itself does.
	it('reads a data-less error response without throwing inside the submit handler', async () => {
		const rejections = trackUnhandledRejections()

		stubGraphQL({ LoginAdmin: { errors: [graphQLError('Invalid credentials', 'Email or password not correct')] } })
		await renderRoute('/', { token: null, session: null })

		await userEvent.type(screen.getByLabelText('Email'), 'admin@marketplace.test')
		await userEvent.type(screen.getByLabelText('Password'), 'password123')
		await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('Email or password not correct')

		await rejections.settle()
		rejections.stop()
		expect(rejections.reasons).toEqual([])
	})
})

/**
 * ⚠️ B2. `guardPublicLogin` spends the Turnstile token at Cloudflare on the very first request that
 * carries it, before password validation even runs — so a mistyped password must not leave the widget
 * holding the same already-spent token for the retry, or every later attempt is refused as a duplicate
 * regardless of what the admin types.
 *
 * A real site key is required to observe this at all: with none configured (the default in every other
 * test in this file, and the state of a developer machine) the widget never renders, and there is
 * nothing here to remount. `vi.resetModules()` plus a dynamic re-import is what lets one test load the
 * env-driven `Turnstile` module with a key — see the identical technique, and why it is needed, in
 * `Turnstile.test.tsx`.
 */
describe('LoginForm — Turnstile reset after a refusal', () => {
	const SCRIPT_ID = 'cf-turnstile-script'
	const SITE_KEY = '0x4AAAAAAABBBBBBBBCCCCCC'

	type RenderFn = NonNullable<typeof globalThis.turnstile>['render']
	type RenderOptions = Parameters<RenderFn>[1]

	interface WidgetApi {
		readonly render: Mock<RenderFn>
		readonly remove: ReturnType<typeof vi.fn>
		readonly optionsOf: (widgetId: string) => RenderOptions
	}

	/** One `render`/`remove` pair shared by every widget this test mounts, keyed by the id it hands back. */
	const widgetApi = (): WidgetApi => {
		let next = 0
		const calls = new Map<string, RenderOptions>()
		const render = vi.fn<RenderFn>((_element, options) => {
			next += 1
			const id = `widget-${next}`
			calls.set(id, options)
			return id
		})
		const remove = vi.fn()

		vi.stubGlobal('turnstile', { render, remove })

		return { render, remove, optionsOf: (id) => calls.get(id) as RenderOptions }
	}

	const scriptLoads = async (): Promise<void> => {
		const script = await waitFor(() => {
			const found = document.getElementById(SCRIPT_ID)
			expect(found).not.toBeNull()
			return found as HTMLScriptElement
		})

		await act(async () => {
			script.dispatchEvent(new Event('load'))
			await Promise.resolve()
		})
	}

	beforeEach(() => {
		document.getElementById(SCRIPT_ID)?.remove()
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		document.getElementById(SCRIPT_ID)?.remove()
	})

	it('remounts the widget once the login is refused, instead of leaving the spent token in place', async () => {
		vi.stubEnv('VITE_TURNSTILE_SITE_KEY', SITE_KEY)
		vi.resetModules()

		const { stubGraphQL: freshStubGraphQL } = await import('../../helpers/graphql')
		const { renderRoute: freshRenderRoute } = await import('../../helpers/render')

		freshStubGraphQL({ LoginAdmin: { data: { loginAdmin: { accessToken: '' } } } })
		const api = widgetApi()
		await freshRenderRoute('/', { token: null, session: null })
		await scriptLoads()

		expect(api.render).toHaveBeenCalledTimes(1)
		act(() => {
			api.optionsOf('widget-1').callback('a-turnstile-token')
		})

		await userEvent.type(screen.getByLabelText('Email'), 'admin@marketplace.test')
		await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
		await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

		await screen.findByText('Invalid credentials')

		// The refused widget is torn down and a fresh one takes its place. That remount is the only way
		// to make Cloudflare mint a token that was not already spent verifying this attempt — the same
		// script tag is already in the document, so the new widget's own `render()` needs no second
		// `scriptLoads()` to reach it.
		expect(api.remove).toHaveBeenCalledWith('widget-1')
		await waitFor(() => {
			expect(api.render).toHaveBeenCalledTimes(2)
		})
	})
})
