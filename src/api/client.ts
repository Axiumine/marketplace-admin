import { cacheExchange, Client, fetchExchange, mapExchange } from '@urql/core'
import { authExchange } from '@urql/exchange-auth'

import { CTX_ADMIN_AUTHORIZATION, ENDPOINT, requiresAuth } from '@/api/endpoints'
import { isAuthExpired, isRefreshRaceRetry, isSessionGone, statusOf } from '@/api/errors'
import { RefreshDocument } from '@/api/operations/adminAuthorization/refresh'
import { createRefreshBreaker } from '@/api/refreshBreaker'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/api/tokenStore'

/**
 * How many times a `refresh` refused with `REFRESH_RACE_RETRY` is sent again before the session is treated
 * as lost. Retries, not attempts: the first send is not one, so this is three calls at worst.
 */
const REFRESH_RACE_RETRIES = 2

export interface CreateGraphQLClientOptions {
	/**
	 * Called when the refresh mutation cannot mint a new access token. The session is over: the caller
	 * drops the admin back to the login page. Kept as a callback rather than a router import so the
	 * API layer stays independent of TanStack Router, and so a test can observe it directly.
	 */
	onSessionLost: () => void

	/** The refresh breaker's clock. Defaults to `Date.now`; a test passes its own instead. */
	now?: () => number

	/**
	 * Tears down the client's `online` listener when aborted. Production callers pass nothing: the
	 * client lives as long as the page, and the listener should too. A test that builds a client per
	 * test passes a per-test controller's signal and aborts it in teardown, or the shared jsdom
	 * `window` accumulates one listener per client the suite ever constructs.
	 */
	signal?: AbortSignal
}

/**
 * The single urql client.
 *
 * `cacheExchange` is the document cache, not Graphcache: results are keyed by query + variables, and
 * a mutation invalidates every cached query that returned one of the `__typename`s the mutation
 * touched. That falls down in exactly one case — a mutation that creates or deletes, where the
 * response mentions no typename of the list it changed — and this app's create/delete mutations
 * return a bare `Boolean`, so every one of them has to name the affected types explicitly through
 * `additionalTypenames` at the call site. See src/features/shopOwners.
 *
 * `fetchOptions.credentials: 'include'` is what carries the refresh cookie. It works because the app
 * and the services share one origin; see the comment in vite.config.ts.
 */
export const createGraphQLClient = ({ onSessionLost, now = Date.now, signal }: CreateGraphQLClientOptions): Client => {
	/*
	 * One breaker per `Client`, not a module-level one: `authExchange`'s initializer runs once per
	 * client, so this closure already gives every browser tab, and every urql client this repo ever
	 * constructs, its own cooldown — never one client's outage silencing another's retries.
	 */
	const refreshBreaker = createRefreshBreaker(now)

	// No `typeof window` guard: this bundle is a Vite SPA with no SSR entry point, so `window` always
	// exists by the time a `Client` is constructed — an untestable branch this repo's 100%-branch gate
	// does not allow. A repo built for SSR (ADR-019) needs the guard; this one does not.
	//
	// The `signal.aborted` guard is explicit rather than left to `addEventListener` itself: per spec an
	// already-aborted signal is supposed to register nothing on its own, but nothing here depends on
	// that — an aborted signal never needs a listener it would just remove again, so this is the same
	// outcome either way. Omitting the option entirely when there is no `signal` is what
	// `exactOptionalPropertyTypes` demands — `AddEventListenerOptions['signal']` has no `undefined` in
	// its type, so `{ signal }` does not typecheck when `signal` is absent. A per-test controller
	// aborted in teardown stops the listener from outliving the client that registered it, instead of
	// accumulating on the shared jsdom `window`; production passes nothing, so the client lives as long
	// as the page, as before.
	if (signal?.aborted !== true) {
		window.addEventListener('online', () => refreshBreaker.reset(), signal === undefined ? undefined : { signal })
	}

	return new Client({
		url: ENDPOINT.adminResource,
		fetchOptions: { credentials: 'include' },
		/**
		 * POST for queries too, against urql's default of `'within-url-limit'`.
		 *
		 * Every service constructs its `ApolloServer` with `csrfPrevention: true`, which rejects a GET
		 * that carries none of the preflight-forcing headers (`apollo-require-preflight`,
		 * `x-apollo-operation-name`) — and urql sends none of them. Left at the default, every query
		 * short enough to fit in a URL comes back as "This operation has been blocked as a potential
		 * Cross-Site Request Forgery" while mutations work, which reads as a schema problem.
		 *
		 * It is also the right call independently of Apollo: `credentials: 'include'` plus a GET is the
		 * exact shape CSRF prevention exists to stop, and a query string ends up in nginx access logs
		 * and browser history — an admin searching for a person would log that person's name.
		 */
		preferGetMethod: false,
		exchanges: [
			cacheExchange,
			authExchange(async (utils) => ({
				addAuthToOperation(operation) {
					const token = getAccessToken()
					if (token === null) return operation

					// `Bearer access:<token>` — the `access:` prefix is part of the Redis key the backend
					// looks the token up under, not decoration. Without it the lookup misses and the
					// service answers 498.
					return utils.appendHeaders(operation, { Authorization: `Bearer access:${token}` })
				},

				/**
				 * Refresh *before* sending, when there is no token to send and the endpoint needs one.
				 * This is the whole page-reload story: the access token lives in memory, a reload wipes
				 * it, and the first authenticated operation after the reload silently re-mints it from
				 * the httpOnly cookie instead of bouncing the admin to the login page.
				 */
				willAuthError(operation) {
					return getAccessToken() === null && requiresAuth(operation.context.url)
				},

				/** 498 is the platform's "access token expired or deleted". Nothing else is retryable. */
				didAuthError(error) {
					return isAuthExpired(error)
				},

				/**
				 * Mint a new access token from the refresh cookie, retrying the one failure that is not a
				 * failure.
				 *
				 * Two tabs reloading at the same moment both send the same refresh cookie. One wins and
				 * rotates it; the other presents a token the backend consumed milliseconds ago, and inside
				 * the grace window it answers `REFRESH_RACE_RETRY` instead of revoking the family. By then
				 * the winner's `Set-Cookie` is in the jar both tabs share, so the retry sends the current
				 * token and succeeds — which is why there is no backoff here: the thing being waited for has
				 * already happened, and a timer would only delay the admin's first screen.
				 *
				 * Bounded at `REFRESH_RACE_RETRIES` because the loop is otherwise unbounded on a backend
				 * that keeps answering the same code. Two is a race lost twice in a row; a third is not a
				 * race any more, and a logout is the honest answer.
				 */
				async refreshAuth() {
					/*
					 * ⚠️ B28 fixed the single dropped connection; this is the sustained outage it left open.
					 * With no memory of past failures, every operation that hits an expired token calls this
					 * function again, and each one dials straight back out — one refresh attempt per
					 * operation, no backoff between them. While the breaker is open, skip the network call
					 * entirely and keep the session exactly as B28 already does for a lone transport failure:
					 * the operation that triggered this call gets its own failure back, as a network error.
					 */
					if (refreshBreaker.isOpen()) return

					for (let attempt = 0; attempt <= REFRESH_RACE_RETRIES; attempt++) {
						const result = await utils.mutate(RefreshDocument, {}, CTX_ADMIN_AUTHORIZATION)
						const refresh = result.data?.refresh

						if (refresh !== undefined && refresh.status && refresh.accessToken !== '') {
							refreshBreaker.reset()
							setAccessToken(refresh.accessToken)
							return
						}

						/*
						 * ⚠️ A bare transport failure — offline, DNS, a dropped connection mid-reload — never
						 * reached the server, so there is nothing here to say the session is over. The same
						 * policy `mapExchange` applies to every other operation ("a dropped connection is not a
						 * dead session"), mirrored here through the same status-based check: `statusOf` answers
						 * `undefined` only when the error carries no response at all, never for a real refusal —
						 * a 401, a 409 race, a 498. Leave the token as it is and let the queued operation this
						 * refresh was for surface its own failure; a later operation gets its own chance to
						 * refresh once the connection is back — or, during a run of these, once the breaker's
						 * cooldown elapses.
						 */
						if (result.error !== undefined && statusOf(result.error) === undefined) {
							refreshBreaker.recordTransportFailure()
							return
						}

						// Every other failure is terminal: a second attempt would present the same cookie to a
						// backend that has already refused it.
						if (!isRefreshRaceRetry(result.error)) break
					}

					clearAccessToken()
					onSessionLost()
				}
			})),

			/**
			 * The other way a session ends.
			 *
			 * `authExchange` only knows about 498, because 498 is the only status a refresh can fix. The
			 * three in `isSessionGone` — 401 no session, 412 account disabled/deleted/awaiting approval,
			 * 499 token required — are terminal, and they arrive on ordinary domain operations rather
			 * than on the refresh. Without this the admin would sit on a screen showing a red Alert,
			 * still nominally "logged in", with every subsequent action failing the same way.
			 *
			 * Placed below `authExchange` in the chain, so results reach it on the way back up before the
			 * retry logic sees them. A 498 passes straight through — it is not in `SESSION_GONE`, and
			 * whether to retry it is `authExchange`'s decision, not this one's.
			 */
			mapExchange({
				onError(error) {
					if (!isSessionGone(error)) return

					clearAccessToken()
					onSessionLost()
				}
			}),
			fetchExchange
		]
	})
}
