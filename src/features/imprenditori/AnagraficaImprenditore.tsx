import type { ImprenditoreByIdQuery } from '@gql/adminResource/graphql'
import { zodResolver } from '@hookform/resolvers/zod'
import type { OperationContext } from '@urql/core'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useMutation, useQuery } from 'urql'
import { z } from 'zod'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import {
	ImprenditoreUpdateDocument,
	ImprenditoreUpdateEmailDocument,
	ImprenditoreUpdateNoteDocument,
	ImprenditoreUpdatePreferenzeDocument,
	ImprenditoreUpdateStatoDocument
} from '@/api/operations/adminResource/mutations'
import { ImprenditoreByIdDocument } from '@/api/operations/adminResource/queries'
import { AddressField } from '@/components/ui/AddressField'
import { Alert } from '@/components/ui/Alert'
import { CheckboxField } from '@/components/ui/CheckboxField'
import { EditableRow } from '@/components/ui/EditableRow'
import { Infobox, InfoRow } from '@/components/ui/Infobox'
import { MappaIndirizzo } from '@/components/ui/MappaIndirizzo'
import { Spinner } from '@/components/ui/Spinner'
import { TextareaField } from '@/components/ui/TextareaField'
import { TextField } from '@/components/ui/TextField'
import { Toast } from '@/components/ui/Toast'
import { ToastValidazione } from '@/components/ui/ToastValidazione'
import {
	formatDate,
	formatIndirizzo,
	handleNull,
	handleNullBoolYN,
	handleNullDate,
	handleNullHash,
	toDataInput,
	vuotoInNull
} from '@/lib/format'
import { erroreIndirizzo, indirizzoComposto, puntoDiMappa } from '@/lib/indirizzo'
import { scriviIndirizzo } from '@/lib/indirizzoForm'
import { dataMassimaNascita, eMaggiorenne, ETA_MINIMA } from '@/lib/maggiorenne'
import type { IndirizzoTrovato } from '@/lib/nominatim'

import type { RegistraSezione } from './salvataggio'
import { salvaValidato, useSezioneSalvabile } from './salvataggio'

/**
 * The account-status colour, as a class name rather than an inline style string.
 *
 * Order matters: deleted wins over disabled, and the yellow is the *remaining* flagged case — an
 * account still waiting on manual approval. The approved-and-active account falls off the end with no
 * tint at all, which is the honest rendering of "nothing is wrong". Reaching the yellow through a bare
 * `else` would paint every healthy account "in attesa", so the last branch is a real test, not a
 * default.
 *
 * ⚠️ `deleted` is a **timestamp**, not a flag — `IImprenditoreSchema.deleted?: Date`, exposed as
 * `DateTime`. Its presence is the soft delete, so it is tested with `!= null`. Comparing it against
 * `true`, or rendering it through `handleNullBoolYN`, is false for every value the field can hold: a
 * deleted account then reads "Eliminato: No" and never gets its grey.
 */
export const accountStatusClass = (imprenditore: {
	deleted?: string | null
	disabled?: boolean | null
	waitApprov?: boolean | null
}): string => {
	if (imprenditore.deleted != null) return 'account-deleted'
	if (imprenditore.disabled === true) return 'account-disabled'
	if (imprenditore.waitApprov === true) return 'account-wait-approv'
	return ''
}

/*
 * The collection's own `maxLength`s, copied from the migration by way of the service's validators
 * (`src/lib/validate/` in marketplace-dev-admin-authenticated-resource). They are repeated here rather than
 * imported because there is nothing to import from — the backend is a separate repo and a separate npm
 * package boundary — so a bound that moves there has to be moved here too. Getting one wrong costs a
 * round-trip and an error message written for a developer, never a corrupt write: the service checks
 * every one of them again.
 */
const MAX_NOME = 100
const MAX_COGNOME = 100
const MAX_INDIRIZZO = 250
const MAX_COMUNE = 100
const MAX_TELEFONO = 12
const MAX_EMAIL = 250
const MAX_ONBOARDING_STEP = 4
const MAX_NOTA = 2000

const richiesto = (label: string, max: number) =>
	z.string().trim().min(1, `${label} è obbligatorio`).max(max, `${label} non può superare ${max} caratteri`)

/**
 * One half of the GeoJSON pair, as the form holds it: a string, and an *empty* one for every
 * imprenditore stored before the point existed.
 *
 * That is the whole difference from the punto vendita's `coordinata`, whose field is required on its
 * collection and therefore never blank. Here the migration added `position` as optional and nothing
 * backfilled it, so a legacy address seeds both boxes empty and has to stay saveable — the operator may
 * be editing a phone number on a record whose coordinates nobody ever picked.
 *
 * The two rules stay separate for the same reason they are separate there: "12,5" and "1200" are
 * different mistakes. Neither can be reached by typing, since only a geocoder pick writes these fields,
 * but a pick is not the only way a value gets here — the server's own answer seeds them too.
 */
const coordinataOpzionale = (label: string, limite: number) =>
	z
		.string()
		.trim()
		// No blank test, unlike the required rule in `lib/campi.ts`: blank has to pass here, and it does on
		// its own. `Number('')` is `0`, which is finite and inside every bound — the very accident that rule
		// has to guard against is what makes this one work. Spelling the case out changed no answer and left
		// a mutant nothing could kill.
		.refine((valore) => Number.isFinite(Number(valore)), `${label} non è un numero`)
		.refine((valore) => Math.abs(Number(valore)) <= limite, `${label} è fuori da -${limite}..${limite}`)

/**
 * Everything the detail page can write about one imprenditore, flat.
 *
 * Flat and not shaped like the four mutations it feeds: the grouping lives in `GRUPPI` below, where it
 * is a list of field names, and nesting the form state to match would give every `register()` a dotted
 * path for no gain. The booleans are here too — they cannot fail validation, but leaving them out of the
 * schema would leave them out of the resolver's inferred type as well.
 */
export const dettaglioImprenditoreSchema = z
	.object({
		emailLogin: z
			.email('Inserisci un indirizzo email di accesso valido')
			.max(MAX_EMAIL, `L'email di accesso non può superare ${MAX_EMAIL} caratteri`),
		nome: richiesto('Il nome', MAX_NOME),
		cognome: richiesto('Il cognome', MAX_COGNOME),
		// Against the clock at validation time, not a constant captured at import: a panel left open
		// overnight would otherwise keep yesterday's boundary and reject a date the calendar allows.
		dataNascita: z.iso
			.date('Inserisci una data di nascita valida')
			.refine((data) => eMaggiorenne(data, new Date()), `L'imprenditore deve essere maggiorenne (almeno ${ETA_MINIMA} anni)`),
		/**
		 * The whole address on one line — the only part of it with a box of its own, exactly as on a punto
		 * vendita. Unvalidated by itself, because it is text the operator may be halfway through typing, and
		 * checked instead by the composite rule at the bottom.
		 */
		indirizzoCompleto: z.string(),
		indirizzo: richiesto("L'indirizzo", MAX_INDIRIZZO),
		cap: z.string().regex(/^\d{5}$/, 'Il CAP deve essere di 5 cifre'),
		comune: richiesto('Il comune', MAX_COMUNE),
		// Upper-cased by the schema rather than on the way to the wire, so the value the form keeps is the
		// value the collection stores. Uppercasing in the payload alone would leave "mi" in the box after a
		// save that wrote "MI" — a row disagreeing with the server it just answered to.
		provincia: z
			.string()
			.trim()
			.regex(/^[A-Za-z]{2}$/, 'La provincia è la sigla di 2 lettere')
			.transform((valore) => valore.toUpperCase()),
		longitudine: coordinataOpzionale('La longitudine', 180),
		latitudine: coordinataOpzionale('La latitudine', 90),
		cellulare: richiesto('Il cellulare', MAX_TELEFONO),
		fisso: z.string().trim().max(MAX_TELEFONO, `Il fisso non può superare ${MAX_TELEFONO} caratteri`),
		contattoEmail: z
			.email('Inserisci un indirizzo email di contatto valido')
			.max(MAX_EMAIL, `L'email di contatto non può superare ${MAX_EMAIL} caratteri`),
		disabled: z.boolean(),
		waitApprov: z.boolean(),
		rememberMe: z.boolean(),
		onboardingDone: z.boolean(),
		onboardingStep: z
			.string()
			.trim()
			.max(MAX_ONBOARDING_STEP, `Il passo onboarding non può superare ${MAX_ONBOARDING_STEP} caratteri`),
		// Blank is a value here and not a missing one: the empty string is what `imprenditoreUpdateNote`
		// reads as "remove the note", so it needs no `min` and gets none.
		note: z.string().trim().max(MAX_NOTA, `La nota non può superare ${MAX_NOTA} caratteri`)
	})
	/*
	 * The box the operator types into is not what gets stored: the four fields above it are, together with
	 * the coordinates, and all six are written only by picking one of the geocoder's answers. A typed
	 * address that was never picked would otherwise save the *previous* street under new-looking text.
	 *
	 * Same rule as the punto vendita's, and the same reason it has to exist — with one difference behind
	 * it: an imprenditore's coordinates may legitimately be missing, so this is what guarantees that when
	 * the address *does* change, a point comes with it.
	 */
	.refine((valori) => valori.indirizzoCompleto === formatIndirizzo(valori), {
		message: "Seleziona l'indirizzo dall'elenco",
		path: ['indirizzoCompleto']
	})

type DettaglioValues = z.infer<typeof dettaglioImprenditoreSchema>

/**
 * Which fields belong to which mutation.
 *
 * The page sends only the groups the operator actually touched. That is not an optimisation:
 * `imprenditoreUpdate` answers **500** when its `$set` matched the document and modified nothing, so
 * re-sending an untouched anagrafica alongside a changed email would fail the save and roll nothing
 * back — the email would already be written.
 */
const CAMPI_ANAGRAFICA = [
	'nome',
	'cognome',
	'dataNascita',
	'indirizzoCompleto',
	'indirizzo',
	'cap',
	'comune',
	'provincia',
	'latitudine',
	'longitudine',
	'cellulare',
	'fisso',
	'contattoEmail'
] as const
const CAMPI_STATO = ['disabled', 'waitApprov'] as const
const CAMPI_PREFERENZE = ['rememberMe', 'onboardingDone', 'onboardingStep'] as const

/**
 * Invalidates the detail query after a write.
 *
 * All four mutations answer a bare `Boolean`, and the document cache invalidates by the `__typename`s a
 * *response* mentions — a boolean mentions none. Without this the page would keep rendering the values
 * it had before the save, which for a one-way editable row means the read-only half of the row
 * contradicts what was just written.
 */
const CTX_SALVA_IMPRENDITORE: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLImprenditoreById']
})

/**
 * The GeoJSON point the anagrafica mutation carries, or `null` when there is none to carry.
 *
 * The pair is either both blank — an imprenditore whose address predates the field — or both written by
 * a pick, because nothing else writes them. Testing one half is therefore enough, and testing the
 * longitude is the deliberate half: it is `coordinates[0]`, so a swapped pair shows up as a point in the
 * sea rather than as a missing one.
 */
const posizioneDaSalvare = (valori: DettaglioValues): { coordinates: number[] } | null =>
	valori.longitudine === '' ? null : { coordinates: [Number(valori.longitudine), Number(valori.latitudine)] }

type Imprenditore = ImprenditoreByIdQuery['imprenditoreById']

/**
 * The server's answer, as form state.
 *
 * Every optional field becomes `''` and every nullable boolean becomes `false`, because that is what an
 * empty text box and an unticked box read back as — seeded with `null` they would come back dirty on
 * the first render and be written on a save the operator meant for another field.
 */
const valoriIniziali = (imprenditore: Imprenditore): DettaglioValues => ({
	emailLogin: imprenditore.login.email,
	nome: imprenditore.anagrafica.nome,
	cognome: imprenditore.anagrafica.cognome,
	dataNascita: toDataInput(imprenditore.anagrafica.nascita.data),
	indirizzoCompleto: indirizzoComposto(imprenditore.anagrafica.indirizzo),
	indirizzo: imprenditore.anagrafica.indirizzo.indirizzo,
	cap: imprenditore.anagrafica.indirizzo.cap,
	comune: imprenditore.anagrafica.indirizzo.comune,
	provincia: imprenditore.anagrafica.indirizzo.provincia,
	// `''` for the two of them when there is no point — which is the normal state of every imprenditore
	// created before the field existed, not an error. `?? ''` and not a cast: a pair of the wrong length
	// is the one broken shape `[Float!]!` can carry, and `String(undefined)` would seed the box with the
	// word "undefined".
	longitudine: String(imprenditore.anagrafica.indirizzo.position?.coordinates[0] ?? ''),
	latitudine: String(imprenditore.anagrafica.indirizzo.position?.coordinates[1] ?? ''),
	cellulare: imprenditore.anagrafica.contatti.cellulare,
	fisso: imprenditore.anagrafica.contatti.fisso ?? '',
	contattoEmail: imprenditore.anagrafica.contatti.email,
	disabled: imprenditore.disabled === true,
	waitApprov: imprenditore.waitApprov === true,
	rememberMe: imprenditore.login.rememberMe === true,
	onboardingDone: imprenditore.login.onboardingDone === true,
	onboardingStep: imprenditore.login.onboardingStep ?? '',
	note: imprenditore.note ?? ''
})

/**
 * The anagrafica block, once the data is in.
 *
 * Its own component because `useForm` takes its `defaultValues` once, on mount: rendering the form
 * beside the `fetching` branch would seed every field with `undefined` and then never look again, so
 * every box would be empty and every field dirty.
 */
const FormAnagrafica = ({ imprenditore, registra }: { imprenditore: Imprenditore; registra: RegistraSezione }) => {
	const [errore, setErrore] = useState<string | undefined>(undefined)

	// Whether the address editor is open, which is what tells the card to stop drawing its own map — the
	// editor brings one that follows what is being typed, and two maps of two different places, stacked,
	// is worse than either.
	const [indirizzoInModifica, setIndirizzoInModifica] = useState(false)

	const [, eseguiAnagrafica] = useMutation(ImprenditoreUpdateDocument)
	const [, eseguiEmail] = useMutation(ImprenditoreUpdateEmailDocument)
	const [, eseguiStato] = useMutation(ImprenditoreUpdateStatoDocument)
	const [, eseguiPreferenze] = useMutation(ImprenditoreUpdatePreferenzeDocument)
	const [, eseguiNote] = useMutation(ImprenditoreUpdateNoteDocument)

	const {
		register,
		control,
		handleSubmit,
		setValue,
		trigger,
		reset,
		formState: { errors, dirtyFields, isDirty }
	} = useForm<DettaglioValues>({
		resolver: zodResolver(dettaglioImprenditoreSchema),
		defaultValues: valoriIniziali(imprenditore)
	})

	// Watched for its length alone: the box is uncontrolled, so the count under it has nowhere else to
	// come from, and it has to be right from the first render rather than from the first keystroke.
	const nota = useWatch({ control, name: 'note' })

	const sporco = (campi: readonly (keyof DettaglioValues)[]) => campi.some((campo) => dirtyFields[campo] === true)

	/**
	 * The address the card draws when the editor is closed. `null` for every imprenditore stored before
	 * the point existed — there is nothing to draw, and the box says so instead.
	 */
	const posizione = puntoDiMappa(imprenditore.anagrafica.indirizzo.position?.coordinates)

	/** A pick writes all seven boxes and revalidates them — see `scriviIndirizzo`, shared with both cards. */
	const applicaIndirizzo = (trovato: IndirizzoTrovato) => scriviIndirizzo(trovato, setValue, trigger)

	/**
	 * Turns a refusal into a message and stops the save.
	 *
	 * A mutation can fail two ways: with a `CombinedError`, which carries the backend's own description,
	 * or by answering `false` with no error at all — which no resolver here does, but a `Boolean!` says it
	 * could, and a save that quietly reports success would be worse than a generic line.
	 */
	const fallito = (error: Parameters<typeof messageOf>[0]) => {
		setErrore(error === undefined ? 'Salvataggio non riuscito.' : messageOf(error))
		return false
	}

	/**
	 * The five writes, once the form has validated.
	 *
	 * `valori` is the resolver's output and not what is in the boxes: the schema's `trim` and its
	 * upper-casing are transforms, so this is where " Mario " and "mi" have already become "Mario" and
	 * "MI". Sending the raw form state would write them past a validator that had just approved the
	 * cleaned-up pair.
	 */
	const scrivi = async (valori: DettaglioValues): Promise<boolean> => {
		if (sporco(CAMPI_ANAGRAFICA)) {
			const risultato = await eseguiAnagrafica(
				{
					_id: imprenditore._id,
					anagrafica: {
						nome: valori.nome,
						cognome: valori.cognome,
						nascita: { data: valori.dataNascita },
						indirizzo: {
							indirizzo: valori.indirizzo,
							cap: valori.cap,
							comune: valori.comune,
							provincia: valori.provincia,
							// ⚠️ Sent on every anagrafica save, not only when the address changed: the mutation
							// `$set`s the whole sub-document, so omitting the point erases the one the record
							// already had. `null` is the honest value for a record that never had one — the
							// resolver leaves the key out entirely rather than writing it.
							position: posizioneDaSalvare(valori)
						},
						contatti: {
							cellulare: valori.cellulare,
							fisso: vuotoInNull(valori.fisso),
							email: valori.contattoEmail
						}
					}
				},
				CTX_SALVA_IMPRENDITORE
			)

			if (risultato.data?.imprenditoreUpdate !== true) return fallito(risultato.error)
		}

		if (dirtyFields.emailLogin === true) {
			const risultato = await eseguiEmail({ _id: imprenditore._id, email: valori.emailLogin }, CTX_SALVA_IMPRENDITORE)

			if (risultato.data?.imprenditoreUpdateEmail !== true) return fallito(risultato.error)
		}

		if (sporco(CAMPI_STATO)) {
			const risultato = await eseguiStato(
				{ _id: imprenditore._id, disabled: valori.disabled, waitApprov: valori.waitApprov },
				CTX_SALVA_IMPRENDITORE
			)

			if (risultato.data?.imprenditoreUpdateStato !== true) return fallito(risultato.error)
		}

		if (sporco(CAMPI_PREFERENZE)) {
			const risultato = await eseguiPreferenze(
				{
					_id: imprenditore._id,
					rememberMe: valori.rememberMe,
					onboardingDone: valori.onboardingDone,
					onboardingStep: vuotoInNull(valori.onboardingStep)
				},
				CTX_SALVA_IMPRENDITORE
			)

			if (risultato.data?.imprenditoreUpdatePreferenze !== true) return fallito(risultato.error)
		}

		// `valori.note` and not `vuotoInNull`: this mutation takes `String!`, and the empty string is the
		// instruction that removes the note. There is nothing to send `null` as.
		if (dirtyFields.note === true) {
			const risultato = await eseguiNote({ _id: imprenditore._id, note: valori.note }, CTX_SALVA_IMPRENDITORE)

			if (risultato.data?.imprenditoreUpdateNote !== true) return fallito(risultato.error)
		}

		// The written values become the new baseline, so nothing is dirty any more and the Save button
		// goes back to disabled. Re-seeding from the refetched query instead would race it.
		reset(valori)
		setErrore(undefined)

		return true
	}

	const salva = async (): Promise<boolean> => {
		// An untouched block is not merely nothing to send — it must not be *validated* either. These forms
		// are seeded from whatever the collection already holds, and a legacy row the current rules would
		// reject (a three-letter provincia, a landline of thirteen digits) would otherwise fail the page's
		// save while the operator was editing a different block entirely.
		if (!isDirty) return true

		return await salvaValidato(handleSubmit, scrivi)
	}

	useSezioneSalvabile(imprenditore._id, registra, isDirty, salva)

	const { anagrafica, login, resetPwd } = imprenditore

	return (
		<div className="flex flex-col gap-6">
			{errore === undefined ? null : <Toast tone="error">{errore}</Toast>}
			<ToastValidazione errori={errors} />

			<section>
				<h2 className="mb-2 text-lg font-bold">Anagrafica</h2>
				{/* Three cards, one line: the imprenditore, where they are, and what the operator wrote about
				    them. The note lived under Account until it turned out to be read beside the address rather
				    than beside the login flags. */}
				<div className="grid gap-4 md:grid-cols-3">
					<Infobox title="Imprenditore">
						{/* `login.email` is the credential and carries the collection's only unique index;
						    `contatti.email` is where the shop is written to. They are usually the same
						    address, and the two labels are what stops one being edited for the other. */}
						<EditableRow label="Email di login" value={login.email}>
							<TextField
								label="Email di login"
								type="email"
								maxLength={MAX_EMAIL}
								error={errors.emailLogin?.message}
								{...register('emailLogin')}
							/>
						</EditableRow>
						<EditableRow label="Nome" value={anagrafica.nome}>
							<TextField label="Nome" maxLength={MAX_NOME} error={errors.nome?.message} {...register('nome')} />
						</EditableRow>
						<EditableRow label="Cognome" value={anagrafica.cognome}>
							<TextField label="Cognome" maxLength={MAX_COGNOME} error={errors.cognome?.message} {...register('cognome')} />
						</EditableRow>
						{/* `max` greys out the disallowed half of the picker. It is a hint, not the check: a
						    typed or pasted date reaches zod regardless, which is where the rule lives. */}
						<EditableRow label="Nato il" value={formatDate(anagrafica.nascita.data)}>
							<TextField
								label="Nato il"
								type="date"
								max={dataMassimaNascita(new Date())}
								error={errors.dataNascita?.message}
								{...register('dataNascita')}
							/>
						</EditableRow>
						<EditableRow label="Cellulare" value={anagrafica.contatti.cellulare}>
							<TextField
								label="Cellulare"
								type="tel"
								maxLength={MAX_TELEFONO}
								error={errors.cellulare?.message}
								{...register('cellulare')}
							/>
						</EditableRow>
						<EditableRow label="Fisso" value={handleNull(anagrafica.contatti.fisso)}>
							<TextField
								label="Fisso"
								type="tel"
								maxLength={MAX_TELEFONO}
								error={errors.fisso?.message}
								{...register('fisso')}
							/>
						</EditableRow>
						<EditableRow label="Email di contatto" value={anagrafica.contatti.email}>
							<TextField
								label="Email di contatto"
								type="email"
								maxLength={MAX_EMAIL}
								error={errors.contattoEmail?.message}
								{...register('contattoEmail')}
							/>
						</EditableRow>
					</Infobox>

					{/* One column of the three, beside the imprenditore's card rather than under it. The map
					    inside is drawn from the card's width, so it simply gets narrower. */}
					<Infobox title="Indirizzo">
						<EditableRow
							label="Indirizzo"
							value={formatIndirizzo(anagrafica.indirizzo)}
							onApri={() => {
								setIndirizzoInModifica(true)
							}}
						>
							{/*
							 * One box for the whole address, and the four fields it fills are not on screen at
							 * all — the same component the new-imprenditore form and the punto vendita use.
							 *
							 * Its map opens on the imprenditore's own address when there is one, and on the middle
							 * of Italy when there is not; `centroIniziale` takes the `null` for exactly that.
							 *
							 * `Controller` and not `register` + `useWatch`: the box is a controlled component, and
							 * `register` would also hand the form the input's DOM node to write `ref.value` onto
							 * behind React's back — the same value arriving twice by two different routes. See
							 * the company card, which carries the long version of this note.
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

						{/* The map, while the editor is closed. Two things can put it away: an open editor, which
						    brings a map of its own, and an address that has no point behind it — the normal state
						    of every imprenditore registered before the coordinates existed, which is a sentence
						    rather than a blank space so it does not read as a failed render. */}
						{indirizzoInModifica ? null : (
							<div className="flex flex-col gap-2 pt-2">
								{posizione === null ? (
									<p className="text-sm text-tip">
										Posizione non disponibile: modifica l&apos;indirizzo e selezionalo dall&apos;elenco per aggiungerla.
									</p>
								) : (
									<MappaIndirizzo
										lat={posizione.lat}
										lon={posizione.lon}
										titolo={`Mappa di ${anagrafica.nome} ${anagrafica.cognome}`}
									/>
								)}
							</div>
						)}
					</Infobox>

					{/*
					 * The operator's own note about the imprenditore — not something the imprenditore wrote or can
					 * read. Third card of the first line, beside the address rather than down in Account: it is read
					 * together with who the person is and where they are, not with the login flags.
					 */}
					<Infobox title="Note">
						{/* `whitespace-pre-line`, because a note is written in lines and the read-only half would
						    otherwise run them all together into one paragraph. */}
						<EditableRow label="Note" value={<span className="whitespace-pre-line">{handleNull(imprenditore.note)}</span>}>
							<TextareaField
								label="Note"
								maxLength={MAX_NOTA}
								rimanenti={MAX_NOTA - nota.length}
								error={errors.note?.message}
								{...register('note')}
							/>
						</EditableRow>
					</Infobox>
				</div>
			</section>

			<section>
				<h2 className="mb-2 text-lg font-bold">Account</h2>
				<div className="grid gap-4 md:grid-cols-3">
					<Infobox title="Account status" className={accountStatusClass(imprenditore)}>
						<EditableRow label="Disabilitato" value={handleNullBoolYN(imprenditore.disabled)}>
							<CheckboxField label="Disabilitato" {...register('disabled')} />
						</EditableRow>
						{/* The four timestamps below are the account's audit trail — written by the platform,
						    never by an operator — so they have no pen. */}
						<InfoRow label="Eliminato il" value={handleNullDate(imprenditore.deleted)} />
						<EditableRow label="In attesa di approvazione" value={handleNullBoolYN(imprenditore.waitApprov)}>
							<CheckboxField label="In attesa di approvazione" {...register('waitApprov')} />
						</EditableRow>
						<InfoRow label="Registrato" value={handleNullDate(imprenditore.iscrizione)} />
						<InfoRow label="Primo login" value={handleNullDate(login.firstLogin)} />
						<InfoRow label="Ultimo login" value={handleNullDate(login.lastLogin)} />
					</Infobox>

					<Infobox title="Preferenze">
						<EditableRow label="Ricordami al login" value={handleNullBoolYN(login.rememberMe)}>
							<CheckboxField label="Ricordami al login" {...register('rememberMe')} />
						</EditableRow>
						<EditableRow label="Onboarding completato" value={handleNullBoolYN(login.onboardingDone)}>
							<CheckboxField label="Onboarding completato" {...register('onboardingDone')} />
						</EditableRow>
						<EditableRow label="Passo onboarding" value={handleNull(login.onboardingStep)}>
							<TextField
								label="Passo onboarding"
								maxLength={MAX_ONBOARDING_STEP}
								error={errors.onboardingStep?.message}
								{...register('onboardingStep')}
							/>
						</EditableRow>
					</Infobox>

					<Infobox title="Password">
						<InfoRow label="Richiesta di reset" value={handleNullDate(resetPwd?.resetDateReq)} />
						<InfoRow label="Hash di recupero" value={handleNullHash(resetPwd?.resetHash)} />
					</Infobox>
				</div>
			</section>
		</div>
	)
}

/**
 * The imprenditore detail page's anagrafica, address, account, preferences and password blocks.
 *
 * ⚠️ Every row here is a field the resolver actually returns. There is no `account` sub-document on
 * the `imprenditore` collection — `account.email.valid`, `account.newsletter`, `account.rememberMe`,
 * `requestTimes`, `newEmailTmp` and `s2FA` do not exist anywhere on the platform, however plausible
 * they sound. A label with a permanently empty cell beside it reads as missing data rather than as a
 * missing field, so do not add one before the resolver can answer it.
 */
export const AnagraficaImprenditore = ({ idImprenditore, registra }: { idImprenditore: string; registra: RegistraSezione }) => {
	const [result] = useQuery({
		query: ImprenditoreByIdDocument,
		variables: { idImprenditore },
		context: CTX_ADMIN_RESOURCE
	})

	if (result.fetching) return <Spinner label="Caricamento imprenditore" />
	if (result.error !== undefined) return <Alert tone="error">{messageOf(result.error)}</Alert>

	const imprenditore = result.data?.imprenditoreById

	if (imprenditore == null) return <Alert tone="error">Imprenditore non trovato.</Alert>

	return <FormAnagrafica imprenditore={imprenditore} registra={registra} />
}
