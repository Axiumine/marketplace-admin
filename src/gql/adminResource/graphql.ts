/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
/** The width of one bucket. Derived from the range by the server — see `imprenditoriPerPeriodo`. */
export type GraphQlGranularitaPeriodo =
  | 'GIORNO'
  | 'MESE';

/**
 * The four columns the table can order by. Value-less on the backend, so the resolver receives the enum
 * NAME and maps it to a Mongo path itself. Each one has a matching index in marketplace-db-setup
 * (`tbl_attivi_*`); a column not listed here has no index and is refused at schema validation rather
 * than turned into a blocking in-memory sort.
 */
export type GraphQlImprenditoriTblSortField =
  | 'COGNOME'
  | 'COMUNE'
  | 'ISCRIZIONE'
  | 'NOME';

export type GraphQlInputAnagraficaImprenditore = {
  cognome: string;
  contatti: GraphQlInputContatti;
  indirizzo: GraphQlInputIndirizzo;
  nascita: GraphQlInputNascita;
  nome: string;
};

/**
 * Everything the operator types about a company, in one object — one form and one Save, which is also what
 * lets `aziendaUpdate` `$set` the document in a single atomic write.
 *
 * `_id` and `idImprenditore` are deliberately absent: the first is minted by the service, the second is a
 * separate argument on `aziendaAdd` and is nowhere on the update path, so a company cannot be moved to
 * another owner by editing its card.
 *
 * `cf` and `univoco` are the two optional ones, mirroring the collection's `required` array. Both are
 * dropped rather than stored empty when blank — sending `null` for them is legal on the wire and the
 * service reads it as "not set".
 */
export type GraphQlInputAzienda = {
  amministratore: string;
  cf?: string | null | undefined;
  indirizzo: GraphQlInputAziendaIndirizzo;
  pec: string;
  piva: string;
  ragionesociale: string;
  referente: string;
  univoco?: string | null | undefined;
  visura: string;
};

export type GraphQlInputAziendaIndirizzo = {
  cap: string;
  comune: string;
  indirizzo: string;
  position: GraphQlInputAziendaPosition;
  provincia: string;
};

/**
 * ⚠️ **Coordinates only**, for the reason `GraphQLInputPuntoVenditaPosition` gives at length: the GeoJSON
 * type has one legal spelling and the service writes the literal.
 */
export type GraphQlInputAziendaPosition = {
  coordinates: Array<number>;
};

export type GraphQlInputContatti = {
  cellulare: string;
  email: string;
  fisso?: string | null | undefined;
};

export type GraphQlInputIndirizzo = {
  cap: string;
  comune: string;
  indirizzo: string;
  /**
   * ⚠️ **Coordinates only and nullable.** No `type` field, like `GraphQLInputPuntoVenditaPosition` —
   * the resolver adds `type: 'Point'`. Nullable because the operator can save an anagrafica whose
   * address was never re-picked. ⚠️ Omitting it does **not** preserve the stored point:
   * `imprenditoreUpdate` `$set`s the whole `anagrafica`, so a save without `position` erases it. Send
   * back the point the query returned whenever the address is left alone.
   */
  position?: GraphQlInputIndirizzoPosition | null | undefined;
  provincia: string;
};

export type GraphQlInputIndirizzoPosition = {
  coordinates: Array<number>;
};

export type GraphQlInputLogin = {
  email: string;
  password: string;
};

export type GraphQlInputNascita = {
  data: string;
};

export type GraphQlInputPuntoVenditaContatti = {
  cellulare: string;
  email?: string | null | undefined;
  fisso?: string | null | undefined;
  pec?: string | null | undefined;
  web?: string | null | undefined;
};

export type GraphQlInputPuntoVenditaIndirizzo = {
  cap: string;
  comune: string;
  indirizzo: string;
  position: GraphQlInputPuntoVenditaPosition;
  provincia: string;
};

/**
 * One opening slot. `Time` in, `DateTime` out — see the `Time` scalar's own note for the round trip and
 * for the timezone designator it insists on.
 */
export type GraphQlInputPuntoVenditaOrari = {
  a: unknown;
  da: unknown;
  giorno: string;
};

/**
 * ⚠️ **Coordinates only.** Unlike the output `GraphQLPVPosition`, this input has no `type` field: the
 * value has exactly one legal spelling (`Point`), the collection caps it at 5 characters and the model
 * declares it as an enum of one, so accepting it from a client would only be a way to receive `point`
 * or `POINT` and fail the write naming a field the operator never saw. The service writes the literal.
 */
export type GraphQlInputPuntoVenditaPosition = {
  coordinates: Array<number>;
};

/**
 * How far back the stats chart looks. `TUTTO` runs from the month the first imprenditore registered in
 * to the current one; the other two are counted back from today, clamped to the target month's length
 * (one month before 31 March is 28 February, not 3 March).
 */
export type GraphQlPeriodoImprenditori =
  | 'TRE_MESI'
  | 'TUTTO'
  | 'UN_MESE';

export type GraphQlSortDirection =
  | 'ASC'
  | 'DESC';

export type AdminUpdatePwdMutationVariables = Exact<{
  passwordOld: string;
  passwordNew: string;
}>;


export type AdminUpdatePwdMutation = { adminUpdatePwd: boolean };

export type ImprenditoreAddMutationVariables = Exact<{
  login: GraphQlInputLogin;
  anagrafica: GraphQlInputAnagraficaImprenditore;
}>;


export type ImprenditoreAddMutation = { imprenditoreAdd: boolean };

export type ImprenditoreUpdateMutationVariables = Exact<{
  _id: string | number;
  anagrafica: GraphQlInputAnagraficaImprenditore;
}>;


export type ImprenditoreUpdateMutation = { imprenditoreUpdate: boolean };

export type ImprenditoreUpdateEmailMutationVariables = Exact<{
  _id: string | number;
  email: string;
}>;


export type ImprenditoreUpdateEmailMutation = { imprenditoreUpdateEmail: boolean };

export type ImprenditoreUpdateStatoMutationVariables = Exact<{
  _id: string | number;
  disabled: boolean;
  waitApprov: boolean;
}>;


export type ImprenditoreUpdateStatoMutation = { imprenditoreUpdateStato: boolean };

export type ImprenditoreUpdatePreferenzeMutationVariables = Exact<{
  _id: string | number;
  rememberMe: boolean;
  onboardingDone: boolean;
  onboardingStep?: string | null | undefined;
}>;


export type ImprenditoreUpdatePreferenzeMutation = { imprenditoreUpdatePreferenze: boolean };

export type ImprenditoreUpdateNoteMutationVariables = Exact<{
  _id: string | number;
  note: string;
}>;


export type ImprenditoreUpdateNoteMutation = { imprenditoreUpdateNote: boolean };

export type AziendaAddMutationVariables = Exact<{
  idImprenditore: string | number;
  azienda: GraphQlInputAzienda;
}>;


export type AziendaAddMutation = { aziendaAdd: boolean };

export type AziendaUpdateMutationVariables = Exact<{
  _id: string | number;
  azienda: GraphQlInputAzienda;
}>;


export type AziendaUpdateMutation = { aziendaUpdate: boolean };

export type AziendaDelMutationVariables = Exact<{
  _id: string | number;
}>;


export type AziendaDelMutation = { aziendaDel: boolean };

export type PuntoVenditaAddMutationVariables = Exact<{
  idImprenditore: string | number;
  nome: string;
  idAzienda: string | number;
  indirizzo: GraphQlInputPuntoVenditaIndirizzo;
  contatti: GraphQlInputPuntoVenditaContatti;
  orari: Array<GraphQlInputPuntoVenditaOrari> | GraphQlInputPuntoVenditaOrari;
}>;


export type PuntoVenditaAddMutation = { puntoVenditaAdd: boolean };

export type PuntoVenditaUpdateMutationVariables = Exact<{
  _id: string | number;
  nome: string;
  idAzienda: string | number;
  indirizzo: GraphQlInputPuntoVenditaIndirizzo;
  contatti: GraphQlInputPuntoVenditaContatti;
  orari: Array<GraphQlInputPuntoVenditaOrari> | GraphQlInputPuntoVenditaOrari;
}>;


export type PuntoVenditaUpdateMutation = { puntoVenditaUpdate: boolean };

export type PuntoVenditaDelMutationVariables = Exact<{
  _id: string | number;
}>;


export type PuntoVenditaDelMutation = { puntoVenditaDel: boolean };

export type PuntoVenditaUpdateStatoMutationVariables = Exact<{
  _id: string | number;
  disabledByAdmin: boolean;
}>;


export type PuntoVenditaUpdateStatoMutation = { puntoVenditaUpdateStato: boolean };

export type InfoAdminAfterLoginQueryVariables = Exact<{ [key: string]: never; }>;


export type InfoAdminAfterLoginQuery = { infoAdminAfterLogin: { _id: string, email: string } };

export type ImprenditoriStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type ImprenditoriStatsQuery = { imprenditoriStats: number };

export type ImprenditoriPerPeriodoQueryVariables = Exact<{
  periodo: GraphQlPeriodoImprenditori;
}>;


export type ImprenditoriPerPeriodoQuery = { imprenditoriPerPeriodo: { granularita: GraphQlGranularitaPeriodo, punti: Array<{ data: string, totale: number }> } };

export type ImprenditoriAttiviTblQueryVariables = Exact<{
  offset: number;
  limit: number;
  search?: string | null | undefined;
  sortBy: GraphQlImprenditoriTblSortField;
  sortDir: GraphQlSortDirection;
}>;


export type ImprenditoriAttiviTblQuery = { imprenditoriAttiviTbl: { total: number, items: Array<{ _id: string, iscrizione: string, anagrafica: { nome: string, cognome: string, indirizzo: { indirizzo: string, cap: string, comune: string, provincia: string } } }> } };

export type ImprenditoreByIdQueryVariables = Exact<{
  idImprenditore: string | number;
}>;


export type ImprenditoreByIdQuery = { imprenditoreById: { _id: string, iscrizione: string, deleted: string | null, disabled: boolean | null, waitApprov: boolean | null, note: string | null, login: { email: string, firstLogin: string | null, lastLogin: string | null, onboardingStep: string | null, onboardingDone: boolean | null, rememberMe: boolean | null }, anagrafica: { nome: string, cognome: string, nascita: { data: string }, contatti: { email: string, fisso: string | null, cellulare: string }, indirizzo: { indirizzo: string, cap: string, comune: string, provincia: string, position: { type: string, coordinates: Array<number> } | null } }, resetPwd: { resetDateReq: string, resetHash: string } | null } };

export type ImprenditorePuntiVenditaQueryVariables = Exact<{
  idImprenditore: string | number;
}>;


export type ImprenditorePuntiVenditaQuery = { imprenditorePuntiVendita: Array<{ _id: string, inserted: string, nome: string, disabled: boolean | null, disabledByAdmin: boolean | null, azienda: { _id: string, ragionesociale: string }, indirizzo: { indirizzo: string, cap: string, comune: string, provincia: string, position: { type: string, coordinates: Array<number> } }, contatti: { cellulare: string, email: string | null, web: string | null, pec: string | null, fisso: string | null }, orari: Array<{ giorno: string, da: string, a: string }> | null }> };

export type ImprenditoreAziendeQueryVariables = Exact<{
  idImprenditore: string | number;
}>;


export type ImprenditoreAziendeQuery = { imprenditoreAziende: Array<{ _id: string, ragionesociale: string, piva: string, cf: string | null, referente: string, amministratore: string, univoco: string | null, pec: string, visura: string, indirizzo: { indirizzo: string, cap: string, comune: string, provincia: string, position: { type: string, coordinates: Array<number> } } }> };


export const AdminUpdatePwdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AdminUpdatePwd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"passwordOld"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"passwordNew"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminUpdatePwd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"passwordOld"},"value":{"kind":"Variable","name":{"kind":"Name","value":"passwordOld"}}},{"kind":"Argument","name":{"kind":"Name","value":"passwordNew"},"value":{"kind":"Variable","name":{"kind":"Name","value":"passwordNew"}}}]}]}}]} as unknown as DocumentNode<AdminUpdatePwdMutation, AdminUpdatePwdMutationVariables>;
export const ImprenditoreAddDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ImprenditoreAdd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"login"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputLogin"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"anagrafica"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputAnagraficaImprenditore"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreAdd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"login"},"value":{"kind":"Variable","name":{"kind":"Name","value":"login"}}},{"kind":"Argument","name":{"kind":"Name","value":"anagrafica"},"value":{"kind":"Variable","name":{"kind":"Name","value":"anagrafica"}}}]}]}}]} as unknown as DocumentNode<ImprenditoreAddMutation, ImprenditoreAddMutationVariables>;
export const ImprenditoreUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ImprenditoreUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"anagrafica"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputAnagraficaImprenditore"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"anagrafica"},"value":{"kind":"Variable","name":{"kind":"Name","value":"anagrafica"}}}]}]}}]} as unknown as DocumentNode<ImprenditoreUpdateMutation, ImprenditoreUpdateMutationVariables>;
export const ImprenditoreUpdateEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ImprenditoreUpdateEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreUpdateEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}]}]}}]} as unknown as DocumentNode<ImprenditoreUpdateEmailMutation, ImprenditoreUpdateEmailMutationVariables>;
export const ImprenditoreUpdateStatoDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ImprenditoreUpdateStato"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"disabled"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"waitApprov"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreUpdateStato"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"disabled"},"value":{"kind":"Variable","name":{"kind":"Name","value":"disabled"}}},{"kind":"Argument","name":{"kind":"Name","value":"waitApprov"},"value":{"kind":"Variable","name":{"kind":"Name","value":"waitApprov"}}}]}]}}]} as unknown as DocumentNode<ImprenditoreUpdateStatoMutation, ImprenditoreUpdateStatoMutationVariables>;
export const ImprenditoreUpdatePreferenzeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ImprenditoreUpdatePreferenze"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"rememberMe"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"onboardingDone"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"onboardingStep"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreUpdatePreferenze"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"rememberMe"},"value":{"kind":"Variable","name":{"kind":"Name","value":"rememberMe"}}},{"kind":"Argument","name":{"kind":"Name","value":"onboardingDone"},"value":{"kind":"Variable","name":{"kind":"Name","value":"onboardingDone"}}},{"kind":"Argument","name":{"kind":"Name","value":"onboardingStep"},"value":{"kind":"Variable","name":{"kind":"Name","value":"onboardingStep"}}}]}]}}]} as unknown as DocumentNode<ImprenditoreUpdatePreferenzeMutation, ImprenditoreUpdatePreferenzeMutationVariables>;
export const ImprenditoreUpdateNoteDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ImprenditoreUpdateNote"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"note"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreUpdateNote"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"note"},"value":{"kind":"Variable","name":{"kind":"Name","value":"note"}}}]}]}}]} as unknown as DocumentNode<ImprenditoreUpdateNoteMutation, ImprenditoreUpdateNoteMutationVariables>;
export const AziendaAddDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AziendaAdd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"azienda"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputAzienda"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aziendaAdd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idImprenditore"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}}},{"kind":"Argument","name":{"kind":"Name","value":"azienda"},"value":{"kind":"Variable","name":{"kind":"Name","value":"azienda"}}}]}]}}]} as unknown as DocumentNode<AziendaAddMutation, AziendaAddMutationVariables>;
export const AziendaUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AziendaUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"azienda"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputAzienda"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aziendaUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"azienda"},"value":{"kind":"Variable","name":{"kind":"Name","value":"azienda"}}}]}]}}]} as unknown as DocumentNode<AziendaUpdateMutation, AziendaUpdateMutationVariables>;
export const AziendaDelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AziendaDel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aziendaDel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}}]}]}}]} as unknown as DocumentNode<AziendaDelMutation, AziendaDelMutationVariables>;
export const PuntoVenditaAddDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PuntoVenditaAdd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"nome"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idAzienda"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"indirizzo"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputPuntoVenditaIndirizzo"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contatti"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputPuntoVenditaContatti"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orari"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputPuntoVenditaOrari"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"puntoVenditaAdd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idImprenditore"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}}},{"kind":"Argument","name":{"kind":"Name","value":"nome"},"value":{"kind":"Variable","name":{"kind":"Name","value":"nome"}}},{"kind":"Argument","name":{"kind":"Name","value":"idAzienda"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idAzienda"}}},{"kind":"Argument","name":{"kind":"Name","value":"indirizzo"},"value":{"kind":"Variable","name":{"kind":"Name","value":"indirizzo"}}},{"kind":"Argument","name":{"kind":"Name","value":"contatti"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contatti"}}},{"kind":"Argument","name":{"kind":"Name","value":"orari"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orari"}}}]}]}}]} as unknown as DocumentNode<PuntoVenditaAddMutation, PuntoVenditaAddMutationVariables>;
export const PuntoVenditaUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PuntoVenditaUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"nome"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idAzienda"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"indirizzo"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputPuntoVenditaIndirizzo"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contatti"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputPuntoVenditaContatti"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orari"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputPuntoVenditaOrari"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"puntoVenditaUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"nome"},"value":{"kind":"Variable","name":{"kind":"Name","value":"nome"}}},{"kind":"Argument","name":{"kind":"Name","value":"idAzienda"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idAzienda"}}},{"kind":"Argument","name":{"kind":"Name","value":"indirizzo"},"value":{"kind":"Variable","name":{"kind":"Name","value":"indirizzo"}}},{"kind":"Argument","name":{"kind":"Name","value":"contatti"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contatti"}}},{"kind":"Argument","name":{"kind":"Name","value":"orari"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orari"}}}]}]}}]} as unknown as DocumentNode<PuntoVenditaUpdateMutation, PuntoVenditaUpdateMutationVariables>;
export const PuntoVenditaDelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PuntoVenditaDel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"puntoVenditaDel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}}]}]}}]} as unknown as DocumentNode<PuntoVenditaDelMutation, PuntoVenditaDelMutationVariables>;
export const PuntoVenditaUpdateStatoDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PuntoVenditaUpdateStato"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"disabledByAdmin"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"puntoVenditaUpdateStato"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"disabledByAdmin"},"value":{"kind":"Variable","name":{"kind":"Name","value":"disabledByAdmin"}}}]}]}}]} as unknown as DocumentNode<PuntoVenditaUpdateStatoMutation, PuntoVenditaUpdateStatoMutationVariables>;
export const InfoAdminAfterLoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"InfoAdminAfterLogin"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"infoAdminAfterLogin"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<InfoAdminAfterLoginQuery, InfoAdminAfterLoginQueryVariables>;
export const ImprenditoriStatsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImprenditoriStats"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoriStats"}}]}}]} as unknown as DocumentNode<ImprenditoriStatsQuery, ImprenditoriStatsQueryVariables>;
export const ImprenditoriPerPeriodoDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImprenditoriPerPeriodo"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"periodo"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLPeriodoImprenditori"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoriPerPeriodo"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"periodo"},"value":{"kind":"Variable","name":{"kind":"Name","value":"periodo"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"granularita"}},{"kind":"Field","name":{"kind":"Name","value":"punti"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"data"}},{"kind":"Field","name":{"kind":"Name","value":"totale"}}]}}]}}]}}]} as unknown as DocumentNode<ImprenditoriPerPeriodoQuery, ImprenditoriPerPeriodoQueryVariables>;
export const ImprenditoriAttiviTblDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImprenditoriAttiviTbl"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sortBy"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLImprenditoriTblSortField"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sortDir"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLSortDirection"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoriAttiviTbl"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"sortBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sortBy"}}},{"kind":"Argument","name":{"kind":"Name","value":"sortDir"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sortDir"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"total"}},{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"iscrizione"}},{"kind":"Field","name":{"kind":"Name","value":"anagrafica"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nome"}},{"kind":"Field","name":{"kind":"Name","value":"cognome"}},{"kind":"Field","name":{"kind":"Name","value":"indirizzo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"indirizzo"}},{"kind":"Field","name":{"kind":"Name","value":"cap"}},{"kind":"Field","name":{"kind":"Name","value":"comune"}},{"kind":"Field","name":{"kind":"Name","value":"provincia"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<ImprenditoriAttiviTblQuery, ImprenditoriAttiviTblQueryVariables>;
export const ImprenditoreByIdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImprenditoreById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreById"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idImprenditore"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"iscrizione"}},{"kind":"Field","name":{"kind":"Name","value":"deleted"}},{"kind":"Field","name":{"kind":"Name","value":"disabled"}},{"kind":"Field","name":{"kind":"Name","value":"waitApprov"}},{"kind":"Field","name":{"kind":"Name","value":"note"}},{"kind":"Field","name":{"kind":"Name","value":"login"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"firstLogin"}},{"kind":"Field","name":{"kind":"Name","value":"lastLogin"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingStep"}},{"kind":"Field","name":{"kind":"Name","value":"onboardingDone"}},{"kind":"Field","name":{"kind":"Name","value":"rememberMe"}}]}},{"kind":"Field","name":{"kind":"Name","value":"anagrafica"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nome"}},{"kind":"Field","name":{"kind":"Name","value":"cognome"}},{"kind":"Field","name":{"kind":"Name","value":"nascita"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"data"}}]}},{"kind":"Field","name":{"kind":"Name","value":"contatti"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fisso"}},{"kind":"Field","name":{"kind":"Name","value":"cellulare"}}]}},{"kind":"Field","name":{"kind":"Name","value":"indirizzo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"indirizzo"}},{"kind":"Field","name":{"kind":"Name","value":"cap"}},{"kind":"Field","name":{"kind":"Name","value":"comune"}},{"kind":"Field","name":{"kind":"Name","value":"provincia"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"resetPwd"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"resetDateReq"}},{"kind":"Field","name":{"kind":"Name","value":"resetHash"}}]}}]}}]}}]} as unknown as DocumentNode<ImprenditoreByIdQuery, ImprenditoreByIdQueryVariables>;
export const ImprenditorePuntiVenditaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImprenditorePuntiVendita"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditorePuntiVendita"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idImprenditore"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"inserted"}},{"kind":"Field","name":{"kind":"Name","value":"nome"}},{"kind":"Field","name":{"kind":"Name","value":"azienda"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"ragionesociale"}}]}},{"kind":"Field","name":{"kind":"Name","value":"indirizzo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"indirizzo"}},{"kind":"Field","name":{"kind":"Name","value":"cap"}},{"kind":"Field","name":{"kind":"Name","value":"comune"}},{"kind":"Field","name":{"kind":"Name","value":"provincia"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"contatti"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellulare"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"web"}},{"kind":"Field","name":{"kind":"Name","value":"pec"}},{"kind":"Field","name":{"kind":"Name","value":"fisso"}}]}},{"kind":"Field","name":{"kind":"Name","value":"orari"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"giorno"}},{"kind":"Field","name":{"kind":"Name","value":"da"}},{"kind":"Field","name":{"kind":"Name","value":"a"}}]}},{"kind":"Field","name":{"kind":"Name","value":"disabled"}},{"kind":"Field","name":{"kind":"Name","value":"disabledByAdmin"}}]}}]}}]} as unknown as DocumentNode<ImprenditorePuntiVenditaQuery, ImprenditorePuntiVenditaQueryVariables>;
export const ImprenditoreAziendeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImprenditoreAziende"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"imprenditoreAziende"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"idImprenditore"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idImprenditore"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"ragionesociale"}},{"kind":"Field","name":{"kind":"Name","value":"piva"}},{"kind":"Field","name":{"kind":"Name","value":"cf"}},{"kind":"Field","name":{"kind":"Name","value":"referente"}},{"kind":"Field","name":{"kind":"Name","value":"amministratore"}},{"kind":"Field","name":{"kind":"Name","value":"univoco"}},{"kind":"Field","name":{"kind":"Name","value":"pec"}},{"kind":"Field","name":{"kind":"Name","value":"visura"}},{"kind":"Field","name":{"kind":"Name","value":"indirizzo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"indirizzo"}},{"kind":"Field","name":{"kind":"Name","value":"cap"}},{"kind":"Field","name":{"kind":"Name","value":"comune"}},{"kind":"Field","name":{"kind":"Name","value":"provincia"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}}]}}]} as unknown as DocumentNode<ImprenditoreAziendeQuery, ImprenditoreAziendeQueryVariables>;