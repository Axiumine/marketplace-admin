import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { nextSort } from '@/features/shopOwners/TblShopOwners'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

const MANAGE = '/p/shopOwners/manage-shopOwners'

const rivers = {
	_id: '65f0000000000000000000f1',
	registeredAt: '2026-02-01T08:05:45.000Z',
	email: 'mark.rivers@example.com',
	// `null`, not `false`: the field is `$unset` on approval, so the wire never carries a `false` and a
	// fixture that invents one tests a document shape the backend cannot produce.
	waitApprov: null,
	personalData: {
		firstName: 'Mark',
		lastName: 'Rivers',
		address: { street: '1 Main Street', postalCode: '02109', city: 'Boston', province: 'MA' }
	}
}

const white = {
	_id: '65f0000000000000000000f2',
	registeredAt: '2026-03-15T10:00:00.000Z',
	email: 'anna.white@example.com',
	waitApprov: null,
	personalData: {
		firstName: 'Anna',
		lastName: 'White',
		address: { street: '9 Broadway', postalCode: '10001', city: 'New York', province: 'NY' }
	}
}

/**
 * A seller who registered themselves on the public site: credentials, a date and the approval flag, and
 * no `personalData` at all until onboarding runs. This is the row the whole approval queue exists for,
 * and the one every unguarded `personalData.` read in the component would throw on.
 */
const selfRegistered = {
	_id: '65f0000000000000000000f3',
	registeredAt: '2026-04-02T09:30:00.000Z',
	email: 'new.seller@example.com',
	waitApprov: true,
	personalData: null
}

const page = (items: unknown[], total = items.length) => ({ data: { shopOwnersActiveTbl: { total, items } } })

const header = (name: string) => screen.getByRole('button', { name })

describe('nextSort', () => {
	it('starts a new column ascending', () => {
		expect(nextSort('FIRST_NAME', 'LAST_NAME', 'DESC')).toEqual({ sortBy: 'FIRST_NAME', sortDir: 'ASC' })
	})

	it('flips the column already sorted', () => {
		expect(nextSort('LAST_NAME', 'LAST_NAME', 'ASC')).toEqual({ sortBy: 'LAST_NAME', sortDir: 'DESC' })
	})

	it('flips back', () => {
		expect(nextSort('LAST_NAME', 'LAST_NAME', 'DESC')).toEqual({ sortBy: 'LAST_NAME', sortDir: 'ASC' })
	})
})

describe('TblShopOwners', () => {
	it('waits before claiming the list is empty', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: { pending: true } })
		await renderRoute(MANAGE)

		expect(screen.getByText('Loading shop owners')).toBeInTheDocument()
		expect(screen.queryByText('No shopOwner found.')).not.toBeInTheDocument()
	})

	it('renders a row per shopOwner', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers, white]) })
		await renderRoute(MANAGE)

		const row = (await screen.findByText('Rivers')).closest('tr')
		expect(row).not.toBeNull()

		const cells = within(row as HTMLElement)
		expect(cells.getByText('Mark')).toBeInTheDocument()
		expect(cells.getByText('01/02/2026')).toBeInTheDocument()
		expect(cells.getByText('1 Main Street, 02109 Boston (MA)')).toBeInTheDocument()
	})

	/**
	 * ⚠️ `firstName` and `lastName` stay two columns. Merging them into one "First name" cell holding `firstName lastName`
	 * looks tidier and is not a sortable thing — the backend indexes the two fields separately and there
	 * is no index on a concatenation, so the merged column could only sort in the browser, over one page.
	 * The link lives on the email cell alone: one link per row rather than two pointing at the same
	 * page, which is what the length assertion below pins.
	 */
	it('links each row to its detail page, once', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(MANAGE)

		const row = (await screen.findByText('Rivers')).closest('tr') as HTMLElement
		const links = within(row).getAllByRole('link')

		expect(links).toHaveLength(1)
		expect(links[0]).toHaveAttribute('href', `/p/shopOwners/id/${rivers._id}`)
	})

	/**
	 * ⚠️ The link is on the **email**, and the row that proves why is the self-registered one: it has no
	 * surname to click. Moving the link back onto `lastName` leaves every pending registration reachable
	 * only by guessing its URL — the accounts an operator opened this page to act on.
	 */
	it('opens the detail page from a row', async () => {
		stubGraphQL({
			ShopOwnersActiveTbl: page([selfRegistered]),
			ShopOwnerById: { pending: true },
			ShopOwnerCompanies: { pending: true }
		})
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(await screen.findByRole('link', { name: selfRegistered.email }))
		expect(router.state.location.pathname).toBe(`/p/shopOwners/id/${selfRegistered._id}`)
	})

	it('shows a dash where a self-registered seller has no personal data yet', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([selfRegistered]) })
		await renderRoute(MANAGE)

		const row = (await screen.findByText(selfRegistered.email)).closest('tr') as HTMLElement
		const cells = within(row).getAllByRole('cell')

		// Positional, because the point is that all three of firstName, lastName and address fall back —
		// `getAllByText('—')` would pass on a table that dropped two of the columns.
		expect(cells[1]).toHaveTextContent('—')
		expect(cells[2]).toHaveTextContent('—')
		expect(cells[4]).toHaveTextContent('—')
		expect(cells[3]).toHaveTextContent('02/04/2026')
	})

	it('marks the account waiting for an operator, and only that one', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([selfRegistered, rivers]) })
		await renderRoute(MANAGE)

		const pendingRow = (await screen.findByText(selfRegistered.email)).closest('tr') as HTMLElement
		expect(within(pendingRow).getByText('Pending approval')).toBeInTheDocument()

		// The approved account reads "Active" rather than nothing at all: an empty status cell is
		// indistinguishable from a column that failed to render.
		const activeRow = (await screen.findByText('Rivers')).closest('tr') as HTMLElement
		expect(within(activeRow).getByText('Active')).toBeInTheDocument()
	})

	/**
	 * ⚠️ Email and Status carry no sort, and the two assertions are one rule seen from both sides. There
	 * is no ordering to offer: `login.email` is CSFLE ciphertext and no algorithm here preserves one,
	 * `waitApprov` has no index, and neither has a value in the backend's sort enum. A header button
	 * would send `sortBy: undefined` at a NonNull argument and empty the table, and an `aria-sort` would
	 * promise a screen-reader user an ordering that does not exist.
	 */
	it('offers no sort on the columns the backend cannot order by', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(MANAGE)

		const email = await screen.findByRole('columnheader', { name: 'Email' })
		expect(within(email).queryByRole('button')).not.toBeInTheDocument()
		expect(email).not.toHaveAttribute('aria-sort')

		const status = screen.getByRole('columnheader', { name: 'Status' })
		expect(within(status).queryByRole('button')).not.toBeInTheDocument()
		expect(status).not.toHaveAttribute('aria-sort')
	})

	it('says so when nothing matches', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([]) })
		await renderRoute(MANAGE)

		expect(await screen.findByText('No shopOwner found.')).toBeInTheDocument()
	})

	/*
	 * A page that never arrived is not a page with no rows, and the mapping has to survive both.
	 *
	 * The case above answers with a page whose `items` are empty; this one answers with no page at all,
	 * which is what a failed query leaves behind — and the `?? []` fallback is the only thing between
	 * that and a `.map` over `undefined`. The body stays at its header row.
	 */
	it('draws no rows at all when the query brought no page back', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: { errors: [graphQLError('Error', 'List unavailable', 500)], status: 500 } })
		await renderRoute(MANAGE)

		expect(await screen.findByText('No shopOwner found.')).toBeInTheDocument()
		expect(screen.getAllByRole('row')).toHaveLength(1)
	})

	it('reports a failure', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: { errors: [graphQLError('Error', 'List unavailable', 500)], status: 500 } })
		await renderRoute(MANAGE)

		expect(await screen.findByRole('alert')).toHaveTextContent('List unavailable')
	})

	/**
	 * ⚠️ Search, sort and paging are all the server's job, and these variables are what assert it. Doing
	 * any of the three in the browser means fetching the whole `shopOwner` collection first — every
	 * operator downloading every record to look at twenty rows, on a collection that grows without
	 * bound. The table component must never gain a client-side filter or comparator.
	 */
	it('asks the server for one page, sorted and unfiltered', async () => {
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(MANAGE)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({
			offset: 0,
			limit: 20,
			// `null`, not `''`: an empty box is "no filter". An empty string is a filter that matches
			// everything by accident, and the backend has to special-case it.
			search: null,
			sortBy: 'LAST_NAME',
			sortDir: 'ASC'
		})
	})

	it('turns the page number into an offset', async () => {
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([rivers], 100) })
		await renderRoute(`${MANAGE}?page=3&pageSize=25`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ offset: 50, limit: 25 })
		})
	})

	it('sends the search term from the URL', async () => {
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(`${MANAGE}?search=rivers`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ search: 'rivers' })
		})
		expect(screen.getByLabelText('Search shopOwner')).toHaveValue('rivers')
	})

	// The search box is debounced, so the URL — and the round-trip — happens once the operator stops
	// typing rather than once per keystroke.
	it('pushes a typed search into the URL and returns to the first page', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers], 100) })
		const { router } = await renderRoute(`${MANAGE}?page=4`)

		await userEvent.type(screen.getByLabelText('Search shopOwner'), 'ross')

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ search: 'ross', page: 1 })
		})
	})

	it('sorts by the column that was clicked, ascending', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(header('First name'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'FIRST_NAME', sortDir: 'ASC' })
	})

	it('flips the direction when the sorted column is clicked again', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(header('Last name'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'LAST_NAME', sortDir: 'DESC' })
	})

	// Sorting reorders the whole result set, so page 4 of the old order has nothing to do with page 4 of
	// the new one. Staying put would land the operator on a page of unrelated rows.
	it('returns to the first page when the sort changes', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers], 100) })
		const { router } = await renderRoute(`${MANAGE}?page=4`)

		await userEvent.click(header('RegisteredAt'))

		expect(router.state.location.search).toMatchObject({ page: 1 })
	})

	// The address column sorts by CITY: the full string is composed client-side and is not an index,
	// and sorting people by street name is not a thing anyone wants.
	it('sorts the address column by town', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(header('Address'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'CITY' })
	})

	it('tells assistive technology which column is sorted, and which way', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(`${MANAGE}?sortBy=FIRST_NAME&sortDir=DESC`)

		expect(await screen.findByRole('columnheader', { name: 'First name' })).toHaveAttribute('aria-sort', 'descending')
		expect(screen.getByRole('columnheader', { name: 'Last name' })).toHaveAttribute('aria-sort', 'none')
	})

	it('reports an ascending sort as ascending', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(`${MANAGE}?sortBy=FIRST_NAME&sortDir=ASC`)

		expect(await screen.findByRole('columnheader', { name: 'First name' })).toHaveAttribute('aria-sort', 'ascending')
	})

	it('pages through the result set from the URL', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers], 41) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(await screen.findByRole('button', { name: 'Page 3' }))

		expect(router.state.location.search).toMatchObject({ page: 3 })
	})

	it('sizes the pager from the server total, not from the rows on screen', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers, white], 41) })
		await renderRoute(MANAGE)

		expect(await screen.findByText('1–20 of 41')).toBeInTheDocument()
	})

	// Both row shapes in one snapshot: the trading account and the self-registered one, so the em dashes
	// and the pending badge are pinned as markup rather than only as text content.
	it('renders', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers, white, selfRegistered], 41) })
		await renderRoute(MANAGE)

		await screen.findByText('Rivers')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
