import type { GraphQlSortDirection } from '@gql/adminResource/graphql'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { OperationContext } from '@urql/core'
import { useState } from 'react'
import { useMutation, useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { UserUpdateStatusDocument } from '@/api/operations/adminResource/mutations'
import { UsersActiveTblDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { SelectField } from '@/components/ui/SelectField'
import { Spinner } from '@/components/ui/Spinner'
import { Toast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'

/**
 * Which accounts the table is looking at.
 *
 * ⚠️ **A filter and not a checkbox, because the backend has no "either" state to offer.** `disabled` and
 * `deleted` are `Boolean!` on `usersActiveTbl`, which is what keeps every page on the
 * `tbl_active_registeredAt` index — an unbound leading field turns the sort into a blocking in-memory one
 * on a collection that only grows. So suspending a customer does not grey their row: it moves them to the
 * other page, and the confirmation below says where they went.
 *
 * ⚠️ **There is no third `deleted` value here, and its absence is not an oversight.** Nothing on any tier
 * writes `user.deleted` — there is no `userDel` and a customer cannot close their own account either
 * (E19 §6, question 3) — so a "Deleted" option would be a view that is empty by construction. The day an
 * erasure path lands it is one entry in this table, one member in the route's zod enum, and the row's
 * status column already reads the flag.
 */
export type CustomerStatus = 'active' | 'suspended'

export interface CustomersQuery {
	status: CustomerStatus
	page: number
	pageSize: number
	sortDir: GraphQlSortDirection
}

/**
 * What each filter asks the service for, and the labels beside them.
 *
 * `deleted: false` in both rows rather than in neither: the argument is required, and pinning it here
 * keeps the two states the screen offers spelled out in one place instead of half in the query variables.
 */
const FILTER = {
	active: { label: 'Active', disabled: false, deleted: false },
	suspended: { label: 'Suspended', disabled: true, deleted: false }
} as const satisfies Record<CustomerStatus, { label: string; disabled: boolean; deleted: boolean }>

const STATUSES = Object.keys(FILTER) as readonly CustomerStatus[]

/**
 * ⚠️ **The only sortable column, and it stays the only one** (E19-S05). `GraphQLUsersTblSortField` has a
 * single member because the registration date is the only field on `user` left in the clear: the names and
 * the city are randomly encrypted (ADR-029), so a column sort on any of them would order the customer base
 * by ciphertext — stable, arbitrary, and indistinguishable from a working sort until somebody checks.
 *
 * Sent explicitly rather than left to the service's own default, so the wire says which ordering the screen
 * is showing rather than inheriting one that could change underneath it.
 */
const SORT_BY = 'REGISTERED_AT'

/** The registered-date header is a toggle, not a three-state control: there is nothing else to sort by. */
export const nextDir = (dir: GraphQlSortDirection): GraphQlSortDirection => (dir === 'ASC' ? 'DESC' : 'ASC')

const ariaSort = (dir: GraphQlSortDirection): 'ascending' | 'descending' => (dir === 'ASC' ? 'ascending' : 'descending')

/**
 * ⚠️ Both mutation and query answer types that name no `__typename` the document cache can invalidate on
 * its own — `userUpdateStatus` is a bare `Boolean!` — so the table would go on listing an account that has
 * just been suspended. On this screen that is not a stale read but a wrong answer to "did it work".
 *
 * Both typenames, not just the row: a page with no rows carries only `GraphQLUsersActiveTblPage` in its
 * response, so an operator who looked at an empty Suspended list before suspending anybody would still be
 * looking at it afterwards.
 */
const CTX_STATUS: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLUserActiveTbl', 'GraphQLUsersActiveTblPage']
})

interface Row {
	_id: string
	email: string
	registeredAt: string
	status: string
	disabled: boolean
}

/**
 * The one thing this row says about the account, out of the three flags that can say it.
 *
 * Ordered by what an operator has to act on first: an erased account is beyond a status switch, a suspended
 * one is the switch's own doing, and an unconfirmed address is the ordinary state of somebody who
 * registered an hour ago and has not opened the email yet. Reading them in any other order would report a
 * suspended account as "Awaiting confirmation" and send the operator to resend a link that changes nothing.
 *
 * ⚠️ `disabled` and `emailVerified` are absent-or-true on the wire — the collection stores `true` or
 * `$unset`s, never `false` — so both are read on truthiness. `deleted` is a timestamp rather than a flag
 * (ADR-011), so presence is what marks it.
 */
export const statusOf = (row: { disabled: boolean | null; deleted: string | null; emailVerified: boolean | null }): string => {
	if (row.deleted !== null) return 'Deleted'
	if (row.disabled === true) return 'Suspended'
	return row.emailVerified === true ? 'Active' : 'Awaiting confirmation'
}

/**
 * The confirmation for suspending a customer, in the browser's own dialog.
 *
 * ⚠️ It names the address rather than the id, because the address is what the support ticket carries — it
 * is also the only thing on the row that identifies a person at all, which is the point of ADR-029.
 *
 * ⚠️ It states what the click actually reaches, and since R54 that is both halves of every session: the
 * refresh lineage and the access token it minted. Warning about a window in which the device kept working
 * would send an operator looking for a gap that has been closed.
 */
export const suspendWarning = (email: string) =>
	`Suspend ${email}?\n\n` +
	'They are signed out of every device now, and cannot sign in again until the account is re-enabled.\n\n' +
	'Their access token ends with the sessions, so the device they are on stops working now rather than ' +
	'when the token would have expired.'

/** What the confirmation toast says once the write has landed. The sessions are half of the news. */
export const outcomeMessage = (email: string, disabled: boolean) =>
	disabled
		? `${email} is suspended, and every session they held has ended. The account is now under the Suspended filter.`
		: `${email} can sign in again.`

const column = createColumnHelper<Row>()

/**
 * The customers table (E19-S04).
 *
 * Pure with respect to the URL, like the shop-owners table: the whole query state arrives as props and
 * changes go back through `onQueryChange`, so a filter and a page are real navigations that survive a
 * reload and can be sent to somebody.
 *
 * ⚠️ **There is no search box, and adding one is what E19-S05 exists to refuse.** Every field a search
 * could match on `user` is encrypted — randomly, for all but the login address — so a term would be
 * compared against base64 and match nothing, on every account, without erroring. An input that silently
 * answers "no customers" is worse than an absent one.
 *
 * ⚠️ **No name, city or address column either, and for the same reason** — this is the table ADR-029 was
 * designed to make possible, not a shop-owner table over a different collection.
 */
export const TblCustomers = ({
	query,
	onQueryChange
}: {
	query: CustomersQuery
	onQueryChange: (next: Partial<CustomersQuery>) => void
}) => {
	/*
	 * What the last status write was about, kept because the wire cannot say it: the mutation answers a
	 * bare boolean and its variables carry an id, while the message an operator needs names the address.
	 *
	 * The toast is gated on the mutation *result* and not on this, which is what makes a second suspension
	 * show a second toast: urql clears a mutation's data when it is executed again, so the toast unmounts
	 * and remounts, and a dismissed one does not stay dismissed. See the note on `Toast`.
	 */
	const [intent, setIntent] = useState<{ email: string; disabled: boolean } | null>(null)

	const [result] = useQuery({
		query: UsersActiveTblDocument,
		variables: {
			offset: (query.page - 1) * query.pageSize,
			limit: query.pageSize,
			disabled: FILTER[query.status].disabled,
			deleted: FILTER[query.status].deleted,
			sortBy: SORT_BY,
			sortDir: query.sortDir
		},
		context: CTX_ADMIN_RESOURCE
	})

	const [statusResult, executeStatus] = useMutation(UserUpdateStatusDocument)

	const page = result.data?.usersActiveTbl
	const rows: Row[] = (page?.items ?? []).map((item) => ({
		_id: item._id,
		email: item.email,
		registeredAt: formatDate(item.registeredAt),
		status: statusOf(item),
		disabled: item.disabled === true
	}))

	const change = (row: Row, disabled: boolean) => {
		if (disabled && !window.confirm(suspendWarning(row.email))) return

		setIntent({ email: row.email, disabled })
		void executeStatus({ _id: row._id, disabled }, CTX_STATUS)
	}

	// The message belongs to a write that landed. `intent` outlives its own mutation — it is still set
	// while the next one is in flight — so the result is what decides whether there is anything to say.
	const done = statusResult.data?.userUpdateStatus === true ? intent : null

	const columns = [
		// No link, because there is no customer detail page to link to: the collection has one operator
		// lever and it is the button in the last column. A link here would have to lead somewhere.
		column.accessor('email', { header: 'Email' }),
		column.accessor('registeredAt', { header: 'Registered' }),
		column.accessor('status', { header: 'Status' }),
		column.display({
			id: 'action',
			header: 'Action',
			/*
			 * Driven by the row's own flag rather than by the filter in the URL. They agree today, and the
			 * row is the one that is still right if a page is rendered from a cache the filter has moved on
			 * from — a button offering to suspend an account that is already suspended is a wrong answer
			 * this way round, and an operator's second click on it is a no-op they cannot see.
			 */
			cell: (info) => {
				const row = info.row.original
				return row.disabled ? (
					<Button
						loading={statusResult.fetching}
						onClick={() => {
							change(row, false)
						}}
					>
						Enable
					</Button>
				) : (
					<Button
						variant="danger"
						loading={statusResult.fetching}
						onClick={() => {
							change(row, true)
						}}
					>
						Suspend
					</Button>
				)
			}
		})
	]

	// As on the shop-owners table: `getCoreRowModel` is the only row model registered, so nothing here can
	// re-sort or re-filter the page the server handed back, and `manualPagination` is what stops the page
	// count being derived from the length of that page.
	const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true })

	return (
		<div className="flex flex-col gap-4">
			<div className="sm:w-56">
				<SelectField
					label="Status"
					value={query.status}
					onChange={(event) => {
						// Back to page 1: the two sets are different sizes, and page 7 of the one an operator
						// was standing on is very often past the end of the one they asked for.
						onQueryChange({ status: event.target.value as CustomerStatus, page: 1 })
					}}
				>
					{STATUSES.map((value) => (
						<option key={value} value={value}>
							{FILTER[value].label}
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
									const sortable = header.column.id === 'registeredAt'
									const label = flexRender(header.column.columnDef.header, header.getContext())

									// ⚠️ Only the registered-date header is a button, and only it carries `aria-sort`.
									// A sort control on any other column would promise an ordering the service refuses
									// at schema validation — and would promise a screen-reader user one that, for the
									// encrypted columns, could never exist at all.
									return (
										<th
											key={header.id}
											scope="col"
											className="border-b border-palette-bg3/20 p-2"
											aria-sort={sortable ? ariaSort(query.sortDir) : undefined}
										>
											{sortable ? (
												<button
													type="button"
													className="font-bold"
													onClick={() => {
														onQueryChange({ sortDir: nextDir(query.sortDir), page: 1 })
													}}
												>
													{label}
												</button>
											) : (
												<span className="font-bold">{label}</span>
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

			{result.fetching ? <Spinner label="Loading customers" /> : null}
			{/*
			 * An empty page is an answer here and has to read as one — an operator who filtered to Suspended
			 * and found nobody has learnt that no customer is suspended, which is the good news. Left as bare
			 * headers it reads as a screen that failed to load.
			 */}
			{!result.fetching && rows.length === 0 ? <p className="text-tip">No customer found.</p> : null}

			<Pagination
				page={query.page}
				pageSize={query.pageSize}
				total={page?.total ?? 0}
				onPageChange={(next) => {
					onQueryChange({ page: next })
				}}
			/>

			{statusResult.error === undefined ? null : <Toast tone="error">{messageOf(statusResult.error)}</Toast>}
			{done === null ? null : <Toast tone="success">{outcomeMessage(done.email, done.disabled)}</Toast>}
		</div>
	)
}
