import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { nextDir, outcomeMessage, statusOf, suspendWarning } from '@/features/customers/TblCustomers'

import type { GraphQLCall } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

const CUSTOMERS = '/customers'

/**
 * ⚠️ The `__typename` is load-bearing, exactly as in the session console's fixture: urql's document cache
 * invalidates by the typenames a *response* carries, and `userUpdateStatus` answers a bare `Boolean` that
 * carries none. A fixture without it would make the table's `additionalTypenames` look like decoration —
 * the suspension would report success and the list would go on showing the account it suspended.
 */
const customer = (over: Record<string, unknown> = {}) => ({
	__typename: 'GraphQLUserActiveTbl',
	_id: '65f0000000000000000000c1',
	registeredAt: '2026-02-01T08:05:45.000Z',
	email: 'ada.stone@example.com',
	// `null` and not `false` on both flags: the collection stores `true` or `$unset`s, so a fixture that
	// invents a `false` tests a document shape the backend cannot produce.
	disabled: null,
	deleted: null,
	emailVerified: true,
	...over
})

const OTHER = customer({
	_id: '65f0000000000000000000c2',
	email: 'ben.frost@example.com',
	registeredAt: '2026-03-15T10:00:00.000Z'
})

const page = (items: unknown[], total = items.length) => ({
	data: { usersActiveTbl: { __typename: 'GraphQLUsersActiveTblPage', total, items } }
})

const respond = (response: boolean) => vi.spyOn(window, 'confirm').mockReturnValue(response)

const callsTo = (calls: readonly GraphQLCall[], operationName: string) =>
	calls.filter((call) => call.operationName === operationName)

const rowOf = async (email: string) => (await screen.findByText(email)).closest('tr') as HTMLElement

describe('statusOf', () => {
	it('reads a confirmed, enabled account as active', () => {
		expect(statusOf({ disabled: null, deleted: null, emailVerified: true })).toBe('Active')
	})

	/*
	 * The ordinary state of somebody who registered an hour ago, not a fault. `emailVerify.valid` is
	 * written by the confirmation link, so an unconfirmed account has no such key rather than a `false` one.
	 */
	it('reads an unconfirmed address as awaiting confirmation', () => {
		expect(statusOf({ disabled: null, deleted: null, emailVerified: null })).toBe('Awaiting confirmation')
	})

	// Precedence, not preference: an operator told "Awaiting confirmation" about a suspended account would
	// go and resend a link that changes nothing.
	it('reports a suspended account as suspended even when the address was never confirmed', () => {
		expect(statusOf({ disabled: true, deleted: null, emailVerified: null })).toBe('Suspended')
	})

	it('reports an erased account as erased, over both other flags', () => {
		expect(statusOf({ disabled: true, deleted: '2026-05-01T00:00:00.000Z', emailVerified: true })).toBe('Deleted')
	})
})

describe('nextDir', () => {
	it('flips ascending to descending', () => {
		expect(nextDir('ASC')).toBe('DESC')
	})

	it('flips back', () => {
		expect(nextDir('DESC')).toBe('ASC')
	})
})

describe('the confirmation texts', () => {
	/*
	 * ⚠️ The address, because it is what the support ticket carries — and, since ADR-029, the only thing on
	 * the row that identifies a person at all.
	 */
	it('names the account being suspended', () => {
		expect(suspendWarning('ada.stone@example.com')).toContain('ada.stone@example.com')
	})

	/*
	 * ⚠️ Both halves of every session go since R54, so the device stops working now. A warning about a
	 * window in which it kept working would send an operator looking for a gap that has been closed.
	 */
	it('says the device stops working now rather than when the token expires', () => {
		expect(suspendWarning('ada.stone@example.com')).toContain('stops working now')
	})

	it('reports the sessions as part of the outcome, and where the row went', () => {
		const message = outcomeMessage('ada.stone@example.com', true)

		expect(message).toContain('every session they held has ended')
		expect(message).toContain('Suspended filter')
	})

	it('reports a re-enabled account as able to sign in again', () => {
		expect(outcomeMessage('ada.stone@example.com', false)).toBe('ada.stone@example.com can sign in again.')
	})
})

describe('TblCustomers', () => {
	it('waits before claiming the list is empty', async () => {
		stubGraphQL({ UsersActiveTbl: { pending: true } })
		await renderRoute(CUSTOMERS)

		expect(screen.getByText('Loading customers')).toBeInTheDocument()
		expect(screen.queryByText('No customer found.')).not.toBeInTheDocument()
	})

	it('renders a row per customer', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer(), OTHER]) })
		await renderRoute(CUSTOMERS)

		const cells = within(await rowOf('ada.stone@example.com'))
		expect(cells.getByText('01/02/2026')).toBeInTheDocument()
		expect(cells.getByText('Active')).toBeInTheDocument()
	})

	/**
	 * ⚠️ **The anti-story, as markup** (E19-S05). Four columns and no fifth: every field a name, city or
	 * address column would render on `user` is encrypted — randomly, for all but the login address — so such
	 * a column would print base64 and a sort on it would order the customer base by ciphertext. The
	 * assertion is on the exact list rather than on the absence of one name, because the way this goes wrong
	 * is somebody adding the column they happen to want.
	 */
	it('shows the four columns the collection can answer for, and no others', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await screen.findByText('ada.stone@example.com')
		expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
			'Email',
			'Registered',
			'Status',
			'Action'
		])
	})

	/**
	 * ⚠️ The other half of E19-S05. A search box here would compare a term against random ciphertext and
	 * match nothing, on every account, without erroring — an input that silently answers "no customers".
	 * The status dropdown is the screen's only filter, and it filters on the two clear flags.
	 */
	it('offers no free-text search', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await screen.findByText('ada.stone@example.com')
		expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
	})

	/**
	 * ⚠️ Paging and sorting are the server's job, and these variables are what assert it. `disabled` and
	 * `deleted` travel as required booleans because the service has no "either" state — that pair is what
	 * keeps the page on `tbl_active_registeredAt` — and `sortBy` is sent rather than defaulted so the wire
	 * says which ordering is on screen.
	 */
	it('asks the server for one page of live, enabled accounts, newest first', async () => {
		const stub = stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({
			offset: 0,
			limit: 20,
			disabled: false,
			deleted: false,
			sortBy: 'REGISTERED_AT',
			sortDir: 'DESC'
		})
	})

	/**
	 * ⚠️ The other half of the route's own test: a hand-edited URL can carry `search` and `sortBy`, because
	 * no route claims them, and neither may reach the service. `search` is an argument `usersActiveTbl`
	 * does not have and `EMAIL` is not a member of its sort enum — both would come back as schema
	 * validation errors, which is an emptied table in exchange for a parameter that could never have worked.
	 */
	it('sends neither a search term nor a sort column a URL invented', async () => {
		const stub = stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(`${CUSTOMERS}?search=stone&sortBy=EMAIL`)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({
			offset: 0,
			limit: 20,
			disabled: false,
			deleted: false,
			sortBy: 'REGISTERED_AT',
			sortDir: 'DESC'
		})
	})

	it('asks for the suspended accounts when the URL says so', async () => {
		const stub = stubGraphQL({ UsersActiveTbl: page([customer({ disabled: true })]) })
		await renderRoute(`${CUSTOMERS}?status=suspended`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ disabled: true, deleted: false })
		})
		expect(screen.getByLabelText('Status')).toHaveValue('suspended')
	})

	// Back to the first page: the two sets are different sizes, and page 7 of the one the operator was
	// standing on is very often past the end of the one they asked for.
	it('pushes a chosen filter into the URL and returns to the first page', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()], 100) })
		const { router } = await renderRoute(`${CUSTOMERS}?page=4`)

		await userEvent.selectOptions(screen.getByLabelText('Status'), 'suspended')

		expect(router.state.location.search).toMatchObject({ status: 'suspended', page: 1 })
	})

	it('turns the page number into an offset', async () => {
		const stub = stubGraphQL({ UsersActiveTbl: page([customer()], 100) })
		await renderRoute(`${CUSTOMERS}?page=3&pageSize=25`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ offset: 50, limit: 25 })
		})
	})

	it('flips the sort direction from the registered-date header, and returns to the first page', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()], 100) })
		const { router } = await renderRoute(`${CUSTOMERS}?page=4`)

		await userEvent.click(await screen.findByRole('button', { name: 'Registered' }))

		expect(router.state.location.search).toMatchObject({ sortDir: 'ASC', page: 1 })
	})

	it('tells assistive technology which way the one sortable column runs', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByRole('columnheader', { name: 'Registered' })).toHaveAttribute('aria-sort', 'descending')
	})

	it('reports an ascending sort as ascending', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(`${CUSTOMERS}?sortDir=ASC`)

		expect(await screen.findByRole('columnheader', { name: 'Registered' })).toHaveAttribute('aria-sort', 'ascending')
	})

	/**
	 * ⚠️ Three of the four columns carry no sort, and cannot. `GraphQLUsersTblSortField` has one member
	 * (E19-S05): a header button on any other column would send a value the service refuses at schema
	 * validation, and an `aria-sort` would promise a screen-reader user an ordering that does not exist.
	 */
	it('offers no sort on the columns the service cannot order by', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await screen.findByText('ada.stone@example.com')
		for (const name of ['Email', 'Status', 'Action']) {
			const header = screen.getByRole('columnheader', { name })
			expect(within(header).queryByRole('button')).not.toBeInTheDocument()
			expect(header).not.toHaveAttribute('aria-sort')
		}
	})

	/*
	 * An empty page is an answer, and on the Suspended filter it is the good news: nobody is suspended.
	 * Left as bare headers it reads as a screen that failed to load.
	 */
	it('says so when the filter matches nobody', async () => {
		stubGraphQL({ UsersActiveTbl: page([]) })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('No customer found.')).toBeInTheDocument()
	})

	// A page that never arrived is not a page with no rows, and the mapping has to survive both — the
	// `?? []` fallback is the only thing between a failed query and a `.map` over `undefined`.
	it('draws no rows at all when the query brought no page back', async () => {
		stubGraphQL({ UsersActiveTbl: { errors: [graphQLError('Error', 'List unavailable', 500)], status: 500 } })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('No customer found.')).toBeInTheDocument()
		expect(screen.getAllByRole('row')).toHaveLength(1)
		expect(screen.getByRole('alert')).toHaveTextContent('List unavailable')
	})

	it('sizes the pager from the server total, not from the rows on screen', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer(), OTHER], 41) })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('1–20 of 41')).toBeInTheDocument()
	})

	it('pages through the result set', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer()], 41) })
		const { router } = await renderRoute(CUSTOMERS)

		await userEvent.click(await screen.findByRole('button', { name: 'Page 3' }))

		expect(router.state.location.search).toMatchObject({ page: 3 })
	})

	/**
	 * ⚠️ A confirmation first, because the click ends every session the customer holds — it is the session
	 * console's "end every session" with a flag attached, not a checkbox.
	 */
	it('asks before suspending, and sends the account it named', async () => {
		respond(true)
		const stub = stubGraphQL({
			UsersActiveTbl: [page([customer()]), page([])],
			UserUpdateStatus: { data: { userUpdateStatus: true } }
		})
		await renderRoute(CUSTOMERS)

		await userEvent.click(within(await rowOf('ada.stone@example.com')).getByRole('button', { name: 'Suspend' }))

		expect(window.confirm).toHaveBeenCalledWith(suspendWarning('ada.stone@example.com'))
		await waitFor(() => {
			expect(callsTo(stub.calls, 'UserUpdateStatus')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'UserUpdateStatus')[0]?.variables).toEqual({ _id: '65f0000000000000000000c1', disabled: true })
	})

	it('sends nothing when the confirmation is refused', async () => {
		respond(false)
		const stub = stubGraphQL({ UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await userEvent.click(within(await rowOf('ada.stone@example.com')).getByRole('button', { name: 'Suspend' }))

		expect(callsTo(stub.calls, 'UserUpdateStatus')).toHaveLength(0)
	})

	/**
	 * The `additionalTypenames` on the call site, proven rather than assumed. `userUpdateStatus` answers a
	 * bare boolean, which names no typename to invalidate, so without it the table would go on listing the
	 * account that was just suspended — the wrong answer to "did it work".
	 */
	it('re-reads the table afterwards and says what happened to the sessions', async () => {
		respond(true)
		const stub = stubGraphQL({
			UsersActiveTbl: [page([customer(), OTHER]), page([OTHER])],
			UserUpdateStatus: { data: { userUpdateStatus: true } }
		})
		await renderRoute(CUSTOMERS)

		await userEvent.click(within(await rowOf('ada.stone@example.com')).getByRole('button', { name: 'Suspend' }))

		expect(await screen.findByText(outcomeMessage('ada.stone@example.com', true))).toBeInTheDocument()
		await waitFor(() => {
			expect(screen.queryByText('ada.stone@example.com')).not.toBeInTheDocument()
		})
		expect(callsTo(stub.calls, 'UsersActiveTbl')).toHaveLength(2)
	})

	/**
	 * ⚠️ Re-enabling ends nothing and asks nothing: the customer simply logs in again. A confirmation here
	 * would train an operator to click through the one on the other button.
	 *
	 * The button is chosen by the row's own flag rather than by the filter in the URL, which is what this
	 * asserts: the row is the half that is still right if a cached page and the filter disagree.
	 */
	it('re-enables a suspended customer without asking', async () => {
		const confirm = respond(true)
		const stub = stubGraphQL({
			UsersActiveTbl: page([customer({ disabled: true })]),
			UserUpdateStatus: { data: { userUpdateStatus: true } }
		})
		await renderRoute(`${CUSTOMERS}?status=suspended`)

		await userEvent.click(within(await rowOf('ada.stone@example.com')).getByRole('button', { name: 'Enable' }))

		expect(confirm).not.toHaveBeenCalled()
		await waitFor(() => {
			expect(callsTo(stub.calls, 'UserUpdateStatus')[0]?.variables).toEqual({
				_id: '65f0000000000000000000c1',
				disabled: false
			})
		})
		expect(await screen.findByText(outcomeMessage('ada.stone@example.com', false))).toBeInTheDocument()
	})

	/**
	 * A refused write says so and claims nothing. The success message is asserted absent in the same test
	 * because the failure that matters is not "no toast" but "the wrong toast": an operator told the
	 * account is suspended stops watching it.
	 */
	it('reports a refused write and claims nothing', async () => {
		respond(true)
		stubGraphQL({
			UsersActiveTbl: page([customer()]),
			UserUpdateStatus: { errors: [graphQLError('Oops', 'user not found', 404)], status: 404 }
		})
		await renderRoute(CUSTOMERS)

		await userEvent.click(within(await rowOf('ada.stone@example.com')).getByRole('button', { name: 'Suspend' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('user not found')
		expect(screen.queryByText(outcomeMessage('ada.stone@example.com', true))).not.toBeInTheDocument()
	})

	/**
	 * ⚠️ A fixture the service cannot send today, and deliberately so: nothing on any tier writes
	 * `user.deleted` (E19 §6, question 3). The row is here because the column reads the flag rather than
	 * inferring the state from the filter — the day an erasure path lands, an erased account must not read
	 * as "Active" on the operator's screen.
	 */
	it('renders an erased account as erased rather than as active', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer({ deleted: '2026-05-01T00:00:00.000Z' })]) })
		await renderRoute(CUSTOMERS)

		expect(within(await rowOf('ada.stone@example.com')).getByText('Deleted')).toBeInTheDocument()
	})

	it('renders an unconfirmed registration as awaiting confirmation', async () => {
		stubGraphQL({ UsersActiveTbl: page([customer({ emailVerified: null })]) })
		await renderRoute(CUSTOMERS)

		expect(within(await rowOf('ada.stone@example.com')).getByText('Awaiting confirmation')).toBeInTheDocument()
	})

	// Both row shapes in one snapshot: the enabled account with its Suspend button, and the suspended one
	// with its Enable button, so the two controls are pinned as markup rather than only as text.
	it('renders', async () => {
		stubGraphQL({
			UsersActiveTbl: page(
				[customer(), customer({ _id: '65f0000000000000000000c3', email: 'cara.lane@example.com', disabled: true })],
				41
			)
		})
		await renderRoute(CUSTOMERS)

		await screen.findByText('ada.stone@example.com')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
