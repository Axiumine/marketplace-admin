import type { CodegenConfig } from '@graphql-codegen/cli'

/**
 * One project per access level, not one merged schema.
 *
 * The four endpoints are four independent GraphQL servers that happen to share a browser. Merging
 * them into a single schema would invent an API that exists nowhere: `logout` and `shopOwnersStats`
 * would end up on the same `MutationsApi`/`QueriesApi` pair, and a document could be written that
 * type-checks against the merged shape while no single server can answer it. Keeping them apart also
 * means a document physically cannot be sent to the wrong endpoint — the `graphql()` helper it was
 * built with only knows its own schema, and `endpointFor` in src/api/endpoints.ts maps it back to the
 * one URL that serves it.
 *
 * `documents` is scoped per tier for the same reason. A document living under
 * src/api/operations/adminResource/ is typed against the admin-resource schema only.
 */
const preset = 'client' as const

/**
 * Shared by all four projects.
 *
 * `fragmentMasking: false` — the app reads fragment fields directly off the query result rather than
 * threading `useFragment` through every component, which is the right trade for a codebase this size.
 * `enumsAsTypes` keeps the generated sort enums as string unions, so a sort column can be carried in
 * the URL search params and handed to the query without a cast.
 */
const presetConfig = { fragmentMasking: false }

/**
 * `scalars` maps the two custom scalars the admin-resource schema mounts. Without it codegen types
 * them `unknown`, and `unknown` on an input field means the value cannot be assigned without a cast —
 * which is how a date input silently becomes `any`. Both cross the wire as ISO-8601 strings:
 * `DateTime` as a full timestamp, `Date` as `YYYY-MM-DD`.
 */
const config = {
	enumsAsTypes: true,
	skipTypename: true,
	useTypeImports: true,
	scalars: { DateTime: 'string', Date: 'string' }
}

const codegenConfig: CodegenConfig = {
	// Tabs, to match every other file in this repo and the eslint `indent` rule the generated output
	// is exempt from but the config file is not.
	config: { useTypeImports: true },
	ignoreNoDocuments: true,
	generates: {
		'src/gql/publicAuthorization/': {
			schema: 'schema/public-authorization.graphql',
			documents: 'src/api/operations/publicAuthorization/**/*.ts',
			preset,
			presetConfig,
			config
		},
		'src/gql/adminAuthorization/': {
			schema: 'schema/admin-authenticated-authorization.graphql',
			documents: 'src/api/operations/adminAuthorization/**/*.ts',
			preset,
			presetConfig,
			config
		},
		'src/gql/logout/': {
			schema: 'schema/logout.graphql',
			documents: 'src/api/operations/logout/**/*.ts',
			preset,
			presetConfig,
			config
		},
		'src/gql/adminResource/': {
			schema: 'schema/admin-authenticated-resource.graphql',
			documents: 'src/api/operations/adminResource/**/*.ts',
			preset,
			presetConfig,
			config
		}
	}
}

export default codegenConfig
