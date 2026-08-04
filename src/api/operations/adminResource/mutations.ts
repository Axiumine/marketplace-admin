import { graphql } from '@gql/adminResource'

/**
 * Changes the signed-in operator's own password.
 *
 * There is deliberately no `_id` argument: the account comes from the Redis session server-side. An
 * `_id` from a browser is a variable the sender can edit, and the platform has no role field to check
 * it against — accepting one would be a way for any operator to rewrite any other operator's password.
 */
export const AdminUpdatePwdDocument = graphql(`
	mutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {
		adminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)
	}
`)

/**
 * Creates an imprenditore. It has been on the admin-resource service since v1; this app is its first
 * caller, so its behaviour is proven by these tests and nothing else.
 *
 * The backend also exposes `imprenditoreDel(_id)`, which still has no screen and so still has no
 * document here: an unsent operation is dead weight that has to be typed, tested and kept in step with
 * the schema. Add it alongside the screen that needs it.
 */
export const ImprenditoreAddDocument = graphql(`
	mutation ImprenditoreAdd($login: GraphQLInputLogin!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {
		imprenditoreAdd(login: $login, anagrafica: $anagrafica)
	}
`)

/**
 * The six writes the editable detail page sends.
 *
 * They are six and not one because the backend splits them that way, and the split is not arbitrary:
 * `login.email` carries the collection's only unique index and is the one field a valid save can still
 * be refused on; the two account flags are stored by *absence*, so they need a mutation that can unset;
 * the operator's note is not part of the anagrafica `imprenditoreUpdate` replaces wholesale; and a
 * company is a different collection entirely. The page fires only the ones whose fields the
 * operator actually touched — `imprenditoreUpdate` in particular answers 500 for a write that changed
 * nothing, so sending it unconditionally would turn every save into a coin toss.
 *
 * All six answer a bare `Boolean`, so every call site has to name `additionalTypenames` itself: the
 * document cache invalidates by the `__typename`s a mutation's *response* mentions, and a boolean
 * mentions none. Without it the detail page keeps rendering the values it had before the save.
 */
export const ImprenditoreUpdateDocument = graphql(`
	mutation ImprenditoreUpdate($_id: ID!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {
		imprenditoreUpdate(_id: $_id, anagrafica: $anagrafica)
	}
`)

export const ImprenditoreUpdateEmailDocument = graphql(`
	mutation ImprenditoreUpdateEmail($_id: ID!, $email: String!) {
		imprenditoreUpdateEmail(_id: $_id, email: $email)
	}
`)

export const ImprenditoreUpdateStatoDocument = graphql(`
	mutation ImprenditoreUpdateStato($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!) {
		imprenditoreUpdateStato(_id: $_id, disabled: $disabled, waitApprov: $waitApprov)
	}
`)

export const ImprenditoreUpdatePreferenzeDocument = graphql(`
	mutation ImprenditoreUpdatePreferenze($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {
		imprenditoreUpdatePreferenze(
			_id: $_id
			rememberMe: $rememberMe
			onboardingDone: $onboardingDone
			onboardingStep: $onboardingStep
		)
	}
`)

/**
 * The operator's note about the account.
 *
 * `note` is `String!`, and the empty string is what clears it — the resolver reads `''` as an `$unset`.
 * Sending `null` is not an option the schema offers, deliberately: "leave the note alone" is expressed
 * by not firing this mutation at all.
 */
export const ImprenditoreUpdateNoteDocument = graphql(`
	mutation ImprenditoreUpdateNote($_id: ID!, $note: String!) {
		imprenditoreUpdateNote(_id: $_id, note: $note)
	}
`)

/**
 * The three writes on a company, which the Aziende section of the detail page sends.
 *
 * `AziendaAdd` takes the owner and `AziendaUpdate` does not — `idImprenditore` is absent from
 * `GraphQLInputAzienda` too, so a card cannot be edited into another imprenditore's hands.
 *
 * `AziendaDel` is a soft delete — it stamps `deleted` and the row stays. The message comes back through
 * `messageOf` like any other. ⚠️ The partita IVA stays occupied afterwards: `piva_unique` is global and
 * unconditional, so the same company cannot be registered again once retired.
 *
 * All three answer a bare `Boolean`, so every call site names `additionalTypenames` itself.
 */
export const AziendaAddDocument = graphql(`
	mutation AziendaAdd($idImprenditore: ID!, $azienda: GraphQLInputAzienda!) {
		aziendaAdd(idImprenditore: $idImprenditore, azienda: $azienda)
	}
`)

export const AziendaUpdateDocument = graphql(`
	mutation AziendaUpdate($_id: ID!, $azienda: GraphQLInputAzienda!) {
		aziendaUpdate(_id: $_id, azienda: $azienda)
	}
`)

export const AziendaDelDocument = graphql(`
	mutation AziendaDel($_id: ID!) {
		aziendaDel(_id: $_id)
	}
`)
