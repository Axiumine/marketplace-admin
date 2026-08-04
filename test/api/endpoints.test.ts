import { describe, expect, it } from 'vitest'

import {
	CTX_ADMIN_AUTHORIZATION,
	CTX_ADMIN_RESOURCE,
	CTX_LOGOUT,
	CTX_PUBLIC_AUTHORIZATION,
	ENDPOINT,
	requiresAuth
} from '@/api/endpoints'
import { env } from '@/env'

describe('ENDPOINT', () => {
	it('is the four paths from the environment', () => {
		expect(ENDPOINT).toEqual({
			publicAuthorization: env.publicAuthorization,
			adminAuthorization: env.adminAuthorization,
			adminResource: env.adminResource,
			logout: env.logout
		})
	})
})

describe('the operation contexts', () => {
	it('each point at their own endpoint', () => {
		expect(CTX_PUBLIC_AUTHORIZATION).toEqual({ url: ENDPOINT.publicAuthorization })
		expect(CTX_ADMIN_AUTHORIZATION).toEqual({ url: ENDPOINT.adminAuthorization })
		expect(CTX_ADMIN_RESOURCE).toEqual({ url: ENDPOINT.adminResource })
		expect(CTX_LOGOUT).toEqual({ url: ENDPOINT.logout })
	})

	// urql re-executes an operation whenever its context changes and compares by key. A context object
	// rebuilt per render is a new key every render, which turns a static query into a refetch loop —
	// hence module-level constants, frozen so nothing can mutate one into another endpoint's URL.
	it('are frozen module-level singletons', () => {
		expect(Object.isFrozen(CTX_ADMIN_RESOURCE)).toBe(true)
		expect(Object.isFrozen(CTX_PUBLIC_AUTHORIZATION)).toBe(true)
		expect(Object.isFrozen(CTX_ADMIN_AUTHORIZATION)).toBe(true)
		expect(Object.isFrozen(CTX_LOGOUT)).toBe(true)
	})
})

describe('requiresAuth', () => {
	it('is false only for the public endpoint, where loginAdmin lives', () => {
		expect(requiresAuth(ENDPOINT.publicAuthorization)).toBe(false)
	})

	it('is true for every authenticated endpoint, logout included', () => {
		expect(requiresAuth(ENDPOINT.adminAuthorization)).toBe(true)
		expect(requiresAuth(ENDPOINT.adminResource)).toBe(true)
		expect(requiresAuth(ENDPOINT.logout)).toBe(true)
	})

	// An operation sent without an explicit context falls back to the client's default URL, which is the
	// admin-resource endpoint — authenticated. Treating "no url" as public would send it tokenless.
	it('is true when no url was given', () => {
		expect(requiresAuth(undefined)).toBe(true)
	})
})
