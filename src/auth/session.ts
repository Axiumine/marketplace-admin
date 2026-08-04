import { useSyncExternalStore } from 'react'

/**
 * Who is signed in, in memory only.
 *
 * A module store rather than React context, for one reason: TanStack Router's `beforeLoad` guard runs
 * outside React and has to read the session synchronously to decide a redirect. `useSyncExternalStore`
 * then gives components the same value without a second source of truth.
 *
 * Nothing is persisted, deliberately. Backing this with localStorage would leave a signed-out browser
 * still advertising the last operator's `_id` and email to anything that can read storage. A reload
 * starts empty and `/loading` re-derives the identity from the session cookie — the same round-trip
 * the access token already needs.
 */
export interface AdminIdentity {
	readonly _id: string
	readonly email: string
}

let current: AdminIdentity | null = null
const listeners = new Set<() => void>()

const emit = (): void => {
	listeners.forEach((listener) => {
		listener()
	})
}

export const getSession = (): AdminIdentity | null => current

export const setSession = (identity: AdminIdentity): void => {
	current = identity
	emit()
}

export const clearSession = (): void => {
	current = null
	emit()
}

export const subscribeSession = (listener: () => void): (() => void) => {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export const useSession = (): AdminIdentity | null => useSyncExternalStore(subscribeSession, getSession, getSession)
