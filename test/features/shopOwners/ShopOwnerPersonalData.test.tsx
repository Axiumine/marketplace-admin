import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SEARCH_DEBOUNCE_MS } from '@/components/ui/AddressField'
import { VALIDATION_HEADER } from '@/components/ui/ToastValidation'
import { accountStatusClass } from '@/features/shopOwners/ShopOwnerPersonalData'

import type { GraphQLReplies, GraphQLStub } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import type { ResponseOsm } from '../../helpers/nominatim'
import { osmStub, resultOsm } from '../../helpers/nominatim'
import { page } from '../../helpers/page'
import { renderRoute } from '../../helpers/render'

const ID = '65f0000000000000000000f1'
const DETAIL = `/p/shopOwners/id/${ID}`

/**
 * ⚠️ The `__typename` is not decoration. urql's document cache invalidates by the typenames a *response*
 * mentions, and every write on this page answers a bare `Boolean` that mentions none — so the call sites
 * name the type by hand through `additionalTypenames`, and that only matches if the cached query result
 * carries the typename in the first place. Drop it here and the refetch assertion below can never fire.
 */
const shopOwner = {
	__typename: 'GraphQLShopOwnerById',
	_id: ID,
	registeredAt: '2026-02-01T08:05:45.000Z',
	deleted: null,
	disabled: false,
	waitApprov: false,
	login: {
		email: 'mario@rossi.it',
		firstLogin: '2026-02-02T09:00:00.000Z',
		lastLogin: '2026-03-01T18:30:00.000Z',
		// A string, not a number: `login.onboardingStep` is `GraphQLString` on the resolver and
		// `string, maxLength: 4` in the collection validator. A numeric fixture would be a shape the
		// service cannot send, and it would fail the detail form's own `z.string()` on every save.
		onboardingStep: '3',
		onboardingDone: true,
		rememberMe: false
	},
	personalData: {
		firstName: 'Mario',
		lastName: 'Rossi',
		birth: { date: '1980-06-15T00:00:00.000Z' },
		contacts: { email: 'contatto@rossi.it', landline: null, mobile: '3331234567' },
		// ⚠️ No `position`, which is the *normal* state of an shopOwner: the field was added as optional
		// by `alter-shopOwner-position` and nothing backfilled it, unlike a shop where it is
		// required. The fixture with a point is `conPosition` below, and it is the exception here.
		address: { street: 'Via Roma 1', postalCode: '20100', city: 'Milano', province: 'MI', position: null }
	},
	// The operator's own note about the account. Absent until one is written — `shopOwnerUpdateNote`
	// `$unset`s the key rather than storing an empty string.
	notes: null,
	resetPwd: null
}

/** The same shopOwner with the coordinates an address pick would have left behind. */
const conPosition = {
	personalData: {
		...shopOwner.personalData,
		address: { ...shopOwner.personalData.address, position: { type: 'Point', coordinates: [9.19, 45.4642] } }
	}
}

/**
 * An address the form refuses on every field behind the box at once.
 *
 * Not a contrived shape: the address rules arrived with this card, the collection validator is looser
 * than they are, and the coordinates were added by a migration that backfilled nothing — so a record
 * written before any of that can hold no street, a four-digit CAP, no city, a sigla that is three
 * letters and a point that is nowhere. It is the only way to get all six refusals on screen together,
 * which is what the pick then has to clear.
 */
const corrupted = {
	personalData: {
		...shopOwner.personalData,
		address: { street: '', postalCode: '2010', city: '', province: 'MIL', position: { type: 'Point', coordinates: [999, 999] } }
	}
}

const detail = (override: Record<string, unknown> = {}) => ({
	ShopOwnerById: { data: { shopOwnerById: { ...shopOwner, ...override } } },
	// No companies: this file is about the personalData card, and a list would put more regions, more pens
	// and — when its query fails — a second alert on the page these assertions look at.
	ShopOwnerCompanies: { data: { shopOwnerCompanies: [] } }
})

/** One Infobox, by the heading that names it — every card on this page is a labelled `region`. */
const box = (title: string) => within(screen.getByRole('region', { name: title }))

/**
 * The right-hand half of an `InfoRow`, found through the label on its left.
 *
 * ⚠️ `selector: 'span'`, because two cards are named after their only row — "Address" and "Notes" — so
 * the card's own `h3` carries the same text as the row label and an unrestricted lookup matches both.
 */
const rowValue = (title: string, label: string): string => {
	const row = box(title).getByText(label, { selector: 'span' }).parentElement as HTMLElement
	return row.lastElementChild?.textContent ?? ''
}

/**
 * ⚠️ `deleted` is a **timestamp**, not a flag — `IShopOwnerSchema.deleted?: Date`, exposed as
 * `DateTime`. Its presence is the soft delete, so it is tested with `!= null`. Comparing it against
 * `true`, or rendering it through `handleNullBoolYN`, is false for every value the field can hold: a
 * deleted account then reads "Eliminato: No" and never gets its grey tint. The cases below pin each
 * state to its class so that mistake cannot pass.
 */
describe('accountStatusClass', () => {
	it('is nothing at all for an approved, active account', () => {
		expect(accountStatusClass({ deleted: null, disabled: false, waitApprov: false })).toBe('')
	})

	it('marks a soft-deleted account by the presence of its timestamp', () => {
		expect(accountStatusClass({ deleted: '2026-04-01T00:00:00.000Z', disabled: false, waitApprov: false })).toBe(
			'account-deleted'
		)
	})

	// Deleted wins over disabled: an account that is both is gone, and "disabilitato" understates it.
	it('prefers deleted over disabled', () => {
		expect(accountStatusClass({ deleted: '2026-04-01T00:00:00.000Z', disabled: true, waitApprov: true })).toBe('account-deleted')
	})

	it('marks a disabled account', () => {
		expect(accountStatusClass({ deleted: null, disabled: true, waitApprov: true })).toBe('account-disabled')
	})

	it('marks an account still waiting on manual approval', () => {
		expect(accountStatusClass({ deleted: null, disabled: false, waitApprov: true })).toBe('account-wait-approv')
	})

	// The empty object is the case a bare trailing `else` gets wrong: reaching the yellow that way also
	// catches an account with nothing set, painting a perfectly active shopOwner "in attesa".
	it('treats missing fields as nothing wrong', () => {
		expect(accountStatusClass({})).toBe('')
	})
})

describe('ShopOwnerPersonalData', () => {
	it('waits before deciding the shopOwner does not exist', async () => {
		stubGraphQL({
			ShopOwnerById: { pending: true },
			ShopOwnerCompanies: { pending: true }
		})
		await renderRoute(DETAIL)

		expect(screen.getByText('Loading shop owner')).toBeInTheDocument()
		expect(screen.queryByText('Shop owner not found.')).not.toBeInTheDocument()
	})

	it('shows the personal details', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		expect(await screen.findByText('Mario')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('Rossi')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('15/06/1980')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('3331234567')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('contatto@rossi.it')).toBeInTheDocument()
	})

	// A dash says "not given"; an empty cell says "something broke". Every optional field on this page
	// goes through `handleNull` for that reason — a label with nothing beside it reads as a rendering
	// fault, and an operator cannot tell it apart from a field that failed to load.
	it('renders a missing landline as a dash, not as a gap', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('ShopOwner', 'Landline')).toBe('---')
	})

	// One line, not a row per field: the four fields behind it have no box of their own, exactly as on a
	// shop, because only a geocoder pick writes them.
	it('composes the address on one line', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Address', 'Address')).toBe('Via Roma 1, 20100 Milano (MI)')
		expect(box('Address').queryByText('Postal code')).not.toBeInTheDocument()
		expect(box('Address').queryByText('Città')).not.toBeInTheDocument()
	})

	// The marker, not the frame: an embed without one is a picture of Milan, which is true of every
	// shopOwner in the city and says nothing about this one.
	it('draws the position as a map named after the shopOwner', async () => {
		stubGraphQL(detail(conPosition))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByTitle('Map of Mario Rossi')).toHaveAttribute('src', expect.stringContaining('marker=45.46420,9.19000'))
	})

	/*
	 * ⚠️ The difference from the shop's card, and the reason it is a sentence rather than a blank
	 * space: an shopOwner registered before `position` existed has none, so this is the state most rows
	 * are in. A map centred on a fallback would be a claim about where they live; an empty gap would read
	 * as a frame that failed to load.
	 */
	it('says so instead of drawing a map for an address with no point behind it', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.queryByTitle('Map of Mario Rossi')).not.toBeInTheDocument()
		expect(
			box('Address').getByText('Position unavailable: change the address and pick it from the list to add one.')
		).toBeInTheDocument()
	})

	it('shows the account status and the login history', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Account status', 'Disabled')).toBe('No')
		expect(rowValue('Account status', 'Deleted on')).toBe('---')
		expect(rowValue('Account status', 'Registered')).toBe('1 febbraio 2026 alle ore 08:05:45')
		expect(rowValue('Account status', 'First login')).toBe('2 febbraio 2026 alle ore 09:00:00')
		expect(rowValue('Account status', 'Last login')).toBe('1 marzo 2026 alle ore 18:30:00')
	})

	it('tints the box of a deleted account', async () => {
		stubGraphQL(detail({ deleted: '2026-04-01T12:00:00.000Z' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByRole('region', { name: 'Account status' })).toHaveClass('account-deleted')
		expect(rowValue('Account status', 'Deleted on')).toBe('1 aprile 2026 alle ore 12:00:00')
	})

	it('shows the onboarding preferences', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Preferences', 'Remember me at login')).toBe('No')
		expect(rowValue('Preferences', 'Onboarding complete')).toBe('Sì')
		expect(rowValue('Preferences', 'Onboarding step')).toBe('3')
	})

	// A reset hash is secret-adjacent: enough of it to correlate with a log line, not enough to replay
	// the reset link it belongs to.
	it('truncates the recovery hash', async () => {
		stubGraphQL(
			detail({
				resetPwd: { resetDateReq: '2026-05-01T07:00:00.000Z', resetHash: 'abcdefghijklmnopqrstuvwxyz0123456789' }
			})
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Password', 'Recovery hash')).toBe('abcdefghijklmnopqrst...')
		expect(rowValue('Password', 'Reset request')).toBe('1 maggio 2026 alle ore 07:00:00')
	})

	// The note is the operator's own, and every shopOwner starts without one — a dash, so the empty card
	// reads as "nothing written here" rather than as a card that failed to render.
	it('shows the note, and a dash when there is none', async () => {
		stubGraphQL(detail({ notes: 'Chiamare prima delle 18.\nRichiamato il 3/4.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Notes', 'Notes')).toBe('Chiamare prima delle 18.\nRichiamato il 3/4.')
	})

	it('renders a missing note as a dash, not as a gap', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Notes', 'Notes')).toBe('---')
	})

	it('handles an account that never asked for a reset', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Password', 'Recovery hash')).toBe('---')
		expect(rowValue('Password', 'Reset request')).toBe('---')
	})

	it('reports a failure', async () => {
		stubGraphQL({
			ShopOwnerById: { errors: [graphQLError('Errore', 'Scheda non disponibile', 500)], status: 500 },
			ShopOwnerCompanies: { data: { shopOwnerCompanies: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByRole('alert')).toHaveTextContent('Scheda non disponibile')
	})

	// `shopOwnerById` is nullable: an `_id` that matches nothing answers `null` without an error, and
	// a blank page would leave the operator to guess whether it loaded.
	it('says so when the id matches nothing', async () => {
		stubGraphQL({
			ShopOwnerById: { data: { shopOwnerById: null } },
			ShopOwnerCompanies: { data: { shopOwnerCompanies: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByText('Shop owner not found.')).toBeInTheDocument()
	})

	// A different shape from the one above and a different branch: `null` for the field is the service
	// answering "no such shopOwner", while a `data` that is null altogether is the service answering
	// nothing at all. Both end on the same message, and neither may end on a blank page.
	it('says so when the answer carries no data at all', async () => {
		stubGraphQL({
			ShopOwnerById: {},
			ShopOwnerCompanies: { data: { shopOwnerCompanies: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByText('Shop owner not found.')).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})

/** Opens one row's editor. The pen is icon-only, so its `aria-label` is the only thing naming it. */
const open = async (label: string) => {
	await userEvent.click(screen.getByRole('button', { name: `Change ${label}` }))
}

/** `fireEvent.change`, never `userEvent.type`: every box on this form carries a `maxLength` or is a date. */
const write = (label: string, value: string) => {
	fireEvent.change(screen.getByLabelText(label), { target: { value: value } })
}

const save = () => screen.getByRole('button', { name: 'Save' })

/**
 * A refusal that is `false` with no error at all.
 *
 * No resolver here answers that way, but `Boolean!` says it could, and a save reported as successful
 * would be worse than a generic line. One case per group, because the four checks are four separate
 * branches: a copy-paste that left one of them reading another group's answer would otherwise pass.
 */
const REFUSALS: readonly (readonly [string, string, string, Record<string, boolean>])[] = [
	['First name', 'Marco', 'ShopOwnerUpdate', { shopOwnerUpdate: false }],
	['Login email', 'new@rossi.it', 'ShopOwnerUpdateEmail', { shopOwnerUpdateEmail: false }],
	['Onboarding step', '2', 'ShopOwnerUpdatePreferences', { shopOwnerUpdatePreferences: false }]
]

/** Only the writes. The two queries the page fires on mount are not what any of these tests is about. */
const writes = (stub: GraphQLStub) => stub.calls.filter((call) => call.operationName.startsWith('ShopOwnerUpdate'))

const writeNames = (stub: GraphQLStub) => writes(stub).map((call) => call.operationName)

/**
 * Every row on the detail page is editable in place, and nothing is written until the one Save button at
 * the bottom is pressed.
 *
 * ⚠️ The four mutations are fired **only for the groups the operator touched**, and that is a
 * correctness requirement rather than an optimisation: `shopOwnerUpdate` answers 500 when its `$set`
 * matched the document and modified nothing. Re-sending an untouched personalData alongside a changed
 * email would fail the save *after* the email had already been written, with nothing to roll it back.
 * The assertions below are on the exact list of operations sent, for that reason.
 */
describe('ShopOwnerPersonalData — modifica', () => {
	it('turns a row into its editor, seeded with the stored value', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('First name')

		expect(screen.getByLabelText('First name')).toHaveValue('Mario')
		expect(box('ShopOwner').queryByText('Mario')).not.toBeInTheDocument()
	})

	// `onboardingStep` is the one nullable field of the form. A null has to seed an empty box, not the
	// word "null" for the operator to delete — and not a dirty box either, or the next save writes it.
	it('seeds an empty box for an shopOwner with no onboarding step', async () => {
		stubGraphQL(detail({ login: { ...shopOwner.login, onboardingStep: null } }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Onboarding step')

		expect(screen.getByLabelText('Onboarding step')).toHaveValue('')
		expect(save()).toBeDisabled()
	})

	// The date box wants `YYYY-MM-DD` and the collection stores midnight UTC. Seeded in local time it
	// would arrive a day early west of Greenwich — and already dirty, so the next save would write it.
	it('seeds the date of birth in the form the date box accepts', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Born on')

		expect(screen.getByLabelText('Born on')).toHaveValue('1980-06-15')
		expect(save()).toBeDisabled()
	})

	it('sends the personalData alone when only the personalData changed', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('First name')
		write('First name', 'Marco')
		await userEvent.click(save())

		expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdate',
				variables: {
					_id: ID,
					personalData: {
						firstName: 'Marco',
						lastName: 'Rossi',
						birth: { date: '1980-06-15' },
						// ⚠️ `position: null` and not an absent key. The mutation `$set`s the whole personalData,
						// so the point travels on every save of it — this shopOwner has none, and `null` is
						// what says so. An omitted key here would be a save that erases a point the record had.
						address: {
							street: 'Via Roma 1',
							postalCode: '20100',
							city: 'Milano',
							province: 'MI',
							position: null
						},
						// The landline is absent on this shopOwner and stays absent: `null`, never `''`,
						// which the collection would accept as a real number of no digits.
						contacts: { mobile: '3331234567', landline: null, email: 'contatto@rossi.it' }
					}
				}
			})
		])
	})

	it('sends a cleared landline as null', async () => {
		const stub = stubGraphQL({
			...detail({
				personalData: { ...shopOwner.personalData, contacts: { ...shopOwner.personalData.contacts, landline: '021234567' } }
			}),
			ShopOwnerUpdate: { data: { shopOwnerUpdate: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Landline')
		write('Landline', '')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({
			personalData: { contacts: { landline: null } }
		})
	})

	// The point the record already had, re-sent unchanged on a save that was about the name. The mutation
	// `$set`s the whole personalData, so a payload that dropped it would erase the coordinates of every
	// shopOwner whose phone number was ever corrected.
	it('carries the stored position through a save about something else', async () => {
		const stub = stubGraphQL({ ...detail(conPosition), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('First name')
		write('First name', 'Marco')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({
			// Longitude first — the pair is GeoJSON on the wire, whatever order the boxes hold it in.
			personalData: { address: { position: { coordinates: [9.19, 45.4642] } } }
		})
	})

	// `login.email` carries the collection's only unique index, which is why it has a mutation of its own
	// and why it must not travel inside the personalData write.
	it('sends the login email on its own', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateEmail: { data: { shopOwnerUpdateEmail: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Login email')
		write('Login email', 'new@rossi.it')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateEmail',
				variables: { _id: ID, email: 'new@rossi.it' }
			})
		])
	})

	it('sends both account flags when either is toggled', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Disabled')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateStatus',
				variables: { _id: ID, disabled: true, waitApprov: false }
			})
		])
	})

	// `onboardingStep` is the one argument of the four that is nullable, and `null` genuinely means
	// "unset it" — the resolver `$unset`s the key rather than writing an empty string.
	it('sends a cleared onboarding step as null', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Onboarding step')
		write('Onboarding step', '')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdatePreferences',
				variables: { _id: ID, rememberMe: false, onboardingDone: true, onboardingStep: null }
			})
		])
	})

	it('fires every touched group, in order', async () => {
		const stub = stubGraphQL({
			...detail(),
			ShopOwnerUpdate: { data: { shopOwnerUpdate: true } },
			ShopOwnerUpdateEmail: { data: { shopOwnerUpdateEmail: true } },
			ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } },
			ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Last name')
		write('Last name', 'Bianchi')
		await open('Login email')
		write('Login email', 'new@rossi.it')
		await open('Awaiting approval')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Awaiting approval' }))
		await open('Remember me at login')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Remember me at login' }))
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writeNames(stub)).toEqual([
			'ShopOwnerUpdate',
			'ShopOwnerUpdateEmail',
			'ShopOwnerUpdateStatus',
			'ShopOwnerUpdatePreferences'
		])
	})

	// Nothing is written until Save is pressed — a row left open with a typed value is not a write.
	it('writes nothing until Save is pressed', async () => {
		const stub = stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('First name')
		write('First name', 'Marco')

		expect(writes(stub)).toEqual([])
		expect(save()).toBeEnabled()
	})

	it('refuses to send an invalid field', async () => {
		const stub = stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('First name')
		write('First name', '   ')
		await userEvent.click(save())

		expect(await page().findByText('First name is required')).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	/*
	 * The three halves of a refusal, in one place: the box doubles its border and turns red, the toast in
	 * the corner names what is wrong, and both go away as the value is corrected — with no second press.
	 *
	 * That last part is what `handleSubmit` buys and `trigger()` did not: `isSubmitted` is what turns on
	 * react-hook-form's `reValidateMode: 'onChange'`, so until this the operator had to press Save again to
	 * find out whether the correction had worked.
	 *
	 * ⚠️ The toast is looked up through `screen` and not `page()`: the same sentence is on screen twice —
	 * under the box and in the list — and the stack is portalled to `document.body`, outside `main`.
	 */
	it('turns the refused box red and says why, then clears both as it is corrected', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('First name')
		write('First name', '   ')
		await userEvent.click(save())

		const warning = await screen.findByRole('alert')
		expect(warning).toHaveTextContent(VALIDATION_HEADER)
		expect(within(warning).getByRole('listitem')).toHaveTextContent('First name is required')
		expect(screen.getByLabelText('First name')).toHaveClass('border-2', 'bg-app-error/10')

		write('First name', 'Marco')

		await waitFor(() => {
			expect(screen.getByLabelText('First name')).toHaveClass('border', 'bg-white')
		})
		expect(screen.getByLabelText('First name')).not.toHaveClass('bg-app-error/10')
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	// The backend's own description, not a generic line: 409 on a duplicate email is the one refusal an
	// operator can act on, and it is carried in `extensions.description` rather than in `message`.
	it('shows the backend refusal', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdateEmail: { errors: [graphQLError('Errore', 'Email già presente', 409)], status: 409 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Login email')
		write('Login email', 'presa@rossi.it')
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Email già presente')
		expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument()
	})

	it.each(REFUSALS)('reports a bare refusal of %s', async (label, value, operation, data) => {
		stubGraphQL({ ...detail(), [operation]: { data } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open(label)
		write(label, value)
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})

	it('reports a bare refusal of the account flags', async () => {
		stubGraphQL({ ...detail(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Disabled')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})

	/*
	 * `=== true` per flag, and each of the four on its own line. All four are nullable booleans, and a box
	 * seeded from the wrong side of one of them fails silently: it does not come back dirty, so nothing is
	 * written and nothing is flagged — the operator simply reads the opposite of what the collection holds
	 * and, worse, ticking it back to the truth is what finally sends a write.
	 */
	it('seeds each box from the flag it belongs to', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Disabled')
		await open('Awaiting approval')
		await open('Remember me at login')
		await open('Onboarding complete')

		expect(screen.getByRole('checkbox', { name: 'Disabled' })).not.toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Awaiting approval' })).not.toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Remember me at login' })).not.toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Onboarding complete' })).toBeChecked()
		expect(save()).toBeDisabled()
	})

	/*
	 * The same four boxes on a fixture holding the other value of every flag, and both halves are needed.
	 * A seeding that read no flag at all and ticked the four boxes from constants passes whichever of the
	 * two is run on its own — it is the pair that ties each box to its own field rather than to a literal.
	 */
	it('seeds each box from the flag it belongs to, the other way round', async () => {
		stubGraphQL(
			detail({
				disabled: true,
				waitApprov: true,
				login: { ...shopOwner.login, rememberMe: true, onboardingDone: false }
			})
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Disabled')
		await open('Awaiting approval')
		await open('Remember me at login')
		await open('Onboarding complete')

		expect(screen.getByRole('checkbox', { name: 'Disabled' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Awaiting approval' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Remember me at login' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Onboarding complete' })).not.toBeChecked()
		expect(save()).toBeDisabled()
	})

	// The name passed to `register` is what ties a box to the form, and getting it wrong is not a type
	// error — the box simply detaches. What the operator typed then never reaches the payload and the
	// stored value is re-sent in its place, which reads as a save that silently undid the edit.
	it('sends what was typed into each of the remaining boxes', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Mobile')
		write('Mobile', '3339998877')
		await open('Contact email')
		write('Contact email', 'nuovo@rossi.it')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({
			personalData: { contacts: { mobile: '3339998877', email: 'nuovo@rossi.it' } }
		})
	})

	it('sends the onboarding flag the operator unticked', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Onboarding complete')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Onboarding complete' }))
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdatePreferences',
				variables: { _id: ID, rememberMe: false, onboardingDone: false, onboardingStep: '3' }
			})
		])
	})

	/*
	 * The three refusals below arrive as a `CombinedError`, which is the shape every real failure here has
	 * — a 409 on the unique email, a 500 from a `$set` that matched a document and modified none.
	 *
	 * ⚠️ An error reply carries **no `data` at all**, which is why each check reaches through it with `?.`.
	 * Written as `result.data.shopOwnerUpdate` it is not a wrong message but a TypeError thrown mid
	 * save: the promise rejects, nothing catches it, and the operator is left on a page that reports
	 * neither success nor failure. One test per mutation, because they are four separate checks.
	 */
	it('reports the backend refusal of the personalData write', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdate: { errors: [graphQLError('Errore', 'PersonalData non aggiornabile', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('First name')
		write('First name', 'Marco')
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('PersonalData non aggiornabile')
	})

	it('reports the backend refusal of the account flags', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdateStatus: { errors: [graphQLError('Errore', 'Status non aggiornabile', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Disabled')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Status non aggiornabile')
	})

	it('reports the backend refusal of the preferences write', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdatePreferences: { errors: [graphQLError('Errore', 'Preferences non aggiornabili', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Onboarding step')
		write('Onboarding step', '2')
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Preferences non aggiornabili')
	})

	/*
	 * All four writes answer a bare `Boolean`, which names no type for the document cache to invalidate —
	 * so the query behind this page would go on serving what it fetched on mount, and every row the
	 * operator did not have open would still show the old value after a successful save.
	 * `additionalTypenames` on the mutation context is what re-reads it.
	 */
	it('re-reads the shopOwner after a write that went through', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		const reads = () => stub.calls.filter((call) => call.operationName === 'ShopOwnerById')

		await screen.findByText('Mario')
		expect(reads()).toHaveLength(1)

		await open('First name')
		write('First name', 'Marco')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		await waitFor(() => {
			expect(reads()).toHaveLength(2)
		})
	})
})

/**
 * Every test that opens the address row stubs the geocoder as well as GraphQL: typing into that row is
 * what the field debounces into a Nominatim request, and a stub that covered only GraphQL would let the
 * request fall through to the operation queue and throw as an unconfigured operation.
 */
const stubNetwork = (replies: GraphQLReplies, osm: ResponseOsm | readonly ResponseOsm[] = {}) =>
	stubGraphQL(replies, osmStub(osm).rest)

/** The suggestion for a geocoder answer, once the 700 ms debounce has run out. */
const hintOsm = (firstName: string) => screen.findByRole('button', { name: firstName }, { timeout: SEARCH_DEBOUNCE_MS + 2000 })

/** What `osmResult()` answers with, as the suggestion list spells it out. */
const HINT = 'Via Roma, 1, Milano, MI, 20121, Italia'

/** The same answer once picked, as the box spells it out. */
const PICKED = 'Via Roma 1, 20121 Milano (MI)'

/** The map `AddressField` brings with it, which follows what is being typed rather than what is stored. */
const mapEditor = () => screen.queryByTitle('Address map')

/**
 * Every refusal the address box can be showing, and the reason they are asserted as a set.
 *
 * The box has one message for seven fields and shows the first of them that is in error, so a stale
 * refusal on any one field is indistinguishable from a stale refusal on any other — the operator sees
 * whichever comes first in that order and nothing about the rest. Checking that all seven are gone is
 * the only assertion that says the pick cleared the field it was really about.
 */
const MESSAGES_ADDRESS = [
	'Address is required',
	'The postal code must be 5 digits',
	'City is required',
	'The province is the 2-letter code',
	'Latitude is outside -90..90',
	'Longitude is outside -180..180',
	'Select the address from the list'
]

/**
 * The address card, which is the shop's card on a different collection.
 *
 * One box holding the whole address; the four fields behind it and the coordinate pair are written only
 * by picking one of the geocoder's answers. That is what makes the map possible at all — a position
 * cannot be typed, so it cannot be typed wrong.
 *
 * ⚠️ One thing here has no equivalent on a shop: the point is optional on this collection, so the pick is
 * how an shopOwner *gains* coordinates rather than how they move.
 */
describe('ShopOwnerPersonalData — address', () => {
	// ⚠️ Not `screen.getByLabelText`. The card is a `region` labelled by its own "Address" heading, so
	// an unscoped lookup matches the card as well as the box inside it.
	const field = () => box('Address').getByLabelText('Address')

	it('opens one box holding the whole address, and no box per field', async () => {
		stubNetwork(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')

		expect(field()).toHaveValue('Via Roma 1, 20100 Milano (MI)')
		expect(box('Address').queryByLabelText('Postal code')).not.toBeInTheDocument()
		expect(box('Address').queryByLabelText('City')).not.toBeInTheDocument()
		expect(box('Address').queryByLabelText('Province')).not.toBeInTheDocument()
		expect(box('Address').queryByLabelText('Latitudine')).not.toBeInTheDocument()
	})

	// Two maps of two different places stacked in one card is worse than either: the editor's follows what
	// is being typed, the stored one is where the shopOwner lives now, and nothing on screen would say
	// which is which. The stored one steps aside for as long as the editor is open.
	it('hands the map over to the editor while the row is open', async () => {
		stubNetwork(detail(conPosition))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByTitle('Map of Mario Rossi')).toBeInTheDocument()
		expect(mapEditor()).not.toBeInTheDocument()

		await open('Address')

		expect(screen.queryByTitle('Map of Mario Rossi')).not.toBeInTheDocument()
		// Framed on the shopOwner, not on the middle of Italy: the card was drawing this exact point a
		// moment ago, and an editor that opens by throwing it away is an editor that lost the address.
		expect(mapEditor()).toHaveAttribute('src', expect.stringContaining('marker=45.46420,9.19000'))
	})

	// The sentence goes away with the rest of the read-only half, and the editor opens on the middle of
	// Italy — there is nowhere else to open it for a record whose position nobody ever picked.
	it('opens on Italy for an shopOwner who has no point yet', async () => {
		stubNetwork(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')

		expect(
			screen.queryByText('Position unavailable: change the address and pick it from the list to add one.')
		).not.toBeInTheDocument()
		expect(mapEditor()).toBeInTheDocument()
	})

	/*
	 * The whole point of the card, and on this collection the only way a point arrives at all: the operator
	 * types, OSM answers, and one click fills an address, a CAP, a city, a province **and** a position
	 * where the record had none.
	 */
	it('writes the picked address and its coordinates, longitude first on the wire', async () => {
		const stub = stubNetwork({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } }, { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')
		fireEvent.change(field(), { target: { value: 'Via Roma 1 Milano' } })
		fireEvent.click(await hintOsm(HINT))

		expect(field()).toHaveValue(PICKED)

		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({
			personalData: {
				address: {
					street: 'Via Roma 1',
					postalCode: '20121',
					city: 'Milano',
					province: 'MI',
					// Longitude first, and the pair is the geocoder's — reading it back in the order OSM sent
					// it would put an shopOwner from Milan in the sea off Somalia.
					position: { coordinates: [9.1895, 45.4642] }
				}
			}
		})
	})

	/*
	 * ⚠️ The reason this card needs a rule of its own.
	 *
	 * The box is free text and the fields behind it are not written by typing, so an address left half
	 * typed and never picked would send the *stored* street, CAP, city and position under a line that
	 * reads like a different address entirely — a save that looks like it worked and wrote none of what is
	 * on screen. The message is on the box, because the fields it is really about have no input at all.
	 */
	it('refuses an address that was typed but never picked', async () => {
		const stub = stubNetwork({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } }, { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')
		fireEvent.change(field(), { target: { value: 'Via Roma 1 Milano' } })
		await userEvent.click(save())

		expect(await page().findByText('Select the address from the list')).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	// And takes the refusal back the moment one is picked. The composite rule is checked on
	// `addressComplete`, the one field of the seven that has a box, so its name has to be in the list the
	// pick re-validates as much as the five that do not — left out, the operator picks the address they
	// were told to pick and is told again to pick it.
	it('clears the refusal once an address is picked from the list', async () => {
		stubNetwork(detail(), { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')
		fireEvent.change(field(), { target: { value: 'Via Roma 1 Milano' } })
		await userEvent.click(save())

		expect(await page().findByText('Select the address from the list')).toBeInTheDocument()

		fireEvent.click(await hintOsm(HINT))

		await waitFor(() => {
			expect(page().queryByText('Select the address from the list')).not.toBeInTheDocument()
		})
		expect(field()).toHaveValue(PICKED)
	})

	/*
	 * The other six names in that list, cleared together.
	 *
	 * A pick writes all six fields behind the box, so all six have to be asked again — and a record stored
	 * before the address rules existed is refused on every one of them at once, which is what makes the
	 * whole set observable in a single save. Any name missing from the list leaves its own refusal
	 * standing, and the box goes on showing an error about a field the operator has just replaced.
	 */
	it('clears every field that was refused before the address was picked', async () => {
		stubNetwork(detail(corrupted), { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')
		fireEvent.change(field(), { target: { value: 'Via Roma 1 Milano' } })
		await userEvent.click(save())

		// The first of the six, which is all the box can say about them.
		expect(await page().findByText('Address is required')).toBeInTheDocument()

		fireEvent.click(await hintOsm(HINT))

		await waitFor(() => {
			for (const message of MESSAGES_ADDRESS) expect(screen.queryByText(message)).not.toBeInTheDocument()
		})
	})

	/*
	 * OSM answers for places that are not postal addresses — a bridge, a square, a hamlet — and those come
	 * back without a `postcode`. The four fields it fills have no box of their own, so their errors have
	 * nowhere to render unless the card gathers them: without that the save would refuse in silence and the
	 * operator would press Save again. The field's own message comes first, because "seleziona l'address"
	 * under an address that *was* selected sends them back to the list for nothing.
	 */
	it('reports a geocoder answer that carries no CAP', async () => {
		const stub = stubNetwork(
			{ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } },
			{
				results: [
					resultOsm({
						display_name: 'Piazza del Duomo, Milano, Italia',
						address: { road: 'Piazza del Duomo', city: 'Milano', 'ISO3166-2-lvl6': 'IT-MI' }
					})
				]
			}
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')
		fireEvent.change(field(), { target: { value: 'Piazza del Duomo' } })
		fireEvent.click(await hintOsm('Piazza del Duomo, Milano, Italia'))
		await userEvent.click(save())

		expect(await page().findByText('The postal code must be 5 digits')).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	/*
	 * A pick is what the form counts as the edit, not the typing that led to it — which is why all seven
	 * fields are written as modified rather than left alone.
	 *
	 * The case that tells the two apart: pick the address the shopOwner already has. Every field then
	 * holds what it held before anything was touched, so there is nothing to save and the button says so.
	 * Left unmarked, the pick would not undo the typing's own dirty flag and the page would offer to write
	 * the address back over itself.
	 */
	it('goes clean again when the stored address is the one picked', async () => {
		stubNetwork(detail(conPosition), {
			results: [
				resultOsm({
					display_name: 'Via Roma, 1, Milano, MI, 20100, Italia',
					lat: '45.4642',
					lon: '9.19',
					address: {
						road: 'Via Roma',
						house_number: '1',
						postcode: '20100',
						city: 'Milano',
						'ISO3166-2-lvl6': 'IT-MI'
					}
				})
			]
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Address')
		expect(save()).toBeDisabled()

		fireEvent.change(field(), { target: { value: 'Via Roma Milano' } })
		expect(save()).toBeEnabled()

		fireEvent.click(await hintOsm('Via Roma, 1, Milano, MI, 20100, Italia'))

		expect(field()).toHaveValue('Via Roma 1, 20100 Milano (MI)')
		await waitFor(() => {
			expect(save()).toBeDisabled()
		})
	})
})

/**
 * The operator's note, which is a mutation of its own for the same reason the login email is: it is the
 * one field on this page that is not part of the personalData, the flags or the preferences, and
 * `shopOwnerUpdate` answers **500** for a `$set` that changed nothing.
 */
describe('ShopOwnerPersonalData — note', () => {
	// ⚠️ Scoped like the address box: the card is a `region` labelled "Notes" and the box inside it is
	// labelled "Notes" too, so an unscoped lookup matches both.
	const areaNote = () => box('Notes').getByLabelText('Notes')

	it('opens a textarea seeded with the stored note', async () => {
		stubGraphQL(detail({ notes: 'Chiamare prima delle 18.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')

		expect(areaNote().tagName).toBe('TEXTAREA')
		expect(areaNote()).toHaveValue('Chiamare prima delle 18.')
		expect(save()).toBeDisabled()
	})

	// An shopOwner with no note seeds an empty box, not the word "null" for the operator to delete —
	// and not a dirty box either, or the next save would write it.
	it('seeds an empty box for an shopOwner with no note', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')

		expect(areaNote()).toHaveValue('')
		expect(save()).toBeDisabled()
	})

	it('sends the note on its own, and nothing else with it', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: '  Preferisce il telefono.  ' } })
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateNote',
				// Trimmed, because the payload is the *parsed* value — the schema's transforms are as much
				// part of the write as its messages are part of the page.
				variables: { _id: ID, notes: 'Preferisce il telefono.' }
			})
		])
	})

	// ⚠️ The empty string, not `null`. The mutation takes `String!`, and blank is the instruction that
	// removes the note — there is nothing to send `null` as, and a `vuotoInNull` here would be a type
	// error at best and a cleared note that never clears at worst.
	it('sends a cleared note as an empty string', async () => {
		const stub = stubGraphQL({
			...detail({ notes: 'Chiamare prima delle 18.' }),
			ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: '' } })
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toEqual({ _id: ID, notes: '' })
	})

	// Last of the six writes, after the preferences — the order the page fires them in is asserted whole
	// so a group that stopped firing shows up as a missing name rather than as a passing test.
	it('fires after the other groups when both were touched', async () => {
		const stub = stubGraphQL({
			...detail(),
			ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } },
			ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Onboarding step')
		write('Onboarding step', '4')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writeNames(stub)).toEqual(['ShopOwnerUpdatePreferences', 'ShopOwnerUpdateNote'])
	})

	it('refuses a note past the cap', async () => {
		const stub = stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'n'.repeat(2001) } })
		await userEvent.click(save())

		expect(await page().findByText('The notes cannot exceed 2000 characters')).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	/*
	 * The count is seeded from the stored note, not from zero.
	 *
	 * ⚠️ This is the case the caller-side count exists for: `register()` writes the stored value in through
	 * a ref and fires no `onChange`, so a length the box measured itself would open at "2000 rimanenti" on a
	 * note of twenty-four characters and only tell the truth after a keystroke.
	 */
	it('counts the characters left, starting from the stored note', async () => {
		stubGraphQL(detail({ notes: 'Chiamare prima delle 18.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')

		expect(box('Notes').getByText('1976 characters remaining')).toBeInTheDocument()

		fireEvent.change(areaNote(), { target: { value: 'Memo' } })

		expect(box('Notes').getByText('1996 characters remaining')).toBeInTheDocument()
	})

	// Past the cap the count goes negative rather than sticking at zero: `maxLength` stops typing but not a
	// paste, and "-1" is the one number that says how much has to come back out.
	it('counts past the cap into the negative', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'n'.repeat(2001) } })

		expect(box('Notes').getByText('-1 characters remaining')).toBeInTheDocument()
	})

	it('reports the backend refusal of the note write', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdateNote: { errors: [graphQLError('Errore', 'Note non aggiornabile', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Note non aggiornabile')
	})

	it('reports a bare refusal of the note write', async () => {
		stubGraphQL({ ...detail(), ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})
})
