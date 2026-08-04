import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { ImprenditoreAddDocument } from '@/api/operations/adminResource/mutations'
import { AddressField } from '@/components/ui/AddressField'
import { FormSubmit } from '@/components/ui/FormSubmit'
import { PasswordField } from '@/components/ui/PasswordField'
import { TextField } from '@/components/ui/TextField'
import { Toast } from '@/components/ui/Toast'
import { dataMassimaNascita, eMaggiorenne, ETA_MINIMA } from '@/lib/maggiorenne'
import type { IndirizzoTrovato } from '@/lib/nominatim'

/** Same bounds as the password-change form, and for the same reason: bcrypt truncates at 72 bytes. */
export const MIN_PWD_LENGTH = 10
export const MAX_PWD_LENGTH = 72

const required = (label: string) => z.string().trim().min(1, `${label} è obbligatorio`)

/**
 * Mirrors `GraphQLInputAnagraficaImprenditore` field for field, flattened: nesting the form state to
 * match the input shape would buy nothing and cost every `register()` a dotted path.
 *
 * `cap` and `provincia` are the two the backend's `$jsonSchema` is strict about — five digits and a
 * two-letter code — so they are checked here too, to spend a validation error instead of a round-trip.
 *
 * Exported for its own test. The age rule cannot be reached by driving the form: the date box carries
 * the same limit as a `max`, and an out-of-range date is a `rangeOverflow` that stops the submit before
 * a resolver runs. The rule still belongs here — `max` is a picker hint, and this is the gate that
 * decides what is sent — so it is asserted where it is reachable.
 */
export const imprenditoreSchema = z
	.object({
		email: z.email('Inserisci un indirizzo email valido'),
		password: z
			.string()
			.min(MIN_PWD_LENGTH, `La password deve avere almeno ${MIN_PWD_LENGTH} caratteri`)
			.max(MAX_PWD_LENGTH, `La password non può superare ${MAX_PWD_LENGTH} caratteri`),
		confermaPassword: z.string(),
		nome: required('Il nome'),
		cognome: required('Il cognome'),
		// Checked against the clock at validation time, not against a constant captured when this module
		// loaded: a panel left open overnight would otherwise keep yesterday's boundary, and the operator
		// on the other side of midnight gets a rejection the calendar in front of them contradicts.
		dataNascita: z.iso
			.date('Inserisci una data di nascita valida')
			.refine((data) => eMaggiorenne(data, new Date()), `L'imprenditore deve essere maggiorenne (almeno ${ETA_MINIMA} anni)`),
		indirizzo: required("L'indirizzo"),
		cap: z.string().regex(/^\d{5}$/, 'Il CAP deve essere di 5 cifre'),
		comune: required('Il comune'),
		provincia: z
			.string()
			.trim()
			.regex(/^[A-Za-z]{2}$/, 'La provincia è la sigla di 2 lettere'),
		cellulare: required('Il cellulare'),
		fisso: z.string().trim(),
		contattoEmail: z.email('Inserisci un indirizzo email di contatto valido')
	})
	// On the repeat, not on the password: the error belongs under the box the operator can fix by
	// retyping it. Reported on the first field it would accuse the value that is probably right.
	.refine((values) => values.password === values.confermaPassword, {
		message: 'Le due password non coincidono',
		path: ['confermaPassword']
	})

type ImprenditoreValues = z.infer<typeof imprenditoreSchema>

/**
 * Creates an imprenditore.
 *
 * ⚠️ This form is `imprenditoreAdd`'s only caller. The mutation has been on the admin-resource service
 * since v1 with nothing sending it, so its validation behaviour is proven here and nowhere else.
 *
 * The login email and the contact email are separate fields because the backend stores them in
 * separate places — `login.email` is the credential and carries the unique index, `contatti.email` is
 * where the shop is written to. They are usually the same and the form does not assume it.
 */
export const ImprenditoreAddForm = () => {
	const navigate = useNavigate()
	const [state, executeAdd] = useMutation(ImprenditoreAddDocument)

	// One `defaultValue`, and only one. Every other field is a registered, uncontrolled input, so
	// react-hook-form seeds its state from the DOM on mount — for an empty text box that is the empty
	// string, the exact value a table of twelve `''` defaults would have supplied, and the form never
	// resets (a success navigates away) so the table would have had no second reader.
	//
	// `indirizzo` is the exception because it is *controlled*: `AddressField` needs the current text to
	// geocode it, and a controlled input whose value starts as `undefined` is the uncontrolled-to-
	// controlled switch React warns about — and the value the geocoder would be handed on first render.
	const {
		register,
		handleSubmit,
		setValue,
		trigger,
		watch,
		formState: { errors }
	} = useForm<ImprenditoreValues>({ resolver: zodResolver(imprenditoreSchema), defaultValues: { indirizzo: '' } })

	/**
	 * Fills the four address fields from one OpenStreetMap answer.
	 *
	 * All four are written unconditionally, including the ones OSM left empty. A pick replaces an
	 * address, it does not merge with the previous one — keeping a CAP from a street in another town
	 * because the new match has none is how a plausible-looking wrong address is assembled.
	 *
	 * The four are then re-checked in one pass, which is what says so out loud: a match with no street
	 * number or no CAP — a bridge, a hamlet, a motorway junction — shows its error the moment it is
	 * picked instead of at submit, and a field the pick corrected stops showing a stale one. One
	 * `trigger` and not four `shouldValidate` flags: the resolver validates the whole object every time
	 * it runs, so four writes would mean four full passes to learn the same thing.
	 */
	const applicaIndirizzo = (trovato: IndirizzoTrovato) => {
		setValue('indirizzo', trovato.indirizzo)
		setValue('cap', trovato.cap)
		setValue('comune', trovato.comune)
		setValue('provincia', trovato.provincia)
		void trigger(['indirizzo', 'cap', 'comune', 'provincia'])
	}

	const onSubmit = handleSubmit(async (values) => {
		const result = await executeAdd(
			{
				login: { email: values.email, password: values.password },
				anagrafica: {
					nome: values.nome,
					cognome: values.cognome,
					nascita: { data: values.dataNascita },
					indirizzo: {
						indirizzo: values.indirizzo,
						cap: values.cap,
						comune: values.comune,
						provincia: values.provincia.toUpperCase()
					},
					contatti: {
						cellulare: values.cellulare,
						// `fisso` is the one nullable field on the input. An empty text box is "not given",
						// not "the empty string" — sending `''` would store a landline number of no digits.
						fisso: values.fisso === '' ? null : values.fisso,
						email: values.contattoEmail
					}
				}
			},
			CTX_ADMIN_RESOURCE
		)

		if (result.data?.imprenditoreAdd === true) await navigate({ to: '/p/imprenditori/gestione-imprenditori' })
	})

	return (
		/*
		 * Two columns on a wide screen, one below it — and the columns are the width the whole form used
		 * to be, so nothing inside them gets narrower; the form stops leaving half the panel empty
		 * instead.
		 *
		 * The address is the second column on its own because it is the only part with a map in it: 400 px
		 * of frame that would otherwise push the contacts a screen down, in a form that has to be read as
		 * one page. Everything typed goes on the left, the address and what it draws on the right.
		 *
		 * The switch is `xl` and not `md`: every fieldset already splits into two at `md`, and splitting
		 * the split would leave four columns of field on a 768 px screen.
		 */
		<form
			className="grid max-w-3xl gap-6 xl:max-w-[97.5rem] xl:grid-cols-2 xl:items-start"
			onSubmit={(event) => {
				void onSubmit(event)
			}}
		>
			<div className="flex flex-col gap-6">
				<fieldset className="grid gap-4 md:grid-cols-2">
					<legend className="font-bold">Credenziali di accesso</legend>
					{/* The email spans the row it shares with nothing; the two password boxes sit side by side,
					    which is the whole point of a repeat — the pair is read as one control. */}
					<div className="md:col-span-2">
						<TextField label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
					</div>
					<PasswordField
						label="Password"
						autoComplete="new-password"
						maxLength={MAX_PWD_LENGTH}
						error={errors.password?.message}
						{...register('password')}
					/>
					<PasswordField
						label="Ripeti password"
						autoComplete="new-password"
						maxLength={MAX_PWD_LENGTH}
						error={errors.confermaPassword?.message}
						{...register('confermaPassword')}
					/>
				</fieldset>

				<fieldset className="grid gap-4 md:grid-cols-2">
					<legend className="font-bold">Anagrafica</legend>
					<TextField label="Nome" error={errors.nome?.message} {...register('nome')} />
					<TextField label="Cognome" error={errors.cognome?.message} {...register('cognome')} />
					{/* `max` stops the date picker at the eighteenth birthday, so the disallowed half of the
					    calendar is greyed out rather than rejected after the fact. It is a hint and not the
					    check: a typed or pasted date reaches zod regardless, which is where the rule lives. */}
					<TextField
						label="Data di nascita"
						type="date"
						max={dataMassimaNascita(new Date())}
						error={errors.dataNascita?.message}
						{...register('dataNascita')}
					/>
				</fieldset>

				<fieldset className="grid gap-4 md:grid-cols-2">
					<legend className="font-bold">Contatti</legend>
					<TextField label="Cellulare" type="tel" error={errors.cellulare?.message} {...register('cellulare')} />
					<TextField label="Fisso" type="tel" error={errors.fisso?.message} {...register('fisso')} />
					<TextField
						label="Email di contatto"
						type="email"
						error={errors.contattoEmail?.message}
						{...register('contattoEmail')}
					/>
				</fieldset>

				{state.error === undefined ? null : <Toast tone="error">{messageOf(state.error)}</Toast>}
			</div>

			<fieldset className="grid gap-4 md:grid-cols-2">
				<legend className="font-bold">Indirizzo</legend>
				<AddressField
					label="Indirizzo"
					className="md:col-span-2"
					value={watch('indirizzo')}
					error={errors.indirizzo?.message}
					onSelect={applicaIndirizzo}
					{...register('indirizzo')}
				/>
				<TextField label="CAP" inputMode="numeric" maxLength={5} error={errors.cap?.message} {...register('cap')} />
				<TextField label="Comune" error={errors.comune?.message} {...register('comune')} />
				<TextField label="Provincia" maxLength={2} error={errors.provincia?.message} {...register('provincia')} />
			</fieldset>

			{/* Under both columns, not at the foot of one: the submit ends the whole form, and hanging it off
			    the left column would put it level with the middle of the map. */}
			<FormSubmit loading={state.fetching}>Crea imprenditore</FormSubmit>
		</form>
	)
}
