import { describe, expect, it, vi } from 'vitest'

import { createGraphQLClient } from '@/api/client'
import { CTX_ADMIN_RESOURCE, CTX_PUBLIC_AUTHORIZATION, ENDPOINT } from '@/api/endpoints'
import { InfoAdminAfterLoginDocument } from '@/api/operations/adminResource/queries'
import { LoginAdminDocument } from '@/api/operations/publicAuthorization/loginAdmin'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/api/tokenStore'

import { graphQLError, stubGraphQL } from '../helpers/graphql'

const ADMIN = { infoAdminAfterLogin: { _id: '65f0000000000000000000a1', email: 'admin@marketplace.it' } }

const refreshed = (accessToken: string) => ({ data: { refresh: { status: true, accessToken } } })

/**
 * What the backend answers the loser of a multi-tab refresh race (E14-S04): a 409 carrying the one
 * `extensions.code` on the platform, and no token of any kind — the grace branch mints nothing.
 */
const raceLost = {
	errors: [graphQLError('Refresh In Progress', 'Retry with the current cookie.', 409, 'REFRESH_RACE_RETRY')],
	status: 409
}

const setup = () => {
	const onSessionLost = vi.fn()
	return { client: createGraphQLClient({ onSessionLost }), onSessionLost }
}

const info = (client: ReturnType<typeof setup>['client']) =>
	client.query(InfoAdminAfterLoginDocument, {}, CTX_ADMIN_RESOURCE).toPromise()

describe('createGraphQLClient', () => {
	it('defaults to the admin-resource endpoint and sends the refresh cookie', async () => {
		const stub = stubGraphQL({ InfoAdminAfterLogin: { data: ADMIN } })
		setAccessToken('tok-1')

		const { client } = setup()
		await client.query(InfoAdminAfterLoginDocument, {}).toPromise()

		expect(stub.calls[0]?.url).toBe(ENDPOINT.adminResource)
		// Without `credentials: 'include'` the httpOnly refresh cookie never leaves the browser and every
		// reload ends at the login page.
		expect(stub.calls[0]?.credentials).toBe('include')
	})

	// urql defaults queries to GET (`preferGetMethod: 'within-url-limit'`), and every service builds its
	// ApolloServer with `csrfPrevention: true` — which rejects a GET carrying none of the preflight
	// headers urql omits. Left at the default, every query short enough to fit in a URL fails while
	// mutations succeed.
	it('sends queries as POST, not GET', async () => {
		const stub = stubGraphQL({ InfoAdminAfterLogin: { data: ADMIN } })
		setAccessToken('tok-1')

		const { client } = setup()
		await info(client)

		expect(stub.calls[0]?.method).toBe('POST')
		expect(stub.calls[0]?.url).toBe(ENDPOINT.adminResource)
	})

	it('sends the access token as `Bearer access:<token>`', async () => {
		const stub = stubGraphQL({ InfoAdminAfterLogin: { data: ADMIN } })
		setAccessToken('tok-1')

		const { client } = setup()
		await info(client)

		// The `access:` prefix is part of the Redis key the backend looks the token up under, not
		// decoration: without it the lookup misses and the service answers 498.
		expect(stub.calls[0]?.authorization).toBe('Bearer access:tok-1')
	})

	it('sends no Authorization header to the public endpoint', async () => {
		const stub = stubGraphQL({ LoginAdmin: { data: { loginAdmin: { accessToken: 'tok-1' } } } })
		clearAccessToken()

		const { client } = setup()
		await client
			.mutation(
				LoginAdminDocument,
				{ email: 'admin@marketplace.it', password: 'password123', rememberMe: false },
				CTX_PUBLIC_AUTHORIZATION
			)
			.toPromise()

		expect(stub.calls).toHaveLength(1)
		expect(stub.calls[0]?.url).toBe(ENDPOINT.publicAuthorization)
		expect(stub.calls[0]?.authorization).toBeNull()
	})

	// The page-reload story: the access token lives in memory, a reload wipes it, and the first
	// authenticated operation after the reload re-mints it from the cookie instead of bouncing the
	// admin to the login page.
	it('refreshes before sending when there is no token yet', async () => {
		const stub = stubGraphQL({ Refresh: refreshed('tok-2'), InfoAdminAfterLogin: { data: ADMIN } })
		clearAccessToken()

		const { client, onSessionLost } = setup()
		const result = await info(client)

		expect(stub.calls.map((call) => call.operationName)).toEqual(['Refresh', 'InfoAdminAfterLogin'])
		expect(stub.calls[0]?.url).toBe(ENDPOINT.adminAuthorization)
		expect(stub.calls[1]?.authorization).toBe('Bearer access:tok-2')
		expect(result.data).toEqual(ADMIN)
		expect(getAccessToken()).toBe('tok-2')
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	it('refreshes and retries when the token has expired', async () => {
		const stub = stubGraphQL({
			InfoAdminAfterLogin: [{ errors: [graphQLError('Invalid token', undefined, 498)], status: 498 }, { data: ADMIN }],
			Refresh: refreshed('tok-2')
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		const result = await info(client)

		expect(stub.calls.map((call) => call.operationName)).toEqual(['InfoAdminAfterLogin', 'Refresh', 'InfoAdminAfterLogin'])
		expect(stub.calls[0]?.authorization).toBe('Bearer access:tok-1')
		expect(stub.calls[2]?.authorization).toBe('Bearer access:tok-2')
		expect(result.error).toBeUndefined()
		expect(result.data).toEqual(ADMIN)
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	it('does not retry a failure that is not 498', async () => {
		const stub = stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid data', undefined, 400)], status: 400 },
			Refresh: refreshed('tok-2')
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		const result = await info(client)

		expect(stub.calls.map((call) => call.operationName)).toEqual(['InfoAdminAfterLogin'])
		expect(result.error?.message).toContain('Invalid data')
		expect(getAccessToken()).toBe('tok-1')
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	it('ends the session when the refresh mutation reports failure', async () => {
		const stub = stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
			Refresh: { data: { refresh: { status: false, accessToken: '' } } }
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(onSessionLost).toHaveBeenCalled()
		expect(getAccessToken()).toBeNull()
		// Sent once. The retry loop of E14-S04 is for the lost race and nothing else: re-sending a cookie
		// the backend has already refused would triple the cost of every genuine expiry.
		expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(1)
	})

	// `status: false` with a token in the same payload is a contradiction, and the reason the check is
	// an `&&` chain rather than a token test alone: the flag is the service's answer, the token is only
	// what it hands over when the answer was yes. Taking the token here would revive a session the
	// backend has just said is over.
	it('ends the session when the refresh reports failure but still returns a token', async () => {
		stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
			Refresh: { data: { refresh: { status: false, accessToken: 'tok-2' } } }
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(onSessionLost).toHaveBeenCalled()
		expect(getAccessToken()).toBeNull()
	})

	// A body with no `data` at all: the field is non-null in the schema, so Apollo nulls the whole
	// response rather than the one field. Nothing is left to read the status off.
	it('ends the session when the refresh answers without data', async () => {
		stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
			Refresh: {}
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(onSessionLost).toHaveBeenCalled()
		expect(getAccessToken()).toBeNull()
	})

	// `status: true` with an empty token is the one case the schema cannot express — the field is
	// non-null, so a blank string is the service saying it minted nothing.
	it('ends the session when the refresh returns an empty token', async () => {
		stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
			Refresh: { data: { refresh: { status: true, accessToken: '' } } }
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(onSessionLost).toHaveBeenCalled()
		expect(getAccessToken()).toBeNull()
	})

	it('ends the session when the refresh itself errors', async () => {
		stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
			Refresh: { errors: [graphQLError('Session not found', undefined, 401)], status: 401 }
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(onSessionLost).toHaveBeenCalled()
		expect(getAccessToken()).toBeNull()
	})

	/*
	 * E14-S04, the whole point of the grace window. Two tabs reload together, both send the same refresh
	 * cookie, one loses — and the loser must not be logged out of every session it has. The backend answers
	 * a code rather than a 498, and the client sends the refresh again with the cookie the winner has by
	 * then written into the shared jar.
	 */
	it('retries a refresh that lost a multi-tab race and keeps the session', async () => {
		const stub = stubGraphQL({
			InfoAdminAfterLogin: [{ errors: [graphQLError('Invalid token', undefined, 498)], status: 498 }, { data: ADMIN }],
			Refresh: [raceLost, refreshed('tok-2')]
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		const result = await info(client)

		expect(stub.calls.map((call) => call.operationName)).toEqual([
			'InfoAdminAfterLogin',
			'Refresh',
			'Refresh',
			'InfoAdminAfterLogin'
		])
		expect(result.error).toBeUndefined()
		expect(result.data).toEqual(ADMIN)
		expect(getAccessToken()).toBe('tok-2')
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	// Two retries, not one: a tab can lose twice in a row when three are open, and the second retry is the
	// difference between an unlucky admin staying signed in and being sent back to the login page.
	it('retries a second time and still keeps the session', async () => {
		const stub = stubGraphQL({
			InfoAdminAfterLogin: [{ errors: [graphQLError('Invalid token', undefined, 498)], status: 498 }, { data: ADMIN }],
			Refresh: [raceLost, raceLost, refreshed('tok-2')]
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		const result = await info(client)

		expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(3)
		expect(result.data).toEqual(ADMIN)
		expect(getAccessToken()).toBe('tok-2')
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	// And it stops. A backend answering the same code forever is not a race any more, and a client that
	// keeps asking would hammer the refresh endpoint into its own rate limiter (E14-S08) on every operation.
	it('gives up after two retries and ends the session', async () => {
		const stub = stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
			Refresh: raceLost
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(3)
		expect(onSessionLost).toHaveBeenCalled()
		expect(getAccessToken()).toBeNull()
	})

	it.each([
		['401 no session', 401],
		['412 account disabled', 412],
		['499 token missing', 499]
	])('ends the session on %s', async (_label, status) => {
		stubGraphQL({ InfoAdminAfterLogin: { errors: [graphQLError('Fine', undefined, status)], status } })
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(onSessionLost).toHaveBeenCalledTimes(1)
		expect(getAccessToken()).toBeNull()
	})

	it('keeps the session on an ordinary domain failure', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { errors: [graphQLError('Invalid data', undefined, 400)], status: 400 } })
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		await info(client)

		expect(onSessionLost).not.toHaveBeenCalled()
		expect(getAccessToken()).toBe('tok-1')
	})

	// A dropped connection is not a dead session: the admin is almost certainly still signed in and
	// the wifi is not. Logging them out here would lose whatever they were typing.
	it('keeps the session on a transport failure', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { networkError: 'offline' } })
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		const result = await info(client)

		expect(result.error?.networkError).toBeDefined()
		expect(onSessionLost).not.toHaveBeenCalled()
		expect(getAccessToken()).toBe('tok-1')
	})
})
