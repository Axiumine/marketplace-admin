/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type GraphQlInputAddress = {
  city: string;
  /**
   * ⚠️ **Coordinates only and nullable.** No `type` field, like `GraphQLInputCompanyPosition` — the
   * resolver adds `type: 'Point'`. Nullable because the operator can save personal data whose
   * address was never re-picked. ⚠️ Omitting it does **not** preserve the stored point:
   * `shopOwnerUpdate` `$set`s the whole `personalData`, so a save without `position` erases it. Send
   * back the point the query returned whenever the address is left alone.
   */
  position?: GraphQlInputAddressPosition | null | undefined;
  postalCode: string;
  province: string;
  street: string;
};

export type GraphQlInputAddressPosition = {
  coordinates: Array<number>;
};

export type GraphQlInputBirth = {
  date: string;
};

/**
 * Everything the operator types about a company, in one object — one form and one Save, which is also what
 * lets `companyUpdate` `$set` the document in a single atomic write.
 *
 * `_id` and `idShopOwner` are deliberately absent: the first is minted by the service, the second is a
 * separate argument on `companyAdd` and is nowhere on the update path, so a company cannot be moved to
 * another owner by editing its card.
 *
 * `taxCode` and `uniqueCode` are the two optional ones, mirroring the collection's `required` array. Both are
 * dropped rather than stored empty when blank — sending `null` for them is legal on the wire and the
 * service reads it as "not set".
 */
export type GraphQlInputCompany = {
  address: GraphQlInputCompanyAddress;
  administrator: string;
  certifiedEmail: string;
  contactPerson: string;
  legalName: string;
  registryExtract: string;
  taxCode?: string | null | undefined;
  uniqueCode?: string | null | undefined;
  vatNumber: string;
};

export type GraphQlInputCompanyAddress = {
  city: string;
  position: GraphQlInputCompanyPosition;
  postalCode: string;
  province: string;
  street: string;
};

/**
 * ⚠️ **Coordinates only.** This input has no `type` field: the value has exactly one legal spelling
 * (`Point`), the collection caps it at 5 characters and the model declares it as an enum of one, so
 * accepting it from a client would only be a way to receive `point` or `POINT` and fail the write
 * naming a field the operator never saw. The service writes the literal.
 */
export type GraphQlInputCompanyPosition = {
  coordinates: Array<number>;
};

export type GraphQlInputContacts = {
  email: string;
  landline?: string | null | undefined;
  mobile: string;
};

export type GraphQlInputLogin = {
  email: string;
  password: string;
};

export type GraphQlInputShopOwnerPersonalData = {
  address: GraphQlInputAddress;
  birth: GraphQlInputBirth;
  contacts: GraphQlInputContacts;
  firstName: string;
  lastName: string;
};

/** The width of one bucket. Derived from the range by the server — see `shopOwnersPerPeriod`. */
export type GraphQlPeriodGranularity =
  | 'DAY'
  | 'MONTH';

/**
 * How far back the stats chart looks. `ALL` runs from the month the first shopOwner registered in
 * to the current one; the other two are counted back from today, clamped to the target month's length
 * (one month before 31 March is 28 February, not 3 March).
 */
export type GraphQlShopOwnersPeriod =
  | 'ALL'
  | 'ONE_MONTH'
  | 'THREE_MONTHS';

/**
 * The four columns the table can order by. Value-less on the backend, so the resolver receives the enum
 * NAME and maps it to a Mongo path itself. Each one has a matching index in marketplace-db-setup
 * (`tbl_active_*`); a column not listed here has no index and is refused at schema validation rather
 * than turned into a blocking in-memory sort.
 */
export type GraphQlShopOwnersTblSortField =
  | 'CITY'
  | 'FIRST_NAME'
  | 'LAST_NAME'
  | 'REGISTERED_AT';

export type GraphQlSortDirection =
  | 'ASC'
  | 'DESC';

export type AdminUpdatePwdMutationVariables = Exact<{
  passwordOld: string;
  passwordNew: string;
}>;


export type AdminUpdatePwdMutation = { adminUpdatePwd: boolean };

export type ShopOwnerAddMutationVariables = Exact<{
  login: GraphQlInputLogin;
  personalData: GraphQlInputShopOwnerPersonalData;
}>;


export type ShopOwnerAddMutation = { shopOwnerAdd: boolean };

export type ShopOwnerUpdateMutationVariables = Exact<{
  _id: string | number;
  personalData: GraphQlInputShopOwnerPersonalData;
}>;


export type ShopOwnerUpdateMutation = { shopOwnerUpdate: boolean };

export type ShopOwnerUpdateEmailMutationVariables = Exact<{
  _id: string | number;
  email: string;
}>;


export type ShopOwnerUpdateEmailMutation = { shopOwnerUpdateEmail: boolean };

export type ShopOwnerUpdateStatusMutationVariables = Exact<{
  _id: string | number;
  disabled: boolean;
  waitApprov: boolean;
}>;


export type ShopOwnerUpdateStatusMutation = { shopOwnerUpdateStatus: boolean };

export type ShopOwnerUpdatePreferencesMutationVariables = Exact<{
  _id: string | number;
  rememberMe: boolean;
  onboardingDone: boolean;
  onboardingStep?: string | null | undefined;
}>;


export type ShopOwnerUpdatePreferencesMutation = { shopOwnerUpdatePreferences: boolean };

export type ShopOwnerUpdateNoteMutationVariables = Exact<{
  _id: string | number;
  notes: string;
}>;


export type ShopOwnerUpdateNoteMutation = { shopOwnerUpdateNote: boolean };

export type CompanyAddMutationVariables = Exact<{
  idShopOwner: string | number;
  company: GraphQlInputCompany;
}>;


export type CompanyAddMutation = { companyAdd: boolean };

export type CompanyUpdateMutationVariables = Exact<{
  _id: string | number;
  company: GraphQlInputCompany;
}>;


export type CompanyUpdateMutation = { companyUpdate: boolean };

export type CompanyDelMutationVariables = Exact<{
  _id: string | number;
}>;


export type CompanyDelMutation = { companyDel: boolean };

export type InfoAdminAfterLoginQueryVariables = Exact<{ [key: string]: never; }>;


export type InfoAdminAfterLoginQuery = { infoAdminAfterLogin: { _id: string, email: string } };

export type ShopOwnersStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type ShopOwnersStatsQuery = { shopOwnersStats: number };

export type ShopOwnersPerPeriodQueryVariables = Exact<{
  period: GraphQlShopOwnersPeriod;
}>;


export type ShopOwnersPerPeriodQuery = { shopOwnersPerPeriod: { granularity: GraphQlPeriodGranularity, points: Array<{ date: string, total: number }> } };

export type ShopOwnersActiveTblQueryVariables = Exact<{
  offset: number;
  limit: number;
  search?: string | null | undefined;
  sortBy: GraphQlShopOwnersTblSortField;
  sortDir: GraphQlSortDirection;
}>;


export type ShopOwnersActiveTblQuery = { shopOwnersActiveTbl: { total: number, items: Array<{ _id: string, registeredAt: string, personalData: { firstName: string, lastName: string, address: { street: string, postalCode: string, city: string, province: string } } }> } };

export type ShopOwnerByIdQueryVariables = Exact<{
  idShopOwner: string | number;
}>;


export type ShopOwnerByIdQuery = { shopOwnerById: { _id: string, registeredAt: string, deleted: string | null, disabled: boolean | null, waitApprov: boolean | null, notes: string | null, login: { email: string, firstLogin: string | null, lastLogin: string | null, onboardingStep: string | null, onboardingDone: boolean | null, rememberMe: boolean | null }, personalData: { firstName: string, lastName: string, birth: { date: string }, contacts: { email: string, landline: string | null, mobile: string }, address: { street: string, postalCode: string, city: string, province: string, position: { type: string, coordinates: Array<number> } | null } }, resetPwd: { resetDateReq: string, resetHash: string } | null } };

export type ShopOwnerCompaniesQueryVariables = Exact<{
  idShopOwner: string | number;
}>;


export type ShopOwnerCompaniesQuery = { shopOwnerCompanies: Array<{ _id: string, legalName: string, vatNumber: string, taxCode: string | null, contactPerson: string, administrator: string, uniqueCode: string | null, certifiedEmail: string, registryExtract: string, address: { street: string, postalCode: string, city: string, province: string, position: { type: string, coordinates: Array<number> } } }> };


export const AdminUpdatePwdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AdminUpdatePwd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"passwordOld"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"passwordNew"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminUpdatePwd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"passwordOld"},"value":{"kind":"Variable","name":{"kind":"Name","value":"passwordOld"}}},{"kind":"Argument","name":{"kind":"Name","value":"passwordNew"},"value":{"kind":"Variable","name":{"kind":"Name","value":"passwordNew"}}}]}]}}]} as unknown as DocumentNode<AdminUpdatePwdMutation, AdminUpdatePwdMutationVariables>;
export const ShopOwnerAddDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ShopOwnerAdd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"login"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputLogin"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"personalData"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputShopOwnerPersonalData"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerAdd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"login"},"value":{"kind":"Variable","name":{"kind":"Name","value":"login"}}},{"kind":"Argument","name":{"kind":"Name","value":"personalData"},"value":{"kind":"Variable","name":{"kind":"Name","value":"personalData"}}}]}]}}]} as unknown as DocumentNode<ShopOwnerAddMutation, ShopOwnerAddMutationVariables>;
export const ShopOwnerUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ShopOwnerUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"personalData"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputShopOwnerPersonalData"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"personalData"},"value":{"kind":"Variable","name":{"kind":"Name","value":"personalData"}}}]}]}}]} as unknown as DocumentNode<ShopOwnerUpdateMutation, ShopOwnerUpdateMutationVariables>;
export const ShopOwnerUpdateEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ShopOwnerUpdateEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerUpdateEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}]}]}}]} as unknown as DocumentNode<ShopOwnerUpdateEmailMutation, ShopOwnerUpdateEmailMutationVariables>;
export const ShopOwnerUpdateStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ShopOwnerUpdateStatus"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"disabled"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"waitApprov"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerUpdateStatus"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"disabled"},"value":{"kind":"Variable","name":{"kind":"Name","value":"disabled"}}},{"kind":"Argument","name":{"kind":"Name","value":"waitApprov"},"value":{"kind":"Variable","name":{"kind":"Name","value":"waitApprov"}}}]}]}}]} as unknown as DocumentNode<ShopOwnerUpdateStatusMutation, ShopOwnerUpdateStatusMutationVariables>;
export const ShopOwnerUpdatePreferencesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ShopOwnerUpdatePreferences"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"rememberMe"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"onboardingDone"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"onboardingStep"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerUpdatePreferences"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"rememberMe"},"value":{"kind":"Variable","name":{"kind":"Name","value":"rememberMe"}}},{"kind":"Argument","name":{"kind":"Name","value":"onboardingDone"},"value":{"kind":"Variable","name":{"kind":"Name","value":"onboardingDone"}}},{"kind":"Argument","name":{"kind":"Name","value":"onboardingStep"},"value":{"kind":"Variable","name":{"kind":"Name","value":"onboardingStep"}}}]}]}}]} as unknown as DocumentNode<ShopOwnerUpdatePreferencesMutation, ShopOwnerUpdatePreferencesMutationVariables>;
export const ShopOwnerUpdateNoteDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ShopOwnerUpdateNote"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"notes"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerUpdateNote"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"notes"},"value":{"kind":"Variable","name":{"kind":"Name","value":"notes"}}}]}]}}]} as unknown as DocumentNode<ShopOwnerUpdateNoteMutation, ShopOwnerUpdateNoteMutationVariables>;
export const CompanyAddDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CompanyAdd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idShopOwner"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"company"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputCompany"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"companyAdd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idShopOwner"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idShopOwner"}}},{"kind":"Argument","name":{"kind":"Name","value":"company"},"value":{"kind":"Variable","name":{"kind":"Name","value":"company"}}}]}]}}]} as unknown as DocumentNode<CompanyAddMutation, CompanyAddMutationVariables>;
export const CompanyUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CompanyUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"company"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputCompany"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"companyUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"company"},"value":{"kind":"Variable","name":{"kind":"Name","value":"company"}}}]}]}}]} as unknown as DocumentNode<CompanyUpdateMutation, CompanyUpdateMutationVariables>;
export const CompanyDelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CompanyDel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"companyDel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}}]}]}}]} as unknown as DocumentNode<CompanyDelMutation, CompanyDelMutationVariables>;
export const InfoAdminAfterLoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"InfoAdminAfterLogin"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"infoAdminAfterLogin"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<InfoAdminAfterLoginQuery, InfoAdminAfterLoginQueryVariables>;
export const ShopOwnersStatsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ShopOwnersStats"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnersStats"}}]}}]} as unknown as DocumentNode<ShopOwnersStatsQuery, ShopOwnersStatsQueryVariables>;
export const ShopOwnersPerPeriodDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ShopOwnersPerPeriod"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"period"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLShopOwnersPeriod"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnersPerPeriod"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"period"},"value":{"kind":"Variable","name":{"kind":"Name","value":"period"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"granularity"}},{"kind":"Field","name":{"kind":"Name","value":"points"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"date"}},{"kind":"Field","name":{"kind":"Name","value":"total"}}]}}]}}]}}]} as unknown as DocumentNode<ShopOwnersPerPeriodQuery, ShopOwnersPerPeriodQueryVariables>;
export const ShopOwnersActiveTblDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ShopOwnersActiveTbl"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sortBy"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLShopOwnersTblSortField"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sortDir"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLSortDirection"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnersActiveTbl"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"sortBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sortBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"sortDir"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sortDir"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"total"}},{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"registeredAt"}},{"kind":"Field","name":{"kind":"Name","value":"personalData"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"address"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"street"}},{"kind":"Field","name":{"kind":"Name","value":"postalCode"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"province"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<ShopOwnersActiveTblQuery, ShopOwnersActiveTblQueryVariables>;
export const ShopOwnerByIdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ShopOwnerById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idShopOwner"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerById"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idShopOwner"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idShopOwner"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"registeredAt"}},{"kind":"Field","name":{"kind":"Name","value":"deleted"}},{"kind":"Field","name":{"kind":"Name","value":"disabled"}},{"kind":"Field","name":{"kind":"Name","value":"waitApprov"}},{"kind":"Field","name":{"kind":"Name","value":"notes"}},{"kind":"Field","name":{"kind":"Name","value":"login"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"firstLogin"}},{"kind":"Field","name":{"kind":"Name","value":"lastLogin"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingStep"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingDone"}},{"kind":"Field","name":{"kind":"Name","value":"rememberMe"}}]}},{"kind":"Field","name":{"kind":"Name","value":"personalData"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"birth"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"date"}}]}},{"kind":"Field","name":{"kind":"Name","value":"contacts"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"landline"}},{"kind":"Field","name":{"kind":"Name","value":"mobile"}}]}},{"kind":"Field","name":{"kind":"Name","value":"address"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"street"}},{"kind":"Field","name":{"kind":"Name","value":"postalCode"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"province"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"resetPwd"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"resetDateReq"}},{"kind":"Field","name":{"kind":"Name","value":"resetHash"}}]}}]}}]}}]} as unknown as DocumentNode<ShopOwnerByIdQuery, ShopOwnerByIdQueryVariables>;
export const ShopOwnerCompaniesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ShopOwnerCompanies"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idShopOwner"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"shopOwnerCompanies"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idShopOwner"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idShopOwner"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"legalName"}},{"kind":"Field","name":{"kind":"Name","value":"vatNumber"}},{"kind":"Field","name":{"kind":"Name","value":"taxCode"}},{"kind":"Field","name":{"kind":"Name","value":"contactPerson"}},{"kind":"Field","name":{"kind":"Name","value":"administrator"}},{"kind":"Field","name":{"kind":"Name","value":"uniqueCode"}},{"kind":"Field","name":{"kind":"Name","value":"certifiedEmail"}},{"kind":"Field","name":{"kind":"Name","value":"registryExtract"}},{"kind":"Field","name":{"kind":"Name","value":"address"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"street"}},{"kind":"Field","name":{"kind":"Name","value":"postalCode"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"province"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}}]}}]} as unknown as DocumentNode<ShopOwnerCompaniesQuery, ShopOwnerCompaniesQueryVariables>;