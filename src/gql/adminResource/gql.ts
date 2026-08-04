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
    "\n\tmutation ImprenditoreAdd($login: GraphQLInputLogin!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreAdd(login: $login, anagrafica: $anagrafica)\n\t}\n": typeof types.ImprenditoreAddDocument,
    "\n\tmutation ImprenditoreUpdate($_id: ID!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreUpdate(_id: $_id, anagrafica: $anagrafica)\n\t}\n": typeof types.ImprenditoreUpdateDocument,
    "\n\tmutation ImprenditoreUpdateEmail($_id: ID!, $email: String!) {\n\t\timprenditoreUpdateEmail(_id: $_id, email: $email)\n\t}\n": typeof types.ImprenditoreUpdateEmailDocument,
    "\n\tmutation ImprenditoreUpdateStato($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!) {\n\t\timprenditoreUpdateStato(_id: $_id, disabled: $disabled, waitApprov: $waitApprov)\n\t}\n": typeof types.ImprenditoreUpdateStatoDocument,
    "\n\tmutation ImprenditoreUpdatePreferenze($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\timprenditoreUpdatePreferenze(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n": typeof types.ImprenditoreUpdatePreferenzeDocument,
    "\n\tmutation ImprenditoreUpdateNote($_id: ID!, $note: String!) {\n\t\timprenditoreUpdateNote(_id: $_id, note: $note)\n\t}\n": typeof types.ImprenditoreUpdateNoteDocument,
    "\n\tmutation AziendaAdd($idImprenditore: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaAdd(idImprenditore: $idImprenditore, azienda: $azienda)\n\t}\n": typeof types.AziendaAddDocument,
    "\n\tmutation AziendaUpdate($_id: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaUpdate(_id: $_id, azienda: $azienda)\n\t}\n": typeof types.AziendaUpdateDocument,
    "\n\tmutation AziendaDel($_id: ID!) {\n\t\taziendaDel(_id: $_id)\n\t}\n": typeof types.AziendaDelDocument,
    "\n\tmutation PuntoVenditaAdd(\n\t\t$idImprenditore: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaAdd(\n\t\t\tidImprenditore: $idImprenditore\n\t\t\tnome: $nome\n\t\t\tidAzienda: $idAzienda\n\t\t\tindirizzo: $indirizzo\n\t\t\tcontatti: $contatti\n\t\t\torari: $orari\n\t\t)\n\t}\n": typeof types.PuntoVenditaAddDocument,
    "\n\tmutation PuntoVenditaUpdate(\n\t\t$_id: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaUpdate(_id: $_id, nome: $nome, idAzienda: $idAzienda, indirizzo: $indirizzo, contatti: $contatti, orari: $orari)\n\t}\n": typeof types.PuntoVenditaUpdateDocument,
    "\n\tmutation PuntoVenditaDel($_id: ID!) {\n\t\tpuntoVenditaDel(_id: $_id)\n\t}\n": typeof types.PuntoVenditaDelDocument,
    "\n\tmutation PuntoVenditaUpdateStato($_id: ID!, $disabledByAdmin: Boolean!) {\n\t\tpuntoVenditaUpdateStato(_id: $_id, disabledByAdmin: $disabledByAdmin)\n\t}\n": typeof types.PuntoVenditaUpdateStatoDocument,
    "\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n": typeof types.InfoAdminAfterLoginDocument,
    "\n\tquery ImprenditoriStats {\n\t\timprenditoriStats\n\t}\n": typeof types.ImprenditoriStatsDocument,
    "\n\tquery ImprenditoriPerPeriodo($periodo: GraphQLPeriodoImprenditori!) {\n\t\timprenditoriPerPeriodo(periodo: $periodo) {\n\t\t\tgranularita\n\t\t\tpunti {\n\t\t\t\tdata\n\t\t\t\ttotale\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ImprenditoriPerPeriodoDocument,
    "\n\tquery ImprenditoriAttiviTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLImprenditoriTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\timprenditoriAttiviTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tiscrizione\n\t\t\t\tanagrafica {\n\t\t\t\t\tnome\n\t\t\t\t\tcognome\n\t\t\t\t\tindirizzo {\n\t\t\t\t\t\tindirizzo\n\t\t\t\t\t\tcap\n\t\t\t\t\t\tcomune\n\t\t\t\t\t\tprovincia\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ImprenditoriAttiviTblDocument,
    "\n\tquery ImprenditoreById($idImprenditore: ID!) {\n\t\timprenditoreById(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tiscrizione\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\twaitApprov\n\t\t\tnote\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tanagrafica {\n\t\t\t\tnome\n\t\t\t\tcognome\n\t\t\t\tnascita {\n\t\t\t\t\tdata\n\t\t\t\t}\n\t\t\t\tcontatti {\n\t\t\t\t\temail\n\t\t\t\t\tfisso\n\t\t\t\t\tcellulare\n\t\t\t\t}\n\t\t\t\tindirizzo {\n\t\t\t\t\tindirizzo\n\t\t\t\t\tcap\n\t\t\t\t\tcomune\n\t\t\t\t\tprovincia\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ImprenditoreByIdDocument,
    "\n\tquery ImprenditorePuntiVendita($idImprenditore: ID!) {\n\t\timprenditorePuntiVendita(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tinserted\n\t\t\tnome\n\t\t\t# The reference and the one field the shop card shows of it. The company's own card is in the\n\t\t\t# Aziende section above, which reads the whole row through ImprenditoreAziende — asking for it\n\t\t\t# again here would make every shop pay for a second lookup to render a dropdown whose options\n\t\t\t# that other query already holds.\n\t\t\tazienda {\n\t\t\t\t_id\n\t\t\t\tragionesociale\n\t\t\t}\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t\tcontatti {\n\t\t\t\tcellulare\n\t\t\t\temail\n\t\t\t\tweb\n\t\t\t\tpec\n\t\t\t\tfisso\n\t\t\t}\n\t\t\torari {\n\t\t\t\tgiorno\n\t\t\t\tda\n\t\t\t\ta\n\t\t\t}\n\t\t\tdisabled\n\t\t\tdisabledByAdmin\n\t\t}\n\t}\n": typeof types.ImprenditorePuntiVenditaDocument,
    "\n\tquery ImprenditoreAziende($idImprenditore: ID!) {\n\t\timprenditoreAziende(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tragionesociale\n\t\t\tpiva\n\t\t\tcf\n\t\t\treferente\n\t\t\tamministratore\n\t\t\tunivoco\n\t\t\tpec\n\t\t\tvisura\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": typeof types.ImprenditoreAziendeDocument,
};
const documents: Documents = {
    "\n\tmutation AdminUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tadminUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n": types.AdminUpdatePwdDocument,
    "\n\tmutation ImprenditoreAdd($login: GraphQLInputLogin!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreAdd(login: $login, anagrafica: $anagrafica)\n\t}\n": types.ImprenditoreAddDocument,
    "\n\tmutation ImprenditoreUpdate($_id: ID!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreUpdate(_id: $_id, anagrafica: $anagrafica)\n\t}\n": types.ImprenditoreUpdateDocument,
    "\n\tmutation ImprenditoreUpdateEmail($_id: ID!, $email: String!) {\n\t\timprenditoreUpdateEmail(_id: $_id, email: $email)\n\t}\n": types.ImprenditoreUpdateEmailDocument,
    "\n\tmutation ImprenditoreUpdateStato($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!) {\n\t\timprenditoreUpdateStato(_id: $_id, disabled: $disabled, waitApprov: $waitApprov)\n\t}\n": types.ImprenditoreUpdateStatoDocument,
    "\n\tmutation ImprenditoreUpdatePreferenze($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\timprenditoreUpdatePreferenze(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n": types.ImprenditoreUpdatePreferenzeDocument,
    "\n\tmutation ImprenditoreUpdateNote($_id: ID!, $note: String!) {\n\t\timprenditoreUpdateNote(_id: $_id, note: $note)\n\t}\n": types.ImprenditoreUpdateNoteDocument,
    "\n\tmutation AziendaAdd($idImprenditore: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaAdd(idImprenditore: $idImprenditore, azienda: $azienda)\n\t}\n": types.AziendaAddDocument,
    "\n\tmutation AziendaUpdate($_id: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaUpdate(_id: $_id, azienda: $azienda)\n\t}\n": types.AziendaUpdateDocument,
    "\n\tmutation AziendaDel($_id: ID!) {\n\t\taziendaDel(_id: $_id)\n\t}\n": types.AziendaDelDocument,
    "\n\tmutation PuntoVenditaAdd(\n\t\t$idImprenditore: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaAdd(\n\t\t\tidImprenditore: $idImprenditore\n\t\t\tnome: $nome\n\t\t\tidAzienda: $idAzienda\n\t\t\tindirizzo: $indirizzo\n\t\t\tcontatti: $contatti\n\t\t\torari: $orari\n\t\t)\n\t}\n": types.PuntoVenditaAddDocument,
    "\n\tmutation PuntoVenditaUpdate(\n\t\t$_id: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaUpdate(_id: $_id, nome: $nome, idAzienda: $idAzienda, indirizzo: $indirizzo, contatti: $contatti, orari: $orari)\n\t}\n": types.PuntoVenditaUpdateDocument,
    "\n\tmutation PuntoVenditaDel($_id: ID!) {\n\t\tpuntoVenditaDel(_id: $_id)\n\t}\n": types.PuntoVenditaDelDocument,
    "\n\tmutation PuntoVenditaUpdateStato($_id: ID!, $disabledByAdmin: Boolean!) {\n\t\tpuntoVenditaUpdateStato(_id: $_id, disabledByAdmin: $disabledByAdmin)\n\t}\n": types.PuntoVenditaUpdateStatoDocument,
    "\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n": types.InfoAdminAfterLoginDocument,
    "\n\tquery ImprenditoriStats {\n\t\timprenditoriStats\n\t}\n": types.ImprenditoriStatsDocument,
    "\n\tquery ImprenditoriPerPeriodo($periodo: GraphQLPeriodoImprenditori!) {\n\t\timprenditoriPerPeriodo(periodo: $periodo) {\n\t\t\tgranularita\n\t\t\tpunti {\n\t\t\t\tdata\n\t\t\t\ttotale\n\t\t\t}\n\t\t}\n\t}\n": types.ImprenditoriPerPeriodoDocument,
    "\n\tquery ImprenditoriAttiviTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLImprenditoriTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\timprenditoriAttiviTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tiscrizione\n\t\t\t\tanagrafica {\n\t\t\t\t\tnome\n\t\t\t\t\tcognome\n\t\t\t\t\tindirizzo {\n\t\t\t\t\t\tindirizzo\n\t\t\t\t\t\tcap\n\t\t\t\t\t\tcomune\n\t\t\t\t\t\tprovincia\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": types.ImprenditoriAttiviTblDocument,
    "\n\tquery ImprenditoreById($idImprenditore: ID!) {\n\t\timprenditoreById(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tiscrizione\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\twaitApprov\n\t\t\tnote\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tanagrafica {\n\t\t\t\tnome\n\t\t\t\tcognome\n\t\t\t\tnascita {\n\t\t\t\t\tdata\n\t\t\t\t}\n\t\t\t\tcontatti {\n\t\t\t\t\temail\n\t\t\t\t\tfisso\n\t\t\t\t\tcellulare\n\t\t\t\t}\n\t\t\t\tindirizzo {\n\t\t\t\t\tindirizzo\n\t\t\t\t\tcap\n\t\t\t\t\tcomune\n\t\t\t\t\tprovincia\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n": types.ImprenditoreByIdDocument,
    "\n\tquery ImprenditorePuntiVendita($idImprenditore: ID!) {\n\t\timprenditorePuntiVendita(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tinserted\n\t\t\tnome\n\t\t\t# The reference and the one field the shop card shows of it. The company's own card is in the\n\t\t\t# Aziende section above, which reads the whole row through ImprenditoreAziende — asking for it\n\t\t\t# again here would make every shop pay for a second lookup to render a dropdown whose options\n\t\t\t# that other query already holds.\n\t\t\tazienda {\n\t\t\t\t_id\n\t\t\t\tragionesociale\n\t\t\t}\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t\tcontatti {\n\t\t\t\tcellulare\n\t\t\t\temail\n\t\t\t\tweb\n\t\t\t\tpec\n\t\t\t\tfisso\n\t\t\t}\n\t\t\torari {\n\t\t\t\tgiorno\n\t\t\t\tda\n\t\t\t\ta\n\t\t\t}\n\t\t\tdisabled\n\t\t\tdisabledByAdmin\n\t\t}\n\t}\n": types.ImprenditorePuntiVenditaDocument,
    "\n\tquery ImprenditoreAziende($idImprenditore: ID!) {\n\t\timprenditoreAziende(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tragionesociale\n\t\t\tpiva\n\t\t\tcf\n\t\t\treferente\n\t\t\tamministratore\n\t\t\tunivoco\n\t\t\tpec\n\t\t\tvisura\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": types.ImprenditoreAziendeDocument,
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
export function graphql(source: "\n\tmutation ImprenditoreAdd($login: GraphQLInputLogin!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreAdd(login: $login, anagrafica: $anagrafica)\n\t}\n"): (typeof documents)["\n\tmutation ImprenditoreAdd($login: GraphQLInputLogin!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreAdd(login: $login, anagrafica: $anagrafica)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ImprenditoreUpdate($_id: ID!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreUpdate(_id: $_id, anagrafica: $anagrafica)\n\t}\n"): (typeof documents)["\n\tmutation ImprenditoreUpdate($_id: ID!, $anagrafica: GraphQLInputAnagraficaImprenditore!) {\n\t\timprenditoreUpdate(_id: $_id, anagrafica: $anagrafica)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ImprenditoreUpdateEmail($_id: ID!, $email: String!) {\n\t\timprenditoreUpdateEmail(_id: $_id, email: $email)\n\t}\n"): (typeof documents)["\n\tmutation ImprenditoreUpdateEmail($_id: ID!, $email: String!) {\n\t\timprenditoreUpdateEmail(_id: $_id, email: $email)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ImprenditoreUpdateStato($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!) {\n\t\timprenditoreUpdateStato(_id: $_id, disabled: $disabled, waitApprov: $waitApprov)\n\t}\n"): (typeof documents)["\n\tmutation ImprenditoreUpdateStato($_id: ID!, $disabled: Boolean!, $waitApprov: Boolean!) {\n\t\timprenditoreUpdateStato(_id: $_id, disabled: $disabled, waitApprov: $waitApprov)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ImprenditoreUpdatePreferenze($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\timprenditoreUpdatePreferenze(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n"): (typeof documents)["\n\tmutation ImprenditoreUpdatePreferenze($_id: ID!, $rememberMe: Boolean!, $onboardingDone: Boolean!, $onboardingStep: String) {\n\t\timprenditoreUpdatePreferenze(\n\t\t\t_id: $_id\n\t\t\trememberMe: $rememberMe\n\t\t\tonboardingDone: $onboardingDone\n\t\t\tonboardingStep: $onboardingStep\n\t\t)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation ImprenditoreUpdateNote($_id: ID!, $note: String!) {\n\t\timprenditoreUpdateNote(_id: $_id, note: $note)\n\t}\n"): (typeof documents)["\n\tmutation ImprenditoreUpdateNote($_id: ID!, $note: String!) {\n\t\timprenditoreUpdateNote(_id: $_id, note: $note)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation AziendaAdd($idImprenditore: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaAdd(idImprenditore: $idImprenditore, azienda: $azienda)\n\t}\n"): (typeof documents)["\n\tmutation AziendaAdd($idImprenditore: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaAdd(idImprenditore: $idImprenditore, azienda: $azienda)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation AziendaUpdate($_id: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaUpdate(_id: $_id, azienda: $azienda)\n\t}\n"): (typeof documents)["\n\tmutation AziendaUpdate($_id: ID!, $azienda: GraphQLInputAzienda!) {\n\t\taziendaUpdate(_id: $_id, azienda: $azienda)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation AziendaDel($_id: ID!) {\n\t\taziendaDel(_id: $_id)\n\t}\n"): (typeof documents)["\n\tmutation AziendaDel($_id: ID!) {\n\t\taziendaDel(_id: $_id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation PuntoVenditaAdd(\n\t\t$idImprenditore: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaAdd(\n\t\t\tidImprenditore: $idImprenditore\n\t\t\tnome: $nome\n\t\t\tidAzienda: $idAzienda\n\t\t\tindirizzo: $indirizzo\n\t\t\tcontatti: $contatti\n\t\t\torari: $orari\n\t\t)\n\t}\n"): (typeof documents)["\n\tmutation PuntoVenditaAdd(\n\t\t$idImprenditore: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaAdd(\n\t\t\tidImprenditore: $idImprenditore\n\t\t\tnome: $nome\n\t\t\tidAzienda: $idAzienda\n\t\t\tindirizzo: $indirizzo\n\t\t\tcontatti: $contatti\n\t\t\torari: $orari\n\t\t)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation PuntoVenditaUpdate(\n\t\t$_id: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaUpdate(_id: $_id, nome: $nome, idAzienda: $idAzienda, indirizzo: $indirizzo, contatti: $contatti, orari: $orari)\n\t}\n"): (typeof documents)["\n\tmutation PuntoVenditaUpdate(\n\t\t$_id: ID!\n\t\t$nome: String!\n\t\t$idAzienda: ID!\n\t\t$indirizzo: GraphQLInputPuntoVenditaIndirizzo!\n\t\t$contatti: GraphQLInputPuntoVenditaContatti!\n\t\t$orari: [GraphQLInputPuntoVenditaOrari!]!\n\t) {\n\t\tpuntoVenditaUpdate(_id: $_id, nome: $nome, idAzienda: $idAzienda, indirizzo: $indirizzo, contatti: $contatti, orari: $orari)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation PuntoVenditaDel($_id: ID!) {\n\t\tpuntoVenditaDel(_id: $_id)\n\t}\n"): (typeof documents)["\n\tmutation PuntoVenditaDel($_id: ID!) {\n\t\tpuntoVenditaDel(_id: $_id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation PuntoVenditaUpdateStato($_id: ID!, $disabledByAdmin: Boolean!) {\n\t\tpuntoVenditaUpdateStato(_id: $_id, disabledByAdmin: $disabledByAdmin)\n\t}\n"): (typeof documents)["\n\tmutation PuntoVenditaUpdateStato($_id: ID!, $disabledByAdmin: Boolean!) {\n\t\tpuntoVenditaUpdateStato(_id: $_id, disabledByAdmin: $disabledByAdmin)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery InfoAdminAfterLogin {\n\t\tinfoAdminAfterLogin {\n\t\t\t_id\n\t\t\temail\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ImprenditoriStats {\n\t\timprenditoriStats\n\t}\n"): (typeof documents)["\n\tquery ImprenditoriStats {\n\t\timprenditoriStats\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ImprenditoriPerPeriodo($periodo: GraphQLPeriodoImprenditori!) {\n\t\timprenditoriPerPeriodo(periodo: $periodo) {\n\t\t\tgranularita\n\t\t\tpunti {\n\t\t\t\tdata\n\t\t\t\ttotale\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ImprenditoriPerPeriodo($periodo: GraphQLPeriodoImprenditori!) {\n\t\timprenditoriPerPeriodo(periodo: $periodo) {\n\t\t\tgranularita\n\t\t\tpunti {\n\t\t\t\tdata\n\t\t\t\ttotale\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ImprenditoriAttiviTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLImprenditoriTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\timprenditoriAttiviTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tiscrizione\n\t\t\t\tanagrafica {\n\t\t\t\t\tnome\n\t\t\t\t\tcognome\n\t\t\t\t\tindirizzo {\n\t\t\t\t\t\tindirizzo\n\t\t\t\t\t\tcap\n\t\t\t\t\t\tcomune\n\t\t\t\t\t\tprovincia\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ImprenditoriAttiviTbl(\n\t\t$offset: Int!\n\t\t$limit: Int!\n\t\t$search: String\n\t\t$sortBy: GraphQLImprenditoriTblSortField!\n\t\t$sortDir: GraphQLSortDirection!\n\t) {\n\t\timprenditoriAttiviTbl(offset: $offset, limit: $limit, search: $search, sortBy: $sortBy, sortDir: $sortDir) {\n\t\t\ttotal\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tiscrizione\n\t\t\t\tanagrafica {\n\t\t\t\t\tnome\n\t\t\t\t\tcognome\n\t\t\t\t\tindirizzo {\n\t\t\t\t\t\tindirizzo\n\t\t\t\t\t\tcap\n\t\t\t\t\t\tcomune\n\t\t\t\t\t\tprovincia\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ImprenditoreById($idImprenditore: ID!) {\n\t\timprenditoreById(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tiscrizione\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\twaitApprov\n\t\t\tnote\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tanagrafica {\n\t\t\t\tnome\n\t\t\t\tcognome\n\t\t\t\tnascita {\n\t\t\t\t\tdata\n\t\t\t\t}\n\t\t\t\tcontatti {\n\t\t\t\t\temail\n\t\t\t\t\tfisso\n\t\t\t\t\tcellulare\n\t\t\t\t}\n\t\t\t\tindirizzo {\n\t\t\t\t\tindirizzo\n\t\t\t\t\tcap\n\t\t\t\t\tcomune\n\t\t\t\t\tprovincia\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ImprenditoreById($idImprenditore: ID!) {\n\t\timprenditoreById(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tiscrizione\n\t\t\tdeleted\n\t\t\tdisabled\n\t\t\twaitApprov\n\t\t\tnote\n\t\t\tlogin {\n\t\t\t\temail\n\t\t\t\tfirstLogin\n\t\t\t\tlastLogin\n\t\t\t\tonboardingStep\n\t\t\t\tonboardingDone\n\t\t\t\trememberMe\n\t\t\t}\n\t\t\tanagrafica {\n\t\t\t\tnome\n\t\t\t\tcognome\n\t\t\t\tnascita {\n\t\t\t\t\tdata\n\t\t\t\t}\n\t\t\t\tcontatti {\n\t\t\t\t\temail\n\t\t\t\t\tfisso\n\t\t\t\t\tcellulare\n\t\t\t\t}\n\t\t\t\tindirizzo {\n\t\t\t\t\tindirizzo\n\t\t\t\t\tcap\n\t\t\t\t\tcomune\n\t\t\t\t\tprovincia\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\tresetPwd {\n\t\t\t\tresetDateReq\n\t\t\t\tresetHash\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ImprenditorePuntiVendita($idImprenditore: ID!) {\n\t\timprenditorePuntiVendita(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tinserted\n\t\t\tnome\n\t\t\t# The reference and the one field the shop card shows of it. The company's own card is in the\n\t\t\t# Aziende section above, which reads the whole row through ImprenditoreAziende — asking for it\n\t\t\t# again here would make every shop pay for a second lookup to render a dropdown whose options\n\t\t\t# that other query already holds.\n\t\t\tazienda {\n\t\t\t\t_id\n\t\t\t\tragionesociale\n\t\t\t}\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t\tcontatti {\n\t\t\t\tcellulare\n\t\t\t\temail\n\t\t\t\tweb\n\t\t\t\tpec\n\t\t\t\tfisso\n\t\t\t}\n\t\t\torari {\n\t\t\t\tgiorno\n\t\t\t\tda\n\t\t\t\ta\n\t\t\t}\n\t\t\tdisabled\n\t\t\tdisabledByAdmin\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ImprenditorePuntiVendita($idImprenditore: ID!) {\n\t\timprenditorePuntiVendita(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tinserted\n\t\t\tnome\n\t\t\t# The reference and the one field the shop card shows of it. The company's own card is in the\n\t\t\t# Aziende section above, which reads the whole row through ImprenditoreAziende — asking for it\n\t\t\t# again here would make every shop pay for a second lookup to render a dropdown whose options\n\t\t\t# that other query already holds.\n\t\t\tazienda {\n\t\t\t\t_id\n\t\t\t\tragionesociale\n\t\t\t}\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t\tcontatti {\n\t\t\t\tcellulare\n\t\t\t\temail\n\t\t\t\tweb\n\t\t\t\tpec\n\t\t\t\tfisso\n\t\t\t}\n\t\t\torari {\n\t\t\t\tgiorno\n\t\t\t\tda\n\t\t\t\ta\n\t\t\t}\n\t\t\tdisabled\n\t\t\tdisabledByAdmin\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ImprenditoreAziende($idImprenditore: ID!) {\n\t\timprenditoreAziende(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tragionesociale\n\t\t\tpiva\n\t\t\tcf\n\t\t\treferente\n\t\t\tamministratore\n\t\t\tunivoco\n\t\t\tpec\n\t\t\tvisura\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ImprenditoreAziende($idImprenditore: ID!) {\n\t\timprenditoreAziende(idImprenditore: $idImprenditore) {\n\t\t\t_id\n\t\t\tragionesociale\n\t\t\tpiva\n\t\t\tcf\n\t\t\treferente\n\t\t\tamministratore\n\t\t\tunivoco\n\t\t\tpec\n\t\t\tvisura\n\t\t\tindirizzo {\n\t\t\t\tindirizzo\n\t\t\t\tcap\n\t\t\t\tcomune\n\t\t\t\tprovincia\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;