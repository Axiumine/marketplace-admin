import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'

import { type GraphQLCall, graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/**
 * The session console, driven through the real route.
 *
 * Through the router rather than by mounting the component, because the account being looked at *is* the
 * URL: a row has to be linkable from a ticket, and props assembled by hand here would test the console
 * against an input no operator can produce.
 */

const ACCOUNT = '68b0f2c1a2b3c4d5e6f70819'
const OTHER = '68b0f2c1a2b3c4d5e6f70820'

/** Two session ids, in the shape the index files them under: a 64-character SHA-256 digest. */
const FIELD_A = 'a3f1'.repeat(16)
const FIELD_B = 'b7c2'.repeat(16)

const FAMILY_A = '2f0b1d3c-8a55-4c1e-9d10-7c2f4a6b8e01'
const FAMILY_B = '6d4e9a17-2b30-4f8a-8e21-0c5b7d9f3a42'

/**
 * ⚠️ The `__typename` is load-bearing, as in the keygrip fixture: urql's document cache invalidates by the
 * typenames a *response* carries, and both revoke mutations answer a bare `Boolean` / `Int` that carries
 * none. A fixture without it would make the console's `additionalTypenames` look like decoration — the
 * revocation would report success and the table would go on listing the session it ended.
 */
const session = (over: Record<string, unknown> = {}) => ({
	__typename: 'GraphQLSession',
	id: FIELD_A,
	tier: 'shopOwner',
	mintedAt: '1786352400000',
	familyId: FAMILY_A,
	...over
})

const SESSIONS = { data: { sessions: [session(), session({ id: FIELD_B, mintedAt: '1786458600000', familyId: FAMILY_B })] } }
const ONE_SESSION = { data: { sessions: [session()] } }
const NO_SESSIONS = { data: { sessions: [] } }

const EVENTS = {
	data: {
		reuseEvents: [
			{
				__typename: 'GraphQLReuseEvent',
				familyId: FAMILY_B,
				tier: 'shopOwner',
				accountId: ACCOUNT,
				action: 'refreshTokenReplayed',
				at: '1785312300000'
			},
			{
				__typename: 'GraphQLReuseEvent',
				familyId: FAMILY_A,
				tier: 'shopOwner',
				accountId: ACCOUNT,
				action: 'sessionCapReached',
				at: '1780355700000'
			}
		]
	}
}

const NO_EVENTS = { data: { reuseEvents: [] } }

/** The keygrip half of the page is always mounted; every test here has to answer its one query. */
const KEYGRIP = {
	data: {
		keygripStatus: {
			__typename: 'GraphQLKeygripStatus',
			version: 3,
			fingerprint: 'a1b2c3d4e5f6',
			keys: [{ id: 'k3', createdAt: '2026-08-12T09:00:00.000Z', ageDays: 0 }],
			holders: []
		}
	}
}

/** jsdom's own `confirm` is `Not implemented`, so every test that reaches a revoke button answers it here. */
const respond = (response: boolean) => vi.spyOn(window, 'confirm').mockReturnValue(response)

const callsTo = (calls: readonly GraphQLCall[], operationName: string) =>
	calls.filter((call) => call.operationName === operationName)

/** The rows of one card, headers excluded, as arrays of cell text. */
const rowsOf = (name: string): string[][] =>
	within(screen.getByRole('region', { name }))
		.getAllByRole('row')
		.slice(1)
		.map((row) =>
			within(row)
				.getAllByRole('cell')
				.map((cell) => cell.textContent ?? '')
		)

const endButtons = () => within(screen.getByRole('region', { name: 'Sessions' })).getAllByRole('button', { name: /^End$/ })

/** The URL both queries are already looking at, so a test can start with the tables on screen. */
const AT_ACCOUNT = `/security?tier=shopOwner&accountId=${ACCOUNT}`

const loaded = () => screen.findByRole('region', { name: 'Sessions' })

describe('the account lookup', () => {
	/**
	 * ⚠️ Nothing is asked for until an account is named, and this is the assertion that keeps it that way.
	 * `sessions('')` is a perfectly legal query over an empty keyspace: it answers "no sessions", which reads
	 * exactly like a clean account. Opening the screen on that answer, for nobody, is the one plainly wrong
	 * thing this console could do.
	 */
	it('asks for nothing until an account is named', async () => {
		const stub = stubGraphQL({ KeygripStatus: KEYGRIP })
		await renderRoute('/security')

		expect(await screen.findByText('Name an account to list the sessions it holds.')).toBeInTheDocument()
		expect(callsTo(stub.calls, 'Sessions')).toHaveLength(0)
		expect(callsTo(stub.calls, 'ReuseEvents')).toHaveLength(0)
		expect(screen.queryByRole('region', { name: 'Sessions' })).not.toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		expect(screen.getByRole('region', { name: 'Sessions' })).toMatchSnapshot()
		expect(screen.getByRole('region', { name: 'Revoked lineages' })).toMatchSnapshot()
	})

	it('offers the three tiers, and the one the URL names is selected', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(`/security?tier=user&accountId=${ACCOUNT}`)

		const tier = screen.getByLabelText('Tier')

		expect(
			within(tier)
				.getAllByRole('option')
				.map((option) => option.textContent)
		).toEqual(['admin', 'shopOwner', 'user'])
		expect(tier).toHaveValue('user')
		expect(screen.getByLabelText('Account id')).toHaveValue(ACCOUNT)
	})

	/**
	 * The submit is what promotes the form to the URL, and both queries read it from there. Typing does not:
	 * a partial id is a valid lookup, so a query per keystroke would be a run of confident "no sessions"
	 * answers for accounts that have several.
	 */
	it('puts the account in the URL on submit, and asks both questions about it', async () => {
		const stub = stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		const { router } = await renderRoute('/security')

		await userEvent.selectOptions(screen.getByLabelText('Tier'), 'user')
		await userEvent.type(screen.getByLabelText('Account id'), ACCOUNT)

		expect(callsTo(stub.calls, 'Sessions')).toHaveLength(0)

		await userEvent.click(screen.getByRole('button', { name: 'Look up' }))

		await waitFor(() => {
			expect(callsTo(stub.calls, 'Sessions')).toHaveLength(1)
		})
		expect(router.state.location.search).toEqual({ tier: 'user', accountId: ACCOUNT })
		expect(callsTo(stub.calls, 'Sessions')[0]?.variables).toEqual({ tier: 'user', accountId: ACCOUNT })
		expect(callsTo(stub.calls, 'Sessions')[0]?.url).toBe(ENDPOINT.adminResource)
		expect(callsTo(stub.calls, 'ReuseEvents')[0]?.variables).toEqual({ tier: 'user', accountId: ACCOUNT })
	})

	// A pasted id arrives with the whitespace the paste brought. Sent as typed it is a different key, and the
	// answer is "no sessions" for an account that is signed in on four devices.
	it('trims the account id before it reaches the URL', async () => {
		const stub = stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute('/security')

		await userEvent.type(screen.getByLabelText('Account id'), `  ${ACCOUNT}  `)
		await userEvent.click(screen.getByRole('button', { name: 'Look up' }))

		await waitFor(() => {
			expect(callsTo(stub.calls, 'Sessions')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'Sessions')[0]?.variables).toEqual({ tier: 'shopOwner', accountId: ACCOUNT })
	})

	/**
	 * A replacement, not a merge. Carrying the previous account forward under a newly chosen tier would look
	 * an id up in a keyspace it does not belong to — the same confident "no sessions" for an account that has
	 * several, arrived at a different way.
	 */
	it('replaces the whole lookup rather than merging it with the one before', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		const { router } = await renderRoute(AT_ACCOUNT)

		await loaded()
		await userEvent.clear(screen.getByLabelText('Account id'))
		await userEvent.type(screen.getByLabelText('Account id'), OTHER)
		await userEvent.selectOptions(screen.getByLabelText('Tier'), 'admin')
		await userEvent.click(screen.getByRole('button', { name: 'Look up' }))

		await waitFor(() => {
			expect(router.state.location.search).toEqual({ tier: 'admin', accountId: OTHER })
		})
	})

	// A URL nobody can produce by clicking is still a URL an operator can paste. Both fields fall back rather
	// than crashing the screen they were meant to open.
	it('falls back to shopOwner and no account when the URL says something else', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP })
		await renderRoute('/security?tier=root&accountId=')

		expect(await screen.findByText('Name an account to list the sessions it holds.')).toBeInTheDocument()
		expect(screen.getByLabelText('Tier')).toHaveValue('shopOwner')
	})

	/*
	 * ⚠️ The empty tier separately from the unknown one, because the two fail the enum at different places and
	 * only this one can be swallowed by a hole in it. `tier=root` is refused by any list that does not contain
	 * `root`, so it falls back whatever the list holds; `tier=` falls back only while the empty string is
	 * *absent* from the list. A tier accidentally spelled `''` would make this URL parse successfully, hand the
	 * console an empty tier, and send `sessionIndexKey('', id)` — a key that has never existed — so the screen
	 * would answer "no live session" for an account holding several. Silence in the one direction an operator
	 * cannot detect.
	 */
	it('falls back to shopOwner when the URL carries an empty tier', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP })
		await renderRoute('/security?tier=&accountId=')

		expect(await screen.findByText('Name an account to list the sessions it holds.')).toBeInTheDocument()
		expect(screen.getByLabelText('Tier')).toHaveValue('shopOwner')
	})

	/*
	 * By the spinner's label text and not by `getByRole('status', { name })`: `status` is a live-region role,
	 * which takes its name from the author rather than from its contents, so a name query never matches one.
	 */
	it('waits while the sessions are being read', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: { pending: true }, ReuseEvents: { pending: true } })
		await renderRoute(AT_ACCOUNT)

		expect(await screen.findByText('Loading the sessions')).toBeInTheDocument()
		expect(screen.queryByRole('region', { name: 'Sessions' })).not.toBeInTheDocument()
	})

	// The other half of the same condition: the spinner has to *stop*. A wait that outlives the answer reads
	// as a read still in flight, and the operator waits for a table that is already under it.
	it('stops waiting once the table is on screen', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		expect(screen.queryByText('Loading the sessions')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ The absence is asserted by *text*, not by `getByRole('status', { name })`. `role="status"` is a live
	 * region: it takes its accessible name from the author, and the Spinner sets none — so a name query
	 * against it matches nothing whether the spinner is mounted or not, and passes either way. A failed read
	 * has no data and never will, so a spinner left beside the error is a wait that cannot end.
	 */
	it('reports a refused read instead of spinning', async () => {
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: { errors: [graphQLError('Oops', 'no such account', 404)], status: 404 },
			ReuseEvents: NO_EVENTS
		})
		await renderRoute(AT_ACCOUNT)

		expect(await screen.findByRole('alert')).toHaveTextContent('no such account')
		expect(screen.queryByText('Loading the sessions')).not.toBeInTheDocument()
	})

	// The trail is read separately, so it can fail separately. A refused trail must not take the session
	// table off the screen: ending the sessions is the action, and the trail is the explanation.
	it('keeps the session table when only the trail is refused', async () => {
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: SESSIONS,
			ReuseEvents: { errors: [graphQLError('Oops', 'the trail could not be read', 500)], status: 500 }
		})
		await renderRoute(AT_ACCOUNT)

		expect(await screen.findByRole('alert')).toHaveTextContent('the trail could not be read')
		expect(rowsOf('Sessions')).toHaveLength(2)
	})
})

describe('the session table', () => {
	/**
	 * ⚠️ Four columns, and the omissions are the contract (BCON-01, E17 §2). No token, no prefix of one,
	 * and nothing network- or device-derived: there is no address column because there is no address field,
	 * by the standing decision. The `id` is the session index field — a SHA-256 digest of the prefixed
	 * refresh token — which is why it can be shown *and* handed back to `revokeSession`.
	 *
	 * `mintedAt` is the login the session descends from, not its last rotation: a session refreshing every
	 * fifteen minutes must not read as freshly created.
	 */
	it('lists each session by digest, login time and lineage, and nothing else', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		expect(rowsOf('Sessions')).toEqual([
			[FIELD_A, '10 August 2026 at 09:00:00', FAMILY_A, 'End'],
			[FIELD_B, '11 August 2026 at 14:30:00', FAMILY_B, 'End']
		])
		expect(
			within(screen.getByRole('region', { name: 'Sessions' }))
				.getAllByRole('columnheader')
				.map((h) => h.textContent)
		).toEqual(['Session', 'Signed in since', 'Lineage', 'Action'])
	})

	/**
	 * ⚠️ An empty table is an answer here, and a load-bearing one: it is what an operator reads after ending
	 * everything, and what tells them a suspected account is signed in nowhere. Left as bare headers it reads
	 * as a screen that failed to load.
	 */
	it('says so when the account holds no session, and offers nothing to end', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: NO_SESSIONS, ReuseEvents: NO_EVENTS })
		await renderRoute(AT_ACCOUNT)

		expect(await screen.findByText('This account holds no live session.')).toBeInTheDocument()
		expect(rowsOf('Sessions')).toEqual([])
		expect(screen.queryByRole('button', { name: /End every session/ })).not.toBeInTheDocument()
	})
})

describe('the revocation trail', () => {
	// The store's two reason codes, as sentences. `familyId` is the column that joins a line here to the rows
	// `sessions` has stopped returning — which is what turns "I was logged out of everything" into an answer.
	it('explains each revoked lineage in words', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		expect(rowsOf('Revoked lineages')).toEqual([
			['29 July 2026 at 08:05:00', FAMILY_B, 'A refresh token that had already been used was presented again'],
			['1 June 2026 at 23:15:00', FAMILY_A, 'The session reached the maximum age a login is allowed']
		])
	})

	/**
	 * ⚠️ Empty is the normal, healthy state, and has to say so in as many words. An operator who read a blank
	 * trail as "the trail is broken" would go looking for a logging fault instead of reading it as the good
	 * news it is.
	 */
	it('says that an empty trail is the expected state', async () => {
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: NO_EVENTS })
		await renderRoute(AT_ACCOUNT)

		expect(await screen.findByText('Nothing has been revoked for this account. That is the expected state.')).toBeInTheDocument()
		expect(rowsOf('Revoked lineages')).toEqual([])
	})

	/*
	 * ⚠️ The trail is the one list here with no id of its own: an event is a lineage *and* an instant, and
	 * either alone repeats — a family that replayed twice, or two families capped in the same millisecond.
	 * A row key that collapses is not a rendering nit on this screen: React would reconcile two entries of
	 * the same trail onto one node, and the row an operator reads as "this lineage, at this time" would be
	 * carrying another event's cells. The duplicate-key warning is the only place a collapsed key surfaces,
	 * so it is asserted rather than left to be noticed in a console nobody is watching.
	 */
	it('keys each event by its lineage and its instant, so no two rows collide', async () => {
		const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined)
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		expect(rowsOf('Revoked lineages')).toHaveLength(2)
		expect(warn.mock.calls.flat().join(' ')).not.toMatch(/same key/)
	})
})

/**
 * ⚠️ Every test below asserts a blocked round-trip or a sent one. Ending a session is destructive and cannot
 * be undone from here — the account has to sign in again — so "the button looks right" and "the button does
 * the right thing" are told apart by the call count, never by the rendering.
 */
describe('ending one session', () => {
	const end = async (index: number) => {
		await userEvent.click(endButtons()[index] as HTMLElement)
	}

	/**
	 * The confirmation names the blast radius: one session, and whose. The id beside the button is a
	 * 64-character digest no operator reads across, so the account is the thing they can check against the
	 * ticket — and the residual is spelled out, because an access token already in a browser cannot be
	 * recalled and an operator who believed otherwise would close an incident early.
	 */
	it('asks first, stating what ends and what does not, and sends nothing when the operator says no', async () => {
		const confirm = respond(false)
		const stub = stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await end(0)

		expect(confirm).toHaveBeenCalledWith(
			`End 1 session of shopOwner ${ACCOUNT}?\n\n` +
				'That one session only. The account is not disabled and can sign in again straight away.\n\n' +
				'Its access token keeps working until it expires — ending a session ends the refresh lineage, and a ' +
				'token already in a browser cannot be recalled.'
		)
		expect(callsTo(stub.calls, 'RevokeSession')).toHaveLength(0)
	})

	it('sends the digest of the clicked row, with the account the URL names', async () => {
		respond(true)
		const stub = stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: [SESSIONS, ONE_SESSION],
			ReuseEvents: EVENTS,
			RevokeSession: { data: { revokeSession: true } }
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await end(1)

		await waitFor(() => {
			expect(callsTo(stub.calls, 'RevokeSession')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'RevokeSession')[0]?.variables).toEqual({
			tier: 'shopOwner',
			accountId: ACCOUNT,
			id: FIELD_B
		})
		expect(callsTo(stub.calls, 'RevokeSession')[0]?.url).toBe(ENDPOINT.adminResource)
	})

	/**
	 * The `additionalTypenames` on the call site, proven rather than assumed. `revokeSession` answers a bare
	 * boolean, which names no typename to invalidate, so without it the table would go on listing the session
	 * that was just ended — on the one screen where that is not a stale read but a wrong answer to "did it
	 * work".
	 */
	it('re-reads the table afterwards and confirms', async () => {
		respond(true)
		const stub = stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: [SESSIONS, ONE_SESSION],
			ReuseEvents: EVENTS,
			RevokeSession: { data: { revokeSession: true } }
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await end(1)

		expect(await screen.findByText('The session was ended')).toBeInTheDocument()
		await waitFor(() => {
			expect(rowsOf('Sessions')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'Sessions')).toHaveLength(2)
	})

	/**
	 * ⚠️ `false` is an answer, not a failure: the session had already ended. Reported as an error it trains an
	 * operator to retry a call that has already done everything it can; reported as a success it tells them
	 * they ended something they did not.
	 */
	it('passes an already-ended session through as its own answer rather than as a failure', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: SESSIONS,
			ReuseEvents: EVENTS,
			RevokeSession: { data: { revokeSession: false } }
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await end(0)

		expect(await screen.findByText('That session had already ended')).toBeInTheDocument()
		expect(screen.queryByText('The session was ended')).not.toBeInTheDocument()
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	// The rate limit is per operator and per account (E17-S03). Its refusal has to be readable, or the
	// operator retries into it and reads the silence as a broken screen.
	it('reports a refusal, and confirms nothing', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: SESSIONS,
			ReuseEvents: EVENTS,
			RevokeSession: {
				errors: [graphQLError('Too Many Requests', 'too many revocations for this account this hour', 429)],
				status: 429
			}
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await end(0)

		expect(await screen.findByRole('alert')).toHaveTextContent('too many revocations for this account this hour')
		expect(screen.queryByText('The session was ended')).not.toBeInTheDocument()
	})

	// Data and errors in one answer is legal GraphQL. "The session was ended" under a red toast would leave
	// the operator to guess which half is true.
	it('does not confirm when the answer carries an error alongside the data', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: SESSIONS,
			ReuseEvents: EVENTS,
			RevokeSession: {
				data: { revokeSession: true },
				errors: [graphQLError('Oops', 'the index changed while the session was being ended', 409)],
				status: 409
			}
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await end(0)

		expect(await screen.findByRole('alert')).toHaveTextContent('the index changed while the session was being ended')
		expect(screen.queryByText('The session was ended')).not.toBeInTheDocument()
		expect(screen.queryByText('That session had already ended')).not.toBeInTheDocument()
	})
})

describe('ending every session an account holds', () => {
	const endAll = async () => {
		await userEvent.click(screen.getByRole('button', { name: /End every session/ }))
	}

	/**
	 * ⚠️ The count in the confirmation is the one on screen, so the operator agrees to a number they can see.
	 * It is per account and there is deliberately no "every account" form of it anywhere: a button that
	 * logged out a whole tier would be a platform-wide outage one click away.
	 */
	it('asks first, naming how many sessions and whose, and sends nothing when the operator says no', async () => {
		const confirm = respond(false)
		const stub = stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: SESSIONS, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		expect(confirm).toHaveBeenCalledWith(
			`End all 2 sessions of shopOwner ${ACCOUNT}?\n\n` +
				'Every device and browser this one account is signed in on, and no other account.\n\n' +
				'Access tokens already issued keep working until they expire, as above.'
		)
		expect(callsTo(stub.calls, 'RevokeAllSessions')).toHaveLength(0)
	})

	// One session is still a plural in the wrong hands: "all 1 sessions" is the sort of sentence that makes an
	// operator stop and re-read a dialog they should be able to act on.
	it('counts one session in the singular', async () => {
		const confirm = respond(false)
		stubGraphQL({ KeygripStatus: KEYGRIP, Sessions: ONE_SESSION, ReuseEvents: EVENTS })
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		expect(confirm).toHaveBeenCalledWith(expect.stringContaining(`End all 1 session of shopOwner ${ACCOUNT}?`))
	})

	/**
	 * The answer is the count the service actually ended, which is the blast radius that landed rather than
	 * the one on screen when the button was pressed — a session minted between the read and the click goes
	 * too.
	 */
	it('sends the account, re-reads the table and reports how many went', async () => {
		respond(true)
		const stub = stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: [SESSIONS, NO_SESSIONS],
			ReuseEvents: EVENTS,
			RevokeAllSessions: { data: { revokeAllSessions: 3 } }
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		expect(await screen.findByText('3 sessions ended')).toBeInTheDocument()
		expect(callsTo(stub.calls, 'RevokeAllSessions')[0]?.variables).toEqual({ tier: 'shopOwner', accountId: ACCOUNT })
		await waitFor(() => {
			expect(screen.getByText('This account holds no live session.')).toBeInTheDocument()
		})
	})

	// Zero is an answer worth showing rather than hiding: the sessions ended between the read and the click,
	// and an operator told nothing would press the button again.
	it('reports a count of none as a count', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: [SESSIONS, NO_SESSIONS],
			ReuseEvents: EVENTS,
			RevokeAllSessions: { data: { revokeAllSessions: 0 } }
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		expect(await screen.findByText('0 sessions ended')).toBeInTheDocument()
	})

	it('reports one ended session in the singular', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: [SESSIONS, NO_SESSIONS],
			ReuseEvents: EVENTS,
			RevokeAllSessions: { data: { revokeAllSessions: 1 } }
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		expect(await screen.findByText('1 session ended')).toBeInTheDocument()
	})

	it('reports a refusal, and no count', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: SESSIONS,
			ReuseEvents: EVENTS,
			RevokeAllSessions: {
				errors: [graphQLError('Too Many Requests', 'too many mass revocations this hour', 429)],
				status: 429
			}
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		expect(await screen.findByRole('alert')).toHaveTextContent('too many mass revocations this hour')
		expect(screen.queryByText(/sessions ended/)).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ Data and errors in one answer is legal GraphQL, and this is the count where believing the data half
	 * is worst: "4 sessions ended" under a red toast tells an operator the account is clear when the service
	 * has just said the revocation did not complete. The count is tied to the *absence of an error* and not
	 * merely to a number having arrived, exactly as the single revocation is.
	 */
	it('reports no count when the answer carries an error alongside the data', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: SESSIONS,
			ReuseEvents: EVENTS,
			RevokeAllSessions: {
				data: { revokeAllSessions: 4 },
				errors: [graphQLError('Conflict', 'the session index changed while the account was being cleared', 409)],
				status: 409
			}
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		expect(await screen.findByRole('alert')).toHaveTextContent('the session index changed while the account was being cleared')
		expect(screen.queryByText(/sessions ended/)).not.toBeInTheDocument()
	})

	// The window in which a second click would send a second mass revocation. The table stays on screen: it is
	// what the operator is comparing against, and a spinner in its place loses the rows they were reading.
	it('holds the button while the revocation is in flight', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: KEYGRIP,
			Sessions: SESSIONS,
			ReuseEvents: EVENTS,
			RevokeAllSessions: { pending: true }
		})
		await renderRoute(AT_ACCOUNT)

		await loaded()
		await endAll()

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /End every session/ })).toBeDisabled()
		})
		expect(rowsOf('Sessions')).toHaveLength(2)
	})
})
