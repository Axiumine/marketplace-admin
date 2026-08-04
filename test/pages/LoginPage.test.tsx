import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'

import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { ADMIN, renderRoute } from '../helpers/render'

const signedOut = { token: null, session: null } as const

const fillIn = async (email: string, password: string) => {
	await userEvent.type(screen.getByLabelText('Email'), email)
	await userEvent.type(screen.getByLabelText('Password'), password)
}

const submit = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
	it('renders the login card', async () => {
		stubGraphQL({})
		const { container } = await renderRoute('/', signedOut)

		expect(screen.getByRole('heading', { name: 'Marketplace — operator panel' })).toBeInTheDocument()
		expect(container).toMatchSnapshot()
	})

	// ⚠️ The platform's only recovery pair looks the address up in the `shopOwner` collection, so it
	// answers "not found" for every operator account. The note is asserted, and the absence of a button
	// with it: a recovery form added later without a matching `admin`-scoped resolver is a dead end that
	// reads as a problem with the operator's own credentials.
	it('explains that operator password recovery is manual instead of offering a dead form', async () => {
		stubGraphQL({})
		await renderRoute('/', signedOut)

		expect(screen.getByText(/Il recovery standalone non è available per gli account operator/)).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Recupera/ })).not.toBeInTheDocument()
	})

	// ⚠️ Asserted, not assumed. A "development only" default email and password is substituted into the
	// client bundle statically by Vite, so it ships to production in plain text; this test is what stops
	// one being added for convenience.
	it('pre-fills nothing', async () => {
		stubGraphQL({})
		await renderRoute('/', signedOut)

		expect(screen.getByLabelText('Email')).toHaveValue('')
		expect(screen.getByLabelText('Password')).toHaveValue('')
		expect(screen.getByLabelText('Remember me on this device')).not.toBeChecked()
	})

	// `operator@marketplace`, not `operatore`: the field is `type="email"`, so a value with no `@` fails
	// the browser's own constraint validation and the submit event never fires — nothing to assert about
	// this app. A missing TLD is the gap between the two checks: the HTML validator accepts it, the zod
	// schema does not, and that is the branch under test.
	it('refuses a malformed email without a round-trip', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/', signedOut)

		await fillIn('operator@marketplace', 'password123')
		await submit()

		expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('refuses an empty password without a round-trip', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/', signedOut)

		await userEvent.type(screen.getByLabelText('Email'), 'operator@marketplace.it')
		await submit()

		expect(await screen.findByText('Enter the password')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// No minimum length on the password: the rules live on the backend, and refusing to even try an
	// existing password because it is "too short" locks out anyone whose account predates the policy.
	it('sends a short password rather than rejecting it locally', async () => {
		const stub = stubGraphQL({ LoginAdmin: { errors: [graphQLError('Invalid credentialse', undefined, 400)], status: 400 } })
		await renderRoute('/', signedOut)

		await fillIn('operator@marketplace.it', 'corta')
		await submit()

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({ email: 'operator@marketplace.it', password: 'corta', rememberMe: false })
	})

	it('signs in, stores the token and lands on the dashboard', async () => {
		const stub = stubGraphQL({
			LoginAdmin: { data: { loginAdmin: { accessToken: 'tok-1' } } },
			InfoAdminAfterLogin: { data: { infoAdminAfterLogin: ADMIN } }
		})
		const { router } = await renderRoute('/', signedOut)

		await fillIn('operator@marketplace.it', 'password123')
		await submit()

		expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
		expect(getAccessToken()).toBe('tok-1')
		expect(getSession()).toEqual(ADMIN)
		expect(router.state.location.pathname).toBe('/home')
		expect(stub.calls[0]?.url).toBe(ENDPOINT.publicAuthorization)
	})

	// `rememberMe` controls the lifetime of the refresh-token cookie server-side, so the checkbox has to
	// reach the mutation — a form that renders it but hardcodes `false` looks identical on screen and
	// silently gives every operator a session that dies with the browser.
	it('sends rememberMe when the box is ticked', async () => {
		const stub = stubGraphQL({
			LoginAdmin: { data: { loginAdmin: { accessToken: 'tok-1' } } },
			InfoAdminAfterLogin: { data: { infoAdminAfterLogin: ADMIN } }
		})
		await renderRoute('/', signedOut)

		await fillIn('operator@marketplace.it', 'password123')
		await userEvent.click(screen.getByLabelText('Remember me on this device'))
		await submit()

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toEqual({
				email: 'operator@marketplace.it',
				password: 'password123',
				rememberMe: true
			})
		})
	})

	it('reports the backend error and stays put', async () => {
		stubGraphQL({
			LoginAdmin: {
				errors: [graphQLError('Invalid credentialse', 'Email o password non corrette', 400)],
				status: 400
			}
		})
		const { router } = await renderRoute('/', signedOut)

		await fillIn('operator@marketplace.it', 'password123')
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('Email o password non corrette')
		expect(getAccessToken()).toBeNull()
		expect(router.state.location.pathname).toBe('/')
	})

	// The one case the schema cannot express: `accessToken` is non-null, so an empty string is the
	// service answering without minting a session. Treating it as success stores `''`, and the operator
	// lands on a dashboard whose every query then fails with no explanation of why.
	it('reports an empty token as a failed login', async () => {
		stubGraphQL({ LoginAdmin: { data: { loginAdmin: { accessToken: '' } } } })
		const { router } = await renderRoute('/', signedOut)

		await fillIn('operator@marketplace.it', 'password123')
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentialse')
		expect(getAccessToken()).toBeNull()
		expect(router.state.location.pathname).toBe('/')
	})
})
