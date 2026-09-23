import { useCallback, useRef, useState } from 'react'

/**
 * Holds the Turnstile token for one form.
 *
 * Three things it exists to get right:
 *
 * - **`onToken` is stable.** `Turnstile` lists it in an effect dependency, so a fresh function per
 *   render would unmount and re-render the widget on every keystroke in the surrounding form — which
 *   also discards the token the admin already earned.
 * - **The token is read through a ref at submit time, not through the state value.** A widget that
 *   solves itself between the click and the `await` would otherwise be missed, and a token that expired
 *   in that window would be sent anyway. State is still kept so a form that wants to react to a token
 *   arriving re-renders when one does.
 * - **A failed submit leaves nothing to resend.** Cloudflare's siteverify spends a token on the first
 *   request that carries it, win or lose — the server checks it before password or registration
 *   validation ever runs. Without `reset()` a mistyped password would leave every retry rejected as a
 *   duplicate token, correct input or not, until the ~300s expiry or a full reload.
 *
 * `null` is a legitimate value to submit: it is what a machine with no site key configured always sends,
 * and the server accepts it in exactly that case. See the note in `Turnstile.tsx`.
 */
export interface TurnstileToken {
	readonly token: string | null
	readonly onToken: (token: string | null) => void
	readonly read: () => string | null
	/**
	 * Bumped by `reset()`. Pass it as the `<Turnstile>` element's `key`: React only tears a component
	 * down and rebuilds it when its `key` changes, and a fresh widget is the only way to make Cloudflare
	 * mint a new token — there is no "solve again" call on the script's own API.
	 */
	readonly resetKey: number
	/**
	 * Clears the held token and bumps `resetKey`, so a form that renders `<Turnstile key={resetKey} …>`
	 * remounts the widget after a failed submit. Call it whenever a Turnstile-guarded mutation comes back
	 * refused, before the admin can retry — see the note above on why the token they already used is
	 * worthless the second time.
	 */
	readonly reset: () => void
}

export const useTurnstileToken = (): TurnstileToken => {
	const [token, setToken] = useState<string | null>(null)
	const [resetKey, setResetKey] = useState(0)
	const latest = useRef<string | null>(null)

	/*
	 * ⚠️ The three empty dependency arrays are excluded from mutation testing, and this is the one place
	 * in the repo where that is true — so it needs its reason written down rather than assumed.
	 *
	 * Stryker's `ArrayDeclaration` mutator rewrites `[]` as `['Stryker was here']`, and React compares
	 * dependency lists element by element with `Object.is`. A list whose single element is the same string
	 * literal on every render compares equal on every render, so all three callbacks keep the identity
	 * they had — the mutant produces the same behaviour as the original, for every input, and no test can
	 * tell them apart. It is an equivalent mutant, not a gap: the stability it appears to attack is
	 * asserted repeatedly in `useTurnstileToken.test.tsx`, across a re-render, a token arrival and a
	 * closure created before one.
	 *
	 * Scoped to this mutator and these three lines. A non-empty dependency list mutated the same way
	 * *does* change behaviour — it stops tracking what it named — and stays under the gate everywhere
	 * else.
	 */
	// Stryker disable ArrayDeclaration
	const onToken = useCallback((next: string | null) => {
		latest.current = next
		setToken(next)
	}, [])

	const read = useCallback(() => latest.current, [])

	const reset = useCallback(() => {
		latest.current = null
		setToken(null)
		setResetKey((key) => key + 1)
	}, [])
	// Stryker restore ArrayDeclaration

	return { token, onToken, read, resetKey, reset }
}
