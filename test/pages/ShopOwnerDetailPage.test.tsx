import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DISCARD_WARNING } from '@/features/saving'

import { stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const ID = '65f0000000000000000000f1'
const DETAIL = `/p/shopOwners/id/${ID}`

const detail = {
	ShopOwnerById: {
		data: {
			shopOwnerById: {
				_id: ID,
				registeredAt: '2026-02-01T08:05:45.000Z',
				deleted: null,
				disabled: false,
				waitApprov: false,
				login: {
					email: 'mark@rivers.test',
					firstLogin: null,
					lastLogin: null,
					onboardingStep: '0',
					onboardingDone: false,
					rememberMe: false
				},
				personalData: {
					firstName: 'Mark',
					lastName: 'Rivers',
					birth: { date: '1980-06-15T00:00:00.000Z' },
					contacts: { email: 'contact@rivers.test', landline: null, mobile: '3331234567' },
					address: { street: '1 Main Street', postalCode: '02109', city: 'Boston', province: 'MA' }
				},
				resetPwd: null
			}
		}
	},
	// The list is empty: this file is about the page's save registry and its leave guard, and a card would
	// only add rows for the assertions here to look past.
	ShopOwnerCompanies: { data: { shopOwnerCompanies: [] } }
}

const ID_COMPANY = '65f0000000000000000000a1'

/**
 * The same page with one company on it, for the one test that has to watch both sections come back
 * closed.
 *
 * Kept out of `detail` rather than folded into it: every other test here is about the save registry or
 * the leave guard, and another card would put another pen and another region in front of assertions
 * that are not looking for them.
 */
const withCompanies = {
	...detail,
	ShopOwnerCompanies: {
		data: {
			shopOwnerCompanies: [
				{
					__typename: 'GraphQLCompany',
					_id: ID_COMPANY,
					legalName: 'Rivers Trading Ltd',
					vatNumber: '12345678901',
					taxCode: null,
					contactPerson: 'Mark Rivers',
					administrator: 'Mark Rivers',
					uniqueCode: null,
					certifiedEmail: 'certified@rivers.test',
					registryExtract: 'MA-123456',
					address: {
						street: '3 Oak Street',
						postalCode: '02108',
						city: 'Boston',
						province: 'MA',
						position: { type: 'Point', coordinates: [-71.0636, 42.3626] }
					}
				}
			]
		}
	}
}

/**
 * jsdom has no `window.confirm` worth calling — the real one is `Not implemented` — so every test that
 * reaches the guard has to say what the admin answered. The spy is also what proves the question was
 * asked at all, which is the half a `location.pathname` assertion cannot tell apart from a broken route.
 */
const respond = (response: boolean) => vi.spyOn(window, 'confirm').mockReturnValue(response)

const dirty = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Change First name' }))
	fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Markus' } })
	await waitFor(() => {
		expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
	})
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ShopOwnerDetailPage — rendering', () => {
	it('renders', async () => {
		stubGraphQL(withCompanies)
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })
		expect(await screen.findByRole('button', { name: 'Change Legal name' })).toBeInTheDocument()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})

/*
 * Nothing on this page is written until Save is pressed, so every edit lives in the browser and nowhere
 * else. A stray click on the breadcrumb throws away thirteen fields and however many shops, with no
 * undo — the values never reached the server, so there is nothing to re-read them from.
 */
describe('ShopOwnerDetailPage — unsaved changes', () => {
	it('asks before leaving a page holding unsaved edits, and stays when the answer is no', async () => {
		stubGraphQL(detail)
		const { router } = await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })
		await dirty()

		const confirm = respond(false)
		// ⚠️ Not awaited. A blocked `navigate()` never settles — the promise resolves when the navigation
		// completes, and this one never does — so awaiting it here is a five-second test timeout, not a
		// failed assertion. The `waitFor` below is what makes the test wait for the right thing.
		void router.navigate({ to: '/settings' })

		// Spelled out rather than compared against the exported constant: asserting the constant against
		// itself passes whatever it holds, and this string is the whole of what the admin is told before
		// an edit is thrown away.
		await waitFor(() => {
			expect(confirm).toHaveBeenCalledWith('There are unsaved changes. Do you really want to leave the page?')
		})
		expect(DISCARD_WARNING).toBe('There are unsaved changes. Do you really want to leave the page?')
		expect(router.state.location.pathname).toBe(DETAIL)
		// The edit is still there to go back to — a guard that held the navigation but dropped the form
		// state would be worse than no guard at all.
		expect(screen.getByLabelText('First name')).toHaveValue('Markus')
	})

	it('leaves when the answer is yes', async () => {
		stubGraphQL(detail)
		const { router } = await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })
		await dirty()

		const confirm = respond(true)
		await router.navigate({ to: '/settings' })

		expect(confirm).toHaveBeenCalledWith(DISCARD_WARNING)
		expect(router.state.location.pathname).toBe('/settings')
	})

	// The question is the cost of the guard, and a page nobody touched must not pay it: an admin who
	// only came to read has done nothing that leaving would lose.
	it('says nothing when the page is untouched', async () => {
		stubGraphQL(detail)
		const { router } = await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })

		const confirm = respond(false)
		await router.navigate({ to: '/settings' })

		expect(confirm).not.toHaveBeenCalled()
		expect(router.state.location.pathname).toBe('/settings')
	})
})

/*
 * A save leaves the page looking the way it loaded: every row the admin opened is a value and a pen
 * again. Done by remounting both halves on a counter the successful save bumps, because `EditableRow`
 * has no close of its own — a row that closed while react-hook-form still held its edited value would
 * show the server's value and save a different one.
 */
describe('ShopOwnerDetailPage — after saving', () => {
	it('puts every row it opened back to read-only', async () => {
		stubGraphQL({ ...detail, ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })
		await dirty()

		expect(screen.queryByRole('button', { name: 'Change First name' })).not.toBeInTheDocument()

		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		// The pen is back, the editor is gone, and the field shows what the server has — not the value that
		// was typed into a form which no longer exists.
		expect(await screen.findByRole('button', { name: 'Change First name' })).toBeInTheDocument()
		expect(screen.queryByLabelText('First name')).not.toBeInTheDocument()
		expect(screen.getByText('Mark')).toBeInTheDocument()
	})

	/*
	 * Both sections, and not the personalData alone.
	 *
	 * Each one is remounted by a key of its own, and a key that stopped following the counter would leave
	 * exactly that section open while the other closed — a page half back to read-only, with one card
	 * still holding a form seeded from data the save has just invalidated. The prefixes are what keep the
	 * two keys apart; the counter alone would be two siblings sharing one key space.
	 *
	 * Only the personalData is dirtied: a clean section is asked to save and answers yes without a round
	 * trip, which is enough to bump the counter and is what the companies are here to be measured by.
	 */
	it('puts the rows of the companies back too', async () => {
		stubGraphQL({ ...withCompanies, ShopOwnerUpdate: { data: { shopOwnerUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })
		await dirty()

		// Only the company row is opened here — `dirty()` has already opened *and* edited the personalData's
		// First name, so its pen is gone by this point and clicking it again could only ever fail. It used
		// to be clicked a second time regardless, which is why this test has never passed.
		await userEvent.click(screen.getByRole('button', { name: 'Change Legal name' }))
		expect(screen.getByLabelText('Legal name')).toBeInTheDocument()

		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		expect(await screen.findByRole('button', { name: 'Change Legal name' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Change First name' })).toBeInTheDocument()
		expect(screen.queryByLabelText('Legal name')).not.toBeInTheDocument()
	})

	/*
	 * A section nobody touched is not merely nothing to send — it is nothing to *validate* either.
	 *
	 * These forms are seeded from whatever the collection already holds, and the rules they enforce are
	 * younger than some of the documents: this `personalData` carries a three-letter province and no street,
	 * which the address card refuses outright. Validating it anyway would fail the page's save while the
	 * admin was editing a company, on a card they never opened and cannot see the error on — and the
	 * companies come after the personalData in the save loop, so the write they *did* ask for is the one
	 * that never leaves.
	 *
	 * The clean section short-circuits to `true` before `handleSubmit` is reached, which is the whole of
	 * why the assertions below are about the company's write and not the shopOwner's.
	 */
	it('saves a company without validating a personalData the admin never opened', async () => {
		const stub = stubGraphQL({
			...withCompanies,
			ShopOwnerById: {
				data: {
					shopOwnerById: {
						...withCompanies.ShopOwnerById.data.shopOwnerById,
						personalData: {
							...withCompanies.ShopOwnerById.data.shopOwnerById.personalData,
							address: { street: '', postalCode: '2010', city: '', province: 'MIL' }
						}
					}
				}
			},
			CompanyUpdate: { data: { companyUpdate: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })

		await userEvent.click(screen.getByRole('button', { name: 'Change Legal name' }))
		fireEvent.change(screen.getByLabelText('Legal name'), { target: { value: 'Rivers Trading PLC' } })
		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		expect(await screen.findByRole('button', { name: 'Change Legal name' })).toBeInTheDocument()
		expect(stub.calls.map((call) => call.operationName)).toContain('CompanyUpdate')
		expect(stub.calls.map((call) => call.operationName).filter((name) => name.startsWith('ShopOwnerUpdate'))).toEqual([])
		expect(screen.queryByText('Address is required')).not.toBeInTheDocument()
	})

	/*
	 * The same short-circuit on the other panel — the one a self-registered seller gets.
	 *
	 * Its schema is narrower, but it still has a rule the untouched form must not be measured against, and
	 * the login email below is past it: the panel caps the address at 250 characters while the platform
	 * accepts 255 (`EMAIL_MAX_LEN` in `@axiumine/koa-utils`, which every registration goes through), so a
	 * stored address can be longer than the form would let an admin type. Reaching `handleSubmit` here
	 * would refuse the save on a card nobody opened, and the company write — which comes after it in the
	 * save loop — is the one that would never leave.
	 */
	it('saves a company without validating the pending panel the admin never opened', async () => {
		const shopOwner = withCompanies.ShopOwnerById.data.shopOwnerById
		const stub = stubGraphQL({
			...withCompanies,
			ShopOwnerById: {
				data: {
					shopOwnerById: {
						...shopOwner,
						waitApprov: true,
						personalData: null,
						login: { ...shopOwner.login, email: `${'a'.repeat(239)}@example.com` }
					}
				}
			},
			CompanyUpdate: { data: { companyUpdate: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })
		expect(screen.getByText(/registered on the public site/)).toBeInTheDocument()

		await userEvent.click(screen.getByRole('button', { name: 'Change Legal name' }))
		fireEvent.change(screen.getByLabelText('Legal name'), { target: { value: 'Rivers Trading PLC' } })
		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		expect(await screen.findByRole('button', { name: 'Change Legal name' })).toBeInTheDocument()
		expect(stub.calls.map((call) => call.operationName)).toContain('CompanyUpdate')
		expect(stub.calls.map((call) => call.operationName).filter((name) => name.startsWith('ShopOwnerUpdate'))).toEqual([])
	})

	// Only a save that went all the way through. A page left half-written still holds edits, and closing
	// those rows would hide values the admin would have to type again.
	it('leaves the open rows alone when the save was refused', async () => {
		stubGraphQL({ ...detail, ShopOwnerUpdate: { data: { shopOwnerUpdate: false } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Shop owner info' })
		await dirty()

		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
		expect(screen.getByLabelText('First name')).toHaveValue('Markus')
	})
})
