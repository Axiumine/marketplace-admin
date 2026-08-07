import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { nextSort } from '@/features/shopOwners/TblShopOwners'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

const MANAGE = '/p/shopOwners/manage-shopOwners'

const rossi = {
	_id: '65f0000000000000000000f1',
	registeredAt: '2026-02-01T08:05:45.000Z',
	personalData: {
		firstName: 'Mario',
		lastName: 'Rossi',
		address: { street: 'Via Roma 1', postalCode: '20100', city: 'Milano', province: 'MI' }
	}
}

const bianchi = {
	_id: '65f0000000000000000000f2',
	registeredAt: '2026-03-15T10:00:00.000Z',
	personalData: {
		firstName: 'Anna',
		lastName: 'Bianchi',
		address: { street: 'Corso Italia 9', postalCode: '00100', city: 'Roma', province: 'RM' }
	}
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
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi, bianchi]) })
		await renderRoute(MANAGE)

		const row = (await screen.findByText('Rossi')).closest('tr')
		expect(row).not.toBeNull()

		const cells = within(row as HTMLElement)
		expect(cells.getByText('Mario')).toBeInTheDocument()
		expect(cells.getByText('01/02/2026')).toBeInTheDocument()
		expect(cells.getByText('Via Roma 1, 20100 Milano (MI)')).toBeInTheDocument()
	})

	/**
	 * ⚠️ `firstName` and `lastName` stay two columns. Merging them into one "First name" cell holding `firstName lastName`
	 * looks tidier and is not a sortable thing — the backend indexes the two fields separately and there
	 * is no index on a concatenation, so the merged column could only sort in the browser, over one page.
	 * The link lives on the lastName cell alone: one link per row rather than two pointing at the same
	 * page, which is what the length assertion below pins.
	 */
	it('links each row to its detail page, once', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
		await renderRoute(MANAGE)

		const row = (await screen.findByText('Rossi')).closest('tr') as HTMLElement
		const links = within(row).getAllByRole('link')

		expect(links).toHaveLength(1)
		expect(links[0]).toHaveAttribute('href', `/p/shopOwners/id/${rossi._id}`)
	})

	it('opens the detail page from a row', async () => {
		stubGraphQL({
			ShopOwnersActiveTbl: page([rossi]),
			ShopOwnerById: { pending: true },
			ShopOwnerCompanies: { pending: true }
		})
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(await screen.findByRole('link', { name: 'Rossi' }))
		expect(router.state.location.pathname).toBe(`/p/shopOwners/id/${rossi._id}`)
	})

	it('says so when nothing matches', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([]) })
		await renderRoute(MANAGE)

		expect(await screen.findByText('No shopOwner found.')).toBeInTheDocument()
	})

	it('reports a failure', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: { errors: [graphQLError('Errore', 'Elenco non disponibile', 500)], status: 500 } })
		await renderRoute(MANAGE)

		expect(await screen.findByRole('alert')).toHaveTextContent('Elenco non disponibile')
	})

	/**
	 * ⚠️ Search, sort and paging are all the server's job, and these variables are what assert it. Doing
	 * any of the three in the browser means fetching the whole `shopOwner` collection first — every
	 * operator downloading every record to look at twenty rows, on a collection that grows without
	 * bound. The table component must never gain a client-side filter or comparator.
	 */
	it('asks the server for one page, sorted and unfiltered', async () => {
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
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
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([rossi], 100) })
		await renderRoute(`${MANAGE}?page=3&pageSize=25`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ offset: 50, limit: 25 })
		})
	})

	it('sends the search term from the URL', async () => {
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
		await renderRoute(`${MANAGE}?search=rossi`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ search: 'rossi' })
		})
		expect(screen.getByLabelText('Search shopOwner')).toHaveValue('rossi')
	})

	// The search box is debounced, so the URL — and the round-trip — happens once the operator stops
	// typing rather than once per keystroke.
	it('pushes a typed search into the URL and returns to the first page', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi], 100) })
		const { router } = await renderRoute(`${MANAGE}?page=4`)

		await userEvent.type(screen.getByLabelText('Search shopOwner'), 'ross')

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ search: 'ross', page: 1 })
		})
	})

	it('sorts by the column that was clicked, ascending', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(header('First name'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'FIRST_NAME', sortDir: 'ASC' })
	})

	it('flips the direction when the sorted column is clicked again', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(header('Last name'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'LAST_NAME', sortDir: 'DESC' })
	})

	// Sorting reorders the whole result set, so page 4 of the old order has nothing to do with page 4 of
	// the new one. Staying put would land the operator on a page of unrelated rows.
	it('returns to the first page when the sort changes', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi], 100) })
		const { router } = await renderRoute(`${MANAGE}?page=4`)

		await userEvent.click(header('RegisteredAt'))

		expect(router.state.location.search).toMatchObject({ page: 1 })
	})

	// The address column sorts by CITY: the full string is composed client-side and is not an index,
	// and sorting people by street name is not a thing anyone wants.
	it('sorts the address column by town', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(header('Address'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'CITY' })
	})

	it('tells assistive technology which column is sorted, and which way', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
		await renderRoute(`${MANAGE}?sortBy=FIRST_NAME&sortDir=DESC`)

		expect(await screen.findByRole('columnheader', { name: 'First name' })).toHaveAttribute('aria-sort', 'descending')
		expect(screen.getByRole('columnheader', { name: 'Last name' })).toHaveAttribute('aria-sort', 'none')
	})

	it('reports an ascending sort as ascending', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi]) })
		await renderRoute(`${MANAGE}?sortBy=FIRST_NAME&sortDir=ASC`)

		expect(await screen.findByRole('columnheader', { name: 'First name' })).toHaveAttribute('aria-sort', 'ascending')
	})

	it('pages through the result set from the URL', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi], 41) })
		const { router } = await renderRoute(MANAGE)

		await userEvent.click(await screen.findByRole('button', { name: 'Page 3' }))

		expect(router.state.location.search).toMatchObject({ page: 3 })
	})

	it('sizes the pager from the server total, not from the rows on screen', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi, bianchi], 41) })
		await renderRoute(MANAGE)

		expect(await screen.findByText('1–20 of 41')).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rossi, bianchi], 41) })
		await renderRoute(MANAGE)

		await screen.findByText('Rossi')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
