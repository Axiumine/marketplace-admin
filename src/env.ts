/**
 * Build-time configuration, read once from `import.meta.env`.
 *
 * Every value has a default and nothing here throws. That is deliberate: the four endpoint paths are
 * fixed by the `ENDPOINT` constant each backend service exports from its `src/index.mts`, so they are
 * not really configuration — the env vars exist only so the app can be relocated behind a different
 * nginx prefix without a code change. A missing variable is therefore the normal case, not an error.
 *
 * The Sentry DSN is the one genuinely optional value: empty means "do not report", which is what a
 * developer machine wants.
 */
export interface AppEnv {
	readonly publicAuthorization: string
	readonly adminAuthorization: string
	readonly adminResource: string
	readonly logout: string
	readonly sentryDsn: string
	readonly sentryEnvironment: string
}

/**
 * Defaults, kept together so the `env` template and this file can be diffed by eye.
 *
 * These are paths, not URLs: the SPA and the services are served from one origin (see the comment in
 * vite.config.ts for why the refresh cookie makes that mandatory rather than merely convenient).
 */
export const DEFAULT_ENDPOINTS = {
	publicAuthorization: '/public-authorization',
	adminAuthorization: '/admin-authenticated-authorization',
	adminResource: '/admin-authenticated-resource',
	logout: '/logout'
} as const

/** An empty string is treated as absent — dotenv writes `KEY=` for "unset", and so does the template. */
const value = (raw: string | undefined, fallback: string): string => (raw === undefined || raw === '' ? fallback : raw)

export const readEnv = (source: ImportMetaEnv): AppEnv => ({
	publicAuthorization: value(source.VITE_GRAPHQL_ENDPOINT_PUBLIC_AUTHORIZATION, DEFAULT_ENDPOINTS.publicAuthorization),
	adminAuthorization: value(
		source.VITE_GRAPHQL_ENDPOINT_ADMIN_AUTHENTICATED_AUTHORIZATION,
		DEFAULT_ENDPOINTS.adminAuthorization
	),
	adminResource: value(source.VITE_GRAPHQL_ENDPOINT_ADMIN_AUTHENTICATED_RESOURCE, DEFAULT_ENDPOINTS.adminResource),
	logout: value(source.VITE_GRAPHQL_ENDPOINT_LOGOUT, DEFAULT_ENDPOINTS.logout),
	sentryDsn: value(source.VITE_SENTRY_DSN, ''),
	sentryEnvironment: value(source.VITE_SENTRY_ENVIRONMENT, 'development')
})

export const env: AppEnv = readEnv(import.meta.env)
