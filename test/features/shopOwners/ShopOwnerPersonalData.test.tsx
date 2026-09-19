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

/** The admin a standing suspension is stamped with — `disabledBy` holds an `admin` `_id`, not a name. */
const ADMIN = '65f00000000000000000000a'

/** The refusal ADR-044's `dependencies: { disabled: ['disabledReason'] }` exists to keep off the wire. */
const REASON_REQUIRED = 'Say why this account is suspended — the reason is stored with the suspension'

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
	// Absent on an account nobody suspended, and a pair rather than a flag since ADR-044: the reason is
	// what this screen reads back, `disabledBy` is who wrote it, and both are `$unset` when the flag is.
	disabledBy: null,
	disabledReason: null,
	waitApprov: false,
	login: {
		email: 'mark@rivers.test',
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
		firstName: 'Mark',
		lastName: 'Rivers',
		birth: { date: '1980-06-15T00:00:00.000Z' },
		contacts: { email: 'contact@rivers.test', landline: null, mobile: '3331234567' },
		// ⚠️ No `position`, which is the *normal* state of an shopOwner: the field was added as optional
		// by `alter-shopOwner-position` and nothing backfilled it, unlike a shop where it is
		// required. The fixture with a point is `withPosition` below, and it is the exception here.
		address: { street: '1 Main Street', postalCode: '02109', city: 'Boston', province: 'MA', position: null }
	},
	// The admin's own note about the account. Absent until one is written — `shopOwnerUpdateNote`
	// `$unset`s the key rather than storing an empty string.
	notes: null,
	resetPwd: null
}

/** The same shopOwner with the coordinates an address pick would have left behind. */
const withPosition = {
	personalData: {
		...shopOwner.personalData,
		address: { ...shopOwner.personalData.address, position: { type: 'Point', coordinates: [-71.06, 42.3601] } }
	}
}

/**
 * An address the form refuses on every field behind the box at once.
 *
 * Not a contrived shape: the address rules arrived with this card, the collection validator is looser
 * than they are, and the coordinates were added by a migration that backfilled nothing — so a record
 * written before any of that can hold no street, a four-digit postal code, no city, a province code that is three
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
 * deleted account then reads "Deleted: No" and never gets its grey tint. The cases below pin each
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

	// Deleted wins over disabled: an account that is both is gone, and "disabled" understates it.
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
	// catches an account with nothing set, painting a perfectly active shopOwner "pending".
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

		expect(await screen.findByText('Mark')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('Rivers')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('15/06/1980')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('3331234567')).toBeInTheDocument()
		expect(box('ShopOwner').getByText('contact@rivers.test')).toBeInTheDocument()
	})

	// A dash says "not given"; an empty cell says "something broke". Every optional field on this page
	// goes through `handleNull` for that reason — a label with nothing beside it reads as a rendering
	// fault, and an admin cannot tell it apart from a field that failed to load.
	it('renders a missing landline as a dash, not as a gap', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(rowValue('ShopOwner', 'Landline')).toBe('---')
	})

	// One line, not a row per field: the four fields behind it have no box of their own, exactly as on a
	// shop, because only a geocoder pick writes them.
	it('composes the address on one line', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(rowValue('Address', 'Address')).toBe('1 Main Street, 02109 Boston (MA)')
		expect(box('Address').queryByText('Postal code')).not.toBeInTheDocument()
		expect(box('Address').queryByText('City')).not.toBeInTheDocument()
	})

	// The marker, not the frame: an embed without one is a picture of the city, which is true of every
	// shopOwner in the city and says nothing about this one.
	it('draws the position as a map named after the shopOwner', async () => {
		stubGraphQL(detail(withPosition))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(screen.getByTitle('Map of Mark Rivers')).toHaveAttribute('src', expect.stringContaining('marker=42.36010,-71.06000'))
	})

	/*
	 * ⚠️ The difference from the shop's card, and the reason it is a sentence rather than a blank
	 * space: an shopOwner registered before `position` existed has none, so this is the state most of them
	 * are in. A map centred on a fallback would be a claim about where they live; an empty gap would read
	 * as a frame that failed to load.
	 */
	it('says so instead of drawing a map for an address with no point behind it', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(screen.queryByTitle('Map of Mark Rivers')).not.toBeInTheDocument()
		expect(
			box('Address').getByText('Position unavailable: change the address and pick it from the list to add one.')
		).toBeInTheDocument()
	})

	it('shows the account status and the login history', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(rowValue('Account status', 'Disabled')).toBe('No')
		expect(rowValue('Account status', 'Suspension reason')).toBe('---')
		expect(rowValue('Account status', 'Suspended by')).toBe('---')
		expect(rowValue('Account status', 'Deleted on')).toBe('---')
		expect(rowValue('Account status', 'Registered')).toBe('1 February 2026 at 08:05:45')
		expect(rowValue('Account status', 'First login')).toBe('2 February 2026 at 09:00:00')
		expect(rowValue('Account status', 'Last login')).toBe('1 March 2026 at 18:30:00')
	})

	/*
	 * The two halves of a standing suspension, since ADR-044: what was written and who wrote it.
	 *
	 * ⚠️ `disabledBy` is the admin's `_id` rather than a name, and it is shown as one. The Admin tier
	 * has no query that turns an admin id into an email, and inventing a lookup here would mean a
	 * second read on every detail page for a row that is empty on almost all of them — the id is what the
	 * document holds and what an audit trail is followed by.
	 */
	it('shows a standing suspension and the admin who raised it', async () => {
		stubGraphQL(detail({ disabled: true, disabledBy: ADMIN, disabledReason: 'Chargeback fraud, ticket 4471.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(screen.getByRole('region', { name: 'Account status' })).toHaveClass('account-disabled')
		expect(rowValue('Account status', 'Disabled')).toBe('Yes')
		expect(rowValue('Account status', 'Suspension reason')).toBe('Chargeback fraud, ticket 4471.')
		expect(rowValue('Account status', 'Suspended by')).toBe(ADMIN)
	})

	it('tints the box of a deleted account', async () => {
		stubGraphQL(detail({ deleted: '2026-04-01T12:00:00.000Z' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(screen.getByRole('region', { name: 'Account status' })).toHaveClass('account-deleted')
		expect(rowValue('Account status', 'Deleted on')).toBe('1 April 2026 at 12:00:00')
	})

	it('shows the onboarding preferences', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(rowValue('Preferences', 'Remember me at login')).toBe('No')
		expect(rowValue('Preferences', 'Onboarding complete')).toBe('Yes')
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

		await screen.findByText('Mark')
		expect(rowValue('Password', 'Recovery hash')).toBe('abcdefghijklmnopqrst...')
		expect(rowValue('Password', 'Reset request')).toBe('1 May 2026 at 07:00:00')
	})

	// The note is the admin's own, and every shopOwner starts without one — a dash, so the empty card
	// reads as "nothing written here" rather than as a card that failed to render.
	it('shows the note, and a dash when there is none', async () => {
		stubGraphQL(detail({ notes: 'Call before 6pm.\nCalled back on 3/4.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(rowValue('Notes', 'Notes')).toBe('Call before 6pm.\nCalled back on 3/4.')
	})

	it('renders a missing note as a dash, not as a gap', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(rowValue('Notes', 'Notes')).toBe('---')
	})

	it('handles an account that never asked for a reset', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(rowValue('Password', 'Recovery hash')).toBe('---')
		expect(rowValue('Password', 'Reset request')).toBe('---')
	})

	it('reports a failure', async () => {
		stubGraphQL({
			ShopOwnerById: { errors: [graphQLError('Error', 'Record unavailable', 500)], status: 500 },
			ShopOwnerCompanies: { data: { shopOwnerCompanies: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByRole('alert')).toHaveTextContent('Record unavailable')
	})

	// `shopOwnerById` is nullable: an `_id` that matches nothing answers `null` without an error, and
	// a blank page would leave the admin to guess whether it loaded.
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

		await screen.findByText('Mark')
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
 * Tick "Disabled" and say why, which since ADR-044 is one gesture rather than two.
 *
 * ⚠️ The reason is mandatory beside the flag — `dependencies: { disabled: ['disabledReason'] }` on the
 * collection refuses the pair without it — so a test that ticked the box alone would be testing a save
 * the form now refuses, not the write it used to send.
 */
const suspend = async (reason = 'Chargeback fraud, ticket 4471.') => {
	await open('Disabled')
	await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
	await open('Suspension reason')
	write('Suspension reason', reason)
}

/**
 * A refusal that is `false` with no error at all.
 *
 * No resolver here answers that way, but `Boolean!` says it could, and a save reported as successful
 * would be worse than a generic line. One case per group, because the four checks are four separate
 * branches: a copy-paste that left one of them reading another group's answer would otherwise pass.
 */
const REFUSALS: readonly (readonly [string, string, string, Record<string, boolean>])[] = [
	['First name', 'Marco', 'ShopOwnerUpdate', { shopOwnerUpdate: false }],
	['Login email', 'new@rivers.test', 'ShopOwnerUpdateEmail', { shopOwnerUpdateEmail: false }],
	['Onboarding step', '2', 'ShopOwnerUpdatePreferences', { shopOwnerUpdatePreferences: false }]
]

/** Only the writes. The two queries the page fires on mount are not what any of these tests is about. */
const writes = (stub: GraphQLStub) => stub.calls.filter((call) => call.operationName.startsWith('ShopOwnerUpdate'))

const writeNames = (stub: GraphQLStub) => writes(stub).map((call) => call.operationName)

/**
 * Every row on the detail page is editable in place, and nothing is written until the one Save button at
 * the bottom is pressed.
 *
 * ⚠️ The four mutations are fired **only for the groups the admin touched**, and that is a
 * correctness requirement rather than an optimisation: `shopOwnerUpdate` answers 500 when its `$set`
 * matched the document and modified nothing. Re-sending an untouched personalData alongside a changed
 * email would fail the save *after* the email had already been written, with nothing to roll it back.
 * The assertions below are on the exact list of operations sent, for that reason.
 */
describe('ShopOwnerPersonalData — editing', () => {
	it('turns a row into its editor, seeded with the stored value', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('First name')

		expect(screen.getByLabelText('First name')).toHaveValue('Mark')
		expect(box('ShopOwner').queryByText('Mark')).not.toBeInTheDocument()
	})

	// `onboardingStep` is the one nullable field of the form. A null has to seed an empty box, not the
	// word "null" for the admin to delete — and not a dirty box either, or the next save writes it.
	it('seeds an empty box for an shopOwner with no onboarding step', async () => {
		stubGraphQL(detail({ login: { ...shopOwner.login, onboardingStep: null } }))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Onboarding step')

		expect(screen.getByLabelText('Onboarding step')).toHaveValue('')
		expect(save()).toBeDisabled()
	})

	// The date box wants `YYYY-MM-DD` and the collection stores midnight UTC. Seeded in local time it
	// would arrive a day early west of Greenwich — and already dirty, so the next save would write it.
	it('seeds the date of birth in the form the date box accepts', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Born on')

		expect(screen.getByLabelText('Born on')).toHaveValue('1980-06-15')
		expect(save()).toBeDisabled()
	})

	it('sends the personalData alone when only the personalData changed', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
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
						lastName: 'Rivers',
						birth: { date: '1980-06-15' },
						// ⚠️ `position: null` and not an absent key. The mutation `$set`s the whole personalData,
						// so the point travels on every save of it — this shopOwner has none, and `null` is
						// what says so. An omitted key here would be a save that erases a point the record had.
						address: {
							street: '1 Main Street',
							postalCode: '02109',
							city: 'Boston',
							province: 'MA',
							position: null
						},
						// The landline is absent on this shopOwner and stays absent: `null`, never `''`,
						// which the collection would accept as a real number of no digits.
						contacts: { mobile: '3331234567', landline: null, email: 'contact@rivers.test' }
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

		await screen.findByText('Mark')
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
		const stub = stubGraphQL({ ...detail(withPosition), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('First name')
		write('First name', 'Marco')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({
			// Longitude first — the pair is GeoJSON on the wire, whatever order the boxes hold it in.
			personalData: { address: { position: { coordinates: [-71.06, 42.3601] } } }
		})
	})

	// `login.email` carries the collection's only unique index, which is why it has a mutation of its own
	// and why it must not travel inside the personalData write.
	it('sends the login email on its own', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateEmail: { data: { shopOwnerUpdateEmail: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Login email')
		write('Login email', 'new@rivers.test')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateEmail',
				variables: { _id: ID, email: 'new@rivers.test' }
			})
		])
	})

	it('sends both account flags when either is toggled', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await suspend()
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateStatus',
				variables: { _id: ID, disabled: true, waitApprov: false, disabledReason: 'Chargeback fraud, ticket 4471.' }
			})
		])
	})

	/*
	 * ADR-044's whole point at this end: the flag alone is not a suspension the collection will take.
	 * `dependencies: { disabled: ['disabledReason'] }` refuses the pair without a reason, so a form that
	 * let the tick through on its own would turn an admin's click into a write error rather than into
	 * a sanction — and the admin would read it as the account being unsuspendable.
	 */
	it('refuses to suspend without a reason', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Disabled')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
		await open('Suspension reason')
		await userEvent.click(save())

		expect(await page().findByText(REASON_REQUIRED)).toBeInTheDocument()
		expect(within(await screen.findByRole('alert')).getByText(REASON_REQUIRED)).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	/*
	 * The same refusal with the reason row still closed, which is the way an admin actually meets it:
	 * the box is one row below the tick and there is no reason to open it until something says so.
	 *
	 * ⚠️ `page()` scopes to `main` and the toast portals to `body`, so this assertion is the toast and
	 * only the toast — and the toast is the whole point here. With the row closed the message has no box
	 * to sit under, so a form that relied on the red border alone would refuse the save and say nothing
	 * at all.
	 */
	it('says why it refused even with the reason row closed', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Disabled')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
		await userEvent.click(save())

		const toast = within(await screen.findByRole('alert'))

		expect(toast.getByText(VALIDATION_HEADER)).toBeInTheDocument()
		expect(toast.getByText(REASON_REQUIRED)).toBeInTheDocument()
		expect(page().queryByText(REASON_REQUIRED)).not.toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	/*
	 * Correcting the reason of a suspension that already stands, without touching either flag.
	 *
	 * The reason is part of the status group rather than a field of its own, so it is the group's dirty
	 * check that has to notice it — `FIELDS_STATUS.some(...)` over three names, not two. Left out, this
	 * save sends nothing at all and the page reports success over a reason nobody stored.
	 */
	it('sends the status write when only the reason changed', async () => {
		const stub = stubGraphQL({
			...detail({ disabled: true, disabledBy: ADMIN, disabledReason: 'Suspected chargeback ring.' }),
			ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Suspension reason')

		expect(screen.getByLabelText('Suspension reason')).toHaveValue('Suspected chargeback ring.')

		write('Suspension reason', 'Chargeback fraud, ticket 4471.')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateStatus',
				variables: { _id: ID, disabled: true, waitApprov: false, disabledReason: 'Chargeback fraud, ticket 4471.' }
			})
		])
	})

	// The same counter as the note's, on the box `dependencies: { disabled: ['disabledReason'] }` exists
	// for — seeded from the stored reason rather than from zero, for the reason written on the note's own
	// version of this test.
	it('counts the characters left in the suspension reason, starting from the stored reason', async () => {
		stubGraphQL(detail({ disabled: true, disabledBy: ADMIN, disabledReason: 'Suspected chargeback ring.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Suspension reason')

		expect(box('Account status').getByText('974 characters remaining')).toBeInTheDocument()

		write('Suspension reason', 'Fraud')

		expect(box('Account status').getByText('995 characters remaining')).toBeInTheDocument()
	})

	// `onboardingStep` is the one argument of the four that is nullable, and `null` genuinely means
	// "unset it" — the resolver `$unset`s the key rather than writing an empty string.
	it('sends a cleared onboarding step as null', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
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

		await screen.findByText('Mark')
		await open('Last name')
		write('Last name', 'White')
		await open('Login email')
		write('Login email', 'new@rivers.test')
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

		await screen.findByText('Mark')
		await open('First name')
		write('First name', 'Marco')

		expect(writes(stub)).toEqual([])
		expect(save()).toBeEnabled()
	})

	it('refuses to send an invalid field', async () => {
		const stub = stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
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
	 * react-hook-form's `reValidateMode: 'onChange'`, so until this the admin had to press Save again to
	 * find out whether the correction had worked.
	 *
	 * ⚠️ The toast is looked up through `screen` and not `page()`: the same sentence is on screen twice —
	 * under the box and in the list — and the stack is portalled to `document.body`, outside `main`.
	 */
	it('turns the refused box red and says why, then clears both as it is corrected', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
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
	// admin can act on, and it is carried in `extensions.description` rather than in `message`.
	it('shows the backend refusal', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdateEmail: { errors: [graphQLError('Error', 'Email already registered', 409)], status: 409 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Login email')
		write('Login email', 'taken@rivers.test')
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered')
		expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument()
	})

	it.each(REFUSALS)('reports a bare refusal of %s', async (label, value, operation, data) => {
		stubGraphQL({ ...detail(), [operation]: { data } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open(label)
		write(label, value)
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})

	it('reports a bare refusal of the account flags', async () => {
		stubGraphQL({ ...detail(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await suspend()
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})

	/*
	 * `=== true` per flag, and each of the four on its own line. All four are nullable booleans, and a box
	 * seeded from the wrong side of one of them fails silently: it does not come back dirty, so nothing is
	 * written and nothing is flagged — the admin simply reads the opposite of what the collection holds
	 * and, worse, ticking it back to the truth is what finally sends a write.
	 */
	it('seeds each box from the flag it belongs to', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
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

		await screen.findByText('Mark')
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
	// error — the box simply detaches. What the admin typed then never reaches the payload and the
	// stored value is re-sent in its place, which reads as a save that silently undid the edit.
	it('sends what was typed into each of the remaining boxes', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Mobile')
		write('Mobile', '3339998877')
		await open('Contact email')
		write('Contact email', 'updated@rivers.test')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({
			personalData: { contacts: { mobile: '3339998877', email: 'updated@rivers.test' } }
		})
	})

	it('sends the onboarding flag the admin unticked', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
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
	 * save: the promise rejects, nothing catches it, and the admin is left on a page that reports
	 * neither success nor failure. One test per mutation, because they are four separate checks.
	 */
	it('reports the backend refusal of the personalData write', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdate: { errors: [graphQLError('Error', 'PersonalData not updatable', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('First name')
		write('First name', 'Marco')
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('PersonalData not updatable')
	})

	it('reports the backend refusal of the account flags', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdateStatus: { errors: [graphQLError('Error', 'Status not updatable', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await suspend()
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Status not updatable')
	})

	it('reports the backend refusal of the preferences write', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdatePreferences: { errors: [graphQLError('Error', 'Preferences not updatable', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Onboarding step')
		write('Onboarding step', '2')
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Preferences not updatable')
	})

	/*
	 * All four writes answer a bare `Boolean`, which names no type for the document cache to invalidate —
	 * so the query behind this page would go on serving what it fetched on mount, and every row the
	 * admin did not have open would still show the old value after a successful save.
	 * `additionalTypenames` on the mutation context is what re-reads it.
	 */
	it('re-reads the shopOwner after a write that went through', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		const reads = () => stub.calls.filter((call) => call.operationName === 'ShopOwnerById')

		await screen.findByText('Mark')
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
const HINT = 'Main Street, 1, Boston, MA, 02108, USA'

/** The same answer once picked, as the box spells it out. */
const PICKED = '1 Main Street, 02108 Boston (MA)'

/** The map `AddressField` brings with it, which follows what is being typed rather than what is stored. */
const mapEditor = () => screen.queryByTitle('Address map')

/**
 * Every refusal the address box can be showing, and the reason they are asserted as a set.
 *
 * The box has one message for seven fields and shows the first of them that is in error, so a stale
 * refusal on any one field is indistinguishable from a stale refusal on any other — the admin sees
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

		await screen.findByText('Mark')
		await open('Address')

		expect(field()).toHaveValue('1 Main Street, 02109 Boston (MA)')
		expect(box('Address').queryByLabelText('Postal code')).not.toBeInTheDocument()
		expect(box('Address').queryByLabelText('City')).not.toBeInTheDocument()
		expect(box('Address').queryByLabelText('Province')).not.toBeInTheDocument()
		expect(box('Address').queryByLabelText('Latitude')).not.toBeInTheDocument()
	})

	// Two maps of two different places stacked in one card is worse than either: the editor's follows what
	// is being typed, the stored one is where the shopOwner lives now, and nothing on screen would say
	// which is which. The stored one steps aside for as long as the editor is open.
	it('hands the map over to the editor while the row is open', async () => {
		stubNetwork(detail(withPosition))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		expect(screen.getByTitle('Map of Mark Rivers')).toBeInTheDocument()
		expect(mapEditor()).not.toBeInTheDocument()

		await open('Address')

		expect(screen.queryByTitle('Map of Mark Rivers')).not.toBeInTheDocument()
		// Framed on the shopOwner, not on the middle of the country: the card was drawing this exact point a
		// moment ago, and an editor that opens by throwing it away is an editor that lost the address.
		expect(mapEditor()).toHaveAttribute('src', expect.stringContaining('marker=42.36010,-71.06000'))
	})

	// The sentence goes away with the rest of the read-only half, and the editor opens on the middle of the
	// country — there is nowhere else to open it for a record whose position nobody ever picked.
	it('opens on the country centre for a shopOwner who has no point yet', async () => {
		stubNetwork(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Address')

		expect(
			screen.queryByText('Position unavailable: change the address and pick it from the list to add one.')
		).not.toBeInTheDocument()
		expect(mapEditor()).toBeInTheDocument()
	})

	/*
	 * The whole point of the card, and on this collection the only way a point arrives at all: the admin
	 * types, OSM answers, and one click fills an address, a postal code, a city, a province **and** a position
	 * where the record had none.
	 */
	it('writes the picked address and its coordinates, longitude first on the wire', async () => {
		const stub = stubNetwork({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } }, { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Address')
		fireEvent.change(field(), { target: { value: '1 Main Street Boston' } })
		fireEvent.click(await hintOsm(HINT))

		expect(field()).toHaveValue(PICKED)

		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({
			personalData: {
				address: {
					street: '1 Main Street',
					postalCode: '02108',
					city: 'Boston',
					province: 'MA',
					// Longitude first, and the pair is the geocoder's — reading it back in the order OSM sent
					// it would put a shopOwner from Boston in the Southern Ocean.
					position: { coordinates: [-71.0589, 42.3601] }
				}
			}
		})
	})

	/*
	 * ⚠️ The reason this card needs a rule of its own.
	 *
	 * The box is free text and the fields behind it are not written by typing, so an address left half
	 * typed and never picked would send the *stored* street, postal code, city and position under a line that
	 * reads like a different address entirely — a save that looks like it worked and wrote none of what is
	 * on screen. The message is on the box, because the fields it is really about have no input at all.
	 */
	it('refuses an address that was typed but never picked', async () => {
		const stub = stubNetwork({ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } }, { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Address')
		fireEvent.change(field(), { target: { value: '1 Main Street Boston' } })
		await userEvent.click(save())

		expect(await page().findByText('Select the address from the list')).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	// And takes the refusal back the moment one is picked. The composite rule is checked on
	// `addressComplete`, the one field of the seven that has a box, so its name has to be in the list the
	// pick re-validates as much as the five that do not — left out, the admin picks the address they
	// were told to pick and is told again to pick it.
	it('clears the refusal once an address is picked from the list', async () => {
		stubNetwork(detail(), { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Address')
		fireEvent.change(field(), { target: { value: '1 Main Street Boston' } })
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
	 * standing, and the box goes on showing an error about a field the admin has just replaced.
	 */
	it('clears every field that was refused before the address was picked', async () => {
		stubNetwork(detail(corrupted), { results: [resultOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Address')
		fireEvent.change(field(), { target: { value: '1 Main Street Boston' } })
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
	 * admin would press Save again. The field's own message comes first, because "select the address"
	 * under an address that *was* selected sends them back to the list for nothing.
	 */
	it('reports a geocoder answer that carries no postal code', async () => {
		const stub = stubNetwork(
			{ ...detail(), ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } },
			{
				results: [
					resultOsm({
						display_name: 'Cathedral Square, Boston, USA',
						address: { road: 'Cathedral Square', city: 'Boston', 'ISO3166-2-lvl4': 'US-MA' }
					})
				]
			}
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Address')
		fireEvent.change(field(), { target: { value: 'Cathedral Square' } })
		fireEvent.click(await hintOsm('Cathedral Square, Boston, USA'))
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
		stubNetwork(detail(withPosition), {
			results: [
				resultOsm({
					display_name: 'Main Street, 1, Boston, MA, 02109, USA',
					lat: '42.3601',
					lon: '-71.06',
					address: {
						road: 'Main Street',
						house_number: '1',
						postcode: '02109',
						city: 'Boston',
						'ISO3166-2-lvl4': 'US-MA'
					}
				})
			]
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Address')
		expect(save()).toBeDisabled()

		fireEvent.change(field(), { target: { value: 'Main Street Boston' } })
		expect(save()).toBeEnabled()

		fireEvent.click(await hintOsm('Main Street, 1, Boston, MA, 02109, USA'))

		expect(field()).toHaveValue('1 Main Street, 02109 Boston (MA)')
		await waitFor(() => {
			expect(save()).toBeDisabled()
		})
	})
})

/**
 * The admin's note, which is a mutation of its own for the same reason the login email is: it is the
 * one field on this page that is not part of the personalData, the flags or the preferences, and
 * `shopOwnerUpdate` answers **500** for a `$set` that changed nothing.
 */
describe('ShopOwnerPersonalData — note', () => {
	// ⚠️ Scoped like the address box: the card is a `region` labelled "Notes" and the box inside it is
	// labelled "Notes" too, so an unscoped lookup matches both.
	const areaNote = () => box('Notes').getByLabelText('Notes')

	it('opens a textarea seeded with the stored note', async () => {
		stubGraphQL(detail({ notes: 'Call before 6pm.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Notes')

		expect(areaNote().tagName).toBe('TEXTAREA')
		expect(areaNote()).toHaveValue('Call before 6pm.')
		expect(save()).toBeDisabled()
	})

	// An shopOwner with no note seeds an empty box, not the word "null" for the admin to delete —
	// and not a dirty box either, or the next save would write it.
	it('seeds an empty box for an shopOwner with no note', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Notes')

		expect(areaNote()).toHaveValue('')
		expect(save()).toBeDisabled()
	})

	it('sends the note on its own, and nothing else with it', async () => {
		const stub = stubGraphQL({ ...detail(), ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: '  Prefers the phone.  ' } })
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateNote',
				// Trimmed, because the payload is the *parsed* value — the schema's transforms are as much
				// part of the write as its messages are part of the page.
				variables: { _id: ID, notes: 'Prefers the phone.' }
			})
		])
	})

	// ⚠️ The empty string, not `null`. The mutation takes `String!`, and blank is the instruction that
	// removes the note — there is nothing to send `null` as, and a `emptyInNull` here would be a type
	// error at best and a cleared note that never clears at worst.
	it('sends a cleared note as an empty string', async () => {
		const stub = stubGraphQL({
			...detail({ notes: 'Call before 6pm.' }),
			ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
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

		await screen.findByText('Mark')
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

		await screen.findByText('Mark')
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
	 * a ref and fires no `onChange`, so a length the box measured itself would open at "2000 remaining" on a
	 * note of sixteen characters and only tell the truth after a keystroke.
	 */
	it('counts the characters left, starting from the stored note', async () => {
		stubGraphQL(detail({ notes: 'Call before 6pm.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Notes')

		expect(box('Notes').getByText('1984 characters remaining')).toBeInTheDocument()

		fireEvent.change(areaNote(), { target: { value: 'Memo' } })

		expect(box('Notes').getByText('1996 characters remaining')).toBeInTheDocument()
	})

	// Past the cap the count goes negative rather than sticking at zero: `maxLength` stops typing but not a
	// paste, and "-1" is the one number that says how much has to come back out.
	it('counts past the cap into the negative', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'n'.repeat(2001) } })

		expect(box('Notes').getByText('-1 characters remaining')).toBeInTheDocument()
	})

	it('reports the backend refusal of the note write', async () => {
		stubGraphQL({
			...detail(),
			ShopOwnerUpdateNote: { errors: [graphQLError('Error', 'Note not updatable', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Note not updatable')
	})

	it('reports a bare refusal of the note write', async () => {
		stubGraphQL({ ...detail(), ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mark')
		await open('Notes')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})
})

/**
 * A seller who registered themselves on the public site: an email, a password, a date and the approval
 * flag. `personalData` is **absent**, not empty — `shopOwnerRegister` writes none of it, and onboarding
 * is what fills it in later.
 *
 * ⚠️ Every other field here is null on purpose. `disabled`, `rememberMe`, `onboardingDone` and
 * `onboardingStep` are optional on the collection and nothing writes them at registration, so this is
 * the document shape the resolver really answers with — a fixture that seeded them `false` would hide
 * every `=== true` that has to survive a null.
 */
const pending = {
	__typename: 'GraphQLShopOwnerById',
	_id: ID,
	registeredAt: '2026-04-02T09:30:00.000Z',
	deleted: null,
	disabled: null,
	disabledBy: null,
	disabledReason: null,
	waitApprov: true,
	login: {
		email: 'new.seller@example.com',
		firstLogin: null,
		lastLogin: null,
		onboardingStep: null,
		onboardingDone: null,
		rememberMe: null
	},
	personalData: null,
	notes: null,
	resetPwd: null
}

const detailPending = (override: Record<string, unknown> = {}) => ({
	ShopOwnerById: { data: { shopOwnerById: { ...pending, ...override } } },
	ShopOwnerCompanies: { data: { shopOwnerCompanies: [] } }
})

/**
 * The detail page of an account that has not onboarded.
 *
 * ⚠️ It is a **separate panel with a schema of its own**, and the reason is the one action the screen
 * exists for. `handleSubmit` validates the whole schema before `write` runs, so reusing
 * `shopOwnerDetailSchema` here would put "First name is required" between an admin and the approval
 * of an account that has no first name by design — the save would be refused on thirteen boxes that are
 * not on screen and cannot be filled in. The tests below are what pin that the approval goes through.
 */
describe('ShopOwnerPersonalData — an account that registered itself', () => {
	it('shows the credentials and says why there is nothing else', async () => {
		stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		expect(await screen.findByText('new.seller@example.com')).toBeInTheDocument()
		expect(screen.getByText(/registered on the public site/)).toBeInTheDocument()
	})

	/*
	 * The rows are absent, not empty, and that is the difference between the two readings of this page:
	 * "First name: ---" says the query failed to bring it back, while no row at all says the field is not
	 * on the document. The address card goes with them — it is the geocoder, the map and a pen for a
	 * street the admin would be typing on a stranger's behalf.
	 */
	it('draws no identity rows at all', async () => {
		stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		expect(screen.queryByText('First name')).not.toBeInTheDocument()
		expect(screen.queryByText('Born on')).not.toBeInTheDocument()
		expect(screen.queryByRole('region', { name: 'Address' })).not.toBeInTheDocument()
		expect(screen.queryByTitle(/^Map of/)).not.toBeInTheDocument()
	})

	// The same yellow the table's badge uses, on the card that carries the tick that clears it.
	it('tints the account status card as waiting', async () => {
		stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		expect(screen.getByRole('region', { name: 'Account status' })).toHaveClass('account-wait-approv')
	})

	/*
	 * The approved seller who has still not onboarded — the state this panel spends most of its life in,
	 * since clearing the flag is what the admin comes here to do and onboarding happens afterwards, in
	 * the shop-owner app.
	 *
	 * Every box is seeded from the document rather than from a constant, and all four flags are `=== true`
	 * against a field that is absent far more often than it is `false`. A fixture with the flags down
	 * would pass just as well against a form that hard-coded them down, which is why this one puts every
	 * one of them up and leaves the note and the approval as the two that are not.
	 */
	it('seeds every box from the document, flags and all', async () => {
		stubGraphQL(
			detailPending({
				disabled: true,
				waitApprov: null,
				login: { ...pending.login, rememberMe: true, onboardingDone: true, onboardingStep: '2' }
			})
		)
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Disabled')
		await open('Awaiting approval')
		await open('Remember me at login')
		await open('Onboarding complete')
		await open('Onboarding step')
		await open('Notes')

		expect(screen.getByRole('checkbox', { name: 'Disabled' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Awaiting approval' })).not.toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Remember me at login' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Onboarding complete' })).toBeChecked()
		expect(screen.getByLabelText('Onboarding step')).toHaveValue('2')
		expect(box('Notes').getByLabelText('Notes')).toHaveValue('')
		expect(box('Notes').getByText('2000 characters remaining')).toBeInTheDocument()
		// Nothing has been saved yet, so nothing has been refused yet: the error toast is rendered by a
		// failure and by nothing else.
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ The whole point of the panel: unticking the box and pressing Save writes the approval, and the
	 * write is the same `shopOwnerUpdateStatus` a complete account uses. `disabled: false` travels with it
	 * because the mutation takes both flags — the account's `disabled` is null on the document, and a
	 * payload that carried that null through would refuse at the `Boolean!` argument.
	 */
	it('approves the account', async () => {
		const stub = stubGraphQL({ ...detailPending(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Awaiting approval')
		expect(screen.getByRole('checkbox', { name: 'Awaiting approval' })).toBeChecked()

		await userEvent.click(screen.getByRole('checkbox', { name: 'Awaiting approval' }))
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateStatus',
				// ⚠️ `disabledReason: null` and not an omitted field: the service `$unset`s the reason with the
				// flag, and a missing variable would read as "leave it as it was".
				variables: { _id: ID, disabled: false, waitApprov: false, disabledReason: null }
			})
		])
	})

	/*
	 * The two flags share one mutation but not one condition, and this is the case that tells them apart.
	 *
	 * Blocking an account is not deciding on it: an admin who ticks "Disabled" on a registration they
	 * are still investigating must not have the approval sent along with it. Both values travel — the
	 * mutation takes both — but the one that was not touched travels as it was found.
	 */
	it('sends the block without deciding the approval', async () => {
		const stub = stubGraphQL({ ...detailPending(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await suspend('Registered with a stolen company number.')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateStatus',
				variables: {
					_id: ID,
					disabled: true,
					waitApprov: true,
					disabledReason: 'Registered with a stolen company number.'
				}
			})
		])
	})

	/*
	 * ADR-044's rule again, and this panel's own schema is the one that has to carry it: `blocking an
	 * account it has not onboarded is still a suspension of the same document, refused by the same
	 * `dependencies: { disabled: ['disabledReason'] }` the complete account answers to. `shopOwnerDetailSchema`
	 * is a different object — see the comment above this describe block — so this schema needs its own
	 * `.refine`, and this is what pins that it has one.
	 */
	it('refuses to block without a reason', async () => {
		const stub = stubGraphQL({ ...detailPending(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Disabled')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
		await open('Suspension reason')
		await userEvent.click(save())

		expect(await page().findByText(REASON_REQUIRED)).toBeInTheDocument()
		expect(within(await screen.findByRole('alert')).getByText(REASON_REQUIRED)).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	// Seeded empty on an account nobody has suspended yet, and counting down from the same cap the
	// complete account's box does — `disabledReason` is `null` here, not a stored string, which is the
	// case the `??` fallback in this panel's own `defaultValues` exists for.
	it('seeds the suspension reason box empty and counts down from the cap', async () => {
		stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Suspension reason')

		expect(screen.getByLabelText('Suspension reason')).toHaveValue('')
		expect(box('Account status').getByText('1000 characters remaining')).toBeInTheDocument()

		write('Suspension reason', 'Fraud')

		expect(box('Account status').getByText('995 characters remaining')).toBeInTheDocument()
	})

	it('sends the login email on its own', async () => {
		const stub = stubGraphQL({ ...detailPending(), ShopOwnerUpdateEmail: { data: { shopOwnerUpdateEmail: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Login email')
		write('Login email', 'seller@rivers.test')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateEmail',
				variables: { _id: ID, email: 'seller@rivers.test' }
			})
		])
	})

	// `emptyInNull` again: the box seeds empty from a null and a typed step has to arrive as a string,
	// while the two flags travel as the booleans the null was read into.
	it('sends the preferences the admin touched', async () => {
		const stub = stubGraphQL({ ...detailPending(), ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Onboarding step')
		expect(screen.getByLabelText('Onboarding step')).toHaveValue('')

		write('Onboarding step', '1')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdatePreferences',
				variables: { _id: ID, rememberMe: false, onboardingDone: false, onboardingStep: '1' }
			})
		])
	})

	// An admin's note about an account they are deciding on is the one piece of writing this screen
	// invites, so the card is here in full — counter included.
	it('sends the note, and counts what is left of it', async () => {
		const stub = stubGraphQL({ ...detailPending(), ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Notes')
		fireEvent.change(box('Notes').getByLabelText('Notes'), { target: { value: 'Called to confirm the VAT number.' } })

		expect(box('Notes').getByText('1967 characters remaining')).toBeInTheDocument()

		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdateNote',
				variables: { _id: ID, notes: 'Called to confirm the VAT number.' }
			})
		])
	})

	/*
	 * ⚠️ Padding is stripped before anything is sent, and both free-text boxes on this panel strip it.
	 *
	 * The step is the case that matters: a spacebar is how an admin clears a box, and `emptyInNull` maps
	 * `''` to `null` — so a trimmed blank *removes* the field from the document while an untrimmed one
	 * stores `'  '`, a step that is not a step, that no `??` fallback treats as absent and that every
	 * `onboardingStep === '3'` comparison in the shop-owner app fails against. The note is the same rule
	 * with lower stakes: leading spaces on an admin's note are noise the next reader has to see past.
	 */
	it('stores neither a padded step nor a padded note', async () => {
		const stub = stubGraphQL({
			...detailPending(),
			ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } },
			ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Onboarding step')
		write('Onboarding step', '  ')
		await open('Notes')
		fireEvent.change(box('Notes').getByLabelText('Notes'), { target: { value: '  Called back.  ' } })
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ShopOwnerUpdatePreferences',
				variables: { _id: ID, rememberMe: false, onboardingDone: false, onboardingStep: null }
			}),
			expect.objectContaining({ operationName: 'ShopOwnerUpdateNote', variables: { _id: ID, notes: 'Called back.' } })
		])
	})

	it('fires every touched group, in order', async () => {
		const stub = stubGraphQL({
			...detailPending(),
			ShopOwnerUpdateEmail: { data: { shopOwnerUpdateEmail: true } },
			ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: true } },
			ShopOwnerUpdatePreferences: { data: { shopOwnerUpdatePreferences: true } },
			ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Login email')
		write('Login email', 'seller@rivers.test')
		await open('Awaiting approval')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Awaiting approval' }))
		await open('Remember me at login')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Remember me at login' }))
		await open('Notes')
		fireEvent.change(box('Notes').getByLabelText('Notes'), { target: { value: 'Approved.' } })
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writeNames(stub)).toEqual([
			'ShopOwnerUpdateEmail',
			'ShopOwnerUpdateStatus',
			'ShopOwnerUpdatePreferences',
			'ShopOwnerUpdateNote'
		])
	})

	// The panel's own schema still has rules, and the login email is the field that carries them: it is
	// the only thing identifying this account, so a typo in it is unrecoverable rather than untidy.
	it('refuses an invalid login email', async () => {
		const stub = stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Login email')
		// No TLD: jsdom runs the input's own validation before submit, so this is what an `<input
		// type="email">` accepts and the zod rule still refuses.
		write('Login email', 'seller@marketplace')
		await userEvent.click(save())

		expect(await page().findByText('Enter a valid login email address')).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	/*
	 * The three caps this panel enforces, each on the field it belongs to.
	 *
	 * The values are pasted rather than typed: every box carries a `maxLength`, which stops a keystroke
	 * and nothing else, so the rule underneath it is the one that has to hold — and the message has to
	 * name the field, since one refused save can only be read on the card it names.
	 *
	 * ⚠️ The login email cap is **250, while the platform accepts 255** (`EMAIL_MAX_LEN` in
	 * `@axiumine/koa-utils`, which every registration goes through). The five characters between them are
	 * why this rule is reachable on a stored document at all rather than only on what an admin types.
	 */
	const CAPS_PENDING: readonly (readonly [string, string, string])[] = [
		['Login email', `${'a'.repeat(239)}@example.com`, 'The login email cannot exceed 250 characters'],
		['Onboarding step', '12345', 'The onboarding step cannot exceed 4 characters']
	]

	it.each(CAPS_PENDING)('refuses a %s past the cap', async (label, value, message) => {
		const stub = stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open(label)
		write(label, value)
		await userEvent.click(save())

		expect(await page().findByText(message)).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	// The note is the one box that is a textarea, and its card is named after it — hence the scoped
	// lookup rather than the `write` helper the two rows above use.
	it('refuses a note past the cap', async () => {
		const stub = stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Notes')
		fireEvent.change(box('Notes').getByLabelText('Notes'), { target: { value: 'x'.repeat(2001) } })
		await userEvent.click(save())

		expect(await page().findByText('The notes cannot exceed 2000 characters')).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	it('shows the backend refusal', async () => {
		stubGraphQL({
			...detailPending(),
			ShopOwnerUpdateStatus: { errors: [graphQLError('Error', 'Status not updatable', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Awaiting approval')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Awaiting approval' }))
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Status not updatable')
		expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument()
	})

	/*
	 * The other three groups' refusals, each read off the answer to its own write.
	 *
	 * ⚠️ A refused write carries **no data at all** — the 500 below has `errors` and nothing else — so
	 * every one of these checks has to reach into the answer through an optional chain. One that did not
	 * would throw on the way to the toast, and the admin would be looking at a blank card instead of
	 * the reason their save did not land.
	 */
	const BACKEND_PENDING: readonly (readonly [string, string, string, string])[] = [
		['Login email', 'seller@rivers.test', 'ShopOwnerUpdateEmail', 'Email not updatable'],
		['Onboarding step', '2', 'ShopOwnerUpdatePreferences', 'Preferences not updatable']
	]

	it.each(BACKEND_PENDING)('reports the backend refusal of %s', async (label, value, operation, message) => {
		stubGraphQL({ ...detailPending(), [operation]: { errors: [graphQLError('Error', message, 500)], status: 500 } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open(label)
		write(label, value)
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent(message)
	})

	it('reports the backend refusal of the note write', async () => {
		stubGraphQL({
			...detailPending(),
			ShopOwnerUpdateNote: { errors: [graphQLError('Error', 'Note not updatable', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Notes')
		fireEvent.change(box('Notes').getByLabelText('Notes'), { target: { value: 'Memo' } })
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Note not updatable')
	})

	/*
	 * One case per group, as on the complete account: the four checks are four separate branches, and a
	 * copy-paste that left one of them reading another group's answer would report a save that never
	 * happened. `false` with no error at all is what `Boolean!` allows and no resolver sends.
	 */
	const REFUSALS_PENDING: readonly (readonly [string, string, string, Record<string, boolean>])[] = [
		['Login email', 'seller@rivers.test', 'ShopOwnerUpdateEmail', { shopOwnerUpdateEmail: false }],
		['Onboarding step', '1', 'ShopOwnerUpdatePreferences', { shopOwnerUpdatePreferences: false }]
	]

	it.each(REFUSALS_PENDING)('reports a bare refusal of %s', async (label, value, operation, data) => {
		stubGraphQL({ ...detailPending(), [operation]: { data } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open(label)
		write(label, value)
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})

	it('reports a bare refusal of the approval', async () => {
		stubGraphQL({ ...detailPending(), ShopOwnerUpdateStatus: { data: { shopOwnerUpdateStatus: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Awaiting approval')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Awaiting approval' }))
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})

	// The Notes box is the one that is not a `TextField`, and its card is named after it — hence the
	// scoped lookup rather than the `write` helper the two rows above use.
	it('reports a bare refusal of the note write', async () => {
		stubGraphQL({ ...detailPending(), ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Notes')
		fireEvent.change(box('Notes').getByLabelText('Notes'), { target: { value: 'Memo' } })
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
	})

	// The written values become the new baseline: the box the admin changed is no longer dirty, so the
	// page's one Save button goes back to disabled rather than offering to send the same write again.
	it('leaves nothing to save once the write went through', async () => {
		stubGraphQL({ ...detailPending(), ShopOwnerUpdateNote: { data: { shopOwnerUpdateNote: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		await open('Notes')
		fireEvent.change(box('Notes').getByLabelText('Notes'), { target: { value: 'Approved.' } })
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		await waitFor(() => {
			expect(save()).toBeDisabled()
		})
	})

	it('renders', async () => {
		stubGraphQL(detailPending())
		await renderRoute(DETAIL)

		await screen.findByText('new.seller@example.com')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
