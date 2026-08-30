import type { GraphQlShopOwnersTblSortField, GraphQlSortDirection } from '@gql/adminResource/graphql'
import { Link } from '@tanstack/react-router'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { ShopOwnersActiveTblDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Pagination } from '@/components/ui/Pagination'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import { formatAddress, formatDate } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

/** How long the search box waits after the last keystroke before it costs a round-trip. */
export const SEARCH_DEBOUNCE_MS = 300

export interface ShopOwnersQuery {
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
	waitApprov: boolean
}

/**
 * What a cell shows when the account has no `personalData` yet. An em dash rather than an empty cell:
 * a blank reads as a rendering fault, a dash reads as "nothing here", and the row still has an email
 * and a date that say who it is.
 */
export const EMPTY_CELL = '—'

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
 * fetch and sort the whole collection in memory; `waitApprov` has no index and only two states worth
 * distinguishing. Adding either to this map does not add a column sort, it adds a server error.
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

const column = createColumnHelper<Row>()

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
 * ⚠️ Search, sort and paging all happen in MongoDB, against the indexes marketplace-db-setup builds for
 * exactly these four fields. Never move any of the three into the browser: doing so means fetching the
 * whole `shopOwner` collection to show twenty rows, and the cost grows with every signup.
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

	// Pushing the debounced value up rather than querying on it directly keeps a single source of truth:
	// the URL. Resetting to page 1 matters — a narrower search almost always has fewer pages than the
	// one the admin is standing on, and page 7 of 2 renders empty.
	useEffect(() => {
		if (debouncedSearch !== query.search) onQueryChange({ search: debouncedSearch, page: 1 })
	}, [debouncedSearch, query.search, onQueryChange])

	const [result] = useQuery({
		query: ShopOwnersActiveTblDocument,
		variables: {
			offset: (query.page - 1) * query.pageSize,
			limit: query.pageSize,
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
		// `waitApprov` is absent-or-true on the wire — it is `$unset` on approval, never written `false`
		// — so the flag is derived from presence here and the rest of the component reads a boolean.
		waitApprov: item.waitApprov === true
	}))

	const columns = [
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
		column.accessor('waitApprov', {
			header: 'Status',
			// The same `account-wait-approv` swatch the detail page paints the header with, so the state
			// an admin sees in the list is the state they see after clicking through.
			cell: (info) =>
				info.getValue() ? <span className="account-wait-approv rounded-box px-2 py-1">Pending approval</span> : 'Active'
		})
	]

	// The React Compiler skips auto-memoizing this component because `useReactTable` hands back functions
	// it cannot prove stable — see the `react-hooks/incompatible-library` override in eslint.config.js
	// for why that is accepted here rather than worked around.
	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		// Paging, sorting and searching are all the server's job — `rows` is already the one page that was
		// asked for. `getCoreRowModel` is the only row model registered, which is what actually keeps the
		// table from re-sorting or re-filtering the page it was handed; `manualSorting` and
		// `manualFiltering` would only be read by the sorted and filtered row models, and there are none.
		// `manualPagination` is not decoration in the same way: it is what stops `getPageCount()` from
		// being derived from the length of the current page.
		manualPagination: true
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
								{row.getVisibleCells().map((cell) => (
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
