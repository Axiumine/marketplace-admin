import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'
import { DEFAULT_REDIRECT, safeRedirect } from '@/pages/LoadingPage'

import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { ADMIN, renderRoute } from '../helpers/render'

const signedIn = { data: { infoAdminAfterLogin: ADMIN } }

describe('safeRedirect', () => {
	it('keeps a same-site path', () => {
		expect(safeRedirect('/settings')).toBe('/settings')
	})

	it('falls back when there is no target', () => {
		expect(safeRedirect(undefined)).toBe(DEFAULT_REDIRECT)
	})

	// The open-redirect cases. The target arrives in a query string, so anyone can hand an admin a
	// link to `/loading?redirect=…` and have this app forward them somewhere else wearing a trusted
	// domain — after a successful login, which is exactly when a phishing page is most convincing.
	it('refuses an absolute URL', () => {
		expect(safeRedirect('https://evil.example/login')).toBe(DEFAULT_REDIRECT)
	})

	// `//evil.example` is a protocol-relative URL, not a path — and it starts with a slash, so a
	// `startsWith('/')` check on its own lets it through.
	it('refuses a protocol-relative URL', () => {
		expect(safeRedirect('//evil.example')).toBe(DEFAULT_REDIRECT)
	})

	it('refuses a relative path', () => {
		expect(safeRedirect('settings')).toBe(DEFAULT_REDIRECT)
	})

	it('refuses an empty target', () => {
		expect(safeRedirect('')).toBe(DEFAULT_REDIRECT)
	})
})

describe('LoadingPage', () => {
	it('shows a spinner while the session is being restored', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { pending: true } })
		await renderRoute('/loading')

		expect(screen.getByText('Loading session')).toBeInTheDocument()
	})

	it('stores the identity and lands on the dashboard', async () => {
		stubGraphQL({ InfoAdminAfterLogin: signedIn })
		const { router } = await renderRoute('/loading', { session: null })

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/home')
		})
		expect(getSession()).toEqual(ADMIN)
	})

	it('honours a same-site redirect target', async () => {
		stubGraphQL({ InfoAdminAfterLogin: signedIn })
		const { router } = await renderRoute('/loading?redirect=%2Fsettings', { session: null })

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/settings')
		})
	})

	/**
	 * The router parses search values with `JSON.parse`, so `?redirect=123` arrives as the number 123 and
	 * not as the string "123". `safeRedirect` is typed for `string | undefined` and would call
	 * `.startsWith` on it; the route's search schema is what keeps that from ever happening, by rejecting
	 * anything that is not a string into `undefined` before the page is rendered.
	 *
	 * Rejecting has to mean *replacing*, not dropping: a route's search is merged over its parent's, and
	 * the root route validates nothing — so a key the loading schema simply omitted would come back
	 * through unvalidated from above.
	 */
	it('ignores a redirect target that is not a string', async () => {
		stubGraphQL({ InfoAdminAfterLogin: signedIn })
		const { router } = await renderRoute('/loading?redirect=123', { session: null })

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/home')
		})
	})

	it('sends an off-site redirect target to the dashboard instead', async () => {
		stubGraphQL({ InfoAdminAfterLogin: signedIn })
		const { router } = await renderRoute('/loading?redirect=https%3A%2F%2Fevil.example', { session: null })

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/home')
		})
	})

	/**
	 * The page-reload story, end to end. The access token lives in memory, so a reload has none: issuing
	 * this query is what re-mints it — urql's `willAuthError` sees a null token, runs `refresh` against
	 * the httpOnly cookie, and only then sends the query.
	 *
	 * The order of the two calls is asserted for that reason. A cheaper "is a cookie there?" check would
	 * pass for an expired or revoked session — the cookie is httpOnly, so presence is all a browser can
	 * see — and the app would render in full before failing on the first piece of data it wanted.
	 */
	it('refreshes from the cookie when there is no token in memory', async () => {
		const stub = stubGraphQL({
			Refresh: { data: { refresh: { status: true, accessToken: 'tok-2' } } },
			InfoAdminAfterLogin: signedIn
		})
		const { router } = await renderRoute('/loading', { token: null, session: null })

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/home')
		})
		expect(stub.calls.map((call) => call.operationName)).toEqual(['Refresh', 'InfoAdminAfterLogin'])
		expect(getAccessToken()).toBe('tok-2')
	})

	it('clears everything and returns to the login page when the session is gone', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { errors: [graphQLError('No session', undefined, 401)], status: 401 } })
		const { router } = await renderRoute('/loading', { session: null })

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/')
		})
		expect(getAccessToken()).toBeNull()
		expect(getSession()).toBeNull()
	})

	it('renders', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { pending: true } })
		const { container } = await renderRoute('/loading')

		expect(container).toMatchSnapshot()
	})
})
