import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
	MAX_DISABLED_REASON,
	nextDir,
	outcomeMessage,
	reasonProblem,
	statusOf,
	SUSPEND_WARNING
} from '@/features/customers/TblCustomers'

import type { GraphQLCall } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

const CUSTOMERS = '/customers'

/**
 * The counter and the chart that sit above the table on the same page. Every test here has to answer
 * their two operations or the requests throw unconfigured — left pending, since nothing below reads
 * either of them and a settled reply would only add noise to the DOM these assertions search.
 */
const ABOVE = { UsersStats: { pending: true }, UsersPerPeriod: { pending: true } }

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
	// Absent on an account nobody suspended, and a pair rather than a flag since ADR-044: the reason is
	// what the admin screen reads back, and `disabledBy` is who wrote it.
	disabledBy: null,
	disabledReason: null,
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

/*
 * ⚠️ **`window.confirm` is watched rather than stubbed, and that is the point of the helper.** ADR-044
 * turned the suspension into a form with a mandatory reason, and a native dialog takes no input — so the
 * screen must not open one. jsdom's own `confirm` throws "not implemented", which would fail loudly, but
 * only on the path that reached it; a spy asserts the absence on every path.
 */
const watchConfirm = () => vi.spyOn(window, 'confirm').mockReturnValue(true)

const openSuspendForm = async (email: string) => {
	await userEvent.click(within(await rowOf(email)).getByRole('button', { name: 'Suspend' }))
	return screen.getByRole('group', { name: `Suspend ${email}` })
}

/** The form's own Suspend, not the row's — both carry the word, and only one of them submits. */
const submitForm = async (form: HTMLElement) => {
	await userEvent.click(within(form).getByRole('button', { name: 'Suspend' }))
}

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

	// Precedence, not preference: an admin told "Awaiting confirmation" about a suspended account would
	// go and resend a link that changes nothing.
	it('reports a suspended account as suspended even when the address was never confirmed', () => {
		expect(statusOf({ disabled: true, deleted: null, emailVerified: null })).toBe('Suspended')
	})

	it('reports a closed account as closed, over the confirmation flag', () => {
		expect(statusOf({ disabled: null, deleted: '2026-05-01T00:00:00.000Z', emailVerified: null })).toBe('Closed')
	})

	/*
	 * ⚠️ The state that has to be its own name rather than one of the other two, and the reason there are
	 * four filters instead of three (ADR-049). `userDel` stamps `deleted` and leaves the suspension trio
	 * exactly as it found it (ADR-048), so this pair is a real document — and reporting it as "Suspended"
	 * would offer an admin a lift that leaves the account closed.
	 */
	it('reports a closed account that was suspended first as both', () => {
		expect(statusOf({ disabled: true, deleted: '2026-05-01T00:00:00.000Z', emailVerified: true })).toBe('Closed & suspended')
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

describe('the form texts', () => {
	/*
	 * ⚠️ Both halves of every session go since R54, so the device stops working now. A warning about a
	 * window in which it kept working would send an admin looking for a gap that has been closed.
	 */
	it('says the device stops working now rather than when the token expires', () => {
		expect(SUSPEND_WARNING).toContain('stops working now')
	})

	/*
	 * ⚠️ The address is on screen once, in the form's heading — asserted there rather than here. A warning
	 * that opened by naming it again would print it twice, three lines apart.
	 */
	it('leaves the address to the heading', () => {
		expect(SUSPEND_WARNING).not.toContain('@')
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

/**
 * ⚠️ **The reason is mandatory at the collection, which is why it is checked here at all.** ADR-044 put
 * `dependencies: { disabled: ['disabledReason'] }` on `user`, so a suspension without one is not a
 * suspension with a blank note — it is a write the server refuses, reported to the admin as an error
 * about a validator. The cap is the service's, not the collection's: the field is randomly encrypted, so
 * `$jsonSchema` sees `binData` and cannot measure a string it may not read.
 */
describe('reasonProblem', () => {
	it('refuses an empty box, saying what the reason is for', () => {
		expect(reasonProblem('')).toContain('why this account is being suspended')
	})

	// Whitespace is not a reason. A box holding a newline would otherwise satisfy a required field while
	// telling the next admin to read it precisely nothing.
	it('refuses a box holding nothing but whitespace', () => {
		expect(reasonProblem('  \n\t ')).toContain('why this account is being suspended')
	})

	it('accepts a reason', () => {
		expect(reasonProblem('Chargeback fraud, ticket 4471.')).toBeUndefined()
	})

	it('accepts a reason of exactly the cap', () => {
		expect(reasonProblem('x'.repeat(MAX_DISABLED_REASON))).toBeUndefined()
	})

	it('refuses one character past it', () => {
		expect(reasonProblem('x'.repeat(MAX_DISABLED_REASON + 1))).toBe(`The reason cannot exceed ${MAX_DISABLED_REASON} characters`)
	})

	// Measured after the trim, because the trimmed string is what the submit sends — a reason refused for
	// the trailing newline the admin never typed on purpose would be refused for nothing.
	it('measures the trimmed length, not the typed one', () => {
		expect(reasonProblem(`  ${'x'.repeat(MAX_DISABLED_REASON)}  `)).toBeUndefined()
	})
})

describe('TblCustomers', () => {
	it('waits before claiming the list is empty', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: { pending: true } })
		await renderRoute(CUSTOMERS)

		expect(screen.getByText('Loading customers')).toBeInTheDocument()
		expect(screen.queryByText('No customer found.')).not.toBeInTheDocument()
	})

	it('renders a row per customer', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer(), OTHER]) })
		await renderRoute(CUSTOMERS)

		const cells = within(await rowOf('ada.stone@example.com'))
		expect(cells.getByText('01/02/2026')).toBeInTheDocument()
		expect(cells.getByText('Active')).toBeInTheDocument()
	})

	/**
	 * ⚠️ **The refusal, as markup.** Four columns and no fifth: every field a name, city or address column
	 * would render on `user` is encrypted — randomly, for all but the login address — so such a column would
	 * print base64 and a sort on it would order the customer base by ciphertext. The assertion is on the
	 * exact list rather than on the absence of one name, because the way this goes wrong is somebody adding
	 * the column they happen to want.
	 */
	it('shows the four columns the collection can answer for, and no others', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
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
	 * ⚠️ The other half of the same refusal. A search box here would compare a term against random
	 * ciphertext and match nothing, on every account, without erroring — an input that silently answers "no
	 * customers". The status dropdown is the screen's only filter, and it filters on the two clear flags.
	 */
	it('offers no free-text search', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
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
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await waitFor(() => {
			expect(callsTo(stub.calls, 'UsersActiveTbl')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'UsersActiveTbl')[0]?.variables).toEqual({
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
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(`${CUSTOMERS}?search=stone&sortBy=EMAIL`)

		await waitFor(() => {
			expect(callsTo(stub.calls, 'UsersActiveTbl')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'UsersActiveTbl')[0]?.variables).toEqual({
			offset: 0,
			limit: 20,
			disabled: false,
			deleted: false,
			sortBy: 'REGISTERED_AT',
			sortDir: 'DESC'
		})
	})

	/**
	 * ⚠️ **The four states as a pair of booleans, and each one asserted separately.** The two flags are
	 * independent — `userDel` never touches the suspension trio (ADR-048) — so the fourth row of this table
	 * is a document that exists and that the previous two-state filter could not ask for: it was neither
	 * "not suspended" nor "not closed", and no filter on this screen listed it (ADR-049).
	 *
	 * The dropdown's own value is asserted with the variables, because a filter the URL honours and the
	 * control does not show is a screen that lies about what it is listing.
	 */
	it.each([
		{ status: 'suspended', disabled: true, deleted: false },
		{ status: 'closed', disabled: false, deleted: true },
		{ status: 'closedSuspended', disabled: true, deleted: true }
	])('asks for the $status accounts when the URL says so', async ({ status, disabled, deleted }) => {
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer({ disabled: true })]) })
		await renderRoute(`${CUSTOMERS}?status=${status}`)

		await waitFor(() => {
			expect(callsTo(stub.calls, 'UsersActiveTbl')[0]?.variables).toMatchObject({ disabled, deleted })
		})
		expect(screen.getByLabelText('Status')).toHaveValue(status)
	})

	/*
	 * The list an admin can actually pick from, asserted as the exact four rather than as "contains
	 * Closed": the way this goes wrong is a state that exists in the service and not in the dropdown, which
	 * is precisely how the closed accounts became unreachable in the first place.
	 */
	it('offers the four account states, and no others', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await screen.findByText('ada.stone@example.com')
		expect(
			within(screen.getByLabelText('Status'))
				.getAllByRole('option')
				.map((option) => option.textContent)
		).toEqual(['Active', 'Suspended', 'Closed', 'Closed & suspended'])
	})

	// Back to the first page: the four sets are different sizes, and page 7 of the one the admin was
	// standing on is very often past the end of the one they asked for.
	it('pushes a chosen filter into the URL and returns to the first page', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()], 100) })
		const { router } = await renderRoute(`${CUSTOMERS}?page=4`)

		await userEvent.selectOptions(screen.getByLabelText('Status'), 'suspended')

		expect(router.state.location.search).toMatchObject({ status: 'suspended', page: 1 })
	})

	it('turns the page number into an offset', async () => {
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()], 100) })
		await renderRoute(`${CUSTOMERS}?page=3&pageSize=25`)

		await waitFor(() => {
			expect(callsTo(stub.calls, 'UsersActiveTbl')[0]?.variables).toMatchObject({ offset: 50, limit: 25 })
		})
	})

	it('flips the sort direction from the registered-date header, and returns to the first page', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()], 100) })
		const { router } = await renderRoute(`${CUSTOMERS}?page=4`)

		await userEvent.click(await screen.findByRole('button', { name: 'Registered' }))

		expect(router.state.location.search).toMatchObject({ sortDir: 'ASC', page: 1 })
	})

	it('tells assistive technology which way the one sortable column runs', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByRole('columnheader', { name: 'Registered' })).toHaveAttribute('aria-sort', 'descending')
	})

	it('reports an ascending sort as ascending', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(`${CUSTOMERS}?sortDir=ASC`)

		expect(await screen.findByRole('columnheader', { name: 'Registered' })).toHaveAttribute('aria-sort', 'ascending')
	})

	/**
	 * ⚠️ Three of the four columns carry no sort, and cannot. `GraphQLUsersTblSortField` has one member:
	 * a header button on any other column would send a value the service refuses at schema validation,
	 * and an `aria-sort` would promise a screen-reader user an ordering that does not exist.
	 */
	it('offers no sort on the columns the service cannot order by', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
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
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([]) })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('No customer found.')).toBeInTheDocument()
	})

	// A page that never arrived is not a page with no rows, and the mapping has to survive both — the
	// `?? []` fallback is the only thing between a failed query and a `.map` over `undefined`.
	it('draws no rows at all when the query brought no page back', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: { errors: [graphQLError('Error', 'List unavailable', 500)], status: 500 } })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('No customer found.')).toBeInTheDocument()
		expect(screen.getAllByRole('row')).toHaveLength(1)
		expect(screen.getByRole('alert')).toHaveTextContent('List unavailable')
	})

	it('sizes the pager from the server total, not from the rows on screen', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer(), OTHER], 41) })
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('1–20 of 41')).toBeInTheDocument()
	})

	it('pages through the result set', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()], 41) })
		const { router } = await renderRoute(CUSTOMERS)

		await userEvent.click(await screen.findByRole('button', { name: 'Page 3' }))

		expect(router.state.location.search).toMatchObject({ page: 3 })
	})

	/**
	 * ⚠️ **The row's Suspend button writes nothing, and that is the whole of ADR-044 on this screen.** The
	 * reason is mandatory at the collection, so the click can only open the form that collects it — a
	 * mutation fired here would be one the server refuses.
	 *
	 * The heading is what names the address, which is why it is the form's accessible name: an admin
	 * who opened the form from the wrong row has one thing to read to find out.
	 */
	it('opens a reason form instead of writing, and names the account in it', async () => {
		const confirm = watchConfirm()
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer(), OTHER]) })
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')

		expect(confirm).not.toHaveBeenCalled()
		expect(callsTo(stub.calls, 'UserUpdateStatus')).toHaveLength(0)
		// ⚠️ Normalised before comparing: testing-library collapses whitespace in the element's text, and the
		// warning is written with a blank line between its two paragraphs — `whitespace-pre-line` is what
		// puts that break back on screen, and it is asserted in the snapshot rather than here.
		expect(within(form).getByText(SUSPEND_WARNING.replace(/\s+/g, ' '))).toBeInTheDocument()
		expect(within(form).getByLabelText('Reason')).toHaveValue('')
	})

	/*
	 * ⚠️ Refused in the browser rather than at the server, because the server's refusal is a validator
	 * error about a `dependencies` clause — true, and no use to the admin reading it.
	 */
	it('refuses a suspension with no reason, and sends nothing', async () => {
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await submitForm(form)

		expect(within(form).getByText(/why this account is being suspended/)).toBeInTheDocument()
		expect(within(form).getByLabelText('Reason')).toHaveAttribute('aria-invalid', 'true')
		expect(callsTo(stub.calls, 'UserUpdateStatus')).toHaveLength(0)
	})

	// A reason past the cap is refused here too: the service answers 400 to it, and the count under the box
	// is the only warning an admin gets on the way there.
	it('refuses a reason past the cap', async () => {
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		// `fireEvent.change` in spirit — typing a thousand characters one keystroke at a time is minutes of
		// test time for a value `paste` sets in one event.
		await userEvent.click(within(form).getByLabelText('Reason'))
		await userEvent.paste('x'.repeat(MAX_DISABLED_REASON + 1))
		await submitForm(form)

		expect(within(form).getByText(`The reason cannot exceed ${MAX_DISABLED_REASON} characters`)).toBeInTheDocument()
		expect(callsTo(stub.calls, 'UserUpdateStatus')).toHaveLength(0)
	})

	/*
	 * The error goes as the admin types rather than on the next submit. Left standing it reads as a
	 * verdict on what is in the box now, which by then it is not.
	 */
	it('clears the error as the admin types', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await submitForm(form)
		await userEvent.type(within(form).getByLabelText('Reason'), 'C')

		expect(within(form).queryByText(/why this account is being suspended/)).not.toBeInTheDocument()
	})

	// Counted off the trimmed value, because that is the string the submit sends and the one the service
	// measures against its own cap.
	it('counts down to the cap on the trimmed value', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await userEvent.type(within(form).getByLabelText('Reason'), '  Fraud  ')

		expect(within(form).getByText(`${MAX_DISABLED_REASON - 5} characters remaining`)).toBeInTheDocument()
	})

	/**
	 * ⚠️ The trimmed reason, because the value is stored and read back by the next admin — and, being
	 * randomly encrypted, is never normalised by anything downstream that could tidy it later.
	 */
	it('sends the trimmed reason with the flag, and closes the form', async () => {
		const stub = stubGraphQL({
			...ABOVE,
			UsersActiveTbl: [page([customer()]), page([])],
			UserUpdateStatus: { data: { userUpdateStatus: true } }
		})
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await userEvent.click(within(form).getByLabelText('Reason'))
		await userEvent.paste('  Chargeback fraud, ticket 4471.  ')
		await submitForm(form)

		await waitFor(() => {
			expect(callsTo(stub.calls, 'UserUpdateStatus')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'UserUpdateStatus')[0]?.variables).toEqual({
			_id: '65f0000000000000000000c1',
			disabled: true,
			disabledReason: 'Chargeback fraud, ticket 4471.'
		})
		expect(screen.queryByRole('group', { name: /^Suspend / })).not.toBeInTheDocument()
	})

	it('sends nothing when the form is cancelled', async () => {
		const stub = stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }))

		expect(screen.queryByRole('group', { name: /^Suspend / })).not.toBeInTheDocument()
		expect(callsTo(stub.calls, 'UserUpdateStatus')).toHaveLength(0)
	})

	// A cancelled reason must not turn up in the next one. The state is per-form and cleared on both ways
	// out, so the box an admin opens is always empty.
	it('opens the next form with an empty box', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer(), OTHER]) })
		await renderRoute(CUSTOMERS)

		const first = await openSuspendForm('ada.stone@example.com')
		await userEvent.type(within(first).getByLabelText('Reason'), 'Wrong row')
		await userEvent.click(within(first).getByRole('button', { name: 'Cancel' }))
		const second = await openSuspendForm('ben.frost@example.com')

		expect(within(second).getByLabelText('Reason')).toHaveValue('')
	})

	/**
	 * The `additionalTypenames` on the call site, proven rather than assumed. `userUpdateStatus` answers a
	 * bare boolean, which names no typename to invalidate, so without it the table would go on listing the
	 * account that was just suspended — the wrong answer to "did it work".
	 */
	it('re-reads the table afterwards and says what happened to the sessions', async () => {
		const stub = stubGraphQL({
			...ABOVE,
			UsersActiveTbl: [page([customer(), OTHER]), page([OTHER])],
			UserUpdateStatus: { data: { userUpdateStatus: true } }
		})
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await userEvent.type(within(form).getByLabelText('Reason'), 'Fraud')
		await submitForm(form)

		expect(await screen.findByText(outcomeMessage('ada.stone@example.com', true))).toBeInTheDocument()
		await waitFor(() => {
			expect(screen.queryByText('ada.stone@example.com')).not.toBeInTheDocument()
		})
		expect(callsTo(stub.calls, 'UsersActiveTbl')).toHaveLength(2)
	})

	/**
	 * The wrapper typename, proven on its own. `userUpdateStatus` names both `GraphQLUserActiveTbl` and
	 * `GraphQLUsersActiveTblPage` — and a page with no rows carries only the second. Without it, an admin
	 * who had the empty Suspended filter cached before suspending somebody on Active would switch back to
	 * Suspended and see the same stale empty list rather than a fresh read.
	 */
	it('invalidates a different filter’s cached list too, even one with no rows to carry the row typename', async () => {
		const stub = stubGraphQL({
			...ABOVE,
			UsersActiveTbl: [page([]), page([customer()]), page([customer()]), page([])],
			UserUpdateStatus: { data: { userUpdateStatus: true } }
		})
		await renderRoute(`${CUSTOMERS}?status=suspended`)
		await waitFor(() => {
			expect(callsTo(stub.calls, 'UsersActiveTbl')).toHaveLength(1)
		})

		await userEvent.selectOptions(screen.getByLabelText('Status'), 'active')
		const form = await openSuspendForm('ada.stone@example.com')
		await userEvent.type(within(form).getByLabelText('Reason'), 'Fraud')
		await submitForm(form)
		await waitFor(() => {
			expect(callsTo(stub.calls, 'UsersActiveTbl')).toHaveLength(3)
		})

		await userEvent.selectOptions(screen.getByLabelText('Status'), 'suspended')
		await waitFor(() => {
			expect(callsTo(stub.calls, 'UsersActiveTbl')).toHaveLength(4)
		})
	})

	/**
	 * ⚠️ **Asymmetric on purpose: suspending asks for a reason, enabling asks for nothing.** Lifting a
	 * suspension ends no session and needs no note — and the platform owner's ruling is that an admin is
	 * the only one who can lift one at all, so the admin's click is the whole gesture. A second form
	 * here would train them to click through the one that matters.
	 *
	 * ⚠️ **`disabledReason: null` travels with it, and an omitted variable would not do.** The service
	 * `$unset`s the reason with the flag; a missing field reads as "leave it as it was" and would leave a
	 * spent reason attached to an account that is no longer suspended.
	 *
	 * The button is chosen by the row's own flag rather than by the filter in the URL, which is what this
	 * asserts: the row is the half that is still right if a cached page and the filter disagree.
	 */
	it('re-enables a suspended customer without asking, and clears the reason', async () => {
		const confirm = watchConfirm()
		const stub = stubGraphQL({
			...ABOVE,
			UsersActiveTbl: page([customer({ disabled: true, disabledReason: 'Chargeback fraud, ticket 4471.' })]),
			UserUpdateStatus: { data: { userUpdateStatus: true } }
		})
		await renderRoute(`${CUSTOMERS}?status=suspended`)

		await userEvent.click(within(await rowOf('ada.stone@example.com')).getByRole('button', { name: 'Enable' }))

		expect(confirm).not.toHaveBeenCalled()
		expect(screen.queryByRole('group', { name: /^Suspend / })).not.toBeInTheDocument()
		await waitFor(() => {
			expect(callsTo(stub.calls, 'UserUpdateStatus')[0]?.variables).toEqual({
				_id: '65f0000000000000000000c1',
				disabled: false,
				disabledReason: null
			})
		})
		expect(await screen.findByText(outcomeMessage('ada.stone@example.com', false))).toBeInTheDocument()
	})

	/**
	 * ⚠️ **The one screen on the platform where the reason is legible.** `disabledReason` is randomly
	 * encrypted (ADR-044), so the ShopOwner- and User-tier services hold ciphertext they have no data key
	 * for; it is decrypted here because here is who it was written for.
	 */
	it('shows the stored reason under the status of a suspended row', async () => {
		stubGraphQL({
			...ABOVE,
			UsersActiveTbl: page([customer({ disabled: true, disabledReason: 'Chargeback fraud, ticket 4471.' })])
		})
		await renderRoute(`${CUSTOMERS}?status=suspended`)

		const cells = within(await rowOf('ada.stone@example.com'))
		expect(cells.getByText('Suspended')).toBeInTheDocument()
		expect(cells.getByText('Chargeback fraud, ticket 4471.')).toBeInTheDocument()
	})

	/*
	 * ⚠️ A suspension raised before ADR-044 carries the flag and no reason. Printing an empty line under it
	 * would claim a reason was recorded; saying only "Suspended" is what actually happened.
	 */
	it('says only what it knows about a suspension that predates the reason', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer({ disabled: true })]) })
		await renderRoute(`${CUSTOMERS}?status=suspended`)

		const row = await rowOf('ada.stone@example.com')
		expect(within(row).getByText('Suspended')).toBeInTheDocument()
		expect(within(row).getByRole('cell', { name: 'Suspended' })).toBeInTheDocument()
	})

	/**
	 * A refused write says so and claims nothing. The success message is asserted absent in the same test
	 * because the failure that matters is not "no toast" but "the wrong toast": an admin told the
	 * account is suspended stops watching it.
	 */
	it('reports a refused write and claims nothing', async () => {
		stubGraphQL({
			...ABOVE,
			UsersActiveTbl: page([customer()]),
			UserUpdateStatus: { errors: [graphQLError('Oops', 'user not found', 404)], status: 404 }
		})
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await userEvent.type(within(form).getByLabelText('Reason'), 'Fraud')
		await submitForm(form)

		expect(await screen.findByRole('alert')).toHaveTextContent('user not found')
		expect(screen.queryByText(outcomeMessage('ada.stone@example.com', true))).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ The bug this guards against: closing the form unconditionally throws away up to
	 * `MAX_DISABLED_REASON` characters the admin just typed, the instant the click handler returns —
	 * before the mutation has said anything. A refusal must leave the form open with the reason still in
	 * the box, not just a generic toast and a blank page to retype into.
	 */
	it('keeps the form open with the reason intact when the write is refused', async () => {
		stubGraphQL({
			...ABOVE,
			UsersActiveTbl: page([customer()]),
			UserUpdateStatus: { errors: [graphQLError('Oops', 'user not found', 404)], status: 404 }
		})
		await renderRoute(CUSTOMERS)

		const form = await openSuspendForm('ada.stone@example.com')
		await userEvent.type(within(form).getByLabelText('Reason'), 'Fraud')
		await submitForm(form)

		await screen.findByRole('alert')
		expect(screen.getByRole('group', { name: 'Suspend ada.stone@example.com' })).toBeInTheDocument()
		expect(screen.getByLabelText('Reason')).toHaveValue('Fraud')
	})

	/**
	 * Asserted on the **Active** filter, deliberately: the column reads the row's own flag rather than
	 * inferring the state from the URL, so a closed account arriving on a cached page reads as closed
	 * instead of as trading.
	 */
	it('renders a closed account as closed rather than as active', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer({ deleted: '2026-05-01T00:00:00.000Z' })]) })
		await renderRoute(CUSTOMERS)

		expect(within(await rowOf('ada.stone@example.com')).getByText('Closed')).toBeInTheDocument()
	})

	/**
	 * ⚠️ **A closed account gets no button at all**, and neither of the two it could get would be honest.
	 * Suspending one writes a flag onto an account nobody can sign into; lifting a suspension on one
	 * promises a return `deleted` refuses — the personal data is thirty days from being overwritten in
	 * place (ADR-046), and only registering again with the same address takes the account back.
	 *
	 * Driven by the row's own `deleted` rather than by the filter, which is what this asserts by standing
	 * on the Suspended filter while the row carries both flags.
	 */
	it('offers no action on a closed account', async () => {
		stubGraphQL({
			...ABOVE,
			UsersActiveTbl: page([customer({ disabled: true, deleted: '2026-05-01T00:00:00.000Z' })])
		})
		await renderRoute(`${CUSTOMERS}?status=suspended`)

		const row = within(await rowOf('ada.stone@example.com'))
		expect(row.queryByRole('button')).not.toBeInTheDocument()
		expect(row.getByRole('cell', { name: '—' })).toBeInTheDocument()
	})

	it('renders an unconfirmed registration as awaiting confirmation', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer({ emailVerified: null })]) })
		await renderRoute(CUSTOMERS)

		expect(within(await rowOf('ada.stone@example.com')).getByText('Awaiting confirmation')).toBeInTheDocument()
	})

	/**
	 * The form as markup, which is where its accessibility lives: the heading that labels the group, the
	 * `whitespace-pre-line` that keeps the warning's paragraph break, the label bound to the box, and the
	 * counter's `aria-live`. None of that is visible to a test that only reads text.
	 */
	it('renders the suspension form', async () => {
		stubGraphQL({ ...ABOVE, UsersActiveTbl: page([customer()]) })
		await renderRoute(CUSTOMERS)

		await openSuspendForm('ada.stone@example.com')

		expect(screen.getByRole('group', { name: 'Suspend ada.stone@example.com' })).toMatchSnapshot()
	})

	// Both row shapes in one snapshot: the enabled account with its Suspend button, and the suspended one
	// with its Enable button and the reason under its status, so all three are pinned as markup rather than
	// only as text.
	it('renders', async () => {
		stubGraphQL({
			...ABOVE,
			UsersActiveTbl: page(
				[
					customer(),
					customer({
						_id: '65f0000000000000000000c3',
						email: 'cara.lane@example.com',
						disabled: true,
						disabledReason: 'Chargeback fraud, ticket 4471.'
					})
				],
				41
			)
		})
		await renderRoute(CUSTOMERS)

		await screen.findByText('ada.stone@example.com')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
