import { describe, expect, it } from 'vitest'

import { ACCOUNT_FILTER, ACCOUNT_STATUSES, closedOrSuspendedLabel } from '@/lib/accountStatus'

/**
 * The four states both admin tables filter by, tested here rather than only through the two screens:
 * this module is what makes them the *same* four, and an asymmetry between the tiers is the thing the
 * platform owner ruled out (2026-08-29, ADR-049).
 */
describe('ACCOUNT_FILTER', () => {
	/*
	 * ⚠️ The 2×2 matrix in full, and the fourth row is why the module exists. `userDel` and `shopOwnerDel`
	 * stamp `deleted` and leave the suspension trio exactly as they found it (ADR-048), so an account
	 * suspended and then closed carries both flags — and the three-state filter this replaced asked for
	 * neither pair that would have listed it.
	 */
	it.each([
		{ status: 'active', disabled: false, deleted: false },
		{ status: 'suspended', disabled: true, deleted: false },
		{ status: 'closed', disabled: false, deleted: true },
		{ status: 'closedSuspended', disabled: true, deleted: true }
	] as const)('asks for disabled=$disabled deleted=$deleted under $status', ({ status, disabled, deleted }) => {
		expect(ACCOUNT_FILTER[status]).toMatchObject({ disabled, deleted })
	})

	it('labels the four states in the words the dropdowns show', () => {
		expect(ACCOUNT_STATUSES.map((status) => ACCOUNT_FILTER[status].label)).toEqual([
			'Active',
			'Suspended',
			'Closed',
			'Closed & suspended'
		])
	})

	/*
	 * The order is the contract the two route schemas and both dropdowns read: `active` first because it
	 * is where an arriving admin lands, and because it is the state the services' own argument defaults
	 * answer with.
	 */
	it('lists the states in the order the dropdowns offer them', () => {
		expect(ACCOUNT_STATUSES).toEqual(['active', 'suspended', 'closed', 'closedSuspended'])
	})
})

describe('closedOrSuspendedLabel', () => {
	/*
	 * ⚠️ Closed is read before suspended. A closed account that was suspended first is both, and reporting
	 * it as merely "Suspended" would offer an admin a lift that leaves the account closed.
	 */
	it.each([
		{ disabled: false, deleted: false, expected: undefined },
		{ disabled: true, deleted: false, expected: 'Suspended' },
		{ disabled: false, deleted: true, expected: 'Closed' },
		{ disabled: true, deleted: true, expected: 'Closed & suspended' }
	])('reads disabled=$disabled deleted=$deleted as $expected', ({ disabled, deleted, expected }) => {
		expect(closedOrSuspendedLabel({ disabled, deleted })).toBe(expected)
	})

	/*
	 * `undefined` and not a label of its own: an account in neither state is described by its own tier —
	 * `waitApprov` on a shop owner, a confirmed address on a customer — and a label here would overwrite
	 * both.
	 */
	it('leaves an account in neither state to the caller', () => {
		expect(closedOrSuspendedLabel({ disabled: false, deleted: false })).toBeUndefined()
	})
})
