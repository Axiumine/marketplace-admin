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
 * Creates an shopOwner. It has been on the admin-resource service since v1; this app is its first
 * caller, so its behaviour is proven by these tests and nothing else.
 *
 * The backend also exposes `shopOwnerDel(_id)`, which still has no screen and so still has no
 * document here: an unsent operation is dead weight that has to be typed, tested and kept in step with
 * the schema. Add it alongside the screen that needs it.
 */
export const ShopOwnerAddDocument = graphql(`
	mutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {
		shopOwnerAdd(login: $login, personalData: $personalData)
	}
`)

/**
 * The six writes the editable detail page sends.
 *
 * They are six and not one because the backend splits them that way, and the split is not arbitrary:
 * `login.email` carries the collection's only unique index and is the one field a valid save can still
 * be refused on; the two account flags are stored by *absence*, so they need a mutation that can unset;
 * the operator's note is not part of the personalData `shopOwnerUpdate` replaces wholesale; and a
 * company is a different collection entirely. The page fires only the ones whose fields the
 * operator actually touched — `shopOwnerUpdate` in particular answers 500 for a write that changed
 * nothing, so sending it unconditionally would turn every save into a coin toss.
 *
 * All six answer a bare `Boolean`, so every call site has to name `additionalTypenames` itself: the
 * document cache invalidates by the `__typename`s a mutation's *response* mentions, and a boolean
 * mentions none. Without it the detail page keeps rendering the values it had before the save.
 */
export const ShopOwnerUpdateDocument = graphql(`
	mutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {
		shopOwnerUpdate(_id: $_id, personalData: $personalData)
	}
`)

export const ShopOwnerUpdateEmailDocument = graphql(`
	mutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {
		shopOwnerUpdateEmail(_id: $_id, email: $email)
	}
`)

export const ShopOwnerUpdateStatusDocument = graphql(`
	mutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!) {
		shopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov)
	}
`)

export const ShopOwnerUpdatePreferencesDocument = graphql(`
	mutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {
		shopOwnerUpdatePreferences(
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
 * `notes` is `String!`, and the empty string is what clears it — the resolver reads `''` as an `$unset`.
 * Sending `null` is not an option the schema offers, deliberately: "leave the note alone" is expressed
 * by not firing this mutation at all.
 */
export const ShopOwnerUpdateNoteDocument = graphql(`
	mutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {
		shopOwnerUpdateNote(_id: $_id, notes: $notes)
	}
`)

/**
 * The three writes on a company, which the Companies section of the detail page sends.
 *
 * `CompanyAdd` takes the owner and `CompanyUpdate` does not — `idShopOwner` is absent from
 * `GraphQLInputCompany` too, so a card cannot be edited into another shopOwner's hands.
 *
 * `CompanyDel` is a soft delete — it stamps `deleted` and the row stays. The message comes back through
 * `messageOf` like any other. ⚠️ The VAT number stays occupied afterwards: `vatNumber_unique` is global and
 * unconditional, so the same company cannot be registered again once retired.
 *
 * All three answer a bare `Boolean`, so every call site names `additionalTypenames` itself.
 */
export const CompanyAddDocument = graphql(`
	mutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {
		companyAdd(idShopOwner: $idShopOwner, company: $company)
	}
`)

export const CompanyUpdateDocument = graphql(`
	mutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {
		companyUpdate(_id: $_id, company: $company)
	}
`)

export const CompanyDelDocument = graphql(`
	mutation CompanyDel($_id: ID!) {
		companyDel(_id: $_id)
	}
`)
