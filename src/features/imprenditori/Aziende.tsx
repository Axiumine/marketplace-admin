import type { ImprenditoreAziendeQuery } from '@gql/adminResource/graphql'
import { zodResolver } from '@hookform/resolvers/zod'
import type { OperationContext } from '@urql/core'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useMutation, useQuery } from 'urql'
import { z } from 'zod'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { AziendaAddDocument, AziendaDelDocument, AziendaUpdateDocument } from '@/api/operations/adminResource/mutations'
import { ImprenditoreAziendeDocument } from '@/api/operations/adminResource/queries'
import { AddressField } from '@/components/ui/AddressField'
import { Alert } from '@/components/ui/Alert'
import { EditableRow } from '@/components/ui/EditableRow'
import { IconButton } from '@/components/ui/IconButton'
import { IconCestino, IconPiu } from '@/components/ui/icons'
import { Infobox } from '@/components/ui/Infobox'
import { MappaIndirizzo } from '@/components/ui/MappaIndirizzo'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import { Toast } from '@/components/ui/Toast'
import { ToastValidazione } from '@/components/ui/ToastValidazione'
import { coordinata, FORMA_EMAIL, INDIRIZZO_VUOTO, MESSAGGIO_INDIRIZZO, richiesto } from '@/lib/campi'
import { formatIndirizzo, handleNull, vuotoInNull } from '@/lib/format'
import { coordinateTesto, erroreIndirizzo, indirizzoComposto, puntoDiMappa } from '@/lib/indirizzo'
import { scriviIndirizzo } from '@/lib/indirizzoForm'
import type { IndirizzoTrovato } from '@/lib/nominatim'

import type { RegistraSezione } from './salvataggio'
import { salvaValidato, useSezioneSalvabile } from './salvataggio'

/*
 * From marketplace-db-setup/migrations/20260803000000-create-azienda.js, by way of the service's own
 * `validaAzienda.mts`. They are the punto vendita's embedded `azienda` bounds unchanged, with the two
 * differences that migration introduces: `visura` was unbounded there and is capped here, and `cf` is
 * new.
 *
 * ⚠️ `MAX_INDIRIZZO` is **100**, as on a punto vendita and not the 250 an imprenditore's own address
 * gets. Same field name, same GraphQL fragment, three different collections.
 */
const MAX_RAGIONE_SOCIALE = 100
const MAX_REFERENTE = 50
const MAX_AMMINISTRATORE = 50
const MAX_VISURA = 1000
const MAX_EMAIL = 250
const MAX_INDIRIZZO = 100
const MAX_COMUNE = 100

/**
 * Exactly 11, and not the 16 of a personal codice fiscale: this is the company's, which for a legal
 * entity is the 11-digit form and usually equals its partita IVA. Optional, because no company stored
 * before the extraction carries one — the field did not exist.
 */
const LUNGHEZZA_CF = 11

/** The SDI recipient code. Seven alphanumerics, or nothing at all. */
const LUNGHEZZA_UNIVOCO = 7

/**
 * One company, flat — the card is one form and one Save, exactly as the mutation is one `$set`.
 *
 * `pec` here is the company's certified address: required, and unique across the whole collection. The
 * shop card has a `pec` of its own which is neither, and the two live on different forms precisely so
 * that flattening cannot write one into the other.
 */
export const aziendaSchema = z
	.object({
		ragionesociale: richiesto('La ragione sociale', MAX_RAGIONE_SOCIALE, 'obbligatoria'),
		piva: z
			.string()
			.trim()
			.regex(/^\d{11}$/, 'La partita IVA è di 11 cifre'),
		// Blank or the full length, with nothing in between and no format: the collection sets `minLength`
		// and `maxLength` and says nothing about the characters, so neither does this.
		cf: z
			.string()
			.trim()
			.refine((valore) => valore === '' || valore.length === LUNGHEZZA_CF, `Il codice fiscale è di ${LUNGHEZZA_CF} caratteri`),
		referente: richiesto('Il referente', MAX_REFERENTE),
		amministratore: richiesto("L'amministratore", MAX_AMMINISTRATORE),
		univoco: z
			.string()
			.trim()
			.refine(
				(valore) => valore === '' || /^[A-Za-z0-9]{7}$/.test(valore),
				`Il codice univoco è di ${LUNGHEZZA_UNIVOCO} caratteri alfanumerici`
			),
		pec: z.string().trim().regex(FORMA_EMAIL, 'La PEC non è un indirizzo valido'),
		visura: richiesto('La visura', MAX_VISURA, 'obbligatoria'),
		/**
		 * The whole address on one line, and the only part of it with a box of its own. Unvalidated by
		 * itself — it is text the operator may be halfway through typing — and checked instead by the rule
		 * at the bottom, which is the only place the six fields below and this one have to agree.
		 */
		indirizzoCompleto: z.string(),
		indirizzo: richiesto("L'indirizzo", MAX_INDIRIZZO),
		cap: z.string().regex(/^\d{5}$/, 'Il CAP deve essere di 5 cifre'),
		comune: richiesto('Il comune', MAX_COMUNE),
		provincia: z
			.string()
			.trim()
			.regex(/^[A-Za-z]{2}$/, 'La provincia è la sigla di 2 lettere')
			.transform((valore) => valore.toUpperCase()),
		longitudine: coordinata('La longitudine', 180),
		latitudine: coordinata('La latitudine', 90)
	})
	.refine((valori) => valori.indirizzoCompleto === formatIndirizzo(valori), {
		message: MESSAGGIO_INDIRIZZO,
		path: ['indirizzoCompleto']
	})

type AziendaValues = z.infer<typeof aziendaSchema>

type Azienda = ImprenditoreAziendeQuery['imprenditoreAziende'][number]

/**
 * See the note on `CTX_SALVA_IMPRENDITORE`: a `Boolean!` response names no typename to invalidate.
 *
 * ⚠️ One typename, and the shops list below still refreshes with it. `imprenditorePuntiVendita` selects
 * `azienda { _id ragionesociale }`, so its cached response carries a `GraphQLAzienda` of its own and the
 * document cache invalidates it on that — a company's ragione sociale is printed on every shop card that
 * points at it, and it comes back renamed without this context ever naming `GraphQLPuntoVendita`.
 *
 * Naming it anyway looked prudent and was unobservable: no test could tell the two lists apart, because
 * there is no state in which one invalidates and the other does not. Put it back the day a query returns
 * shops *without* their company nested inside them, and give it a test that fails without it.
 */
const CTX_SALVA_AZIENDA: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLAzienda']
})

/**
 * A blank card, for a company that does not exist yet.
 *
 * Every field is `''` and not absent, for the reason the shop form's `VALORI_NUOVI` gives: an
 * `undefined` reaching the schema answers with zod's own "expected string, received undefined" instead
 * of this form's messages.
 */
const VALORI_NUOVI: AziendaValues = {
	ragionesociale: '',
	piva: '',
	cf: '',
	referente: '',
	amministratore: '',
	univoco: '',
	pec: '',
	visura: '',
	...INDIRIZZO_VUOTO
}

const datiDi = (azienda: Azienda): AziendaValues => ({
	ragionesociale: azienda.ragionesociale,
	piva: azienda.piva,
	cf: azienda.cf ?? '',
	referente: azienda.referente,
	amministratore: azienda.amministratore,
	univoco: azienda.univoco ?? '',
	pec: azienda.pec,
	visura: azienda.visura,
	indirizzoCompleto: indirizzoComposto(azienda.indirizzo),
	indirizzo: azienda.indirizzo.indirizzo,
	cap: azienda.indirizzo.cap,
	comune: azienda.indirizzo.comune,
	provincia: azienda.indirizzo.provincia,
	...coordinateTesto(azienda.indirizzo.position.coordinates)
})

const valoriIniziali = (azienda: Azienda | null): AziendaValues => (azienda === null ? VALORI_NUOVI : datiDi(azienda))

/**
 * The `GraphQLInputAzienda` the two writes share: `aziendaAdd` and `aziendaUpdate` take the same object
 * and differ only in whether the other argument is the company's `_id` or its owner's.
 *
 * `cf` and `univoco` go out as `null` when blank, which is how the service is told to drop them — the
 * collection is `additionalProperties: false` with `bsonType: 'string'`, so an empty string would be a
 * stored value and not an absent field.
 */
const campiDaSalvare = (valori: AziendaValues) => ({
	ragionesociale: valori.ragionesociale,
	piva: valori.piva,
	cf: vuotoInNull(valori.cf),
	referente: valori.referente,
	amministratore: valori.amministratore,
	univoco: vuotoInNull(valori.univoco),
	pec: valori.pec,
	indirizzo: {
		indirizzo: valori.indirizzo,
		cap: valori.cap,
		comune: valori.comune,
		provincia: valori.provincia,
		// Longitude first — the order GeoJSON stores and the order this form does not display.
		position: { coordinates: [Number(valori.longitudine), Number(valori.latitudine)] }
	},
	visura: valori.visura
})

/**
 * The stored company's position, drawn under its address.
 *
 * A component of its own so that the two nulls are two decisions: the card says whether *a* map belongs
 * here at all — a company that does not exist yet has no seat to draw, and the editor's own map takes
 * over while it is open — and this says whether the pair the company carries is one a map can take.
 * Written as a single condition at the call site, the `azienda === null` half could not be falsified:
 * `posizione` is derived from that same `azienda`, so it was already null wherever that test would have
 * fired, and no test could tell the two halves apart.
 */
const MappaAzienda = ({ azienda }: { azienda: Azienda }) => {
	const posizione = puntoDiMappa(azienda.indirizzo.position.coordinates)

	if (posizione === null) return null

	return (
		<div className="flex flex-col gap-2 pt-2">
			<MappaIndirizzo lat={posizione.lat} lon={posizione.lon} titolo={`Mappa di ${azienda.ragionesociale}`} />
		</div>
	)
}

/**
 * One company, editable — or one that does not exist yet.
 *
 * Deliberately the same card as a punto vendita's, down to the queued deletion and the mask over it:
 * the two sit on one page under one Save button, and a trash icon that wrote immediately on one of them
 * and queued on the other would be the same control meaning two things.
 *
 * What it does *not* have is the ban icon. `disabledByAdmin` is a field on `puntoVendita`; a company is
 * not something the operator opens and closes, and there is nothing on the collection to flip.
 *
 * ⚠️ The delete is a **hard** one on the backend and is the single write on this page that can be
 * refused for a reason the operator has to act on: 409 while a live shop still points at the company.
 * That arrives through the card's own error toast, which is why the toast sits outside the mask.
 */
const FormAzienda = ({
	azienda,
	chiave,
	idImprenditore,
	registra,
	scarta
}: {
	azienda: Azienda | null
	/** What the page's save registry files this card under: the company's `_id`, or a new card's own key. */
	chiave: string
	idImprenditore: string
	registra: RegistraSezione
	/** Removes a new card from the list — pressing its trash, and succeeding at saving it. */
	scarta: (chiave: string) => void
}) => {
	const nuova = azienda === null

	const [errore, setErrore] = useState<string | undefined>(undefined)
	const [eliminata, setEliminata] = useState(false)
	const [, eseguiAdd] = useMutation(AziendaAddDocument)
	const [, eseguiUpdate] = useMutation(AziendaUpdateDocument)
	const [, eseguiDel] = useMutation(AziendaDelDocument)

	const {
		register,
		control,
		handleSubmit,
		setValue,
		trigger,
		reset,
		formState: { errors, isDirty }
	} = useForm<AziendaValues>({
		resolver: zodResolver(aziendaSchema),
		defaultValues: valoriIniziali(azienda)
	})

	/** See the shop form's own flag: the stored map steps aside while the editor's map is on screen. */
	const [indirizzoInModifica, setIndirizzoInModifica] = useState(false)

	const posizione = azienda === null ? null : puntoDiMappa(azienda.indirizzo.position.coordinates)

	/** A pick writes all seven boxes and revalidates them — see `scriviIndirizzo`, shared with both cards. */
	const applicaIndirizzo = (trovato: IndirizzoTrovato) => scriviIndirizzo(trovato, setValue, trigger)

	// A new card counts as a pending change from the moment it appears: it is a company the operator asked
	// for and the page has not written yet, so Save has to be live and leaving has to warn.
	const modificata = nuova || isDirty || eliminata

	/**
	 * The add, once the form has validated.
	 *
	 * `valori` is the resolver's output and not what is in the boxes — see the anagrafica's `scrivi`: the
	 * schema's `trim` and its upper-cased provincia are transforms, and this is the shape they produced.
	 */
	const aggiungi = async (valori: AziendaValues): Promise<boolean> => {
		const risultato = await eseguiAdd({ idImprenditore, azienda: campiDaSalvare(valori) }, CTX_SALVA_AZIENDA)

		if (risultato.data?.aziendaAdd !== true) {
			setErrore(risultato.error === undefined ? 'Salvataggio non riuscito.' : messageOf(risultato.error))
			return false
		}

		// The card has done its job. `additionalTypenames` refetches the list, the stored company takes its
		// place, and a placeholder left behind would offer to add it a second time.
		scarta(chiave)

		return true
	}

	const salva = async (): Promise<boolean> => {
		if (!modificata) return true

		// Everything below reads `azienda._id`, and a new card has none: the add is the whole save.
		if (azienda === null) return await salvaValidato(handleSubmit, aggiungi)

		// Deletion wins over the field edits: a company about to be removed does not need its card written
		// first. Unlike a shop's, this one is refused while anything still points at the company — the
		// message is the server's 409 and the card stays exactly as it was, still queued for deletion.
		if (eliminata) {
			const esito = await eseguiDel({ _id: azienda._id }, CTX_SALVA_AZIENDA)

			if (esito.data?.aziendaDel !== true) {
				setErrore(esito.error === undefined ? 'Eliminazione non riuscita.' : messageOf(esito.error))
				return false
			}

			return true
		}

		/*
		 * What is left is a field edit, with no `if (isDirty)` around it: `modificata` is
		 * `nuova || isDirty || eliminata`, the early return above rules out all three being false and the two
		 * branches above handle the other two, so `isDirty` is true by the time execution reaches here. The
		 * shop card does carry that test, because its own `modificata` has a fourth term — the ban icon,
		 * which writes through a different mutation and leaves the form clean.
		 */

		// Read out here rather than inside the closure below: TypeScript drops the `azienda !== null`
		// narrowing across a function boundary, since the prop is a binding it cannot prove was never
		// reassigned. A const carries it through.
		const _id = azienda._id

		const aggiorna = async (valori: AziendaValues): Promise<boolean> => {
			const risultato = await eseguiUpdate({ _id, azienda: campiDaSalvare(valori) }, CTX_SALVA_AZIENDA)

			if (risultato.data?.aziendaUpdate !== true) {
				setErrore(risultato.error === undefined ? 'Salvataggio non riuscito.' : messageOf(risultato.error))
				return false
			}

			reset(valori)

			// The card's own toast, cleared by the save that fixed what it was about. Not redundant with the
			// remount a save triggers: the page only puts itself back when *every* section succeeded, so a card
			// that has just been written while a later one failed stays mounted, and its stale refusal would sit
			// on screen beside the new one.
			setErrore(undefined)

			return true
		}

		return await salvaValidato(handleSubmit, aggiorna)
	}

	useSezioneSalvabile(chiave, registra, modificata, salva)

	return (
		<section>
			<div className="mb-1 flex items-center justify-between gap-2">
				{/* The heading is the ragione sociale, which is the company's name and the one thing that
				    identifies the card. It is edited from a row inside the box like every other field —
				    there is no pen up here, unlike a shop, whose insegna has no box of its own at all. */}
				<h3 className={`text-lg font-bold ${eliminata ? 'text-tip line-through' : ''}`}>
					{azienda === null ? 'Nuova azienda' : azienda.ragionesociale}
				</h3>
				<IconButton
					nome={nuova ? 'Annulla nuova azienda' : eliminata ? 'Annulla eliminazione azienda' : 'Elimina azienda'}
					onClick={() => {
						// A card with nothing behind it is thrown away rather than queued: there is no document
						// to delete, and discarding it is also the only way out of the leave guard it arms.
						if (nuova) scarta(chiave)
						else setEliminata((attuale) => !attuale)
					}}
				>
					<IconCestino />
				</IconButton>
			</div>

			{errore === undefined ? null : <Toast tone="error">{errore}</Toast>}
			<ToastValidazione errori={errors} />

			{/* `relative` so the mask below covers exactly the company's information — the title row keeps
			    its trash, which is the only way back out of a queued deletion, and the toast above stays
			    sharp because a refused delete is reported through it. */}
			<div className="relative">
				<div className="grid gap-4 md:grid-cols-2">
					<Infobox title="Dati azienda">
						{/* `apertoIniziale={nuova}` on every row, and `value` read through `?.`: a new company has
						    nothing stored, so each row opens on its editor and the closed value is never
						    rendered — the optional chain is there so the expression is evaluable. */}
						<EditableRow label="Ragione sociale" value={azienda?.ragionesociale} apertoIniziale={nuova}>
							<TextField
								label="Ragione sociale"
								maxLength={MAX_RAGIONE_SOCIALE}
								error={errors.ragionesociale?.message}
								{...register('ragionesociale')}
							/>
						</EditableRow>
						<EditableRow label="P. IVA" value={azienda?.piva} apertoIniziale={nuova}>
							<TextField label="P. IVA" inputMode="numeric" maxLength={11} error={errors.piva?.message} {...register('piva')} />
						</EditableRow>
						<EditableRow label="Codice fiscale" value={handleNull(azienda?.cf)} apertoIniziale={nuova}>
							<TextField label="Codice fiscale" maxLength={LUNGHEZZA_CF} error={errors.cf?.message} {...register('cf')} />
						</EditableRow>
						<EditableRow label="Referente" value={azienda?.referente} apertoIniziale={nuova}>
							<TextField
								label="Referente"
								maxLength={MAX_REFERENTE}
								error={errors.referente?.message}
								{...register('referente')}
							/>
						</EditableRow>
						<EditableRow label="Amministratore" value={azienda?.amministratore} apertoIniziale={nuova}>
							<TextField
								label="Amministratore"
								maxLength={MAX_AMMINISTRATORE}
								error={errors.amministratore?.message}
								{...register('amministratore')}
							/>
						</EditableRow>
						<EditableRow label="Codice univoco" value={handleNull(azienda?.univoco)} apertoIniziale={nuova}>
							<TextField
								label="Codice univoco"
								maxLength={LUNGHEZZA_UNIVOCO}
								error={errors.univoco?.message}
								{...register('univoco')}
							/>
						</EditableRow>
						<EditableRow label="PEC" value={azienda?.pec} apertoIniziale={nuova}>
							<TextField label="PEC" type="email" maxLength={MAX_EMAIL} error={errors.pec?.message} {...register('pec')} />
						</EditableRow>
						<EditableRow label="Visura" value={azienda?.visura} apertoIniziale={nuova}>
							<TextField label="Visura" maxLength={MAX_VISURA} error={errors.visura?.message} {...register('visura')} />
						</EditableRow>
					</Infobox>

					{/* The legal seat, and not the address of any of the company's shops — those have boxes of
					    their own further down the page. */}
					<Infobox title="Sede legale">
						<EditableRow
							label="Indirizzo"
							value={azienda === null ? null : formatIndirizzo(azienda.indirizzo)}
							apertoIniziale={nuova}
							onApri={() => {
								setIndirizzoInModifica(true)
							}}
						>
							{/*
							 * `Controller` and not `register` + `watch`, because this box is a controlled
							 * component and the two do not mix: `register` hands react-hook-form the input's DOM
							 * node, and the form then writes `ref.value` straight onto it on every `setValue`.
							 * The box was driven twice over — once by React through `value`, once by the form
							 * behind React's back — and the `value` prop could have been dropped entirely with
							 * nothing on screen changing. `Controller` keeps the ref out of it, so what the
							 * operator sees comes from one place.
							 */}
							<Controller
								control={control}
								name="indirizzoCompleto"
								render={({ field }) => (
									<AddressField
										label="Indirizzo"
										value={field.value}
										error={erroreIndirizzo(errors)}
										centroIniziale={posizione}
										onSelect={applicaIndirizzo}
										name={field.name}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								)}
							/>
						</EditableRow>

						{/* Steps aside while the editor is open: `AddressField` brings a map of its own that
						    follows what is being typed, and two maps of two different places, stacked, is worse
						    than either. */}
						{indirizzoInModifica || azienda === null ? null : <MappaAzienda azienda={azienda} />}
					</Infobox>
				</div>

				{/* The mask — see the shop card's own, which this matches deliberately. */}
				{eliminata ? (
					<div className="absolute inset-0 z-10 flex items-center justify-center rounded-box bg-palette-bg1/60 backdrop-blur-sm">
						<p className="rounded-box border border-third bg-white px-4 py-2 text-sm font-semibold text-third shadow">
							Verrà eliminata al salvataggio.
						</p>
					</div>
				) : null}
			</div>
		</section>
	)
}

/**
 * The stored companies, plus whatever new cards the operator has open.
 *
 * Each company is its own form and its own section of the page's save: one failing on a duplicate partita
 * IVA leaves the others' edits in the boxes, still dirty and still savable.
 */
const ElencoAziende = ({
	aziende,
	idImprenditore,
	registra,
	nuove,
	scarta
}: {
	aziende: readonly Azienda[]
	idImprenditore: string
	registra: RegistraSezione
	nuove: string[]
	scarta: (chiave: string) => void
}) => {
	// "None registered" is about the collection, but it cannot be on screen under an open new card: the
	// card is the answer to it.
	if (aziende.length === 0 && nuove.length === 0) return <p className="text-tip">Nessuna azienda registrata.</p>

	return (
		<div className="flex flex-col gap-6">
			{aziende.map((azienda) => (
				<FormAzienda
					key={azienda._id}
					chiave={azienda._id}
					azienda={azienda}
					idImprenditore={idImprenditore}
					registra={registra}
					scarta={scarta}
				/>
			))}
			{/* New cards last, under the companies that exist: the list is the record, and what is being
			    added to it belongs at the bottom rather than pushing the record down the page. */}
			{nuove.map((chiave) => (
				<FormAzienda
					key={chiave}
					chiave={chiave}
					azienda={null}
					idImprenditore={idImprenditore}
					registra={registra}
					scarta={scarta}
				/>
			))}
		</div>
	)
}

/**
 * The companies of one imprenditore: a heading, the plus that adds one, and the list.
 *
 * It sits between the anagrafica and the shops because that is the order the data requires — a punto
 * vendita points at a company and cannot be created before one exists, so an operator setting up a new
 * imprenditore fills this section first. The shops section below reads the same query and disables its
 * own plus while this list is empty.
 *
 * The query is issued here rather than inside the list so the heading and the plus survive its three
 * outcomes: an imprenditore with no companies is exactly who needs the button, and a failed fetch is no
 * reason to take it away.
 */
export const Aziende = ({ idImprenditore, registra }: { idImprenditore: string; registra: RegistraSezione }) => {
	const [nuove, setNuove] = useState<string[]>([])

	const [result] = useQuery({
		query: ImprenditoreAziendeDocument,
		variables: { idImprenditore },
		context: CTX_ADMIN_RESOURCE
	})

	const aziende = result.data?.imprenditoreAziende ?? []

	return (
		<>
			<div className="mt-8 mb-2 flex items-center justify-between gap-2">
				<h2 className="text-lg font-bold">Aziende</h2>
				<IconButton
					nome="Aggiungi azienda"
					onClick={() => {
						setNuove((attuali) => [...attuali, crypto.randomUUID()])
					}}
				>
					<IconPiu />
				</IconButton>
			</div>

			{result.fetching ? (
				<Spinner label="Caricamento aziende" />
			) : result.error !== undefined ? (
				<Alert tone="error">{messageOf(result.error)}</Alert>
			) : (
				<ElencoAziende
					aziende={aziende}
					idImprenditore={idImprenditore}
					registra={registra}
					nuove={nuove}
					scarta={(chiave) => {
						setNuove((attuali) => attuali.filter((aperta) => aperta !== chiave))
					}}
				/>
			)}
		</>
	)
}
