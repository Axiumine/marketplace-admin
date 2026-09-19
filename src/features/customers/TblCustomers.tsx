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
import { TextareaField } from '@/components/ui/TextareaField'
import { Toast } from '@/components/ui/Toast'
import type { AccountStatus } from '@/lib/accountStatus'
import { ACCOUNT_FILTER, ACCOUNT_STATUSES, closedOrSuspendedLabel } from '@/lib/accountStatus'
import { EMPTY_CELL, formatDate } from '@/lib/format'

/**
 * Which accounts the table is looking at — the four states of `@/lib/accountStatus`, the same four the
 * shopOwners table offers, because an admin acts on the two tiers in the same way.
 *
 * ⚠️ **Including the two closed states, and the fourth is why there are four.** `userDel` stamps
 * `deleted` and leaves the suspension trio alone (ADR-048), so a customer suspended and then closed
 * carries both flags and was listed by neither of the two filters this screen used to offer. A Closed
 * view lists accounts an admin has no lever over — there is no screen for `userDel` here, deliberately
 * (see `mutations.ts`) — and that is the point: the alternative was an account that no page could show.
 */
export interface CustomersQuery {
	status: AccountStatus
	page: number
	pageSize: number
	sortDir: GraphQlSortDirection
}

/**
 * ⚠️ **The only sortable column, and it stays the only one.** `GraphQLUsersTblSortField` has a single
 * member because the registration date is the only field on `user` left in the clear: the names and the
 * city are randomly encrypted (ADR-029), so a column sort on any of them would order the customer base by
 * ciphertext — stable, arbitrary, and indistinguishable from a working sort until somebody checks.
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
 * ⚠️ The wrapper, not the row, is what makes an *empty* filter invalidate too: a page with no rows still
 * carries `GraphQLUsersActiveTblPage` in its response, but none of `GraphQLUserActiveTbl` — an admin who
 * looked at an empty Suspended list before suspending anybody would still be looking at it afterwards if
 * only the row type were named here.
 */
const CTX_STATUS: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: [
		/*
		 * Stryker disable next-line StringLiteral: `GraphQLUserActiveTbl` never appears on the wire outside
		 * `usersActiveTbl.items`, and every response to that query — empty or not — carries the wrapper's
		 * `GraphQLUsersActiveTblPage` typename too (see the note above `collectTypenames` in urql's document
		 * cache: it walks the whole response, so the wrapper alone already gets every cached instance of this
		 * query invalidated). No sequence of filters or pages produces a cached `usersActiveTbl` result that
		 * carries this type without also carrying the wrapper's, so naming it here changes nothing this
		 * mutation invalidates — it is kept only because it names, in the reader's own words, what a
		 * suspension actually changed.
		 */
		'GraphQLUserActiveTbl',
		'GraphQLUsersActiveTblPage'
	]
})

interface Row {
	_id: string
	email: string
	registeredAt: string
	status: string
	disabled: boolean
	/**
	 * Whether the account is closed, and the one thing that takes the action button off the row.
	 *
	 * Read off `deleted` rather than off the filter in the URL, for the reason the button below is driven
	 * by `disabled` rather than by the filter: the row is what is still right when a page is rendered from
	 * a cache the filter has moved on from.
	 */
	closed: boolean
	/**
	 * Why this account was suspended, and `null` on every account that is not.
	 *
	 * ⚠️ **This screen is the only place it can be read at all.** `disabledReason` is randomly encrypted
	 * (ADR-044), so the shop-owner and customer services hold ciphertext they have no data key for — the
	 * admin surface decrypts it because it is the surface the reason was written for.
	 */
	reason: string | null
}

/**
 * The one thing this row says about the account, out of the three flags that can say it.
 *
 * Ordered by what an admin has to act on first: an erased account is beyond a status switch, a suspended
 * one is the switch's own doing, and an unconfirmed address is the ordinary state of somebody who
 * registered an hour ago and has not opened the email yet. Reading them in any other order would report a
 * suspended account as "Awaiting confirmation" and send the admin to resend a link that changes nothing.
 *
 * ⚠️ `disabled` and `emailVerified` are absent-or-true on the wire — the collection stores `true` or
 * `$unset`s, never `false` — so both are read on truthiness. `deleted` is a timestamp rather than a flag
 * (ADR-011), so presence is what marks it.
 */
export const statusOf = (row: { disabled: boolean | null; deleted: string | null; emailVerified: boolean | null }): string =>
	closedOrSuspendedLabel({ disabled: row.disabled === true, deleted: row.deleted !== null }) ??
	(row.emailVerified === true ? ACCOUNT_FILTER.active.label : 'Awaiting confirmation')

/**
 * The warning above the reason box, and the same prose the browser dialog used to carry.
 *
 * ⚠️ **No longer `window.confirm`, and that dialog could not have survived ADR-044.** A suspension now
 * carries a mandatory reason, and a native confirm takes no input — `window.prompt` would, and would then
 * be a required field with no label, no error line and no count against a cap the service enforces at
 * 1000. So the prose moved into a panel and kept its wording; `whitespace-pre-line` is what still renders
 * the paragraph break it was written with.
 *
 * ⚠️ **It no longer opens by naming the address, because the form's heading does.** The address is what
 * the support ticket carries and the only thing on the row that identifies a person at all — the point of
 * ADR-029 — so it is still on screen, once rather than twice.
 *
 * ⚠️ It states what the click actually reaches, and since R54 that is both halves of every session: the
 * refresh lineage and the access token it minted. Warning about a window in which the device kept working
 * would send an admin looking for a gap that has been closed.
 */
export const SUSPEND_WARNING =
	'They are signed out of every device now, and cannot sign in again until the account is re-enabled.\n\n' +
	'Their access token ends with the sessions, so the device they are on stops working now rather than ' +
	'when the token would have expired.'

/**
 * The cap the service enforces, restated here so the box can count down to it (ADR-044).
 *
 * ⚠️ **The collection does not carry this bound and never will.** `disabledReason` is randomly encrypted,
 * so `$jsonSchema` sees `binData` and cannot measure a string it is not allowed to read — the service's
 * own check is the only one there is, and this constant is the only warning an admin gets before it
 * answers 400.
 */
export const MAX_DISABLED_REASON = 1000

/**
 * Why the suspension is being applied, refused empty (ADR-044).
 *
 * ⚠️ **Mandatory, and not as a house style.** `dependencies: { disabled: ['disabledReason'] }` on the
 * collection refuses the flag without the reason, so a form that let this through would not suspend
 * somebody with no note on file — it would fail the write and leave the admin looking at an error
 * about a validator.
 *
 * Trimmed before both checks, because whitespace is not a reason and a box holding a newline would
 * otherwise satisfy the requirement while telling nobody anything.
 */
export const reasonProblem = (reason: string): string | undefined => {
	const trimmed = reason.trim()

	if (trimmed === '') return 'Say why this account is being suspended — the reason is stored with the suspension.'

	return trimmed.length > MAX_DISABLED_REASON ? `The reason cannot exceed ${MAX_DISABLED_REASON} characters` : undefined
}

/** What the confirmation toast says once the write has landed. The sessions are half of the news. */
export const outcomeMessage = (email: string, disabled: boolean) =>
	disabled
		? `${email} is suspended, and every session they held has ended. The account is now under the Suspended filter.`
		: `${email} can sign in again.`

const column = createColumnHelper<Row>()

/**
 * The customers table.
 *
 * Pure with respect to the URL, like the shop-owners table: the whole query state arrives as props and
 * changes go back through `onQueryChange`, so a filter and a page are real navigations that survive a
 * reload and can be sent to somebody.
 *
 * ⚠️ **There is no search box, and there will not be one.** Every field a search could match on `user` is
 * encrypted — randomly, for all but the login address — so a term would be compared against base64 and
 * match nothing, on every account, without erroring. An input that silently answers "no customers" is worse
 * than an absent one.
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
	 * bare boolean and its variables carry an id, while the message an admin needs names the address.
	 *
	 * The toast is gated on the mutation *result* and not on this, which is what makes a second suspension
	 * show a second toast: urql clears a mutation's data when it is executed again, so the toast unmounts
	 * and remounts, and a dismissed one does not stay dismissed. See the note on `Toast`.
	 */
	const [intent, setIntent] = useState<{ email: string; disabled: boolean } | null>(null)

	/*
	 * The row the suspension form is open for, and `null` when it is closed. The whole row rather than an
	 * id, because the form's warning names the address and its submit needs the id, and re-finding the row
	 * in `rows` would go wrong on the one page where it matters: the mutation invalidates the two typenames
	 * above, so the list re-fetches and the suspended row leaves the page while the form that suspended it
	 * is still mounted.
	 */
	const [pending, setPending] = useState<{ _id: string; email: string } | null>(null)
	/*
	 * Stryker disable next-line StringLiteral: this box only ever renders while `pending !== null`, and
	 * `pending` is set to non-null in exactly one place, the Suspend button below, which sets `reason` to
	 * `''` in the same click handler right beside it. No render can show this hook's own initial value —
	 * by the time the box exists at all, the click that opened it has already overwritten `reason`.
	 */
	const [reason, setReason] = useState('')

	/*
	 * ⚠️ Set on submit and not on every keystroke, so the box does not go red before the admin has
	 * finished the first word. Cleared as they type, so a corrected reason stops being an error without
	 * needing a second submit.
	 */
	const [reasonError, setReasonError] = useState<string | undefined>(undefined)

	const [result] = useQuery({
		query: UsersActiveTblDocument,
		variables: {
			offset: (query.page - 1) * query.pageSize,
			limit: query.pageSize,
			disabled: ACCOUNT_FILTER[query.status].disabled,
			deleted: ACCOUNT_FILTER[query.status].deleted,
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
		disabled: item.disabled === true,
		closed: item.deleted !== null,
		reason: item.disabledReason ?? null
	}))

	const closeForm = () => {
		setPending(null)
		/*
		 * ⚠️ Stryker disable next-line StringLiteral: `pending` and `reason` are only ever set together, in
		 * exactly two places — here, and the Suspend button below (`setPending({ … }); setReason('')`). The
		 * box is gated on `pending !== null`, so whatever this call writes is invisible while the form is
		 * closed, and the only way to make it visible again — clicking Suspend — resets `reason` to `''` in
		 * the same handler before that render happens. No reachable sequence of clicks lets this literal's
		 * value reach the screen; it is belt-and-braces for a reopen path that resets its own state anyway.
		 */
		setReason('')
		setReasonError(undefined)
	}

	/*
	 * ⚠️ **Asymmetric on purpose: suspending asks, enabling does not.**
	 *
	 * A suspension needs a reason before it can be written at all — `dependencies: { disabled:
	 * ['disabledReason'] }` on the collection refuses the flag without one (ADR-044) — so the click opens
	 * the form rather than sending anything. Lifting one needs nothing: the platform owner's ruling is that
	 * only an admin removes a suspension, and this screen is an admin, so the second click is the
	 * whole gesture.
	 *
	 * `disabledReason: null` on the way back, not an omitted field: the service `$unset`s the reason with
	 * the flag, and a variable left out would read as "leave it as it was" and keep a spent reason attached
	 * to an account that is no longer suspended.
	 */
	const enable = (row: Row) => {
		setIntent({ email: row.email, disabled: false })
		void executeStatus({ _id: row._id, disabled: false, disabledReason: null }, CTX_STATUS)
	}

	/*
	 * Takes the row rather than reading `pending` off the closure, so there is no `pending === null` guard
	 * to write: the only caller is inside the branch that renders the form, where the type is already
	 * narrowed. A guard for a state the button cannot be clicked in is a line no test can reach.
	 */
	const submitSuspension = (target: { _id: string; email: string }) => {
		const problem = reasonProblem(reason)

		if (problem !== undefined) {
			setReasonError(problem)
			return
		}

		setIntent({ email: target.email, disabled: true })
		void executeStatus({ _id: target._id, disabled: true, disabledReason: reason.trim() }, CTX_STATUS)
		closeForm()
	}

	// The message belongs to a write that landed. `intent` outlives its own mutation — it is still set
	// while the next one is in flight — so the result is what decides whether there is anything to say.
	const done = statusResult.data?.userUpdateStatus === true ? intent : null

	const columns = [
		// No link, because there is no customer detail page to link to: the collection has one admin
		// lever and it is the button in the last column. A link here would have to lead somewhere.
		column.accessor('email', { header: 'Email' }),
		column.accessor('registeredAt', { header: 'Registered' }),
		/*
		 * The reason rides under the status rather than in a column of its own: it is set on exactly the
		 * rows the two suspended filters show and empty on every row the other two do, so a fifth column
		 * would be blank down the whole default page.
		 *
		 * ⚠️ Guarded on the value and not on `row.disabled`. A legacy suspension predating ADR-044 carries
		 * the flag and no reason, and `?? null` above turns that into a row that says "Suspended" and
		 * stops — which is honest — rather than an empty line pretending a reason was recorded.
		 */
		column.accessor('status', {
			header: 'Status',
			cell: (info) => {
				const { reason } = info.row.original
				return (
					<>
						{info.getValue()}
						{reason === null ? null : <span className="block text-xs text-tip">{reason}</span>}
					</>
				)
			}
		}),
		column.display({
			id: 'action',
			header: 'Action',
			/*
			 * Driven by the row's own flags rather than by the filter in the URL. They agree today, and the
			 * row is the one that is still right if a page is rendered from a cache the filter has moved on
			 * from — a button offering to suspend an account that is already suspended is a wrong answer
			 * this way round, and an admin's second click on it is a no-op they cannot see.
			 *
			 * ⚠️ **A closed account gets no button at all.** Suspending one would write a flag onto an
			 * account nobody can sign into, and lifting a suspension on one would promise a return that
			 * `deleted` refuses — the personal data is thirty days from being overwritten in place
			 * (ADR-046), and only registering again with the same address takes the account back.
			 */
			cell: (info) => {
				const row = info.row.original

				if (row.closed) return EMPTY_CELL

				return row.disabled ? (
					<Button
						loading={statusResult.fetching}
						onClick={() => {
							enable(row)
						}}
					>
						Enable
					</Button>
				) : (
					<Button
						variant="danger"
						loading={statusResult.fetching}
						onClick={() => {
							setPending({ _id: row._id, email: row.email })
							setReason('')
							setReasonError(undefined)
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
						// Back to page 1: the four sets are different sizes, and page 7 of the one an admin
						// was standing on is very often past the end of the one they asked for.
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

			{/*
			 * ⚠️ **Above the table and not inside the row.** The mutation invalidates
			 * `GraphQLUsersActiveTblPage`, so submitting re-fetches the list and the row the form belongs to
			 * leaves the Active page — a form rendered inside that row would unmount underneath the admin
			 * mid-write. Up here it owns its own state and closes when it decides to.
			 *
			 * `role="group"` with the heading as its label rather than `role="dialog"`: nothing here traps
			 * focus or covers the page, and announcing a dialog that the Escape key does not close is worse
			 * than announcing a region.
			 */}
			{pending === null ? null : (
				<div
					role="group"
					aria-labelledby="suspend-heading"
					className="flex flex-col gap-3 rounded-box border border-app-error p-4"
				>
					<h2 id="suspend-heading" className="font-bold">
						Suspend {pending.email}
					</h2>
					<p className="whitespace-pre-line text-sm text-tip">{SUSPEND_WARNING}</p>

					<TextareaField
						label="Reason"
						value={reason}
						error={reasonError}
						/* Counted off the trimmed length, because that is the string the submit sends and the
						   one the service measures — a counter following the raw value would read 3 characters
						   short on a reason that ends in a newline. */
						remaining={MAX_DISABLED_REASON - reason.trim().length}
						onChange={(event) => {
							setReason(event.target.value)
							setReasonError(undefined)
						}}
					/>

					<div className="flex gap-2">
						<Button
							variant="danger"
							loading={statusResult.fetching}
							onClick={() => {
								submitSuspension(pending)
							}}
						>
							Suspend
						</Button>
						<Button variant="ghost" onClick={closeForm}>
							Cancel
						</Button>
					</div>
				</div>
			)}

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
			 * An empty page is an answer here and has to read as one — an admin who filtered to Suspended
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
