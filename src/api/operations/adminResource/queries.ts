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
 * Headline count for the imprenditori section. Unfiltered: this is NOT the `total` of a table page,
 * which is the size of the searched set and moves as the operator types.
 */
export const ImprenditoriStatsDocument = graphql(`
	query ImprenditoriStats {
		imprenditoriStats
	}
`)

/**
 * The series behind the stats chart, one point per bucket, gaps already filled by the server.
 *
 * `granularita` comes back rather than going in — the bucket width is a property of the range, not a
 * client choice — and the chart reads it to label the axis. Asking for it in the selection set is not
 * optional: without it the component cannot tell a month bucket from a day one, since `data` is
 * `YYYY-MM-DD` in both.
 */
export const ImprenditoriPerPeriodoDocument = graphql(`
	query ImprenditoriPerPeriodo($periodo: GraphQLPeriodoImprenditori!) {
		imprenditoriPerPeriodo(periodo: $periodo) {
			granularita
			punti {
				data
				totale
			}
		}
	}
`)

/**
 * One page of the imprenditori table.
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
 */
export const ImprenditoriAttiviTblDocument = graphql(`
	query ImprenditoriAttiviTbl(
		$offset: Int!
		$limit: Int!
		$search: String
		$sortBy: GraphQLImprenditoriTblSortField!
		$sortDir: GraphQLSortDirection!
	) {
		imprenditoriAttiviTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {
			total
			items {
				_id
				iscrizione
				anagrafica {
					nome
					cognome
					indirizzo {
						indirizzo
						cap
						comune
						provincia
					}
				}
			}
		}
	}
`)

/**
 * The detail page's anagrafica block.
 *
 * ⚠️ The argument is `idImprenditore`, not `imprenditore` — read off the resolver, which is the only
 * contract there is. A document that declares one name and passes another still compiles here and
 * fails at the server, so the name is worth checking against the resolver rather than against another
 * document that looks similar.
 */
export const ImprenditoreByIdDocument = graphql(`
	query ImprenditoreById($idImprenditore: ID!) {
		imprenditoreById(idImprenditore: $idImprenditore) {
			_id
			iscrizione
			deleted
			disabled
			waitApprov
			note
			login {
				email
				firstLogin
				lastLogin
				onboardingStep
				onboardingDone
				rememberMe
			}
			anagrafica {
				nome
				cognome
				nascita {
					data
				}
				contatti {
					email
					fisso
					cellulare
				}
				indirizzo {
					indirizzo
					cap
					comune
					provincia
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
 * The companies owned by one imprenditore.
 *
 * The Aziende section renders a card per row. Whole rows, not a projection: the section edits the
 * company card, and there is no second query behind it.
 */
export const ImprenditoreAziendeDocument = graphql(`
	query ImprenditoreAziende($idImprenditore: ID!) {
		imprenditoreAziende(idImprenditore: $idImprenditore) {
			_id
			ragionesociale
			piva
			cf
			referente
			amministratore
			univoco
			pec
			visura
			indirizzo {
				indirizzo
				cap
				comune
				provincia
				position {
					type
					coordinates
				}
			}
		}
	}
`)
