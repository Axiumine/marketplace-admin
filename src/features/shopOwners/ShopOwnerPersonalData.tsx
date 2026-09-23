import type { ShopOwnerByIdQuery } from '@gql/adminResource/graphql'
import { zodResolver } from '@hookform/resolvers/zod'
import type { OperationContext } from '@urql/core'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useMutation, useQuery } from 'urql'
import { z } from 'zod'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import {
	ShopOwnerUpdateDocument,
	ShopOwnerUpdateEmailDocument,
	ShopOwnerUpdateNoteDocument,
	ShopOwnerUpdatePreferencesDocument,
	ShopOwnerUpdateStatusDocument
} from '@/api/operations/adminResource/mutations'
import { ShopOwnerByIdDocument } from '@/api/operations/adminResource/queries'
import { AddressField } from '@/components/ui/AddressField'
import { AddressMap } from '@/components/ui/AddressMap'
import { Alert } from '@/components/ui/Alert'
import { CheckboxField } from '@/components/ui/CheckboxField'
import { EditableRow } from '@/components/ui/EditableRow'
import { Infobox, InfoRow } from '@/components/ui/Infobox'
import { Spinner } from '@/components/ui/Spinner'
import { TextareaField } from '@/components/ui/TextareaField'
import { TextField } from '@/components/ui/TextField'
import { Toast } from '@/components/ui/Toast'
import { ToastValidation } from '@/components/ui/ToastValidation'
import { addressError, composedAddress, mapPoint } from '@/lib/address'
import { writeAddress } from '@/lib/addressForm'
import { emptyInNull, formatAddress, formatDate, handleNull, handleNullBoolYN, handleNullDate, toDateInput } from '@/lib/format'
import { isAdult, maxBirthDate, MIN_AGE } from '@/lib/isAdult'
import type { FoundAddress } from '@/lib/nominatim'

import type { RegisterSection } from '../saving'
import { saveValidated, useSavableSection } from '../saving'

/**
 * The account-status colour, as a class name rather than an inline style string.
 *
 * Order matters: deleted wins over disabled, and the yellow is the *remaining* flagged case — an
 * account still waiting on manual approval. The approved-and-active account falls off the end with no
 * tint at all, which is the honest rendering of "nothing is wrong". Reaching the yellow through a bare
 * `else` would paint every healthy account "pending", so the last branch is a real test, not a
 * default.
 *
 * ⚠️ `deleted` is a **timestamp**, not a flag — `IShopOwnerSchema.deleted?: Date`, exposed as
 * `DateTime`. Its presence is the soft delete, so it is tested with `!= null`. Comparing it against
 * `true`, or rendering it through `handleNullBoolYN`, is false for every value the field can hold: a
 * deleted account then reads "Deleted: No" and never gets its grey.
 */
export const accountStatusClass = (shopOwner: {
	deleted?: string | null
	disabled?: boolean | null
	waitApprov?: boolean | null
}): string => {
	if (shopOwner.deleted != null) return 'account-deleted'
	if (shopOwner.disabled === true) return 'account-disabled'
	if (shopOwner.waitApprov === true) return 'account-wait-approv'
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
const MAX_FIRST_NAME = 100
const MAX_LAST_NAME = 100
const MAX_ADDRESS = 250
const MAX_CITY = 100
const MAX_PHONE = 12
const MAX_EMAIL = 250
const MAX_ONBOARDING_STEP = 4
const MAX_NOTE = 2000

/**
 * The suspension reason's cap, the service's own (ADR-044).
 *
 * ⚠️ **The collection does not carry this bound and never will.** `disabledReason` is randomly encrypted,
 * so `$jsonSchema` sees `binData` and cannot measure a string it is not allowed to read — the service's
 * check is the only one there is, and the count under the box is the only warning before it answers 400.
 */
const MAX_DISABLED_REASON = 1000

/**
 * What the form says when a suspension carries no reason.
 *
 * Shared by the two schemas below, which need the same sentence for the same rule: `dependencies:
 * { disabled: ['disabledReason'] }` on the collection refuses the flag without one, so this is not a
 * house style but the write the admin is about to attempt.
 */
const REASON_REQUIRED = 'Say why this account is suspended — the reason is stored with the suspension'

/**
 * The reason as a field: free text, capped, and blank on every account nobody suspended.
 *
 * Blank is a value here rather than a missing one — it is what an untouched box reads back as, and what
 * `emptyInNull` turns into the `null` that tells the service there is no reason to store. The rule that
 * makes it mandatory is not here but on the object, because it can only be read beside `disabled`.
 */
const disabledReasonField = () =>
	z.string().trim().max(MAX_DISABLED_REASON, `The reason cannot exceed ${MAX_DISABLED_REASON} characters`)

/**
 * The reason is required exactly when the flag is raised, on both schemas.
 *
 * ⚠️ **Not a mirror of a server rule, but of a collection rule.** ADR-044 put
 * `dependencies: { disabled: ['disabledReason'] }` on `shopOwner`, so a suspension without a reason is
 * not a suspension with a blank note: it is a write MongoDB refuses, surfacing to the admin as an
 * error about a validator. The service checks the same thing first and answers 400.
 *
 * ⚠️ Safe to apply to the whole form even though `handleSubmit` validates every field: the migration
 * that added the path refuses to run while any suspended document lacks a reason, so a legacy record
 * that would fail this rule while the admin edits a phone number cannot reach the page.
 */
const requireReasonWhenDisabled = <T extends { disabled: boolean; disabledReason: string }>(values: T) =>
	!values.disabled || values.disabledReason !== ''

const required = (label: string, max: number) =>
	z.string().trim().min(1, `${label} is required`).max(max, `${label} cannot exceed ${max} characters`)

/**
 * One half of the GeoJSON pair, as the form holds it: a string, and an *empty* one for every
 * shopOwner stored before the point existed.
 *
 * That is the whole difference from the shop's `coordinate`, whose field is required on its
 * collection and therefore never blank. Here the migration added `position` as optional and nothing
 * backfilled it, so a legacy address seeds both boxes empty and has to stay saveable — the admin may
 * be editing a phone number on a record whose coordinates nobody ever picked.
 *
 * The two rules stay separate for the same reason they are separate there: "12,5" and "1200" are
 * different mistakes. Neither can be reached by typing, since only a geocoder pick writes these fields,
 * but a pick is not the only way a value gets here — the server's own answer seeds them too.
 */
const optionalCoordinates = (label: string, limit: number) =>
	z
		.string()
		.trim()
		// No blank test, unlike the required rule in `lib/fields.ts`: blank has to pass here, and it does on
		// its own. `Number('')` is `0`, which is finite and inside every bound — the very accident that rule
		// has to guard against is what makes this one work. Spelling the case out changed no answer and left
		// a mutant nothing could kill.
		.refine((value) => Number.isFinite(Number(value)), `${label} is not a number`)
		.refine((value) => Math.abs(Number(value)) <= limit, `${label} is outside -${limit}..${limit}`)

/**
 * Everything the detail page can write about one shopOwner, flat.
 *
 * Flat and not shaped like the four mutations it feeds: the grouping lives in `GROUPS` below, where it
 * is a list of field names, and nesting the form state to match would give every `register()` a dotted
 * path for no gain. The booleans are here too — they cannot fail validation, but leaving them out of the
 * schema would leave them out of the resolver's inferred type as well.
 */
export const shopOwnerDetailSchema = z
	.object({
		emailLogin: z
			.email('Enter a valid login email address')
			.max(MAX_EMAIL, `The login email cannot exceed ${MAX_EMAIL} characters`),
		firstName: required('First name', MAX_FIRST_NAME),
		lastName: required('Last name', MAX_LAST_NAME),
		// Against the clock at validation time, not a constant captured at import: a panel left open
		// overnight would otherwise keep yesterday's boundary and reject a date the calendar allows.
		birthDate: z.iso
			.date('Enter a valid date of birth')
			.refine((data) => isAdult(data, new Date()), `The shop owner must be of age (at least ${MIN_AGE})`),
		/**
		 * The whole address on one line — the only part of it with a box of its own, exactly as on a
		 * shop. Unvalidated by itself, because it is text the admin may be halfway through typing, and
		 * checked instead by the composite rule at the bottom.
		 */
		addressComplete: z.string(),
		street: required('Address', MAX_ADDRESS),
		postalCode: z.string().regex(/^\d{5}$/, 'The postal code must be 5 digits'),
		city: required('City', MAX_CITY),
		// Upper-cased by the schema rather than on the way to the wire, so the value the form keeps is the
		// value the collection stores. Uppercasing in the payload alone would leave "mi" in the box after a
		// save that wrote "MA" — a row disagreeing with the server it just answered to.
		province: z
			.string()
			.trim()
			.regex(/^[A-Za-z]{2}$/, 'The province is the 2-letter code')
			.transform((value) => value.toUpperCase()),
		longitude: optionalCoordinates('Longitude', 180),
		latitude: optionalCoordinates('Latitude', 90),
		mobile: required('Mobile', MAX_PHONE),
		landline: z.string().trim().max(MAX_PHONE, `The landline cannot exceed ${MAX_PHONE} characters`),
		contactEmail: z
			.email('Enter a valid contact email address')
			.max(MAX_EMAIL, `The contact email cannot exceed ${MAX_EMAIL} characters`),
		disabled: z.boolean(),
		disabledReason: disabledReasonField(),
		waitApprov: z.boolean(),
		rememberMe: z.boolean(),
		onboardingDone: z.boolean(),
		onboardingStep: z
			.string()
			.trim()
			.max(MAX_ONBOARDING_STEP, `The onboarding step cannot exceed ${MAX_ONBOARDING_STEP} characters`),
		// Blank is a value here and not a missing one: the empty string is what `shopOwnerUpdateNote`
		// reads as "remove the note", so it needs no `min` and gets none.
		notes: z.string().trim().max(MAX_NOTE, `The notes cannot exceed ${MAX_NOTE} characters`)
	})
	/*
	 * The box the admin types into is not what gets stored: the four fields above it are, together with
	 * the coordinates, and all six are written only by picking one of the geocoder's answers. A typed
	 * address that was never picked would otherwise save the *previous* street under new-looking text.
	 *
	 * Same rule as the shop's, and the same reason it has to exist — with one difference behind
	 * it: an shopOwner's coordinates may legitimately be missing, so this is what guarantees that when
	 * the address *does* change, a point comes with it.
	 */
	.refine((values) => values.addressComplete === formatAddress(values), {
		message: 'Select the address from the list',
		path: ['addressComplete']
	})
	.refine(requireReasonWhenDisabled, { message: REASON_REQUIRED, path: ['disabledReason'] })

type DetailValues = z.infer<typeof shopOwnerDetailSchema>

/**
 * Which fields belong to which mutation.
 *
 * The page sends only the groups the admin actually touched. That is not an optimisation:
 * `shopOwnerUpdate` answers **500** when its `$set` matched the document and modified nothing, so
 * re-sending an untouched personalData alongside a changed email would fail the save and roll nothing
 * back — the email would already be written.
 */
const FIELDS_PERSONAL_DATA = [
	'firstName',
	'lastName',
	'birthDate',
	'addressComplete',
	'street',
	'postalCode',
	'city',
	'province',
	'latitude',
	'longitude',
	'mobile',
	'landline',
	'contactEmail'
] as const
/*
 * ⚠️ `disabledReason` belongs to the status group and not to a group of its own: it is written by
 * `shopOwnerUpdateStatus` beside the flag, so editing the reason of a standing suspension has to send the
 * flag with it — the mutation `$set`s the pair or `$unset`s the pair, and there is no third shape.
 */
const FIELDS_STATUS = ['disabled', 'disabledReason', 'waitApprov'] as const
const FIELDS_PREFERENCES = ['rememberMe', 'onboardingDone', 'onboardingStep'] as const

/**
 * Invalidates the detail query after a write.
 *
 * All four mutations answer a bare `Boolean`, and the document cache invalidates by the `__typename`s a
 * *response* mentions — a boolean mentions none. Without this the page would keep rendering the values
 * it had before the save, which for a one-way editable row means the read-only half of the row
 * contradicts what was just written.
 */
const CTX_SAVE_SHOP_OWNER: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLShopOwnerById']
})

/**
 * The GeoJSON point the personalData mutation carries, or `null` when there is none to carry.
 *
 * The pair is either both blank — an shopOwner whose address predates the field — or both written by
 * a pick, because nothing else writes them. Testing one half is therefore enough, and testing the
 * longitude is the deliberate half: it is `coordinates[0]`, so a swapped pair shows up as a point in the
 * sea rather than as a missing one.
 */
const positionToSave = (values: DetailValues): { coordinates: number[] } | null =>
	values.longitude === '' ? null : { coordinates: [Number(values.longitude), Number(values.latitude)] }

type ShopOwner = ShopOwnerByIdQuery['shopOwnerById']

/**
 * The same account, once its `personalData` is known to be there.
 *
 * ⚠️ The block is nullable on the wire and on the collection: a seller who signed themselves up through
 * `shopOwnerRegister` has a login and nothing else until onboarding runs. This alias is what lets the
 * form below go on reading `shopOwner.personalData.firstName` without a `?.` on every line — the null
 * case never reaches it, because `ShopOwnerPersonalData` sends it to `FormAccountPending` instead.
 */
type ShopOwnerOnboarded = ShopOwner & { personalData: NonNullable<ShopOwner['personalData']> }

/**
 * The server's answer, as form state.
 *
 * Every optional field becomes `''` and every nullable boolean becomes `false`, because that is what an
 * empty text box and an unticked box read back as — seeded with `null` they would come back dirty on
 * the first render and be written on a save the admin meant for another field.
 */
const valuesInitial = (shopOwner: ShopOwnerOnboarded): DetailValues => ({
	emailLogin: shopOwner.login.email,
	firstName: shopOwner.personalData.firstName,
	lastName: shopOwner.personalData.lastName,
	birthDate: toDateInput(shopOwner.personalData.birth.date),
	addressComplete: composedAddress(shopOwner.personalData.address),
	street: shopOwner.personalData.address.street,
	postalCode: shopOwner.personalData.address.postalCode,
	city: shopOwner.personalData.address.city,
	province: shopOwner.personalData.address.province,
	// `''` for the two of them when there is no point — which is the normal state of every shopOwner
	// created before the field existed, not an error. `?? ''` and not a cast: a pair of the wrong length
	// is the one broken shape `[Float!]!` can carry, and `String(undefined)` would seed the box with the
	// word "undefined".
	longitude: String(shopOwner.personalData.address.position?.coordinates[0] ?? ''),
	latitude: String(shopOwner.personalData.address.position?.coordinates[1] ?? ''),
	mobile: shopOwner.personalData.contacts.mobile,
	landline: shopOwner.personalData.contacts.landline ?? '',
	contactEmail: shopOwner.personalData.contacts.email,
	disabled: shopOwner.disabled === true,
	disabledReason: shopOwner.disabledReason ?? '',
	waitApprov: shopOwner.waitApprov === true,
	rememberMe: shopOwner.login.rememberMe === true,
	onboardingDone: shopOwner.login.onboardingDone === true,
	onboardingStep: shopOwner.login.onboardingStep ?? '',
	notes: shopOwner.notes ?? ''
})

/**
 * The personalData block, once the data is in.
 *
 * Its own component because `useForm` takes its `defaultValues` once, on mount: rendering the form
 * beside the `fetching` branch would seed every field with `undefined` and then never look again, so
 * every box would be empty and every field dirty.
 */
const FormPersonalData = ({
	shopOwner,
	registerSection
}: {
	shopOwner: ShopOwnerOnboarded
	registerSection: RegisterSection
}) => {
	const [error, setError] = useState<string | undefined>(undefined)

	// Whether the address editor is open, which is what tells the card to stop drawing its own map — the
	// editor brings one that follows what is being typed, and two maps of two different places, stacked,
	// is worse than either.
	const [addressInChange, setAddressInChange] = useState(false)

	const [, runPersonalData] = useMutation(ShopOwnerUpdateDocument)
	const [, runEmail] = useMutation(ShopOwnerUpdateEmailDocument)
	const [, runStatus] = useMutation(ShopOwnerUpdateStatusDocument)
	const [, runPreferences] = useMutation(ShopOwnerUpdatePreferencesDocument)
	const [, runNote] = useMutation(ShopOwnerUpdateNoteDocument)

	const {
		register,
		control,
		handleSubmit,
		setValue,
		trigger,
		reset,
		resetField,
		formState: { errors, dirtyFields, isDirty }
	} = useForm<DetailValues>({
		resolver: zodResolver(shopOwnerDetailSchema),
		defaultValues: valuesInitial(shopOwner)
	})

	// Watched for its length alone: the box is uncontrolled, so the count under it has nowhere else to
	// come from, and it has to be right from the first render rather than from the first keystroke.
	const note = useWatch({ control, name: 'notes' })
	const reason = useWatch({ control, name: 'disabledReason' })

	const dirty = (fields: readonly (keyof DetailValues)[]) => fields.some((field) => dirtyFields[field] === true)

	/**
	 * The address the card draws when the editor is closed. `null` for every shopOwner stored before
	 * the point existed — there is nothing to draw, and the box says so instead.
	 */
	const position = mapPoint(shopOwner.personalData.address.position?.coordinates)

	/** A pick writes all seven boxes and revalidates them — see `writeAddress`, shared with both cards. */
	const applyAddress = (found: FoundAddress) => writeAddress(found, setValue, trigger)

	/**
	 * Turns a refusal into a message and stops the save.
	 *
	 * A mutation can fail two ways: with a `CombinedError`, which carries the backend's own description,
	 * or by answering `false` with no error at all — which no resolver here does, but a `Boolean!` says it
	 * could, and a save that quietly reports success would be worse than a generic line.
	 */
	const failed = (error: Parameters<typeof messageOf>[0]) => {
		setError(error === undefined ? 'Save failed.' : messageOf(error))
		return false
	}

	/**
	 * The five writes, once the form has validated.
	 *
	 * `values` is the resolver's output and not what is in the boxes: the schema's `trim` and its
	 * upper-casing are transforms, so this is where " Mark " and "mi" have already become "Mark" and
	 * "MA". Sending the raw form state would write them past a validator that had just approved the
	 * cleaned-up pair.
	 */
	/**
	 * Marks one group's fields clean without touching any other group's value or dirty state.
	 *
	 * ⚠️ Not `reset(values)` on a group-by-group basis: `reset` replaces every field's baseline at once,
	 * so calling it here for the group that just succeeded would also quietly clean up a group that has
	 * not been sent yet (or that just failed) in the same `write()` — clearing a dirty flag `write` never
	 * asked the server about. `resetField` moves only the named fields' baseline to the value that was
	 * just written, which is what makes each group's success independent of the others'.
	 */
	const settle = (values: DetailValues, fields: readonly (keyof DetailValues)[]) => {
		fields.forEach((field) => {
			resetField(field, { keepDirty: false, defaultValue: values[field] })
		})
	}

	const write = async (values: DetailValues): Promise<boolean> => {
		if (dirty(FIELDS_PERSONAL_DATA)) {
			const result = await runPersonalData(
				{
					_id: shopOwner._id,
					personalData: {
						firstName: values.firstName,
						lastName: values.lastName,
						birth: { date: values.birthDate },
						address: {
							street: values.street,
							postalCode: values.postalCode,
							city: values.city,
							province: values.province,
							// ⚠️ Sent on every personalData save, not only when the address changed: the mutation
							// `$set`s the whole sub-document, so omitting the point erases the one the record
							// already had. `null` is the honest value for a record that never had one — the
							// resolver leaves the key out entirely rather than writing it.
							position: positionToSave(values)
						},
						contacts: {
							mobile: values.mobile,
							landline: emptyInNull(values.landline),
							email: values.contactEmail
						}
					}
				},
				CTX_SAVE_SHOP_OWNER
			)

			if (result.data?.shopOwnerUpdate !== true) return failed(result.error)

			// ⚠️ Settled the moment this write is confirmed, not at the bottom of `write`. A later group
			// (the email, the status, the preferences, the note) can still refuse — and `shopOwnerUpdate`
			// answers 500 on a `$set` that matches the document and modifies nothing, which is exactly the
			// byte-identical retry an unsettled dirty flag would send on the next Save.
			settle(values, FIELDS_PERSONAL_DATA)
		}

		if (dirtyFields.emailLogin === true) {
			const result = await runEmail({ _id: shopOwner._id, email: values.emailLogin }, CTX_SAVE_SHOP_OWNER)

			if (result.data?.shopOwnerUpdateEmail !== true) return failed(result.error)

			settle(values, ['emailLogin'])
		}

		if (dirty(FIELDS_STATUS)) {
			const result = await runStatus(
				{
					_id: shopOwner._id,
					disabled: values.disabled,
					waitApprov: values.waitApprov,
					// The reason travels only with a raised flag. Lifting a suspension `$unset`s it at the
					// service, so what goes with `disabled: false` is `null` and not whatever the box still
					// holds — and `null` rather than an omitted variable, which would read as "leave it as it
					// was". The schema guarantees the string is non-empty whenever the flag is true, so there
					// is nothing here for `emptyInNull` to do.
					disabledReason: values.disabled ? values.disabledReason : null
				},
				CTX_SAVE_SHOP_OWNER
			)

			if (result.data?.shopOwnerUpdateStatus !== true) return failed(result.error)

			settle(values, FIELDS_STATUS)
		}

		if (dirty(FIELDS_PREFERENCES)) {
			const result = await runPreferences(
				{
					_id: shopOwner._id,
					rememberMe: values.rememberMe,
					onboardingDone: values.onboardingDone,
					onboardingStep: emptyInNull(values.onboardingStep)
				},
				CTX_SAVE_SHOP_OWNER
			)

			if (result.data?.shopOwnerUpdatePreferences !== true) return failed(result.error)

			settle(values, FIELDS_PREFERENCES)
		}

		// `values.notes` and not `emptyInNull`: this mutation takes `String!`, and the empty string is the
		// instruction that removes the note. There is nothing to send `null` as.
		if (dirtyFields.notes === true) {
			const result = await runNote({ _id: shopOwner._id, notes: values.notes }, CTX_SAVE_SHOP_OWNER)

			if (result.data?.shopOwnerUpdateNote !== true) return failed(result.error)

			settle(values, ['notes'])
		}

		// The written values become the new baseline, so nothing is dirty any more and the Save button
		// goes back to disabled. Re-seeding from the refetched query instead would race it.
		reset(values)
		setError(undefined)

		return true
	}

	const save = async (): Promise<boolean> => {
		// An untouched block is not merely nothing to send — it must not be *validated* either. These forms
		// are seeded from whatever the collection already holds, and a legacy document the current rules would
		// reject (a three-letter province, a landline of thirteen digits) would otherwise fail the page's
		// save while the admin was editing a different block entirely.
		if (!isDirty) return true

		return await saveValidated(handleSubmit, write)
	}

	useSavableSection(shopOwner._id, registerSection, isDirty, save)

	const { personalData, login, resetPwd } = shopOwner

	return (
		<div className="flex flex-col gap-6">
			{error === undefined ? null : <Toast tone="error">{error}</Toast>}
			<ToastValidation errors={errors} />

			<section>
				<h2 className="mb-2 text-lg font-bold">PersonalData</h2>
				{/* Three cards, one line: the shopOwner, where they are, and what the admin wrote about
				    them. The note lived under Account until it turned out to be read beside the address rather
				    than beside the login flags. */}
				<div className="grid gap-4 md:grid-cols-3">
					<Infobox title="ShopOwner">
						{/* `login.email` is the credential and carries the collection's only unique index;
						    `contacts.email` is where the shop is written to. They are usually the same
						    address, and the two labels are what stops one being edited for the other. */}
						<EditableRow label="Login email" value={login.email}>
							<TextField
								label="Login email"
								type="email"
								maxLength={MAX_EMAIL}
								error={errors.emailLogin?.message}
								{...register('emailLogin')}
							/>
						</EditableRow>
						<EditableRow label="First name" value={personalData.firstName}>
							<TextField
								label="First name"
								maxLength={MAX_FIRST_NAME}
								error={errors.firstName?.message}
								{...register('firstName')}
							/>
						</EditableRow>
						<EditableRow label="Last name" value={personalData.lastName}>
							<TextField
								label="Last name"
								maxLength={MAX_LAST_NAME}
								error={errors.lastName?.message}
								{...register('lastName')}
							/>
						</EditableRow>
						{/* `max` greys out the disallowed half of the picker. It is a hint, not the check: a
						    typed or pasted date reaches zod regardless, which is where the rule lives. */}
						<EditableRow label="Born on" value={formatDate(personalData.birth.date)}>
							<TextField
								label="Born on"
								type="date"
								max={maxBirthDate(new Date())}
								error={errors.birthDate?.message}
								{...register('birthDate')}
							/>
						</EditableRow>
						<EditableRow label="Mobile" value={personalData.contacts.mobile}>
							<TextField
								label="Mobile"
								type="tel"
								maxLength={MAX_PHONE}
								error={errors.mobile?.message}
								{...register('mobile')}
							/>
						</EditableRow>
						<EditableRow label="Landline" value={handleNull(personalData.contacts.landline)}>
							<TextField
								label="Landline"
								type="tel"
								maxLength={MAX_PHONE}
								error={errors.landline?.message}
								{...register('landline')}
							/>
						</EditableRow>
						<EditableRow label="Contact email" value={personalData.contacts.email}>
							<TextField
								label="Contact email"
								type="email"
								maxLength={MAX_EMAIL}
								error={errors.contactEmail?.message}
								{...register('contactEmail')}
							/>
						</EditableRow>
					</Infobox>

					{/* One column of the three, beside the shopOwner's card rather than under it. The map
					    inside is drawn from the card's width, so it simply gets narrower. */}
					<Infobox title="Address">
						<EditableRow
							label="Address"
							value={formatAddress(personalData.address)}
							onOpen={() => {
								setAddressInChange(true)
							}}
						>
							{/*
							 * One box for the whole address, and the four fields it fills are not on screen at
							 * all — the same component the new-shopOwner form and the shop use.
							 *
							 * Its map opens on the shopOwner's own address when there is one, and on the middle
							 * of the country when there is not; `initialCenter` takes the `null` for exactly that.
							 *
							 * `Controller` and not `register` + `useWatch`: the box is a controlled component, and
							 * `register` would also hand the form the input's DOM node to write `ref.value` onto
							 * behind React's back — the same value arriving twice by two different routes. See
							 * the company card, which carries the long version of this note.
							 */}
							<Controller
								control={control}
								name="addressComplete"
								render={({ field }) => (
									<AddressField
										label="Address"
										value={field.value}
										error={addressError(errors)}
										initialCenter={position}
										onSelect={applyAddress}
										name={field.name}
										onChange={field.onChange}
										onBlur={field.onBlur}
									/>
								)}
							/>
						</EditableRow>

						{/* The map, while the editor is closed. Two things can put it away: an open editor, which
						    brings a map of its own, and an address that has no point behind it — the normal state
						    of every shopOwner registered before the coordinates existed, which is a sentence
						    rather than a blank space so it does not read as a failed render. */}
						{addressInChange ? null : (
							<div className="flex flex-col gap-2 pt-2">
								{position === null ? (
									<p className="text-sm text-tip">
										Position unavailable: change the address and pick it from the list to add one.
									</p>
								) : (
									<AddressMap
										lat={position.lat}
										lon={position.lon}
										title={`Map of ${personalData.firstName} ${personalData.lastName}`}
									/>
								)}
							</div>
						)}
					</Infobox>

					{/*
					 * The admin's own note about the shopOwner — not something the shopOwner wrote or can
					 * read. Third card of the first line, beside the address rather than down in Account: it is read
					 * together with who the person is and where they are, not with the login flags.
					 */}
					<Infobox title="Notes">
						{/* `whitespace-pre-line`, because a note is written in lines and the read-only half would
						    otherwise run them all together into one paragraph. */}
						<EditableRow label="Notes" value={<span className="whitespace-pre-line">{handleNull(shopOwner.notes)}</span>}>
							<TextareaField
								label="Notes"
								maxLength={MAX_NOTE}
								remaining={MAX_NOTE - note.length}
								error={errors.notes?.message}
								{...register('notes')}
							/>
						</EditableRow>
					</Infobox>
				</div>
			</section>

			<section>
				<h2 className="mb-2 text-lg font-bold">Account</h2>
				<div className="grid gap-4 md:grid-cols-3">
					<Infobox title="Account status" className={accountStatusClass(shopOwner)}>
						<EditableRow label="Disabled" value={handleNullBoolYN(shopOwner.disabled)}>
							<CheckboxField label="Disabled" {...register('disabled')} />
						</EditableRow>
						{/* ⚠️ **The one screen on the platform where the reason is legible.** `disabledReason` is
						    randomly encrypted (ADR-044), so the ShopOwner-tier services hold ciphertext they have
						    no data key for — this tier decrypts it because it is the tier it was written for.
						    `whitespace-pre-line` for the same reason as the note: an admin's paragraphs would
						    otherwise run together into one. */}
						<EditableRow
							label="Suspension reason"
							value={<span className="whitespace-pre-line">{handleNull(shopOwner.disabledReason)}</span>}
						>
							<TextareaField
								label="Suspension reason"
								maxLength={MAX_DISABLED_REASON}
								remaining={MAX_DISABLED_REASON - reason.length}
								error={errors.disabledReason?.message}
								{...register('disabledReason')}
							/>
						</EditableRow>
						{/* Who raised it, and no pen: an attribution the platform writes from the session, never
						    an admin. It is the admin's `_id` and not a name — nothing joins it to a document,
						    which is what ADR-002 leaves it as. */}
						<InfoRow label="Suspended by" value={handleNull(shopOwner.disabledBy)} />
						{/* The four timestamps below are the account's audit trail — written by the platform,
						    never by an admin — so they have no pen. */}
						<InfoRow label="Deleted on" value={handleNullDate(shopOwner.deleted)} />
						<EditableRow label="Awaiting approval" value={handleNullBoolYN(shopOwner.waitApprov)}>
							<CheckboxField label="Awaiting approval" {...register('waitApprov')} />
						</EditableRow>
						<InfoRow label="Registered" value={handleNullDate(shopOwner.registeredAt)} />
						<InfoRow label="First login" value={handleNullDate(login.firstLogin)} />
						<InfoRow label="Last login" value={handleNullDate(login.lastLogin)} />
					</Infobox>

					<Infobox title="Preferences">
						<EditableRow label="Remember me at login" value={handleNullBoolYN(login.rememberMe)}>
							<CheckboxField label="Remember me at login" {...register('rememberMe')} />
						</EditableRow>
						<EditableRow label="Onboarding complete" value={handleNullBoolYN(login.onboardingDone)}>
							<CheckboxField label="Onboarding complete" {...register('onboardingDone')} />
						</EditableRow>
						<EditableRow label="Onboarding step" value={handleNull(login.onboardingStep)}>
							<TextField
								label="Onboarding step"
								maxLength={MAX_ONBOARDING_STEP}
								error={errors.onboardingStep?.message}
								{...register('onboardingStep')}
							/>
						</EditableRow>
					</Infobox>

					<Infobox title="Password">
						<InfoRow label="Reset request" value={handleNullDate(resetPwd?.resetDateReq)} />
					</Infobox>
				</div>
			</section>
		</div>
	)
}

/**
 * Everything the page can write about an account that has not been through onboarding.
 *
 * The identity half of `shopOwnerDetailSchema` is not merely omitted from the form below, it is omitted
 * from the rules: `handleSubmit` validates the *whole* schema, so an empty `firstName` under the
 * required rule would refuse the save — and the save an admin presses on this page is the approval.
 * Sharing one schema would make the one action this screen exists for the one action it cannot perform.
 */
export const shopOwnerPendingSchema = z
	.object({
		emailLogin: z
			.email('Enter a valid login email address')
			.max(MAX_EMAIL, `The login email cannot exceed ${MAX_EMAIL} characters`),
		disabled: z.boolean(),
		disabledReason: disabledReasonField(),
		waitApprov: z.boolean(),
		rememberMe: z.boolean(),
		onboardingDone: z.boolean(),
		onboardingStep: z
			.string()
			.trim()
			.max(MAX_ONBOARDING_STEP, `The onboarding step cannot exceed ${MAX_ONBOARDING_STEP} characters`),
		notes: z.string().trim().max(MAX_NOTE, `The notes cannot exceed ${MAX_NOTE} characters`)
	})
	// The same rule as on the complete account, because it is the same collection and the same mutation.
	// A seller who has not onboarded can still be suspended — that is most of what this screen does.
	.refine(requireReasonWhenDisabled, { message: REASON_REQUIRED, path: ['disabledReason'] })

type PendingValues = z.infer<typeof shopOwnerPendingSchema>

const FIELDS_PENDING_PREFERENCES = ['rememberMe', 'onboardingDone', 'onboardingStep'] as const

/**
 * The detail page for a seller who registered themselves and has not onboarded yet.
 *
 * What is on screen is what exists: a login address, the dates, the flags and the admin's note. There
 * is no name, no date of birth, no address and no contacts — not because they are hidden, but because
 * `shopOwnerRegister` collects an email and a password and nothing else. Drawing the empty rows anyway
 * would read as data that failed to load, and making them editable would ask an admin to type a
 * stranger's home address on their behalf, which is what onboarding is for.
 *
 * The one thing an admin does come here to do — untick "Awaiting approval" — works exactly as it does
 * on a complete account: same mutation, same context, same invalidation.
 */
export const FormAccountPending = ({
	shopOwner,
	registerSection
}: {
	shopOwner: ShopOwner
	registerSection: RegisterSection
}) => {
	const [error, setError] = useState<string | undefined>(undefined)

	const [, runEmail] = useMutation(ShopOwnerUpdateEmailDocument)
	const [, runStatus] = useMutation(ShopOwnerUpdateStatusDocument)
	const [, runPreferences] = useMutation(ShopOwnerUpdatePreferencesDocument)
	const [, runNote] = useMutation(ShopOwnerUpdateNoteDocument)

	const {
		register,
		control,
		handleSubmit,
		reset,
		resetField,
		formState: { errors, dirtyFields, isDirty }
	} = useForm<PendingValues>({
		resolver: zodResolver(shopOwnerPendingSchema),
		defaultValues: {
			emailLogin: shopOwner.login.email,
			disabled: shopOwner.disabled === true,
			disabledReason: shopOwner.disabledReason ?? '',
			waitApprov: shopOwner.waitApprov === true,
			rememberMe: shopOwner.login.rememberMe === true,
			onboardingDone: shopOwner.login.onboardingDone === true,
			onboardingStep: shopOwner.login.onboardingStep ?? '',
			notes: shopOwner.notes ?? ''
		}
	})

	const note = useWatch({ control, name: 'notes' })
	const reason = useWatch({ control, name: 'disabledReason' })

	const failed = (error: Parameters<typeof messageOf>[0]) => {
		setError(error === undefined ? 'Save failed.' : messageOf(error))
		return false
	}

	/** See the identical helper on `FormPersonalData` — same reason, same shape, a different field set. */
	const settle = (values: PendingValues, fields: readonly (keyof PendingValues)[]) => {
		fields.forEach((field) => {
			resetField(field, { keepDirty: false, defaultValue: values[field] })
		})
	}

	const write = async (values: PendingValues): Promise<boolean> => {
		if (dirtyFields.emailLogin === true) {
			const result = await runEmail({ _id: shopOwner._id, email: values.emailLogin }, CTX_SAVE_SHOP_OWNER)

			if (result.data?.shopOwnerUpdateEmail !== true) return failed(result.error)

			settle(values, ['emailLogin'])
		}

		if (FIELDS_STATUS.some((field) => dirtyFields[field] === true)) {
			const result = await runStatus(
				{
					_id: shopOwner._id,
					disabled: values.disabled,
					waitApprov: values.waitApprov,
					// The reason travels only with a raised flag. Lifting a suspension `$unset`s it at the
					// service, so what goes with `disabled: false` is `null` and not whatever the box still
					// holds — and `null` rather than an omitted variable, which would read as "leave it as it
					// was". The schema guarantees the string is non-empty whenever the flag is true, so there
					// is nothing here for `emptyInNull` to do.
					disabledReason: values.disabled ? values.disabledReason : null
				},
				CTX_SAVE_SHOP_OWNER
			)

			if (result.data?.shopOwnerUpdateStatus !== true) return failed(result.error)

			settle(values, FIELDS_STATUS)
		}

		if (FIELDS_PENDING_PREFERENCES.some((field) => dirtyFields[field] === true)) {
			const result = await runPreferences(
				{
					_id: shopOwner._id,
					rememberMe: values.rememberMe,
					onboardingDone: values.onboardingDone,
					onboardingStep: emptyInNull(values.onboardingStep)
				},
				CTX_SAVE_SHOP_OWNER
			)

			if (result.data?.shopOwnerUpdatePreferences !== true) return failed(result.error)

			settle(values, FIELDS_PENDING_PREFERENCES)
		}

		if (dirtyFields.notes === true) {
			const result = await runNote({ _id: shopOwner._id, notes: values.notes }, CTX_SAVE_SHOP_OWNER)

			if (result.data?.shopOwnerUpdateNote !== true) return failed(result.error)

			settle(values, ['notes'])
		}

		reset(values)
		setError(undefined)

		return true
	}

	const save = async (): Promise<boolean> => {
		if (!isDirty) return true

		return await saveValidated(handleSubmit, write)
	}

	useSavableSection(shopOwner._id, registerSection, isDirty, save)

	const { login, resetPwd } = shopOwner

	return (
		<div className="flex flex-col gap-6">
			{error === undefined ? null : <Toast tone="error">{error}</Toast>}
			<ToastValidation errors={errors} />

			<section>
				<h2 className="mb-2 text-lg font-bold">PersonalData</h2>
				<div className="grid gap-4 md:grid-cols-3">
					<Infobox title="ShopOwner">
						<EditableRow label="Login email" value={login.email}>
							<TextField
								label="Login email"
								type="email"
								maxLength={MAX_EMAIL}
								error={errors.emailLogin?.message}
								{...register('emailLogin')}
							/>
						</EditableRow>
						{/* Said in a sentence rather than as a column of empty rows: the fields are missing from
						    the document, not from the response, and a row reading "First name: —" would send an
						    admin looking for a bug in the query. */}
						<p className="pt-2 text-sm text-tip">
							This shop owner registered on the public site. Their name, date of birth, address and contacts arrive when they
							complete onboarding.
						</p>
					</Infobox>

					<Infobox title="Notes">
						<EditableRow label="Notes" value={<span className="whitespace-pre-line">{handleNull(shopOwner.notes)}</span>}>
							<TextareaField
								label="Notes"
								maxLength={MAX_NOTE}
								remaining={MAX_NOTE - note.length}
								error={errors.notes?.message}
								{...register('notes')}
							/>
						</EditableRow>
					</Infobox>
				</div>
			</section>

			<section>
				<h2 className="mb-2 text-lg font-bold">Account</h2>
				<div className="grid gap-4 md:grid-cols-3">
					<Infobox title="Account status" className={accountStatusClass(shopOwner)}>
						<EditableRow label="Disabled" value={handleNullBoolYN(shopOwner.disabled)}>
							<CheckboxField label="Disabled" {...register('disabled')} />
						</EditableRow>
						{/* ⚠️ **The one screen on the platform where the reason is legible.** `disabledReason` is
						    randomly encrypted (ADR-044), so the ShopOwner-tier services hold ciphertext they have
						    no data key for — this tier decrypts it because it is the tier it was written for.
						    `whitespace-pre-line` for the same reason as the note: an admin's paragraphs would
						    otherwise run together into one. */}
						<EditableRow
							label="Suspension reason"
							value={<span className="whitespace-pre-line">{handleNull(shopOwner.disabledReason)}</span>}
						>
							<TextareaField
								label="Suspension reason"
								maxLength={MAX_DISABLED_REASON}
								remaining={MAX_DISABLED_REASON - reason.length}
								error={errors.disabledReason?.message}
								{...register('disabledReason')}
							/>
						</EditableRow>
						{/* Who raised it, and no pen: an attribution the platform writes from the session, never
						    an admin. It is the admin's `_id` and not a name — nothing joins it to a document,
						    which is what ADR-002 leaves it as. */}
						<InfoRow label="Suspended by" value={handleNull(shopOwner.disabledBy)} />
						<InfoRow label="Deleted on" value={handleNullDate(shopOwner.deleted)} />
						{/* The approval itself: unticking this box and pressing Save is what lets the account
						    log in — see `checkShopOwnerApproval` in the public authorization service. */}
						<EditableRow label="Awaiting approval" value={handleNullBoolYN(shopOwner.waitApprov)}>
							<CheckboxField label="Awaiting approval" {...register('waitApprov')} />
						</EditableRow>
						<InfoRow label="Registered" value={handleNullDate(shopOwner.registeredAt)} />
						<InfoRow label="First login" value={handleNullDate(login.firstLogin)} />
						<InfoRow label="Last login" value={handleNullDate(login.lastLogin)} />
					</Infobox>

					<Infobox title="Preferences">
						<EditableRow label="Remember me at login" value={handleNullBoolYN(login.rememberMe)}>
							<CheckboxField label="Remember me at login" {...register('rememberMe')} />
						</EditableRow>
						<EditableRow label="Onboarding complete" value={handleNullBoolYN(login.onboardingDone)}>
							<CheckboxField label="Onboarding complete" {...register('onboardingDone')} />
						</EditableRow>
						<EditableRow label="Onboarding step" value={handleNull(login.onboardingStep)}>
							<TextField
								label="Onboarding step"
								maxLength={MAX_ONBOARDING_STEP}
								error={errors.onboardingStep?.message}
								{...register('onboardingStep')}
							/>
						</EditableRow>
					</Infobox>

					<Infobox title="Password">
						<InfoRow label="Reset request" value={handleNullDate(resetPwd?.resetDateReq)} />
					</Infobox>
				</div>
			</section>
		</div>
	)
}

/**
 * The shopOwner detail page's personalData, address, account, preferences and password blocks.
 *
 * ⚠️ Every row here is a field the resolver actually returns. There is no `account` sub-document on
 * the `shopOwner` collection — `account.email.valid`, `account.newsletter`, `account.rememberMe`,
 * `requestTimes`, `newEmailTmp` and `s2FA` do not exist anywhere on the platform, however plausible
 * they sound. A label with a permanently empty cell beside it reads as missing data rather than as a
 * missing field, so do not add one before the resolver can answer it.
 */
export const ShopOwnerPersonalData = ({
	idShopOwner,
	registerSection
}: {
	idShopOwner: string
	registerSection: RegisterSection
}) => {
	const [result] = useQuery({
		query: ShopOwnerByIdDocument,
		variables: { idShopOwner },
		context: CTX_ADMIN_RESOURCE
	})

	if (result.fetching) return <Spinner label="Loading shop owner" />
	if (result.error !== undefined) return <Alert tone="error">{messageOf(result.error)}</Alert>

	const shopOwner = result.data?.shopOwnerById

	if (shopOwner == null) return <Alert tone="error">Shop owner not found.</Alert>

	const { personalData } = shopOwner

	// ⚠️ The fork, and the reason `personalData` is nullable all the way from the collection to here: a
	// self-registered seller has none until onboarding, and the panel below would read every one of its
	// thirteen boxes off it. Destructured first because narrowing a property does not narrow the object
	// it came from — the spread is what carries the proof into `FormPersonalData`'s type.
	if (personalData == null) return <FormAccountPending shopOwner={shopOwner} registerSection={registerSection} />

	return <FormPersonalData shopOwner={{ ...shopOwner, personalData }} registerSection={registerSection} />
}
