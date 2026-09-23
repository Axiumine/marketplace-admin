import type { GraphQlShopOwnersTblSortField, GraphQlSortDirection } from '@gql/adminResource/graphql'
import { Link } from '@tanstack/react-router'
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { ShopOwnersActiveTblDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Pagination } from '@/components/ui/Pagination'
import { SelectField } from '@/components/ui/SelectField'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import type { AccountStatus } from '@/lib/accountStatus'
import { ACCOUNT_FILTER, ACCOUNT_STATUSES, closedOrSuspendedLabel } from '@/lib/accountStatus'
import { EMPTY_CELL, formatAddress, formatDate } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

/** How long the search box waits after the last keystroke before it costs a round-trip. */
export const SEARCH_DEBOUNCE_MS = 300

export interface ShopOwnersQuery {
	/**
	 * Which of the four account states the table is looking at — the same four the customers table
	 * offers, from the same module, because an admin acts on the two tiers in the same way (platform
	 * owner, 2026-08-29).
	 *
	 * ⚠️ **Not a cosmetic filter: without it this table cannot see a suspended or a closed shop owner at
	 * all.** `shopOwnersActiveTbl` used to hard-wire both flags to absent, so `shopOwnerUpdateStatus`
	 * suspending an account removed it from the only list of shop owners there is, and `shopOwnerDel`
	 * removed it again (ADR-049).
	 */
	status: AccountStatus
	search: string
	page: number
	pageSize: number
	sortBy: GraphQlShopOwnersTblSortField
	sortDir: GraphQlSortDirection
}

interface Row {
	_id: string
	email: string
	firstName: string
	lastName: string
	registeredAt: string
	address: string
	status: string
	/**
	 * Why this account was suspended, and `null` on every account that is not.
	 *
	 * ⚠️ **This tier is the only one that can read it at all.** `disabledReason` is randomly encrypted
	 * (ADR-044, ADR-029), so the shop-owner services hold ciphertext they have no data key for — the
	 * admin surface decrypts it because it is the surface the reason was written for.
	 */
	reason: string | null
}

/** The state a shop owner is in before an admin has approved them, and the only one with a swatch. */
export const PENDING_APPROVAL = 'Pending approval'

/**
 * The one thing the Status column says about the account, out of the three flags that can say it.
 *
 * The first two are the two flags both tiers carry, so they are read by the shared helper and in its
 * order: a closed account that was suspended first is both, and saying only "Suspended" would send an
 * admin to lift a suspension that leaves the account closed. `waitApprov` is what is left, and it is
 * last because a suspended account waiting for approval is suspended first — the approval queue is not
 * where an admin deals with it.
 *
 * ⚠️ `waitApprov` and `disabled` are absent-or-true on the wire — the collection stores `true` or
 * `$unset`s, never `false` — so both are read on truthiness before they get here. `deleted` is a
 * timestamp rather than a flag (ADR-011), so presence is what marks it.
 */
export const statusOf = (row: { waitApprov: boolean; disabled: boolean; deleted: boolean }): string =>
	closedOrSuspendedLabel(row) ?? (row.waitApprov ? PENDING_APPROVAL : ACCOUNT_FILTER.active.label)

/**
 * The **sortable** columns, each paired with the backend sort field it maps to. A column absent from
 * this map renders a plain header rather than a button — see the header block below.
 *
 * First name and lastName are two columns, not one composed "First name" cell. A concatenation is not a sortable
 * thing — the backend indexes `personalData.firstName` and `personalData.lastName` separately and nothing
 * indexes the pair joined by a space — so splitting them is what makes either sort reachable at all.
 * Surname-first is the ordering an admin scanning a list of people expects.
 *
 * `Address` sorts by CITY: the full address string is composed client-side and, again, is not an
 * index. Sorting by town is the part that is actually useful.
 *
 * ⚠️ **`email` and `status` are deliberately not here.** `login.email` is CSFLE ciphertext in MongoDB
 * and no encryption algorithm on this platform preserves an ordering, so an email sort would have to
 * fetch and sort the whole collection in memory; the status is composed here out of three fields, two of
 * which the filter above has already pinned to one value for the whole page. Adding either to this map
 * does not add a column sort, it adds a server error.
 */
const SORT_FIELD = {
	lastName: 'LAST_NAME',
	firstName: 'FIRST_NAME',
	registeredAt: 'REGISTERED_AT',
	address: 'CITY'
} as const satisfies Record<string, GraphQlShopOwnersTblSortField>

type SortableColumn = keyof typeof SORT_FIELD

/** Whether this column can be ordered by, i.e. whether the backend has an index and an enum value for it. */
const sortFieldOf = (columnId: string): GraphQlShopOwnersTblSortField | undefined =>
	SORT_FIELD[columnId as SortableColumn] as GraphQlShopOwnersTblSortField | undefined

// Every table behaviour is opt-in in v9, and this table wants none of them: paging, sorting and
// searching are the server's job, so the empty feature set is the whole configuration. It is a type
// as much as a value — the column helper and the table are both parameterised on it, so a column
// option or a row method belonging to an unregistered feature does not typecheck.
const features = tableFeatures({})

const column = createColumnHelper<typeof features, Row>()

/**
 * The next sort state for a header click: a new column starts ascending, the current column flips.
 * Pure, and exported, because it is the only branch in the header that can be wrong.
 */
export const nextSort = (
	clicked: GraphQlShopOwnersTblSortField,
	current: GraphQlShopOwnersTblSortField,
	dir: GraphQlSortDirection
): { sortBy: GraphQlShopOwnersTblSortField; sortDir: GraphQlSortDirection } =>
	clicked === current ? { sortBy: clicked, sortDir: dir === 'ASC' ? 'DESC' : 'ASC' } : { sortBy: clicked, sortDir: 'ASC' }

const ariaSort = (
	field: GraphQlShopOwnersTblSortField,
	current: GraphQlShopOwnersTblSortField,
	dir: GraphQlSortDirection
): 'ascending' | 'descending' | 'none' => {
	if (field !== current) return 'none'
	return dir === 'ASC' ? 'ascending' : 'descending'
}

/**
 * The shopOwners table.
 *
 * Pure with respect to the URL: it receives the whole query state as props and reports changes through
 * `onQueryChange`. The route owns the search params, so a sort or a page is a real navigation — back
 * works, and a link to page 4 sorted by town is a link someone can send.
 *
 * ⚠️ Search, sort, filtering and paging all happen in MongoDB, against the indexes marketplace-db-setup
 * builds for exactly these four fields — each of them led by `{deleted, disabled}`, which is why the
 * status filter is two required booleans rather than an optional narrowing. Never move any of the four
 * into the browser: doing so means fetching the whole `shopOwner` collection to show twenty rows, and the
 * cost grows with every signup.
 *
 * There is deliberately no row-selection checkbox column. Nothing here acts on a selection, and a
 * checkbox that collects one is a control that promises a bulk action the app does not have.
 */
export const TblShopOwners = ({
	query,
	onQueryChange
}: {
	query: ShopOwnersQuery
	onQueryChange: (next: Partial<ShopOwnersQuery>) => void
}) => {
	const [searchInput, setSearchInput] = useState(query.search)
	const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

	/**
	 * The search value the box and the URL last agreed on — moved by whichever side changes it, so the
	 * two effects below can tell "the admin typed something new" apart from "the URL moved on its own"
	 * (a Back/Forward navigation, a bookmark) without comparing a `debouncedSearch` that has not caught
	 * up yet against a `query.search` that just did.
	 */
	const synced = useRef(query.search)

	/*
	 * Pushes the admin's own edit, once the debounce has settled — the single source of truth stays the
	 * URL rather than this local state. Resetting to page 1 matters — a narrower search almost always
	 * has fewer pages than the one the admin is standing on, and page 7 of 2 renders empty.
	 *
	 * ⚠️ **Declared before the sync effect below, and that order is load-bearing.** `onQueryChange` is a
	 * fresh function every render the route re-executes for — including a Back/Forward navigation — so
	 * this effect re-runs on exactly the renders where the sync effect is also about to move
	 * `synced.current`. Running first, it still reads the value the two agreed on *before* that
	 * happens. Reversed, it would read a `synced.current` the other effect had already moved to the new
	 * `query.search`, find `debouncedSearch` — still whatever the admin had typed before the navigation
	 * — disagreeing with it, and push the stale term right back: the same bug this pair exists to fix,
	 * reached through the sync effect instead of around it.
	 */
	useEffect(() => {
		if (debouncedSearch === synced.current) return

		synced.current = debouncedSearch
		onQueryChange({ search: debouncedSearch, page: 1 })
	}, [debouncedSearch, onQueryChange])

	/*
	 * Re-syncs the box — and, through it, the debounce — to a `query.search` that moved for a reason
	 * that was not the effect above: a Back/Forward navigation, a bookmark, a link from elsewhere on the
	 * page. Without this, `searchInput`/`debouncedSearch` stay at whatever the admin last typed, the
	 * effect above sees that disagree with the new `query.search` and immediately re-pushes the old term
	 * as a new history entry — silently undoing Back and polluting forward history.
	 */
	useEffect(() => {
		if (query.search === synced.current) return

		synced.current = query.search
		setSearchInput(query.search)
	}, [query.search])

	const [result] = useQuery({
		query: ShopOwnersActiveTblDocument,
		variables: {
			offset: (query.page - 1) * query.pageSize,
			limit: query.pageSize,
			disabled: ACCOUNT_FILTER[query.status].disabled,
			deleted: ACCOUNT_FILTER[query.status].deleted,
			search: query.search === '' ? null : query.search,
			sortBy: query.sortBy,
			sortDir: query.sortDir
		},
		context: CTX_ADMIN_RESOURCE
	})

	const page = result.data?.shopOwnersActiveTbl
	// ⚠️ Every `personalData` read below is optional-chained, and has to be: a shop owner who registered
	// themselves on the public site has none until onboarding fills it in, and those are precisely the
	// rows an admin came here to approve. Reading `item.personalData.firstName` unguarded throws
	// while mapping and takes the whole table down with it, pending rows and trading rows alike.
	const rows: Row[] = (page?.items ?? []).map((item) => ({
		_id: item._id,
		email: item.email,
		firstName: item.personalData?.firstName ?? EMPTY_CELL,
		lastName: item.personalData?.lastName ?? EMPTY_CELL,
		registeredAt: formatDate(item.registeredAt),
		// Not `item.personalData?.address` — `formatAddress` takes the whole block, so the guard has to be
		// on the object rather than on one of its members.
		address: item.personalData == null ? EMPTY_CELL : formatAddress(item.personalData.address),
		// The three flags are absent-or-true or, for `deleted`, absent-or-a-timestamp, so each is derived
		// from presence here and the rest of the component reads one composed string.
		status: statusOf({
			waitApprov: item.waitApprov === true,
			disabled: item.disabled === true,
			deleted: item.deleted != null
		}),
		reason: item.disabledReason ?? null
	}))

	const columns = column.columns([
		// The row's link, and it lives on the email cell rather than on the surname: the address is the
		// one column that is filled in on every row, so a pending registration is still reachable. On the
		// surname it would be an em dash for exactly the accounts an admin needs to open.
		column.accessor('email', {
			header: 'Email',
			cell: (info) => (
				<Link to="/p/shopOwners/id/$_id" params={{ _id: info.row.original._id }} className="underline">
					{info.getValue()}
				</Link>
			)
		}),
		column.accessor('lastName', { header: 'Last name' }),
		column.accessor('firstName', { header: 'First name' }),
		column.accessor('registeredAt', { header: 'RegisteredAt' }),
		column.accessor('address', { header: 'Address' }),
		/*
		 * The reason rides under the status rather than in a column of its own, as on the customers table:
		 * it is set on exactly the rows the two suspended filters show and empty on every row the other two
		 * do, so a column would be blank down the whole default page.
		 *
		 * ⚠️ Guarded on the value and not on the status text. A legacy suspension predating ADR-044 carries
		 * the flag and no reason, and `?? null` above turns that into a row that says "Suspended" and stops
		 * — which is honest — rather than an empty line pretending a reason was recorded.
		 */
		column.accessor('status', {
			header: 'Status',
			cell: (info) => {
				const { reason } = info.row.original
				const status = info.getValue()

				return (
					<>
						{/* The same `account-wait-approv` swatch the detail page paints its header with, so the
						    state an admin sees in the list is the state they see after clicking through. Painted
						    on the label rather than on the flag: a suspended account can be waiting for approval
						    too, and that row says "Suspended". */}
						{status === PENDING_APPROVAL ? <span className="account-wait-approv rounded-box px-2 py-1">{status}</span> : status}
						{reason === null ? null : <span className="block text-xs text-tip">{reason}</span>}
					</>
				)
			}
		})
	])

	// The React Compiler skips auto-memoizing this component because `useTable` hands back functions it
	// cannot prove stable — see the `react-hooks/incompatible-library` override in eslint.config.js for
	// why that is accepted here rather than worked around.
	//
	// `rows` is already the one page the server was asked for, and with `features` empty there is no
	// sorting, filtering or pagination in the table at all — nothing to keep manual. The core row model
	// is built in, so the v8 `getCoreRowModel()` option is gone with it.
	const table = useTable({
		features,
		data: rows,
		columns
	})

	return (
		<div className="flex flex-col gap-4">
			<TextField
				label="Search shopOwner"
				type="search"
				value={searchInput}
				onChange={(event) => {
					setSearchInput(event.target.value)
				}}
			/>

			<div className="sm:w-56">
				<SelectField
					label="Status"
					value={query.status}
					onChange={(event) => {
						// Back to page 1: the four sets are different sizes, and page 7 of the one an admin was
						// standing on is very often past the end of the one they asked for.
						onQueryChange({ status: event.target.value as AccountStatus, page: 1 })
					}}
				>
					{ACCOUNT_STATUSES.map((value) => (
						<option key={value} value={value}>
							{ACCOUNT_FILTER[value].label}
						</option>
					))}
				</SelectField>
			</div>

			{result.error === undefined ? null : <Alert tone="error">{messageOf(result.error)}</Alert>}

			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead>
						{table.getHeaderGroups().map((group) => (
							<tr key={group.id}>
								{group.headers.map((header) => {
									const field = sortFieldOf(header.column.id)
									const label = flexRender(header.column.columnDef.header, header.getContext())

									// ⚠️ A column with no entry in SORT_FIELD gets no button and no `aria-sort` at all.
									// Rendering the button unconditionally would send `sortBy: undefined` to a NonNull
									// enum argument, which the server refuses — the click would empty the table rather
									// than sort it — and would promise a screen-reader user an ordering that does not
									// exist.
									return (
										<th
											key={header.id}
											scope="col"
											className="border-b border-palette-bg3/20 p-2"
											aria-sort={field === undefined ? undefined : ariaSort(field, query.sortBy, query.sortDir)}
										>
											{field === undefined ? (
												<span className="font-bold">{label}</span>
											) : (
												<button
													type="button"
													className="font-bold"
													onClick={() => {
														onQueryChange({ ...nextSort(field, query.sortBy, query.sortDir), page: 1 })
													}}
												>
													{label}
												</button>
											)}
										</th>
									)
								})}
							</tr>
						))}
					</thead>

					<tbody>
						{table.getRowModel().rows.map((row) => (
							<tr key={row.id} className="border-b border-palette-bg3/10">
								{row.getAllCells().map((cell) => (
									<td key={cell.id} className="p-2">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{result.fetching ? <Spinner label="Loading shop owners" /> : null}
			{/*
			 * An empty page is an answer here and has to read as one — an admin who filtered to Closed and
			 * found nobody has learnt that no shop owner has left. Left as bare headers it reads as a screen
			 * that failed to load.
			 */}
			{!result.fetching && rows.length === 0 ? <p className="text-tip">No shopOwner found.</p> : null}

			<Pagination
				page={query.page}
				pageSize={query.pageSize}
				total={page?.total ?? 0}
				onPageChange={(next) => {
					onQueryChange({ page: next })
				}}
			/>
		</div>
	)
}
