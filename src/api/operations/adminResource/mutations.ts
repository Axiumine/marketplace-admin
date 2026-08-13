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
 * `CompanyDel` is a soft delete — it stamps `deleted` and the document stays. The message comes back through
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

/**
 * The three writes on the platform-wide taxonomy, which the category screen sends.
 *
 * ⚠️ **This tier is the only one that has them**, and the collection carries no owner id: a shop owner
 * picks from the taxonomy and cannot add to it, because two shops selling the same kind of thing have to
 * land in the same category or the customer-facing filter means nothing.
 *
 * `ItemCategoryUpdate` takes the same input object as `ItemCategoryAdd` and saves the document whole —
 * an omitted `idParent` is "top-level", not "leave the parent alone", so a card has to send every field
 * and `null` is how a subcategory is promoted.
 *
 * `ItemCategoryDel` is a soft delete and is **refused rather than cascaded** while a live subcategory or
 * a live item still points at the category. All three answer a bare `Boolean`, so the call site names
 * `additionalTypenames` itself.
 */
export const ItemCategoryAddDocument = graphql(`
	mutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {
		itemCategoryAdd(itemCategory: $itemCategory)
	}
`)

export const ItemCategoryUpdateDocument = graphql(`
	mutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {
		itemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)
	}
`)

export const ItemCategoryDelDocument = graphql(`
	mutation ItemCategoryDel($_id: ID!) {
		itemCategoryDel(_id: $_id)
	}
`)

/**
 * Rotates the platform's cookie-signing key.
 *
 * No variables, deliberately: the new key and the version it lands under are decided by the service.
 * An argument for either would let its sender install a key of their choosing, which is the ability to
 * mint a session cookie for any account on the platform — see the note on the mutation in the schema
 * slice. The operator asks for a rotation; they do not get to say what it produces.
 *
 * `Boolean!`, so the call site names `additionalTypenames` itself — `GraphQLKeygripStatus`, which is
 * what the panel beside the button is rendering and what a rotation changes every field of.
 */
export const KeygripRotateDocument = graphql(`
	mutation KeygripRotate {
		keygripRotate
	}
`)

/**
 * Drops one cookie-signing key from the whole platform (E16-S04).
 *
 * ⚠️ **This is the one operation the app can send that logs customers out on purpose.** Every cookie the
 * retired key signed stops verifying as each process picks the new record up. That is what an operator
 * responding to a leaked key is asking for, and it is why this is a separate button from rotation rather
 * than something rotation does quietly.
 *
 * One argument, and it is an *id* — never key material, never a version. The id is public by construction:
 * `keygripStatus` renders it and the fingerprint is computed over the ids.
 *
 * ⚠️ **A 404 here means nothing was retired.** The service refuses an id nothing matches rather than
 * answering the array unchanged, precisely so a suspected compromise cannot be closed on a success the
 * operator misread; the panel has to show it as a failure. Retiring the key the platform is signing with is
 * a 409 the panel never provokes — that row carries no button at all.
 *
 * `Boolean!`, so the call site names `additionalTypenames` itself.
 */
export const KeygripRetireDocument = graphql(`
	mutation KeygripRetire($id: String!) {
		keygripRetire(id: $id)
	}
`)

/**
 * Ends one session of one account (E17-S03).
 *
 * `id` is the row's own `id` — the session index field, a SHA-256 digest — handed straight back. See the
 * note on `SessionsDocument` for why a value safe to render is also safe to accept: a bare digest carries
 * none of the `access:` / `refresh:` prefixes a raw-token key does, so it names no live key.
 *
 * ⚠️ `false` is an *answer*, not a failure: the session was already gone. It must not be reported as an
 * error, or an operator is trained to retry a call that has already done everything it can.
 *
 * ⚠️ The access token that session minted ends with it (R54): the session hash records the key of its own
 * access half, so the service deletes both and the device stops working on the click rather than up to 91
 * minutes later. No deny list is involved, and the confirmation text says the same.
 *
 * `Boolean!`, so the call site names `additionalTypenames` itself.
 */
export const RevokeSessionDocument = graphql(`
	mutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {
		revokeSession(tier: $tier, accountId: $accountId, id: $id)
	}
`)

/**
 * Ends every session one account holds, and answers how many there were (E17-S04).
 *
 * ⚠️ **Per account, and there is deliberately no "every account" form of it anywhere on the platform.** A
 * button that logged out an entire tier is a platform-wide outage one click away, and no incident this
 * console is for needs one.
 *
 * The count is what the operator reads back as the blast radius that actually landed, so it is worth
 * announcing rather than collapsing into "done". `Int!`, which names no typename either — same rule.
 */
export const RevokeAllSessionsDocument = graphql(`
	mutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {
		revokeAllSessions(tier: $tier, accountId: $accountId)
	}
`)
