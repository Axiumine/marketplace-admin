import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { clearSession, getSession, setSession, subscribeSession, useSession } from '@/auth/session'

const ADMIN = { _id: '65f0000000000000000000a1', email: 'operator@marketplace.it' }

describe('the session store', () => {
	it('starts empty', () => {
		expect(getSession()).toBeNull()
	})

	it('holds the identity it was given', () => {
		setSession(ADMIN)
		expect(getSession()).toEqual(ADMIN)
	})

	it('clears back to null', () => {
		setSession(ADMIN)
		clearSession()
		expect(getSession()).toBeNull()
	})

	it('notifies every subscriber on set and on clear', () => {
		const first = vi.fn()
		const second = vi.fn()
		subscribeSession(first)
		subscribeSession(second)

		setSession(ADMIN)
		expect(first).toHaveBeenCalledTimes(1)
		expect(second).toHaveBeenCalledTimes(1)

		clearSession()
		expect(first).toHaveBeenCalledTimes(2)
		expect(second).toHaveBeenCalledTimes(2)
	})

	it('stops notifying an unsubscribed listener', () => {
		const listener = vi.fn()
		const unsubscribe = subscribeSession(listener)
		unsubscribe()

		setSession(ADMIN)
		expect(listener).not.toHaveBeenCalled()
	})

	// ⚠️ Nothing is persisted, and this asserts it. Backing the session store with `localStorage` is the
	// obvious way to survive a reload, and it leaves the last operator's `_id` and email readable by
	// anything running on the origin long after they signed out. The reload path is served by refreshing
	// from the httpOnly cookie instead — see `LoadingPage`.
	it('persists nothing', () => {
		setSession(ADMIN)
		expect(localStorage.length).toBe(0)
		expect(sessionStorage.length).toBe(0)
	})
})

describe('useSession', () => {
	it('renders the current identity and re-renders on every change', () => {
		const { result } = renderHook(() => useSession())
		expect(result.current).toBeNull()

		act(() => {
			setSession(ADMIN)
		})
		expect(result.current).toEqual(ADMIN)

		act(() => {
			clearSession()
		})
		expect(result.current).toBeNull()
	})

	it('unsubscribes on unmount, so an update after teardown is not a React warning', () => {
		const { unmount } = renderHook(() => useSession())
		unmount()

		expect(() => {
			setSession(ADMIN)
		}).not.toThrow()
	})
})
