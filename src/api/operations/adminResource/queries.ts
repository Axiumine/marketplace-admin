import { graphql } from '@gql/adminResource'

/**
 * Proves the session is live and names the operator. Read straight out of the Redis session on the
 * backend — no database round-trip — which is why the app can call it on every boot without cost.
 */
export const InfoAdminAfterLoginDocument = graphql(`
	query InfoAdminAfterLogin {
		infoAdminAfterLogin {
			_id
			email
		}
	}
`)

/**
 * Headline count for the shopOwners section. Unfiltered: this is NOT the `total` of a table page,
 * which is the size of the searched set and moves as the operator types.
 */
export const ShopOwnersStatsDocument = graphql(`
	query ShopOwnersStats {
		shopOwnersStats
	}
`)

/**
 * The series behind the stats chart, one point per bucket, gaps already filled by the server.
 *
 * `granularity` comes back rather than going in — the bucket width is a property of the range, not a
 * client choice — and the chart reads it to label the axis. Asking for it in the selection set is not
 * optional: without it the component cannot tell a month bucket from a day one, since `data` is
 * `YYYY-MM-DD` in both.
 */
export const ShopOwnersPerPeriodDocument = graphql(`
	query ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {
		shopOwnersPerPeriod(period: $period) {
			granularity
			points {
				date
				total
			}
		}
	}
`)

/**
 * One page of the shopOwners table.
 *
 * Paging, search and sort are all server-side. Asking for a flat list and narrowing it in the browser
 * would mean every operator downloading the entire collection to look at twenty rows, and the
 * collection grows without bound.
 *
 * The four sortable columns each have a matching index in marketplace-db-setup, and a column outside the
 * enum is refused at schema validation rather than turned into a blocking in-memory sort.
 *
 * Every argument has a server-side default, so the variables here are the app's defaults, not the
 * schema's.
 *
 * ⚠️ `email` and `waitApprov` are what make this the approval queue rather than a directory, and
 * `personalData` is nullable underneath them: a seller who registered themselves has none until
 * onboarding, so the address is the only thing naming that row and the flag the only thing marking it
 * as waiting. Dropping either from the selection leaves a page that renders and cannot be acted on.
 */
export const ShopOwnersActiveTblDocument = graphql(`
	query ShopOwnersActiveTbl(
		$offset: Int!
		$limit: Int!
		$search: String
		$sortBy: GraphQLShopOwnersTblSortField!
		$sortDir: GraphQLSortDirection!
	) {
		shopOwnersActiveTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {
			total
			items {
				_id
				registeredAt
				email
				waitApprov
				personalData {
					firstName
					lastName
					address {
						street
						postalCode
						city
						province
					}
				}
			}
		}
	}
`)

/**
 * The detail page's personalData block.
 *
 * ⚠️ The argument is `idShopOwner`, not `shopOwner` — read off the resolver, which is the only
 * contract there is. A document that declares one name and passes another still compiles here and
 * fails at the server, so the name is worth checking against the resolver rather than against another
 * document that looks similar.
 */
export const ShopOwnerByIdDocument = graphql(`
	query ShopOwnerById($idShopOwner: ID!) {
		shopOwnerById(idShopOwner: $idShopOwner) {
			_id
			registeredAt
			deleted
			disabled
			waitApprov
			notes
			login {
				email
				firstLogin
				lastLogin
				onboardingStep
				onboardingDone
				rememberMe
			}
			personalData {
				firstName
				lastName
				birth {
					date
				}
				contacts {
					email
					landline
					mobile
				}
				address {
					street
					postalCode
					city
					province
					position {
						type
						coordinates
					}
				}
			}
			resetPwd {
				resetDateReq
				resetHash
			}
		}
	}
`)

/**
 * The cookie-signing key set, and which services are signing with it.
 *
 * ⚠️ The selection set is the whole type and stays that way. There is no `material` field to leave out —
 * see the note on `GraphQLKeygripStatus` in the schema slice — so this document cannot be made safer by
 * asking for less, and every field it names is on screen: the version and fingerprint identify the
 * record, `ageDays` is what marks a key as retirable, and `current` is what marks a service as behind.
 *
 * `keys` comes back newest first, and `holders` sorted by service name; neither is re-sorted here.
 */
export const KeygripStatusDocument = graphql(`
	query KeygripStatus {
		keygripStatus {
			version
			fingerprint
			keys {
				id
				createdAt
				ageDays
			}
			holders {
				service
				fingerprint
				lastSeen
				current
			}
		}
	}
`)

/**
 * The companies owned by one shopOwner.
 *
 * The Companies section renders a card per company. Whole documents, not a projection: the section edits the
 * company card, and there is no second query behind it.
 */
export const ShopOwnerCompaniesDocument = graphql(`
	query ShopOwnerCompanies($idShopOwner: ID!) {
		shopOwnerCompanies(idShopOwner: $idShopOwner) {
			_id
			legalName
			vatNumber
			taxCode
			contactPerson
			administrator
			uniqueCode
			certifiedEmail
			registryExtract
			address {
				street
				postalCode
				city
				province
				position {
					type
					coordinates
				}
			}
		}
	}
`)
