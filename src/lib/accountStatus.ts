/**
 * The account states the two admin tables filter by, shared because the two tables are the same screen
 * over two collections.
 *
 * ⚠️ **A filter and not a checkbox, because the services have no "either" state to offer.** `disabled`
 * and `deleted` are `Boolean!` on both `usersActiveTbl` and `shopOwnersActiveTbl`, which is what keeps
 * every page on an index: they are the leading pair of `tbl_active_registeredAt` on `user` and of all
 * four `tbl_active_*` on `shopOwner`, and an unbound leading field turns the sort into a blocking
 * in-memory one on collections that only grow. So suspending an account does not grey its row: it moves
 * the row to another filter, and the customers table's confirmation says where it went.
 *
 * ⚠️ **Four states and not three, because the two flags are independent** (ADR-049). `userDel` and
 * `shopOwnerDel` stamp `deleted` and leave the suspension trio exactly as they found it, so an account
 * suspended and then closed carries both — and under an Active/Suspended/Closed enum it would answer to
 * none of the three and be unreachable from the only tables that list it.
 *
 * ⚠️ **The four are offered on both tiers, identically.** An admin acts on a shop owner and on a customer
 * in the same way (platform owner, 2026-08-29), so a state reachable on one screen and not on the other
 * is the asymmetry ADR-048 brought the backend out of.
 */
export type AccountStatus = 'active' | 'suspended' | 'closed' | 'closedSuspended'

/**
 * What each filter asks the service for, and the label beside it.
 *
 * Both flags are spelled out on every entry rather than defaulted: both arguments are required, so
 * pinning them here keeps the four states the screens offer in one place instead of half in a query's
 * variables.
 */
export const ACCOUNT_FILTER = {
	active: { label: 'Active', disabled: false, deleted: false },
	suspended: { label: 'Suspended', disabled: true, deleted: false },
	closed: { label: 'Closed', disabled: false, deleted: true },
	closedSuspended: { label: 'Closed & suspended', disabled: true, deleted: true }
} as const satisfies Record<AccountStatus, { label: string; disabled: boolean; deleted: boolean }>

/**
 * The filter names, in the order the dropdowns list them, and the order matters: it runs from the state
 * an admin arrives on to the one they reach last.
 *
 * ⚠️ Derived from `ACCOUNT_FILTER` rather than written out a second time, so a fifth state is one entry
 * above and nothing else — the route schemas read this same tuple.
 */
export const ACCOUNT_STATUSES = Object.keys(ACCOUNT_FILTER) as [AccountStatus, ...AccountStatus[]]

/**
 * The status label for the two flags both tiers carry, or `undefined` when neither is set and the
 * caller's own tier decides what the row says — `waitApprov` on a shop owner, a confirmed address on a
 * customer.
 *
 * ⚠️ Closed is read first and suspended second, deliberately: a closed account that was suspended first
 * is both, and reporting it as merely "Suspended" would offer an admin a lift that leaves the account
 * closed. The labels come from `ACCOUNT_FILTER`, so a row can never say a word no filter offers.
 */
export const closedOrSuspendedLabel = ({ disabled, deleted }: { disabled: boolean; deleted: boolean }): string | undefined => {
	if (deleted) return disabled ? ACCOUNT_FILTER.closedSuspended.label : ACCOUNT_FILTER.closed.label

	return disabled ? ACCOUNT_FILTER.suspended.label : undefined
}
