/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n\tmutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tadminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n": typeof types.AdminUpdatePwdDocument,
    "\n\tmutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerAdd(login: $login, personalData: $personalData)\n\t}\n": typeof types.ShopOwnerAddDocument,
    "\n\tmutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerUpdate(_id: $_id, personalData: $personalData)\n\t}\n": typeof types.ShopOwnerUpdateDocument,
    "\n\tmutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n\t\tshopOwnerUpdateEmail(_id: $_id, email: $email)\n\t}\n": typeof types.ShopOwnerUpdateEmailDocument,
    "\n\tmutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n\t\tshopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n\t}\n": typeof types.ShopOwnerUpdateStatusDocument,
    "\n\tmutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\tshopOwnerUpdatePreferences(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n": typeof types.ShopOwnerUpdatePreferencesDocument,
    "\n\tmutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n\t\tshopOwnerUpdateNote(_id: $_id, notes: $notes)\n\t}\n": typeof types.ShopOwnerUpdateNoteDocument,
    "\n\tmutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyAdd(idShopOwner: $idShopOwner, company: $company)\n\t}\n": typeof types.CompanyAddDocument,
    "\n\tmutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyUpdate(_id: $_id, company: $company)\n\t}\n": typeof types.CompanyUpdateDocument,
    "\n\tmutation CompanyDel($_id: ID!) {\n\t\tcompanyDel(_id: $_id)\n\t}\n": typeof types.CompanyDelDocument,
    "\n\tmutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryAdd(itemCategory: $itemCategory)\n\t}\n": typeof types.ItemCategoryAddDocument,
    "\n\tmutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n\t}\n": typeof types.ItemCategoryUpdateDocument,
    "\n\tmutation ItemCategoryDel($_id: ID!) {\n\t\titemCategoryDel(_id: $_id)\n\t}\n": typeof types.ItemCategoryDelDocument,
    "\n\tmutation KeygripRotate {\n\t\tkeygripRotate\n\t}\n": typeof types.KeygripRotateDocument,
    "\n\tmutation KeygripRetire($id: String!) {\n\t\tkeygripRetire(id: $id)\n\t}\n": typeof types.KeygripRetireDocument,
    "\n\tmutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n\t\trevokeSession(tier: $tier, accountId: $accountId, id: $id)\n\t}\n": typeof types.RevokeSessionDocument,
    "\n\tmutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n\t\trevokeAllSessions(tier: $tier, accountId: $accountId)\n\t}\n": typeof types.RevokeAllSessionsDocument,
    "\n\tmutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n\t\tuserUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n\t}\n": typeof types.UserUpdateStatusDocument,
    "\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n": typeof types.InfoAdminAfterLoginDocument,
    "\n\tquery ShopOwnersStats {\n\t\tshopOwnersStats\n\t}\n": typeof types.ShopOwnersStatsDocument,
    "\n\tquery ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n\t\tshopOwnersPerPeriod(period: $period) {\n\t\t\tgranularity\n\t\t\tpoints {\n\t\t\t\tdate\n\t\t\t\ttotal\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ShopOwnersPerPeriodDocument,
    "\n\tquery ShopOwnersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLShopOwnersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tshopOwnersActiveTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\twaitApprov\n\t\t\t\tpersonalData {\n\t\t\t\t\tfirstName\n\t\t\t\t\tlastName\n\t\t\t\t\taddress {\n\t\t\t\t\t\tstreet\n\t\t\t\t\t\tpostalCode\n\t\t\t\t\t\tcity\n\t\t\t\t\t\tprovince\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ShopOwnersActiveTblDocument,
    "\n\tquery ShopOwnerById($idShopOwner: ID!) {\n\t\tshopOwnerById(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tregisteredAt\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\tdisabledBy\n\t\t\tdisabledReason\n\t\t\twaitApprov\n\t\t\tnotes\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\temail\n\t\t\t\t\tlandline\n\t\t\t\t\tmobile\n\t\t\t\t}\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ShopOwnerByIdDocument,
    "\n\tquery KeygripStatus {\n\t\tkeygripStatus {\n\t\t\tversion\n\t\t\tfingerprint\n\t\t\tkeys {\n\t\t\t\tid\n\t\t\t\tcreatedAt\n\t\t\t\tageDays\n\t\t\t}\n\t\t\tholders {\n\t\t\t\tservice\n\t\t\t\tfingerprint\n\t\t\t\tlastSeen\n\t\t\t\tcurrent\n\t\t\t}\n\t\t}\n\t}\n": typeof types.KeygripStatusDocument,
    "\n\tquery Sessions($tier: GraphQLTier!, $accountId: String!) {\n\t\tsessions(tier: $tier, accountId: $accountId) {\n\t\t\tid\n\t\t\ttier\n\t\t\tmintedAt\n\t\t\tfamilyId\n\t\t}\n\t}\n": typeof types.SessionsDocument,
    "\n\tquery ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n\t\treuseEvents(tier: $tier, accountId: $accountId) {\n\t\t\tfamilyId\n\t\t\ttier\n\t\t\taccountId\n\t\t\taction\n\t\t\tat\n\t\t}\n\t}\n": typeof types.ReuseEventsDocument,
    "\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n": typeof types.ItemCategoriesDocument,
    "\n\tquery ShopOwnerCompanies($idShopOwner: ID!) {\n\t\tshopOwnerCompanies(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tlegalName\n\t\t\tvatNumber\n\t\t\ttaxCode\n\t\t\tcontactPerson\n\t\t\tadministrator\n\t\t\tuniqueCode\n\t\t\tcertifiedEmail\n\t\t\tregistryExtract\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ShopOwnerCompaniesDocument,
    "\n\tquery UsersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$disabled: Boolean!\n\t\t$deleted: Boolean!\n\t\t$sortBy: GraphQLUsersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tusersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\tdisabled\n\t\t\t\tdisabledBy\n\t\t\t\tdisabledReason\n\t\t\t\tdeleted\n\t\t\t\temailVerified\n\t\t\t}\n\t\t}\n\t}\n": typeof types.UsersActiveTblDocument,
};
const documents: Documents = {
    "\n\tmutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tadminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n": types.AdminUpdatePwdDocument,
    "\n\tmutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerAdd(login: $login, personalData: $personalData)\n\t}\n": types.ShopOwnerAddDocument,
    "\n\tmutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerUpdate(_id: $_id, personalData: $personalData)\n\t}\n": types.ShopOwnerUpdateDocument,
    "\n\tmutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n\t\tshopOwnerUpdateEmail(_id: $_id, email: $email)\n\t}\n": types.ShopOwnerUpdateEmailDocument,
    "\n\tmutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n\t\tshopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n\t}\n": types.ShopOwnerUpdateStatusDocument,
    "\n\tmutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\tshopOwnerUpdatePreferences(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n": types.ShopOwnerUpdatePreferencesDocument,
    "\n\tmutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n\t\tshopOwnerUpdateNote(_id: $_id, notes: $notes)\n\t}\n": types.ShopOwnerUpdateNoteDocument,
    "\n\tmutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyAdd(idShopOwner: $idShopOwner, company: $company)\n\t}\n": types.CompanyAddDocument,
    "\n\tmutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyUpdate(_id: $_id, company: $company)\n\t}\n": types.CompanyUpdateDocument,
    "\n\tmutation CompanyDel($_id: ID!) {\n\t\tcompanyDel(_id: $_id)\n\t}\n": types.CompanyDelDocument,
    "\n\tmutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryAdd(itemCategory: $itemCategory)\n\t}\n": types.ItemCategoryAddDocument,
    "\n\tmutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n\t}\n": types.ItemCategoryUpdateDocument,
    "\n\tmutation ItemCategoryDel($_id: ID!) {\n\t\titemCategoryDel(_id: $_id)\n\t}\n": types.ItemCategoryDelDocument,
    "\n\tmutation KeygripRotate {\n\t\tkeygripRotate\n\t}\n": types.KeygripRotateDocument,
    "\n\tmutation KeygripRetire($id: String!) {\n\t\tkeygripRetire(id: $id)\n\t}\n": types.KeygripRetireDocument,
    "\n\tmutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n\t\trevokeSession(tier: $tier, accountId: $accountId, id: $id)\n\t}\n": types.RevokeSessionDocument,
    "\n\tmutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n\t\trevokeAllSessions(tier: $tier, accountId: $accountId)\n\t}\n": types.RevokeAllSessionsDocument,
    "\n\tmutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n\t\tuserUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n\t}\n": types.UserUpdateStatusDocument,
    "\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n": types.InfoAdminAfterLoginDocument,
    "\n\tquery ShopOwnersStats {\n\t\tshopOwnersStats\n\t}\n": types.ShopOwnersStatsDocument,
    "\n\tquery ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n\t\tshopOwnersPerPeriod(period: $period) {\n\t\t\tgranularity\n\t\t\tpoints {\n\t\t\t\tdate\n\t\t\t\ttotal\n\t\t\t}\n\t\t}\n\t}\n": types.ShopOwnersPerPeriodDocument,
    "\n\tquery ShopOwnersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLShopOwnersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tshopOwnersActiveTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\twaitApprov\n\t\t\t\tpersonalData {\n\t\t\t\t\tfirstName\n\t\t\t\t\tlastName\n\t\t\t\t\taddress {\n\t\t\t\t\t\tstreet\n\t\t\t\t\t\tpostalCode\n\t\t\t\t\t\tcity\n\t\t\t\t\t\tprovince\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": types.ShopOwnersActiveTblDocument,
    "\n\tquery ShopOwnerById($idShopOwner: ID!) {\n\t\tshopOwnerById(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tregisteredAt\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\tdisabledBy\n\t\t\tdisabledReason\n\t\t\twaitApprov\n\t\t\tnotes\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\temail\n\t\t\t\t\tlandline\n\t\t\t\t\tmobile\n\t\t\t\t}\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n": types.ShopOwnerByIdDocument,
    "\n\tquery KeygripStatus {\n\t\tkeygripStatus {\n\t\t\tversion\n\t\t\tfingerprint\n\t\t\tkeys {\n\t\t\t\tid\n\t\t\t\tcreatedAt\n\t\t\t\tageDays\n\t\t\t}\n\t\t\tholders {\n\t\t\t\tservice\n\t\t\t\tfingerprint\n\t\t\t\tlastSeen\n\t\t\t\tcurrent\n\t\t\t}\n\t\t}\n\t}\n": types.KeygripStatusDocument,
    "\n\tquery Sessions($tier: GraphQLTier!, $accountId: String!) {\n\t\tsessions(tier: $tier, accountId: $accountId) {\n\t\t\tid\n\t\t\ttier\n\t\t\tmintedAt\n\t\t\tfamilyId\n\t\t}\n\t}\n": types.SessionsDocument,
    "\n\tquery ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n\t\treuseEvents(tier: $tier, accountId: $accountId) {\n\t\t\tfamilyId\n\t\t\ttier\n\t\t\taccountId\n\t\t\taction\n\t\t\tat\n\t\t}\n\t}\n": types.ReuseEventsDocument,
    "\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n": types.ItemCategoriesDocument,
    "\n\tquery ShopOwnerCompanies($idShopOwner: ID!) {\n\t\tshopOwnerCompanies(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tlegalName\n\t\t\tvatNumber\n\t\t\ttaxCode\n\t\t\tcontactPerson\n\t\t\tadministrator\n\t\t\tuniqueCode\n\t\t\tcertifiedEmail\n\t\t\tregistryExtract\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": types.ShopOwnerCompaniesDocument,
    "\n\tquery UsersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$disabled: Boolean!\n\t\t$deleted: Boolean!\n\t\t$sortBy: GraphQLUsersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tusersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\tdisabled\n\t\t\t\tdisabledBy\n\t\t\t\tdisabledReason\n\t\t\t\tdeleted\n\t\t\t\temailVerified\n\t\t\t}\n\t\t}\n\t}\n": types.UsersActiveTblDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tadminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n"): (typeof documents)["\n\tmutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tadminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerAdd(login: $login, personalData: $personalData)\n\t}\n"): (typeof documents)["\n\tmutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerAdd(login: $login, personalData: $personalData)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerUpdate(_id: $_id, personalData: $personalData)\n\t}\n"): (typeof documents)["\n\tmutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n\t\tshopOwnerUpdate(_id: $_id, personalData: $personalData)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n\t\tshopOwnerUpdateEmail(_id: $_id, email: $email)\n\t}\n"): (typeof documents)["\n\tmutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n\t\tshopOwnerUpdateEmail(_id: $_id, email: $email)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n\t\tshopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n\t}\n"): (typeof documents)["\n\tmutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n\t\tshopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\tshopOwnerUpdatePreferences(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n"): (typeof documents)["\n\tmutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\tshopOwnerUpdatePreferences(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n\t\tshopOwnerUpdateNote(_id: $_id, notes: $notes)\n\t}\n"): (typeof documents)["\n\tmutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n\t\tshopOwnerUpdateNote(_id: $_id, notes: $notes)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyAdd(idShopOwner: $idShopOwner, company: $company)\n\t}\n"): (typeof documents)["\n\tmutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyAdd(idShopOwner: $idShopOwner, company: $company)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyUpdate(_id: $_id, company: $company)\n\t}\n"): (typeof documents)["\n\tmutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n\t\tcompanyUpdate(_id: $_id, company: $company)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation CompanyDel($_id: ID!) {\n\t\tcompanyDel(_id: $_id)\n\t}\n"): (typeof documents)["\n\tmutation CompanyDel($_id: ID!) {\n\t\tcompanyDel(_id: $_id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryAdd(itemCategory: $itemCategory)\n\t}\n"): (typeof documents)["\n\tmutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryAdd(itemCategory: $itemCategory)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n\t}\n"): (typeof documents)["\n\tmutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n\t\titemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ItemCategoryDel($_id: ID!) {\n\t\titemCategoryDel(_id: $_id)\n\t}\n"): (typeof documents)["\n\tmutation ItemCategoryDel($_id: ID!) {\n\t\titemCategoryDel(_id: $_id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation KeygripRotate {\n\t\tkeygripRotate\n\t}\n"): (typeof documents)["\n\tmutation KeygripRotate {\n\t\tkeygripRotate\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation KeygripRetire($id: String!) {\n\t\tkeygripRetire(id: $id)\n\t}\n"): (typeof documents)["\n\tmutation KeygripRetire($id: String!) {\n\t\tkeygripRetire(id: $id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n\t\trevokeSession(tier: $tier, accountId: $accountId, id: $id)\n\t}\n"): (typeof documents)["\n\tmutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n\t\trevokeSession(tier: $tier, accountId: $accountId, id: $id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n\t\trevokeAllSessions(tier: $tier, accountId: $accountId)\n\t}\n"): (typeof documents)["\n\tmutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n\t\trevokeAllSessions(tier: $tier, accountId: $accountId)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n\t\tuserUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n\t}\n"): (typeof documents)["\n\tmutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n\t\tuserUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ShopOwnersStats {\n\t\tshopOwnersStats\n\t}\n"): (typeof documents)["\n\tquery ShopOwnersStats {\n\t\tshopOwnersStats\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n\t\tshopOwnersPerPeriod(period: $period) {\n\t\t\tgranularity\n\t\t\tpoints {\n\t\t\t\tdate\n\t\t\t\ttotal\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n\t\tshopOwnersPerPeriod(period: $period) {\n\t\t\tgranularity\n\t\t\tpoints {\n\t\t\t\tdate\n\t\t\t\ttotal\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ShopOwnersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLShopOwnersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tshopOwnersActiveTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\twaitApprov\n\t\t\t\tpersonalData {\n\t\t\t\t\tfirstName\n\t\t\t\t\tlastName\n\t\t\t\t\taddress {\n\t\t\t\t\t\tstreet\n\t\t\t\t\t\tpostalCode\n\t\t\t\t\t\tcity\n\t\t\t\t\t\tprovince\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ShopOwnersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLShopOwnersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tshopOwnersActiveTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\twaitApprov\n\t\t\t\tpersonalData {\n\t\t\t\t\tfirstName\n\t\t\t\t\tlastName\n\t\t\t\t\taddress {\n\t\t\t\t\t\tstreet\n\t\t\t\t\t\tpostalCode\n\t\t\t\t\t\tcity\n\t\t\t\t\t\tprovince\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ShopOwnerById($idShopOwner: ID!) {\n\t\tshopOwnerById(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tregisteredAt\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\tdisabledBy\n\t\t\tdisabledReason\n\t\t\twaitApprov\n\t\t\tnotes\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\temail\n\t\t\t\t\tlandline\n\t\t\t\t\tmobile\n\t\t\t\t}\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ShopOwnerById($idShopOwner: ID!) {\n\t\tshopOwnerById(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tregisteredAt\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\tdisabledBy\n\t\t\tdisabledReason\n\t\t\twaitApprov\n\t\t\tnotes\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\temail\n\t\t\t\t\tlandline\n\t\t\t\t\tmobile\n\t\t\t\t}\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery KeygripStatus {\n\t\tkeygripStatus {\n\t\t\tversion\n\t\t\tfingerprint\n\t\t\tkeys {\n\t\t\t\tid\n\t\t\t\tcreatedAt\n\t\t\t\tageDays\n\t\t\t}\n\t\t\tholders {\n\t\t\t\tservice\n\t\t\t\tfingerprint\n\t\t\t\tlastSeen\n\t\t\t\tcurrent\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery KeygripStatus {\n\t\tkeygripStatus {\n\t\t\tversion\n\t\t\tfingerprint\n\t\t\tkeys {\n\t\t\t\tid\n\t\t\t\tcreatedAt\n\t\t\t\tageDays\n\t\t\t}\n\t\t\tholders {\n\t\t\t\tservice\n\t\t\t\tfingerprint\n\t\t\t\tlastSeen\n\t\t\t\tcurrent\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery Sessions($tier: GraphQLTier!, $accountId: String!) {\n\t\tsessions(tier: $tier, accountId: $accountId) {\n\t\t\tid\n\t\t\ttier\n\t\t\tmintedAt\n\t\t\tfamilyId\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery Sessions($tier: GraphQLTier!, $accountId: String!) {\n\t\tsessions(tier: $tier, accountId: $accountId) {\n\t\t\tid\n\t\t\ttier\n\t\t\tmintedAt\n\t\t\tfamilyId\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n\t\treuseEvents(tier: $tier, accountId: $accountId) {\n\t\t\tfamilyId\n\t\t\ttier\n\t\t\taccountId\n\t\t\taction\n\t\t\tat\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n\t\treuseEvents(tier: $tier, accountId: $accountId) {\n\t\t\tfamilyId\n\t\t\ttier\n\t\t\taccountId\n\t\t\taction\n\t\t\tat\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ShopOwnerCompanies($idShopOwner: ID!) {\n\t\tshopOwnerCompanies(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tlegalName\n\t\t\tvatNumber\n\t\t\ttaxCode\n\t\t\tcontactPerson\n\t\t\tadministrator\n\t\t\tuniqueCode\n\t\t\tcertifiedEmail\n\t\t\tregistryExtract\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ShopOwnerCompanies($idShopOwner: ID!) {\n\t\tshopOwnerCompanies(idShopOwner: $idShopOwner) {\n\t\t\t_id\n\t\t\tlegalName\n\t\t\tvatNumber\n\t\t\ttaxCode\n\t\t\tcontactPerson\n\t\t\tadministrator\n\t\t\tuniqueCode\n\t\t\tcertifiedEmail\n\t\t\tregistryExtract\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery UsersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$disabled: Boolean!\n\t\t$deleted: Boolean!\n\t\t$sortBy: GraphQLUsersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tusersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\tdisabled\n\t\t\t\tdisabledBy\n\t\t\t\tdisabledReason\n\t\t\t\tdeleted\n\t\t\t\temailVerified\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery UsersActiveTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$disabled: Boolean!\n\t\t$deleted: Boolean!\n\t\t$sortBy: GraphQLUsersTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\tusersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tregisteredAt\n\t\t\t\temail\n\t\t\t\tdisabled\n\t\t\t\tdisabledBy\n\t\t\t\tdisabledReason\n\t\t\t\tdeleted\n\t\t\t\temailVerified\n\t\t\t}\n\t\t}\n\t}\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;