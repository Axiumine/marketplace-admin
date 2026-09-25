import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { nextSort, SEARCH_DEBOUNCE_MS, statusOf } from '@/features/shopOwners/TblShopOwners'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

const MANAGE = '/p/shopOwners/manage-shopOwners'

/**
 * The three state fields every row carries, `null` on an account in none of those states.
 *
 * ⚠️ `null` and not `false` on all three: `waitApprov` is `$unset` on approval and `disabled` with its
 * pair on re-enabling, while `deleted` is a timestamp rather than a flag (ADR-011). The wire therefore
 * never carries a `false`, and a fixture that invents one tests a document shape the backend cannot
 * produce.
 */
const LIVE = { waitApprov: null, disabled: null, disabledBy: null, disabledReason: null, deleted: null }

const rivers = {
	_id: '65f0000000000000000000f1',
	registeredAt: '2026-02-01T08:05:45.000Z',
	email: 'mark.rivers@example.com',
	...LIVE,
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
	...LIVE,
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
	...LIVE,
	waitApprov: true,
	personalData: null
}

/**
 * A trading account an admin has suspended, with the reason ADR-044 makes mandatory.
 *
 * ⚠️ The reason is plain text here because this service is the one that can read it: `disabledReason` is
 * randomly encrypted (ADR-029) and the shop-owner services hold ciphertext they have no data key for.
 */
const suspended = {
	...rivers,
	_id: '65f0000000000000000000f4',
	email: 'suspended.seller@example.com',
	personalData: { ...rivers.personalData, firstName: 'Paul', lastName: 'Stone' },
	disabled: true,
	disabledBy: '65f00000000000000000000a',
	disabledReason: 'Counterfeit listings, ticket 8812.'
}

/** An account `shopOwnerDel` has closed, which also withdrew its storefront (ADR-045). */
const closed = {
	...rivers,
	_id: '65f0000000000000000000f5',
	email: 'closed.seller@example.com',
	personalData: { ...rivers.personalData, firstName: 'Nora', lastName: 'Vale' },
	deleted: '2026-05-01T00:00:00.000Z'
}

const page = (items: unknown[], total = items.length) => ({ data: { shopOwnersActiveTbl: { total, items } } })

const header = (name: string) => screen.getByRole('button', { name })

describe('statusOf', () => {
	it('reads an approved, enabled account as active', () => {
		expect(statusOf({ waitApprov: false, disabled: false, deleted: false })).toBe('Active')
	})

	it('reads an account waiting for an admin as pending', () => {
		expect(statusOf({ waitApprov: true, disabled: false, deleted: false })).toBe('Pending approval')
	})

	/*
	 * Precedence, not preference. A suspended account that also carries `waitApprov` is suspended first:
	 * reporting it as "Pending approval" would put it in the approval queue, which is not where an admin
	 * deals with a suspension.
	 */
	it('reports a suspended account as suspended even when it is also waiting for approval', () => {
		expect(statusOf({ waitApprov: true, disabled: true, deleted: false })).toBe('Suspended')
	})

	it('reports a closed account as closed', () => {
		expect(statusOf({ waitApprov: false, disabled: false, deleted: true })).toBe('Closed')
	})

	/*
	 * ⚠️ The state that has to be its own name, and the reason there are four filters rather than three
	 * (ADR-049). `shopOwnerDel` stamps `deleted` and leaves the suspension trio exactly as it found it, so
	 * this pair is a real document — and calling it merely "Suspended" would offer an admin a lift that
	 * leaves the account closed.
	 */
	it('reports a closed account that was suspended first as both', () => {
		expect(statusOf({ waitApprov: false, disabled: true, deleted: true })).toBe('Closed & suspended')
	})
})

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
	 * only by guessing its URL — the accounts an admin opened this page to act on.
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

	it('marks the account waiting for an admin, and only that one', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([selfRegistered, rivers]) })
		await renderRoute(MANAGE)

		const pendingRow = (await screen.findByText(selfRegistered.email)).closest('tr') as HTMLElement
		expect(within(pendingRow).getByText('Pending approval')).toBeInTheDocument()

		// The approved account reads "Active" rather than nothing at all: an empty status cell is
		// indistinguishable from a column that failed to render.
		const activeRow = (await screen.findByText('Rivers')).closest('tr') as HTMLElement
		expect(within(activeRow).getByText('Active')).toBeInTheDocument()
	})

	/*
	 * The swatch marks the approval queue and nothing else. Painted on the label rather than on the flag,
	 * so the suspended row below — which carries `waitApprov` too, since `shopOwnerDel` and
	 * `shopOwnerUpdateStatus` write independent fields — reads as suspended and stays unpainted.
	 */
	it('paints the swatch on the pending row alone', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([selfRegistered, { ...suspended, waitApprov: true }]) })
		await renderRoute(MANAGE)

		expect(await screen.findByText('Pending approval')).toHaveClass('account-wait-approv')

		// Scoped to the row: the dropdown carries the word "Suspended" too, and an unscoped query would
		// assert the absence of a class on an `<option>` that never had one.
		const row = within((await screen.findByText(suspended.email)).closest('tr') as HTMLElement)
		expect(row.getByText('Suspended')).not.toHaveClass('account-wait-approv')
	})

	/**
	 * ⚠️ **The row reads its own flags rather than the filter in the URL**, which is what this asserts by
	 * standing on the default Active filter: a suspended or closed account arriving on a cached page reads
	 * as what it is instead of as trading.
	 */
	it.each([
		{ label: 'Suspended', row: suspended },
		{ label: 'Closed', row: closed },
		{ label: 'Closed & suspended', row: { ...closed, disabled: true } }
	])('renders a $label account as $label', async ({ label, row }) => {
		stubGraphQL({ ShopOwnersActiveTbl: page([row]) })
		await renderRoute(MANAGE)

		const cells = within((await screen.findByText(row.email)).closest('tr') as HTMLElement)
		expect(cells.getByText(label)).toBeInTheDocument()
	})

	/*
	 * The reason rides under the status, and only this tier can read it at all — the shop-owner services
	 * hold ciphertext (ADR-029). An account suspended before ADR-044 carries the flag and no reason, and
	 * the row then says "Suspended" and stops rather than printing an empty line that claims one was
	 * recorded.
	 */
	it('shows the suspension reason under the status, and nothing when there is none', async () => {
		stubGraphQL({
			ShopOwnersActiveTbl: page([
				suspended,
				{ ...suspended, _id: '65f0000000000000000000f6', email: 'legacy@example.com', disabledReason: null }
			])
		})
		await renderRoute(`${MANAGE}?status=suspended`)

		const withReason = within((await screen.findByText(suspended.email)).closest('tr') as HTMLElement)
		expect(withReason.getByText('Counterfeit listings, ticket 8812.')).toBeInTheDocument()

		const legacy = within((await screen.findByText('legacy@example.com')).closest('tr') as HTMLElement)
		expect(legacy.getByRole('cell', { name: 'Suspended' })).toBeInTheDocument()
	})

	/**
	 * ⚠️ Email and Status carry no sort, and the two assertions are one rule seen from both sides. There
	 * is no ordering to offer: `login.email` is CSFLE ciphertext and no algorithm here preserves one, the
	 * status is composed in the browser out of three fields the filter has already pinned, and neither has
	 * a value in the backend's sort enum. A header button would send `sortBy: undefined` at a NonNull
	 * argument and empty the table, and an `aria-sort` would promise a screen-reader user an ordering that
	 * does not exist.
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
	 * ⚠️ Search, sort, filtering and paging are all the server's job, and these variables are what assert
	 * it. Doing any of the four in the browser means fetching the whole `shopOwner` collection first —
	 * every admin downloading every record to look at twenty rows, on a collection that grows without
	 * bound. The table component must never gain a client-side filter or comparator.
	 *
	 * `disabled` and `deleted` travel as required booleans because the service has no "either" state: that
	 * pair leads all four `tbl_active_*` indexes, and leaving either unbound turns the sort into a blocking
	 * in-memory one (ADR-049).
	 */
	it('asks the server for one page of live, enabled accounts, sorted and unsearched', async () => {
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(MANAGE)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({
			offset: 0,
			limit: 20,
			disabled: false,
			deleted: false,
			// `null`, not `''`: an empty box is "no filter". An empty string is a filter that matches
			// everything by accident, and the backend has to special-case it.
			search: null,
			sortBy: 'LAST_NAME',
			sortDir: 'ASC'
		})
	})

	/**
	 * ⚠️ **The four states as a pair of booleans, each asserted separately.** The two flags are independent
	 * — `shopOwnerDel` never touches the suspension trio — so the fourth row here is a document that exists
	 * and that this table could not ask for at all before ADR-049: it hard-wired both flags to absent, so a
	 * suspension removed an account from the only list of shop owners there is.
	 *
	 * The dropdown's own value is asserted with the variables, because a filter the URL honours and the
	 * control does not show is a screen that lies about what it is listing.
	 */
	it.each([
		{ status: 'suspended', disabled: true, deleted: false },
		{ status: 'closed', disabled: false, deleted: true },
		{ status: 'closedSuspended', disabled: true, deleted: true }
	])('asks for the $status accounts when the URL says so', async ({ status, disabled, deleted }) => {
		const stub = stubGraphQL({ ShopOwnersActiveTbl: page([suspended]) })
		await renderRoute(`${MANAGE}?status=${status}`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ disabled, deleted })
		})
		expect(screen.getByLabelText('Status')).toHaveValue(status)
	})

	/*
	 * The exact four rather than "contains Closed": the way this goes wrong is a state that exists in the
	 * service and not in the dropdown, which is how the suspended and closed accounts became unreachable
	 * from this screen in the first place.
	 */
	it('offers the four account states, and no others', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		await renderRoute(MANAGE)

		await screen.findByText('Rivers')
		expect(
			within(screen.getByLabelText('Status'))
				.getAllByRole('option')
				.map((option) => option.textContent)
		).toEqual(['Active', 'Suspended', 'Closed', 'Closed & suspended'])
	})

	// Back to the first page: the four sets are different sizes, and page 7 of the one the admin was
	// standing on is very often past the end of the one they asked for.
	it('pushes a chosen filter into the URL and returns to the first page', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers], 100) })
		const { router } = await renderRoute(`${MANAGE}?page=4`)

		await userEvent.selectOptions(screen.getByLabelText('Status'), 'closed')

		expect(router.state.location.search).toMatchObject({ status: 'closed', page: 1 })
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

	// The search box is debounced, so the URL — and the round-trip — happens once the admin stops
	// typing rather than once per keystroke.
	it('pushes a typed search into the URL and returns to the first page', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers], 100) })
		const { router } = await renderRoute(`${MANAGE}?page=4`)

		await userEvent.type(screen.getByLabelText('Search shopOwner'), 'ross')

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ search: 'ross', page: 1 })
		})
	})

	/*
	 * ⚠️ B26. `searchInput`/`debouncedSearch` used to be seeded from `query.search` only once, at mount.
	 * Back restores the URL to what it was before the admin typed, but the stale local `debouncedSearch`
	 * still held what they typed — so the push effect saw the two disagree and immediately re-pushed the
	 * old term as a *third* history entry, undoing the Back the admin had just done and leaving Forward
	 * pointed at nothing useful.
	 */
	it('does not undo a Back navigation by re-pushing the search the admin had typed', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		const { router } = await renderRoute(`${MANAGE}?search=rivers`)

		await userEvent.type(screen.getByLabelText('Search shopOwner'), 'x')
		await waitFor(
			() => {
				expect(router.state.location.search).toMatchObject({ search: 'riversx' })
			},
			// Generous on purpose: this waits out a real `SEARCH_DEBOUNCE_MS` timer, and the default 1000ms
			// budget leaves little room on a machine running the rest of the suite in parallel.
			{ timeout: 5000 }
		)
		expect(router.history.length).toBe(2)

		router.history.back()

		await waitFor(
			() => {
				expect(router.state.location.search).toMatchObject({ search: 'rivers' })
			},
			{ timeout: 5000 }
		)
		// The box's own state and the router's are two different updates — asserted separately, and both
		// through `waitFor`, so this does not race which of the two settles first.
		await waitFor(
			() => {
				expect(screen.getByLabelText('Search shopOwner')).toHaveValue('rivers')
			},
			{ timeout: 5000 }
		)
		// The URL settled on what Back asked for and stayed there — no third entry pushed behind it.
		expect(router.history.length).toBe(2)
		expect(router.state.location.search).toMatchObject({ search: 'rivers' })
	})

	/*
	 * The guard the sync-from-URL effect opens with (`query.search === synced.current`) only ever reads
	 * true when the URL is echoing back the admin's own edit — the round trip this component's own push
	 * effect just started. Every other way `query.search` can move (Back, Forward, a bookmark) reaches
	 * this effect with the two disagreeing, which is exactly what the test above already covers.
	 *
	 * This one covers the true branch instead: it types a second character while the first edit's own
	 * round trip is still in flight, so the echo lands on a `query.search` that already equals what the
	 * push effect just wrote to `synced.current` — the one moment the guard is the only thing standing
	 * between the box and being reset out from under a keystroke the admin has not sent anywhere yet.
	 */
	it('does not let its own edit echoing back overwrite a keystroke typed while it was in flight', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers]) })
		const { router } = await renderRoute(`${MANAGE}?search=rivers`)
		const input = screen.getByLabelText('Search shopOwner')

		vi.useFakeTimers()
		try {
			// Fires the mount-time debounce timer for real before the fake clock takes over — it is seeded
			// with the initial value and firing it here is a no-op, but left pending it could otherwise land
			// mid-sequence below and regress `debouncedSearch` back to the seeded value.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
			})

			act(() => {
				fireEvent.change(input, { target: { value: 'riversx' } })
			})
			act(() => {
				// The debounce elapses synchronously here: the push effect runs, sets `synced.current` to
				// 'riversx' and starts navigating there — still in flight, nothing has round-tripped through
				// the router yet, so nothing has read `query.search` again since it last changed.
				vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
				// One more keystroke, in the same synchronous turn — before the navigation above gets a
				// chance to resolve and this component sees `query.search` become 'riversx' too.
				fireEvent.change(input, { target: { value: 'riversxy' } })
			})
		} finally {
			vi.useRealTimers()
		}

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ search: 'riversx' })
		})
		// The router settling is not the same moment as the sync-from-URL effect it triggers actually
		// committing — an empty `act` flushes that render rather than racing it, the same way the two
		// separate `waitFor`s just above do it for the Back-navigation case.
		await act(async () => {})
		// The echo of the admin's own edit must not stomp what they typed after sending it — only a
		// search value that moved for some other reason resyncs the box.
		expect(input).toHaveValue('riversxy')
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
	// the new one. Staying put would land the admin on a page of unrelated rows.
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

	// Every row shape in one snapshot: the trading account, the self-registered one and the suspended one,
	// so the em dashes, the pending badge and the reason line are pinned as markup rather than only as text.
	it('renders', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: page([rivers, white, selfRegistered, suspended], 41) })
		await renderRoute(MANAGE)

		await screen.findByText('Rivers')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
