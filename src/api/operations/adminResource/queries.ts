import { graphql } from '@gql/adminResource'

/**
 * Proves the session is live and names the admin. Read straight out of the Redis session on the
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
 * which is the size of the searched set and moves as the admin types.
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
 * would mean every admin downloading the entire collection to look at twenty rows, and the
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
 *
 * `disabled` and `deleted` go in as `Boolean!` because the service has no "either" state to offer — the
 * pair is the leading field of all four `tbl_active_*` indexes — which is why the screen filters by
 * status rather than listing every account at once. The two flags come back as well, and the row needs
 * both: they are independent, so a shop owner suspended and then closed carries them together and a
 * status read off either one alone would be wrong for that row.
 *
 * `disabled` and `waitApprov` come back nullable and mean "absent or true": the collection stores `true`
 * or `$unset`s, never `false`. Read them on truthiness. `deleted` is a timestamp (ADR-011).
 */
export const ShopOwnersActiveTblDocument = graphql(`
	query ShopOwnersActiveTbl(
		$offset: Int!
		$limit: Int!
		$disabled: Boolean!
		$deleted: Boolean!
		$search: String
		$sortBy: GraphQLShopOwnersTblSortField!
		$sortDir: GraphQLSortDirection!
	) {
		shopOwnersActiveTbl(
			offset: $offset
			limit: $limit
			disabled: $disabled
			deleted: $deleted
			search: $search
			sortBy: $sortBy
			sortDir: $sortDir
		) {
			total
			items {
				_id
				registeredAt
				email
				waitApprov
				disabled
				disabledBy
				disabledReason
				deleted
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
			disabledBy
			disabledReason
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
 * record, `ageDays` is how old each key itself is, and `current` is what marks a service as behind.
 * `ageDays` is not what decides a retirement — that runs from the demotion instant, server-side, and the
 * panel neither recomputes it nor gates a button on it.
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
 * The live sessions one account holds.
 *
 * ⚠️ The selection set is the whole type, and asking for less would not make it safer: no field on
 * `GraphQLSession` can hold token or key material, and the service's `schema.test.mts` enumerates the four
 * against an exact expected set so a fifth fails a test rather than reaching this app. `id` is the session
 * index field — the SHA-256 of the prefixed refresh token — which is why it can be rendered *and* sent back
 * to `revokeSession`: every raw-token key on the platform carries an `access:` / `refresh:` prefix that a
 * bare digest does not, so the digest names no live key and authenticates nothing.
 *
 * ⚠️ There is nothing network- or device-derived to ask for, deliberately. An admin cannot answer "where
 * was this session used from" on this platform; the answer to a compromise report is to end the sessions.
 *
 * `mintedAt` is the login the session descends from rather than its last rotation, and `familyId` is the
 * lineage handle: two rows sharing one are a single login seen either side of a rotation race, which is the
 * only thing that explains a duplicate an admin would otherwise read as a second device.
 */
export const SessionsDocument = graphql(`
	query Sessions($tier: GraphQLTier!, $accountId: String!) {
		sessions(tier: $tier, accountId: $accountId) {
			id
			tier
			mintedAt
			familyId
		}
	}
`)

/**
 * The lineages of one account that were revoked, and why.
 *
 * Newest first, as the service returns them, and capped there. It is the trail that explains a mass logout
 * an admin would otherwise be handed as a mystery ticket: `familyId` ties a line here to the rows
 * `sessions` has stopped returning.
 *
 * ⚠️ `accountId` comes back on every line even though the query named it. It is what makes a copied row
 * self-describing in a ticket, and it is already the admin's own input rather than anything the service
 * derived — no token, no digest of one, nothing about a device.
 */
export const ReuseEventsDocument = graphql(`
	query ReuseEvents($tier: GraphQLTier!, $accountId: String!) {
		reuseEvents(tier: $tier, accountId: $accountId) {
			familyId
			tier
			accountId
			action
			at
		}
	}
`)

/**
 * The whole taxonomy, flat.
 *
 * Whole documents rather than a projection, and every field is on screen: the category screen edits
 * these four, and `idParent` is what the two levels are assembled from — a list without it renders as a
 * flat alphabet soup in which no card knows whether it is a subcategory.
 *
 * No arguments and no paging, which is the resolver's own shape. The screen re-reads this after every
 * write, so the three mutations name `GraphQLItemCategory` in `additionalTypenames`.
 */
export const ItemCategoriesDocument = graphql(`
	query ItemCategories {
		itemCategories {
			_id
			idParent
			name
			slug
			position
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

/**
 * One page of the customers table.
 *
 * ⚠️ **Four fields, and there is no fifth to ask for.** `user` carries a name, a city and several
 * addresses, and every one of them is encrypted — randomly, for all but the login address (ADR-029) — so
 * they are not merely absent from this selection, they are unreadable to a query and unsortable by one.
 * Adding a column here is the change to refuse, and the symptom is not an error: a name column would
 * render base64 and a name sort would order the customer base by ciphertext.
 *
 * `disabled` and `deleted` go in as `Boolean!` because the service has no "either" state to offer — the
 * pair is what keeps the page on the `tbl_active_registeredAt` index — which is why the screen filters by
 * status rather than showing every account at once. The two are independent: `userDel` stamps `deleted`
 * and leaves the suspension trio alone, so a closed account that was suspended first answers to both
 * flags and to no single one of them (ADR-049).
 *
 * Both flags come back nullable and mean "absent or true": the collection stores `true` or `$unset`s,
 * never `false`. Read them on truthiness.
 */
export const UsersActiveTblDocument = graphql(`
	query UsersActiveTbl(
		$offset: Int!
		$limit: Int!
		$disabled: Boolean!
		$deleted: Boolean!
		$sortBy: GraphQLUsersTblSortField!
		$sortDir: GraphQLSortDirection!
	) {
		usersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {
			total
			items {
				_id
				registeredAt
				email
				disabled
				disabledBy
				disabledReason
				deleted
				emailVerified
			}
		}
	}
`)

/**
 * Headline count for the customers section. Unfiltered, so it counts the disabled and the closed too —
 * NOT the `total` of `UsersActiveTbl`, which is the size of the currently filtered page's set.
 *
 * ⚠️ This exists even though the customers table has no search box, and the two are not in tension: a
 * count touches no field, so ADR-029's random ciphertext has nothing to say about it. What is blocked
 * on `user` is matching and ordering, not counting.
 */
export const UsersStatsDocument = graphql(`
	query UsersStats {
		usersStats
	}
`)

/**
 * The series behind the customers chart. Same shape and same rules as `ShopOwnersPerPeriod` — the
 * server shares one library between them — and a separate document because the two are separate types
 * in the schema, deliberately: one `PerPeriod` type would let a rename point this chart at shopOwner
 * data and still compile.
 *
 * `granularity` comes back rather than going in, and asking for it is not optional: `date` is
 * `YYYY-MM-DD` in both widths, so without it the component cannot tell a month bucket from a day one.
 */
export const UsersPerPeriodDocument = graphql(`
	query UsersPerPeriod($period: GraphQLUsersPeriod!) {
		usersPerPeriod(period: $period) {
			granularity
			points {
				date
				total
			}
		}
	}
`)
