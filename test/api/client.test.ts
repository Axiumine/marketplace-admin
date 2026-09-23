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
 * What the backend answers the loser of a multi-tab refresh race: a 409 carrying the one
 * `extensions.code` on the platform, and no token of any kind — the grace branch mints nothing.
 */
const raceLost = {
	errors: [graphQLError('Refresh In Progress', 'Retry with the current cookie.', 409, 'REFRESH_RACE_RETRY')],
	status: 409
}

const setup = (now?: () => number) => {
	const onSessionLost = vi.fn()
	return { client: createGraphQLClient(now === undefined ? { onSessionLost } : { onSessionLost, now }), onSessionLost }
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
		// Sent once. The retry loop is for the lost race and nothing else: re-sending a cookie the backend has
		// already refused would triple the cost of every genuine expiry.
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
	 * The whole point of the grace window. Two tabs reload together, both send the same refresh cookie, one
	 * loses — and the loser must not be logged out of every session it has. The backend answers a code
	 * rather than a 498, and the client sends the refresh again with the cookie the winner has by then
	 * written into the shared jar.
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
	// keeps asking would hammer the refresh endpoint into its own rate limiter on every operation.
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

	/*
	 * ⚠️ B28. The same policy, but for the refresh itself rather than for the query that triggered it —
	 * a transport failure never reaches the server, so there is nothing here that says the session is
	 * over. The old code broke the retry loop on *any* non-race failure, transport included, and ended
	 * the session unconditionally; a dropped connection mid-reload then forced a logout an admin who was
	 * still signed in never asked for.
	 */
	it('keeps the session when the refresh itself cannot reach the server', async () => {
		stubGraphQL({
			InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
			Refresh: { networkError: 'offline' }
		})
		setAccessToken('tok-1')

		const { client, onSessionLost } = setup()
		const result = await info(client)

		expect(onSessionLost).not.toHaveBeenCalled()
		expect(getAccessToken()).toBe('tok-1')
		// The queued operation still gets an answer — it retries with the token it already had, which the
		// stub answers with the same 498 it started with, since nothing minted a new one.
		expect(result.error).toBeDefined()
	})

	/*
	 * The backoff itself. During a sustained outage every operation that hits a 401/auth error used to
	 * fire its own refresh attempt with nothing between them; these cover the cooldown that now sits
	 * between one transport failure and the next attempt.
	 */
	describe('refresh backoff', () => {
		it('opens a cooldown after a transport failure and makes no network call while it is open', async () => {
			let time = 1_000_000
			const stub = stubGraphQL({
				InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
				Refresh: { networkError: 'offline' }
			})
			setAccessToken('tok-1')

			const { client, onSessionLost } = setup(() => time)

			// First operation: the transport failure opens a 1s cooldown and leaves the session as is.
			await info(client)
			expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(1)
			expect(onSessionLost).not.toHaveBeenCalled()
			expect(getAccessToken()).toBe('tok-1')

			// A second, later operation still inside the window: refreshAuth must not touch the network at
			// all — not one more call to Refresh — even though this operation's own 498 still asks for one.
			time += 999
			const result = await info(client)
			expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(1)
			expect(result.error).toBeDefined()
			expect(onSessionLost).not.toHaveBeenCalled()
		})

		it('calls Refresh again once the cooldown has elapsed', async () => {
			let time = 1_000_000
			const stub = stubGraphQL({
				InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
				Refresh: [{ networkError: 'offline' }, refreshed('tok-2')]
			})
			setAccessToken('tok-1')

			const { client } = setup(() => time)

			await info(client) // opens the 1s cooldown
			time += 1_000 // the window is `now() < openUntil`, so exactly the boundary already reads as closed
			await info(client)

			expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(2)
			expect(getAccessToken()).toBe('tok-2')
		})

		it('resets the cooldown to 1s after a successful refresh, instead of continuing the backoff', async () => {
			let time = 1_000_000
			const stub = stubGraphQL({
				InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
				Refresh: [{ networkError: 'offline' }, refreshed('tok-2'), { networkError: 'offline' }]
			})
			setAccessToken('tok-1')

			const { client } = setup(() => time)

			await info(client) // 1st transport failure: opens a 1s cooldown
			time += 1_000
			await info(client) // cooldown elapsed: Refresh succeeds and resets the breaker
			expect(getAccessToken()).toBe('tok-2')

			await info(client) // 2nd transport failure, the first one since the reset: reopens at 1s, not 2s

			// If the reset above had not happened, this run would be at n=2 and would still be inside a 2s
			// window here; only a window that reopened at 1s has already closed by this point.
			time += 1_000
			await info(client)

			expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(4)
		})

		it("resets the cooldown on the browser's online event", async () => {
			const time = 1_000_000
			const stub = stubGraphQL({
				InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
				Refresh: [{ networkError: 'offline' }, refreshed('tok-2')]
			})
			setAccessToken('tok-1')

			const { client } = setup(() => time)

			await info(client) // opens the cooldown; `time` never advances past it on its own
			window.dispatchEvent(new Event('online'))
			await info(client) // same instant: only the reset, not elapsed time, lets this one call Refresh

			expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(2)
			expect(getAccessToken()).toBe('tok-2')
		})

		it('does not open a cooldown when the refresh reports terminal failure', async () => {
			const time = 1_000_000
			const stub = stubGraphQL({
				InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
				Refresh: { data: { refresh: { status: false, accessToken: '' } } }
			})
			setAccessToken('tok-1')

			const { client, onSessionLost } = setup(() => time)

			await info(client) // terminal: ends the session, but must not touch the breaker
			await info(client) // same instant — a cooldown here would be a transport failure that never happened

			expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(2)
			expect(onSessionLost).toHaveBeenCalledTimes(2)
		})

		it('does not open a cooldown for a lost refresh race', async () => {
			const time = 1_000_000
			const stub = stubGraphQL({
				InfoAdminAfterLogin: { errors: [graphQLError('Invalid token', undefined, 498)], status: 498 },
				Refresh: [raceLost, refreshed('tok-2'), refreshed('tok-3')]
			})
			setAccessToken('tok-1')

			const { client } = setup(() => time)

			await info(client) // wins the race on retry — no transport failure anywhere in this call
			expect(getAccessToken()).toBe('tok-2')

			await info(client) // same instant: a cooldown here would gate this second refresh instead of calling it

			expect(stub.calls.filter((call) => call.operationName === 'Refresh')).toHaveLength(3)
			expect(getAccessToken()).toBe('tok-3')
		})
	})
})
