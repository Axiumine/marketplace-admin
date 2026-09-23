import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useTurnstileToken } from '@/features/login/useTurnstileToken'

describe('useTurnstileToken', () => {
	it('starts with no token', () => {
		const { result } = renderHook(() => useTurnstileToken())

		expect(result.current.token).toBeNull()
		expect(result.current.read()).toBeNull()
	})

	it('holds the token the widget issued', () => {
		const { result } = renderHook(() => useTurnstileToken())

		act(() => {
			result.current.onToken('a-turnstile-token')
		})

		expect(result.current.token).toBe('a-turnstile-token')
	})

	// The state value exists only so the surrounding form re-renders when a token arrives — a submit
	// button that unblocks on a ref would never learn about it.
	it('re-renders the form when one arrives', () => {
		const { result, rerender } = renderHook(() => useTurnstileToken())
		const before = result.current.token

		act(() => {
			result.current.onToken('a-turnstile-token')
		})
		rerender()

		expect(before).toBeNull()
		expect(result.current.token).toBe('a-turnstile-token')
	})

	/*
	 * ⚠️ `onToken` has to be stable. `Turnstile` lists it in an effect dependency, so a fresh function per
	 * render would tear down and re-render the widget on every keystroke in the surrounding form — which
	 * also discards the token the admin already earned.
	 */
	it('keeps one identity for onToken across renders', () => {
		const { result, rerender } = renderHook(() => useTurnstileToken())
		const first = result.current.onToken

		rerender()

		expect(result.current.onToken).toBe(first)
	})

	it('keeps it stable across a token change too', () => {
		const { result } = renderHook(() => useTurnstileToken())
		const first = result.current.onToken

		act(() => {
			result.current.onToken('a-turnstile-token')
		})

		expect(result.current.onToken).toBe(first)
	})

	it('keeps one identity for read as well', () => {
		const { result, rerender } = renderHook(() => useTurnstileToken())
		const first = result.current.read

		rerender()

		expect(result.current.read).toBe(first)
	})

	/*
	 * ⚠️ The submit path reads the ref, not the state. A widget that solves itself between the click and
	 * the `await` would otherwise be missed, and a token that expired in that window would be sent anyway
	 * — the state value in the closure is whatever it was when the handler was created.
	 */
	it('reads the newest token even from a closure created before it', () => {
		const { result } = renderHook(() => useTurnstileToken())
		const read = result.current.read

		act(() => {
			result.current.onToken('arrived-after-the-closure')
		})

		expect(read()).toBe('arrived-after-the-closure')
	})

	// `null` is a legitimate value to submit: a machine with no site key configured always sends it, and
	// the server accepts it in exactly that case.
	it('withdraws the token when the widget expires', () => {
		const { result } = renderHook(() => useTurnstileToken())

		act(() => {
			result.current.onToken('a-turnstile-token')
		})
		act(() => {
			result.current.onToken(null)
		})

		expect(result.current.token).toBeNull()
		expect(result.current.read()).toBeNull()
	})

	/*
	 * ⚠️ B2. `resetKey` starts at 0 and is what a form passes as `<Turnstile key={resetKey} …>` — bumping
	 * it is the only way to make React tear the widget down and remount it, which is the only way to make
	 * Cloudflare mint a fresh token after one has already been spent on a failed submit.
	 */
	it('starts the reset key at zero', () => {
		const { result } = renderHook(() => useTurnstileToken())

		expect(result.current.resetKey).toBe(0)
	})

	it('bumps the reset key by exactly one per reset', () => {
		const { result } = renderHook(() => useTurnstileToken())

		act(() => {
			result.current.reset()
		})
		expect(result.current.resetKey).toBe(1)

		act(() => {
			result.current.reset()
		})
		expect(result.current.resetKey).toBe(2)
	})

	// The whole point: the token a failed submit already spent must not be read again by the retry that
	// follows it.
	it('withdraws the token on reset', () => {
		const { result } = renderHook(() => useTurnstileToken())

		act(() => {
			result.current.onToken('a-turnstile-token')
		})
		act(() => {
			result.current.reset()
		})

		expect(result.current.token).toBeNull()
		expect(result.current.read()).toBeNull()
	})

	it('keeps one identity for reset across renders, and across a reset itself', () => {
		const { result, rerender } = renderHook(() => useTurnstileToken())
		const first = result.current.reset

		rerender()
		expect(result.current.reset).toBe(first)

		act(() => {
			result.current.reset()
		})
		expect(result.current.reset).toBe(first)
	})
})
