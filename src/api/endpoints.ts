import type { OperationContext } from '@urql/core'

import { env } from '@/env'

/**
 * The four GraphQL endpoints, and the urql contexts that route a document to one of them.
 *
 * urql has a single `Client` with a single default `url`; anything else is selected per operation
 * through `context.url`. The default is the admin-resource endpoint, because every domain query and
 * mutation in this app goes there — the other three carry exactly one operation each.
 *
 * The context objects are module-level constants on purpose. urql re-executes an operation when its
 * context changes, and it compares by key: a `{ url }` literal built inside a component body is a new
 * object on every render, which turns a static query into an infinite refetch loop.
 */
export const ENDPOINT = {
	publicAuthorization: env.publicAuthorization,
	adminAuthorization: env.adminAuthorization,
	adminResource: env.adminResource,
	logout: env.logout
} as const

export const CTX_PUBLIC_AUTHORIZATION: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.publicAuthorization })
export const CTX_ADMIN_AUTHORIZATION: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.adminAuthorization })
export const CTX_ADMIN_RESOURCE: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.adminResource })
export const CTX_LOGOUT: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.logout })

/**
 * Whether an operation needs an access token before it is worth sending.
 *
 * Only the public-authorization endpoint is reachable without one — it is where `loginAdmin` lives,
 * and requiring a token to log in would be a deadlock. Everything else, including `logout`, is
 * bearer-authenticated.
 */
export const requiresAuth = (url: string | undefined): boolean => url !== ENDPOINT.publicAuthorization
