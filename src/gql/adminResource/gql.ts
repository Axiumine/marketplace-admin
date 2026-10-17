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
    "\n  mutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    adminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n": typeof types.AdminUpdatePwdDocument,
    "\n  mutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerAdd(login: $login, personalData: $personalData)\n  }\n": typeof types.ShopOwnerAddDocument,
    "\n  mutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerUpdate(_id: $_id, personalData: $personalData)\n  }\n": typeof types.ShopOwnerUpdateDocument,
    "\n  mutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n    shopOwnerUpdateEmail(_id: $_id, email: $email)\n  }\n": typeof types.ShopOwnerUpdateEmailDocument,
    "\n  mutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n    shopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n  }\n": typeof types.ShopOwnerUpdateStatusDocument,
    "\n  mutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n    shopOwnerUpdatePreferences(\n      _id: $_id\n      rememberMe: $rememberMe\n      onboardingDone: $onboardingDone\n      onboardingStep: $onboardingStep\n    )\n  }\n": typeof types.ShopOwnerUpdatePreferencesDocument,
    "\n  mutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n    shopOwnerUpdateNote(_id: $_id, notes: $notes)\n  }\n": typeof types.ShopOwnerUpdateNoteDocument,
    "\n  mutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n    companyAdd(idShopOwner: $idShopOwner, company: $company)\n  }\n": typeof types.CompanyAddDocument,
    "\n  mutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n    companyUpdate(_id: $_id, company: $company)\n  }\n": typeof types.CompanyUpdateDocument,
    "\n  mutation CompanyDel($_id: ID!) {\n    companyDel(_id: $_id)\n  }\n": typeof types.CompanyDelDocument,
    "\n  mutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryAdd(itemCategory: $itemCategory)\n  }\n": typeof types.ItemCategoryAddDocument,
    "\n  mutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n  }\n": typeof types.ItemCategoryUpdateDocument,
    "\n  mutation ItemCategoryDel($_id: ID!) {\n    itemCategoryDel(_id: $_id)\n  }\n": typeof types.ItemCategoryDelDocument,
    "\n  mutation KeygripRotate {\n    keygripRotate\n  }\n": typeof types.KeygripRotateDocument,
    "\n  mutation KeygripRetire($id: String!) {\n    keygripRetire(id: $id)\n  }\n": typeof types.KeygripRetireDocument,
    "\n  mutation KeygripResweep {\n    keygripResweep\n  }\n": typeof types.KeygripResweepDocument,
    "\n  mutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n    revokeSession(tier: $tier, accountId: $accountId, id: $id)\n  }\n": typeof types.RevokeSessionDocument,
    "\n  mutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n    revokeAllSessions(tier: $tier, accountId: $accountId)\n  }\n": typeof types.RevokeAllSessionsDocument,
    "\n  mutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n    userUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n  }\n": typeof types.UserUpdateStatusDocument,
    "\n  query InfoAdminAfterLogin {\n    infoAdminAfterLogin {\n      _id\n      email\n    }\n  }\n": typeof types.InfoAdminAfterLoginDocument,
    "\n  query ShopOwnersStats {\n    shopOwnersStats\n  }\n": typeof types.ShopOwnersStatsDocument,
    "\n  query ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n    shopOwnersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n": typeof types.ShopOwnersPerPeriodDocument,
    "\n  query ShopOwnersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $search: String\n    $sortBy: GraphQLShopOwnersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    shopOwnersActiveTbl(\n      offset: $offset\n      limit: $limit\n      disabled: $disabled\n      deleted: $deleted\n      search: $search\n      sortBy: $sortBy\n      sortDir: $sortDir\n    ) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        waitApprov\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        personalData {\n          firstName\n          lastName\n          address {\n            street\n            postalCode\n            city\n            province\n          }\n        }\n      }\n    }\n  }\n": typeof types.ShopOwnersActiveTblDocument,
    "\n  query ShopOwnerById($idShopOwner: ID!) {\n    shopOwnerById(idShopOwner: $idShopOwner) {\n      _id\n      registeredAt\n      deleted\n      disabled\n      disabledBy\n      disabledReason\n      waitApprov\n      notes\n      login {\n        email\n        firstLogin\n        lastLogin\n        onboardingStep\n        onboardingDone\n        rememberMe\n      }\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          email\n          landline\n          mobile\n        }\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      resetPwd {\n        resetDateReq\n      }\n    }\n  }\n": typeof types.ShopOwnerByIdDocument,
    "\n  query KeygripStatus {\n    keygripStatus {\n      version\n      fingerprint\n      keys {\n        id\n        createdAt\n        ageDays\n      }\n      holders {\n        service\n        fingerprint\n        lastSeen\n        current\n      }\n    }\n  }\n": typeof types.KeygripStatusDocument,
    "\n  query Sessions($tier: GraphQLTier!, $accountId: String!) {\n    sessions(tier: $tier, accountId: $accountId) {\n      id\n      tier\n      mintedAt\n      familyId\n    }\n  }\n": typeof types.SessionsDocument,
    "\n  query ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n    reuseEvents(tier: $tier, accountId: $accountId) {\n      familyId\n      tier\n      accountId\n      action\n      at\n    }\n  }\n": typeof types.ReuseEventsDocument,
    "\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n": typeof types.ItemCategoriesDocument,
    "\n  query ShopOwnerCompanies($idShopOwner: ID!) {\n    shopOwnerCompanies(idShopOwner: $idShopOwner) {\n      _id\n      legalName\n      vatNumber\n      taxCode\n      contactPerson\n      administrator\n      uniqueCode\n      certifiedEmail\n      registryExtract\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n": typeof types.ShopOwnerCompaniesDocument,
    "\n  query UsersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $sortBy: GraphQLUsersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    usersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        emailVerified\n      }\n    }\n  }\n": typeof types.UsersActiveTblDocument,
    "\n  query UsersStats {\n    usersStats\n  }\n": typeof types.UsersStatsDocument,
    "\n  query UsersPerPeriod($period: GraphQLUsersPeriod!) {\n    usersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n": typeof types.UsersPerPeriodDocument,
};
const documents: Documents = {
    "\n  mutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    adminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n": types.AdminUpdatePwdDocument,
    "\n  mutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerAdd(login: $login, personalData: $personalData)\n  }\n": types.ShopOwnerAddDocument,
    "\n  mutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerUpdate(_id: $_id, personalData: $personalData)\n  }\n": types.ShopOwnerUpdateDocument,
    "\n  mutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n    shopOwnerUpdateEmail(_id: $_id, email: $email)\n  }\n": types.ShopOwnerUpdateEmailDocument,
    "\n  mutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n    shopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n  }\n": types.ShopOwnerUpdateStatusDocument,
    "\n  mutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n    shopOwnerUpdatePreferences(\n      _id: $_id\n      rememberMe: $rememberMe\n      onboardingDone: $onboardingDone\n      onboardingStep: $onboardingStep\n    )\n  }\n": types.ShopOwnerUpdatePreferencesDocument,
    "\n  mutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n    shopOwnerUpdateNote(_id: $_id, notes: $notes)\n  }\n": types.ShopOwnerUpdateNoteDocument,
    "\n  mutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n    companyAdd(idShopOwner: $idShopOwner, company: $company)\n  }\n": types.CompanyAddDocument,
    "\n  mutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n    companyUpdate(_id: $_id, company: $company)\n  }\n": types.CompanyUpdateDocument,
    "\n  mutation CompanyDel($_id: ID!) {\n    companyDel(_id: $_id)\n  }\n": types.CompanyDelDocument,
    "\n  mutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryAdd(itemCategory: $itemCategory)\n  }\n": types.ItemCategoryAddDocument,
    "\n  mutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n  }\n": types.ItemCategoryUpdateDocument,
    "\n  mutation ItemCategoryDel($_id: ID!) {\n    itemCategoryDel(_id: $_id)\n  }\n": types.ItemCategoryDelDocument,
    "\n  mutation KeygripRotate {\n    keygripRotate\n  }\n": types.KeygripRotateDocument,
    "\n  mutation KeygripRetire($id: String!) {\n    keygripRetire(id: $id)\n  }\n": types.KeygripRetireDocument,
    "\n  mutation KeygripResweep {\n    keygripResweep\n  }\n": types.KeygripResweepDocument,
    "\n  mutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n    revokeSession(tier: $tier, accountId: $accountId, id: $id)\n  }\n": types.RevokeSessionDocument,
    "\n  mutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n    revokeAllSessions(tier: $tier, accountId: $accountId)\n  }\n": types.RevokeAllSessionsDocument,
    "\n  mutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n    userUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n  }\n": types.UserUpdateStatusDocument,
    "\n  query InfoAdminAfterLogin {\n    infoAdminAfterLogin {\n      _id\n      email\n    }\n  }\n": types.InfoAdminAfterLoginDocument,
    "\n  query ShopOwnersStats {\n    shopOwnersStats\n  }\n": types.ShopOwnersStatsDocument,
    "\n  query ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n    shopOwnersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n": types.ShopOwnersPerPeriodDocument,
    "\n  query ShopOwnersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $search: String\n    $sortBy: GraphQLShopOwnersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    shopOwnersActiveTbl(\n      offset: $offset\n      limit: $limit\n      disabled: $disabled\n      deleted: $deleted\n      search: $search\n      sortBy: $sortBy\n      sortDir: $sortDir\n    ) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        waitApprov\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        personalData {\n          firstName\n          lastName\n          address {\n            street\n            postalCode\n            city\n            province\n          }\n        }\n      }\n    }\n  }\n": types.ShopOwnersActiveTblDocument,
    "\n  query ShopOwnerById($idShopOwner: ID!) {\n    shopOwnerById(idShopOwner: $idShopOwner) {\n      _id\n      registeredAt\n      deleted\n      disabled\n      disabledBy\n      disabledReason\n      waitApprov\n      notes\n      login {\n        email\n        firstLogin\n        lastLogin\n        onboardingStep\n        onboardingDone\n        rememberMe\n      }\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          email\n          landline\n          mobile\n        }\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      resetPwd {\n        resetDateReq\n      }\n    }\n  }\n": types.ShopOwnerByIdDocument,
    "\n  query KeygripStatus {\n    keygripStatus {\n      version\n      fingerprint\n      keys {\n        id\n        createdAt\n        ageDays\n      }\n      holders {\n        service\n        fingerprint\n        lastSeen\n        current\n      }\n    }\n  }\n": types.KeygripStatusDocument,
    "\n  query Sessions($tier: GraphQLTier!, $accountId: String!) {\n    sessions(tier: $tier, accountId: $accountId) {\n      id\n      tier\n      mintedAt\n      familyId\n    }\n  }\n": types.SessionsDocument,
    "\n  query ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n    reuseEvents(tier: $tier, accountId: $accountId) {\n      familyId\n      tier\n      accountId\n      action\n      at\n    }\n  }\n": types.ReuseEventsDocument,
    "\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n": types.ItemCategoriesDocument,
    "\n  query ShopOwnerCompanies($idShopOwner: ID!) {\n    shopOwnerCompanies(idShopOwner: $idShopOwner) {\n      _id\n      legalName\n      vatNumber\n      taxCode\n      contactPerson\n      administrator\n      uniqueCode\n      certifiedEmail\n      registryExtract\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n": types.ShopOwnerCompaniesDocument,
    "\n  query UsersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $sortBy: GraphQLUsersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    usersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        emailVerified\n      }\n    }\n  }\n": types.UsersActiveTblDocument,
    "\n  query UsersStats {\n    usersStats\n  }\n": types.UsersStatsDocument,
    "\n  query UsersPerPeriod($period: GraphQLUsersPeriod!) {\n    usersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n": types.UsersPerPeriodDocument,
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
export function graphql(source: "\n  mutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    adminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n"): (typeof documents)["\n  mutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    adminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerAdd(login: $login, personalData: $personalData)\n  }\n"): (typeof documents)["\n  mutation ShopOwnerAdd($login: GraphQLInputLogin!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerAdd(login: $login, personalData: $personalData)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerUpdate(_id: $_id, personalData: $personalData)\n  }\n"): (typeof documents)["\n  mutation ShopOwnerUpdate($_id: ID!, $personalData: GraphQLInputShopOwnerPersonalData!) {\n    shopOwnerUpdate(_id: $_id, personalData: $personalData)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n    shopOwnerUpdateEmail(_id: $_id, email: $email)\n  }\n"): (typeof documents)["\n  mutation ShopOwnerUpdateEmail($_id: ID!, $email: String!) {\n    shopOwnerUpdateEmail(_id: $_id, email: $email)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n    shopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n  }\n"): (typeof documents)["\n  mutation ShopOwnerUpdateStatus($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!, $disabledReason: String) {\n    shopOwnerUpdateStatus(_id: $_id, disabled: $disabled, waitApprov: $waitApprov, disabledReason: $disabledReason)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n    shopOwnerUpdatePreferences(\n      _id: $_id\n      rememberMe: $rememberMe\n      onboardingDone: $onboardingDone\n      onboardingStep: $onboardingStep\n    )\n  }\n"): (typeof documents)["\n  mutation ShopOwnerUpdatePreferences($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n    shopOwnerUpdatePreferences(\n      _id: $_id\n      rememberMe: $rememberMe\n      onboardingDone: $onboardingDone\n      onboardingStep: $onboardingStep\n    )\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n    shopOwnerUpdateNote(_id: $_id, notes: $notes)\n  }\n"): (typeof documents)["\n  mutation ShopOwnerUpdateNote($_id: ID!, $notes: String!) {\n    shopOwnerUpdateNote(_id: $_id, notes: $notes)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n    companyAdd(idShopOwner: $idShopOwner, company: $company)\n  }\n"): (typeof documents)["\n  mutation CompanyAdd($idShopOwner: ID!, $company: GraphQLInputCompany!) {\n    companyAdd(idShopOwner: $idShopOwner, company: $company)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n    companyUpdate(_id: $_id, company: $company)\n  }\n"): (typeof documents)["\n  mutation CompanyUpdate($_id: ID!, $company: GraphQLInputCompany!) {\n    companyUpdate(_id: $_id, company: $company)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CompanyDel($_id: ID!) {\n    companyDel(_id: $_id)\n  }\n"): (typeof documents)["\n  mutation CompanyDel($_id: ID!) {\n    companyDel(_id: $_id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryAdd(itemCategory: $itemCategory)\n  }\n"): (typeof documents)["\n  mutation ItemCategoryAdd($itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryAdd(itemCategory: $itemCategory)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n  }\n"): (typeof documents)["\n  mutation ItemCategoryUpdate($_id: ID!, $itemCategory: GraphQLInputItemCategory!) {\n    itemCategoryUpdate(_id: $_id, itemCategory: $itemCategory)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ItemCategoryDel($_id: ID!) {\n    itemCategoryDel(_id: $_id)\n  }\n"): (typeof documents)["\n  mutation ItemCategoryDel($_id: ID!) {\n    itemCategoryDel(_id: $_id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation KeygripRotate {\n    keygripRotate\n  }\n"): (typeof documents)["\n  mutation KeygripRotate {\n    keygripRotate\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation KeygripRetire($id: String!) {\n    keygripRetire(id: $id)\n  }\n"): (typeof documents)["\n  mutation KeygripRetire($id: String!) {\n    keygripRetire(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation KeygripResweep {\n    keygripResweep\n  }\n"): (typeof documents)["\n  mutation KeygripResweep {\n    keygripResweep\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n    revokeSession(tier: $tier, accountId: $accountId, id: $id)\n  }\n"): (typeof documents)["\n  mutation RevokeSession($tier: GraphQLTier!, $accountId: String!, $id: String!) {\n    revokeSession(tier: $tier, accountId: $accountId, id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n    revokeAllSessions(tier: $tier, accountId: $accountId)\n  }\n"): (typeof documents)["\n  mutation RevokeAllSessions($tier: GraphQLTier!, $accountId: String!) {\n    revokeAllSessions(tier: $tier, accountId: $accountId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n    userUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n  }\n"): (typeof documents)["\n  mutation UserUpdateStatus($_id: ID!, $disabled: Boolean!, $disabledReason: String) {\n    userUpdateStatus(_id: $_id, disabled: $disabled, disabledReason: $disabledReason)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query InfoAdminAfterLogin {\n    infoAdminAfterLogin {\n      _id\n      email\n    }\n  }\n"): (typeof documents)["\n  query InfoAdminAfterLogin {\n    infoAdminAfterLogin {\n      _id\n      email\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ShopOwnersStats {\n    shopOwnersStats\n  }\n"): (typeof documents)["\n  query ShopOwnersStats {\n    shopOwnersStats\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n    shopOwnersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n"): (typeof documents)["\n  query ShopOwnersPerPeriod($period: GraphQLShopOwnersPeriod!) {\n    shopOwnersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ShopOwnersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $search: String\n    $sortBy: GraphQLShopOwnersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    shopOwnersActiveTbl(\n      offset: $offset\n      limit: $limit\n      disabled: $disabled\n      deleted: $deleted\n      search: $search\n      sortBy: $sortBy\n      sortDir: $sortDir\n    ) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        waitApprov\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        personalData {\n          firstName\n          lastName\n          address {\n            street\n            postalCode\n            city\n            province\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query ShopOwnersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $search: String\n    $sortBy: GraphQLShopOwnersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    shopOwnersActiveTbl(\n      offset: $offset\n      limit: $limit\n      disabled: $disabled\n      deleted: $deleted\n      search: $search\n      sortBy: $sortBy\n      sortDir: $sortDir\n    ) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        waitApprov\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        personalData {\n          firstName\n          lastName\n          address {\n            street\n            postalCode\n            city\n            province\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ShopOwnerById($idShopOwner: ID!) {\n    shopOwnerById(idShopOwner: $idShopOwner) {\n      _id\n      registeredAt\n      deleted\n      disabled\n      disabledBy\n      disabledReason\n      waitApprov\n      notes\n      login {\n        email\n        firstLogin\n        lastLogin\n        onboardingStep\n        onboardingDone\n        rememberMe\n      }\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          email\n          landline\n          mobile\n        }\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      resetPwd {\n        resetDateReq\n      }\n    }\n  }\n"): (typeof documents)["\n  query ShopOwnerById($idShopOwner: ID!) {\n    shopOwnerById(idShopOwner: $idShopOwner) {\n      _id\n      registeredAt\n      deleted\n      disabled\n      disabledBy\n      disabledReason\n      waitApprov\n      notes\n      login {\n        email\n        firstLogin\n        lastLogin\n        onboardingStep\n        onboardingDone\n        rememberMe\n      }\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          email\n          landline\n          mobile\n        }\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      resetPwd {\n        resetDateReq\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query KeygripStatus {\n    keygripStatus {\n      version\n      fingerprint\n      keys {\n        id\n        createdAt\n        ageDays\n      }\n      holders {\n        service\n        fingerprint\n        lastSeen\n        current\n      }\n    }\n  }\n"): (typeof documents)["\n  query KeygripStatus {\n    keygripStatus {\n      version\n      fingerprint\n      keys {\n        id\n        createdAt\n        ageDays\n      }\n      holders {\n        service\n        fingerprint\n        lastSeen\n        current\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Sessions($tier: GraphQLTier!, $accountId: String!) {\n    sessions(tier: $tier, accountId: $accountId) {\n      id\n      tier\n      mintedAt\n      familyId\n    }\n  }\n"): (typeof documents)["\n  query Sessions($tier: GraphQLTier!, $accountId: String!) {\n    sessions(tier: $tier, accountId: $accountId) {\n      id\n      tier\n      mintedAt\n      familyId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n    reuseEvents(tier: $tier, accountId: $accountId) {\n      familyId\n      tier\n      accountId\n      action\n      at\n    }\n  }\n"): (typeof documents)["\n  query ReuseEvents($tier: GraphQLTier!, $accountId: String!) {\n    reuseEvents(tier: $tier, accountId: $accountId) {\n      familyId\n      tier\n      accountId\n      action\n      at\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n"): (typeof documents)["\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ShopOwnerCompanies($idShopOwner: ID!) {\n    shopOwnerCompanies(idShopOwner: $idShopOwner) {\n      _id\n      legalName\n      vatNumber\n      taxCode\n      contactPerson\n      administrator\n      uniqueCode\n      certifiedEmail\n      registryExtract\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query ShopOwnerCompanies($idShopOwner: ID!) {\n    shopOwnerCompanies(idShopOwner: $idShopOwner) {\n      _id\n      legalName\n      vatNumber\n      taxCode\n      contactPerson\n      administrator\n      uniqueCode\n      certifiedEmail\n      registryExtract\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query UsersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $sortBy: GraphQLUsersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    usersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        emailVerified\n      }\n    }\n  }\n"): (typeof documents)["\n  query UsersActiveTbl(\n    $offset: Int!\n    $limit: Int!\n    $disabled: Boolean!\n    $deleted: Boolean!\n    $sortBy: GraphQLUsersTblSortField!\n    $sortDir: GraphQLSortDirection!\n  ) {\n    usersActiveTbl(offset: $offset, limit: $limit, disabled: $disabled, deleted: $deleted, sortBy: $sortBy, sortDir: $sortDir) {\n      total\n      items {\n        _id\n        registeredAt\n        email\n        disabled\n        disabledBy\n        disabledReason\n        deleted\n        emailVerified\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query UsersStats {\n    usersStats\n  }\n"): (typeof documents)["\n  query UsersStats {\n    usersStats\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query UsersPerPeriod($period: GraphQLUsersPeriod!) {\n    usersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n"): (typeof documents)["\n  query UsersPerPeriod($period: GraphQLUsersPeriod!) {\n    usersPerPeriod(period: $period) {\n      granularity\n      points {\n        date\n        total\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;