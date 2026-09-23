/**
 * A circuit breaker for the refresh mutation's network leg.
 *
 * `client.ts`'s `refreshAuth` already keeps the session alive when a refresh attempt never reaches the
 * server (B28) — but on its own that only fixes the *first* dropped connection. During a sustained
 * outage every operation that hits an expired access token calls `refreshAuth` again, and with no memory
 * of the failures that came before, each one dials straight back out: one refresh attempt per operation,
 * with nothing between them. This is what adds the missing backoff, scoped to one breaker per client so
 * two browser tabs — or, on a repo built for SSR, two requests — never share a cooldown that belongs to
 * neither of them.
 */

/** The window a run of consecutive transport failures never grows past. */
const MAX_COOLDOWN_MS = 30_000

/** The window after the first transport failure; each further one doubles it, up to the cap above. */
const BASE_COOLDOWN_MS = 1_000

export interface RefreshBreaker {
	/**
	 * True while the cooldown opened by a transport failure is still running. `refreshAuth` reads this
	 * before making any network call — a call made while this is true is exactly the bug being fixed.
	 */
	isOpen: () => boolean

	/**
	 * Call once per refresh attempt that got no response at all. Opens a cooldown window of
	 * `min(30_000, 1_000 * 2^(n-1))` ms, `n` being the number of such failures in a row since the last
	 * `reset`.
	 */
	recordTransportFailure: () => void

	/** Call on a refresh that mints a token, and on the browser's `online` event. */
	reset: () => void
}

/**
 * @param now - Defaults to `Date.now`; a test passes its own clock instead of waiting on real timers.
 */
export const createRefreshBreaker = (now: () => number = Date.now): RefreshBreaker => {
	let consecutiveTransportFailures = 0
	let openUntil = 0

	return {
		isOpen: () => now() < openUntil,

		recordTransportFailure: () => {
			consecutiveTransportFailures += 1
			const cooldownMs = Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** (consecutiveTransportFailures - 1))
			openUntil = now() + cooldownMs
		},

		reset: () => {
			consecutiveTransportFailures = 0
			openUntil = 0
		}
	}
}
