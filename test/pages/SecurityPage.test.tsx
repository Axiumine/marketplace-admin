import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'

import { type GraphQLCall, graphQLError, stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

/**
 * ⚠️ The `__typename` is load-bearing, for the reason the Companies fixture gives: urql's document
 * cache invalidates by the typenames a *response* carries, and `keygripRotate` answers a bare boolean
 * that carries none. A fixture without it would make the panel's `additionalTypenames` look like
 * decoration — the rotation would report success and the table would never re-read.
 */
const keygripStatus = (over: Record<string, unknown> = {}) => ({
	__typename: 'GraphQLKeygripStatus',
	version: 3,
	fingerprint: 'a1b2c3d4e5f6',
	keys: [
		{ id: 'k3', createdAt: '2026-08-12T09:00:00.000Z', ageDays: 0 },
		{ id: 'k2', createdAt: '2026-07-20T09:00:00.000Z', ageDays: 23 },
		{ id: 'k1', createdAt: '2026-06-10T09:00:00.000Z', ageDays: 63 }
	],
	holders: [
		{
			service: 'marketplace-dev-authenticated-authorization',
			fingerprint: 'a1b2c3d4e5f6',
			lastSeen: '2026-08-12T09:05:00.000Z',
			current: true
		},
		{
			service: 'marketplace-dev-authenticated-logout',
			fingerprint: '9f8e7d6c5b4a',
			lastSeen: '2026-08-12T08:10:00.000Z',
			current: false
		}
	],
	...over
})

const READ = { data: { keygripStatus: keygripStatus() } }

/** What the record looks like once a rotation has landed: a new version, a new fingerprint, one key more. */
const READ_AFTER = {
	data: {
		keygripStatus: keygripStatus({
			version: 4,
			fingerprint: '0102030405f0',
			keys: [{ id: 'k4', createdAt: '2026-08-12T10:00:00.000Z', ageDays: 0 }, ...keygripStatus().keys],
			holders: []
		})
	}
}

const ROTATED = { data: { keygripRotate: true } }

/**
 * jsdom's own `confirm` is `Not implemented`, so every test that reaches the rotate button answers it
 * here — see the same helper on the detail page.
 */
const respond = (response: boolean) => vi.spyOn(window, 'confirm').mockReturnValue(response)

/**
 * Waits for the record to be on screen.
 *
 * The button and not the fingerprint, which would be the obvious choice: the record's fingerprint and
 * the fingerprint of the service that is up to date are the same string — that is what `current: true`
 * means — so a text query for it matches twice and throws.
 *
 * The name is a regular expression because a rotation in flight puts the spinner's own label in front
 * of it, so the accessible name is "Loading Rotate the key" for as long as the mutation is unanswered.
 */
const loaded = () => screen.findByRole('button', { name: /Rotate the key/ })

const rotate = async () => {
	await userEvent.click(screen.getByRole('button', { name: /Rotate the key/ }))
}

/** The rows of one of the two tables, headers excluded, as arrays of cell text. */
const rowsOf = (name: string): string[][] =>
	within(screen.getByRole('region', { name }))
		.getAllByRole('row')
		.slice(1)
		.map((row) =>
			within(row)
				.getAllByRole('cell')
				.map((cell) => cell.textContent ?? '')
		)

const callsTo = (calls: readonly GraphQLCall[], operationName: string) =>
	calls.filter((call) => call.operationName === operationName)

describe('SecurityPage', () => {
	it('shows the page title and both sections', async () => {
		stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		expect(screen.getByRole('heading', { name: 'Security', level: 1 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Sessions', level: 2 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Account', level: 3 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Cookie-signing keys', level: 2 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Current key set', level: 3 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Keys', level: 3 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Holders', level: 3 })).toBeInTheDocument()
	})

	/**
	 * ⚠️ The adoption delay is on the card with the buttons rather than in a footnote. Neither action takes
	 * effect everywhere at once: adoption rides a Redis publish, measured at 37 ms across the five signing
	 * services, with the 5-minute fallback poll as the ceiling for a lost message. An admin who read the
	 * toast as "done everywhere" would tell an incident channel a compromised key was out of use while a
	 * service that missed the nudge was still verifying with it.
	 */
	it('states the propagation window beside the actions', async () => {
		stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		const card = await screen.findByRole('region', { name: 'Current key set' })

		expect(card).toHaveTextContent('37 ms measured across the five signing services')
		expect(card).toHaveTextContent('up to 5 minutes if the notification is lost')
		expect(within(card).getByRole('button', { name: /Rotate the key/ })).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		await loaded()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})

	it('reads the record from the admin-resource endpoint', async () => {
		const stub = stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.operationName).toBe('KeygripStatus')
		expect(stub.calls[0]?.variables).toEqual({})
		expect(stub.calls[0]?.url).toBe(ENDPOINT.adminResource)
	})

	/*
	 * By the spinner's label text rather than by role: the session console above this panel is paused with no
	 * account named and the line it shows instead is a polite live region too, so the role alone is ambiguous
	 * — and `status`, being a live-region role, takes its name from the author rather than from its contents,
	 * so narrowing by name would match nothing at all.
	 */
	it('waits while the record is being read', async () => {
		stubGraphQL({ KeygripStatus: { pending: true } })
		await renderRoute('/security')

		expect(screen.getByText('Loading the key set')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Rotate the key/ })).not.toBeInTheDocument()
	})

	// A refused read leaves nothing to render, and the panel must say so rather than spin: the record is
	// unwrapped under this service's own `KEYGRIP_KEK`, so a 500 here is the one failure an admin has
	// to act on immediately.
	it('reports a refused read instead of spinning', async () => {
		stubGraphQL({
			KeygripStatus: {
				errors: [graphQLError('Error reported to Dev Team.', 'KEYGRIP_KEK_MISMATCH: this service cannot unwrap', 500)],
				status: 500
			}
		})
		await renderRoute('/security')

		expect(await screen.findByRole('alert')).toHaveTextContent('KEYGRIP_KEK_MISMATCH: this service cannot unwrap')
		expect(screen.queryByRole('button', { name: /Rotate the key/ })).not.toBeInTheDocument()
	})

	it('names the version and the fingerprint of the record', async () => {
		stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		// Label and value together, so a row that lost its value still fails: `toHaveTextContent` reads the
		// card's whole text, and the two spans of an `InfoRow` are adjacent in it.
		const card = await screen.findByRole('region', { name: 'Current key set' })
		expect(card).toHaveTextContent('Version3')
		expect(card).toHaveTextContent('Fingerprinta1b2c3d4e5f6')
	})

	/**
	 * Newest first, and in the server's order rather than one rebuilt here: the first key is the one that
	 * signs, so re-sorting the array in the browser would be a second opinion about which key that is.
	 *
	 * The ages come from the server too. They are asserted as they arrive — a screen that recomputed them
	 * from `createdAt` against the browser's clock could offer a key as retirable while the rotation,
	 * which uses the server's, refuses it.
	 */
	it('lists the keys in the order the service returned them, with the ages it computed', async () => {
		stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		await loaded()
		expect(rowsOf('Keys')).toEqual([
			['k3', '12 August 2026 at 09:00:00', '0', 'Signing'],
			['k2', '20 July 2026 at 09:00:00', '23', 'Retire'],
			['k1', '10 June 2026 at 09:00:00', '63', 'Retire']
		])
	})

	/**
	 * The reason the screen exists: "the mutation returned true" and "the fleet agrees" are two different
	 * claims, and the second one is only visible here. The state is spelled as a word and not only as a
	 * colour — a red cell reading the same as the green one beside it is invisible to a colour-blind admin
	 * and in any black-and-white printout of a ticket.
	 */
	it('marks the service whose fingerprint is behind the record', async () => {
		stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		await screen.findByText('marketplace-dev-authenticated-logout')
		expect(rowsOf('Holders')).toEqual([
			['marketplace-dev-authenticated-authorization', 'a1b2c3d4e5f6', '12 August 2026 at 09:05:00', 'Current'],
			['marketplace-dev-authenticated-logout', '9f8e7d6c5b4a', '12 August 2026 at 08:10:00', 'Behind']
		])
		expect(screen.queryByText('No service has reported holding this key set.')).not.toBeInTheDocument()
	})

	/**
	 * ⚠️ An empty holders table is not "nothing to report". A row ages out an hour after its service last
	 * reported, so an empty table means no service is holding this record at all — a fleet that is down,
	 * or a record seeded moments ago. Left as an empty table it reads as a screen that failed to load.
	 */
	it('says so when no service is holding the record', async () => {
		stubGraphQL({ KeygripStatus: { data: { keygripStatus: keygripStatus({ holders: [] }) } } })
		await renderRoute('/security')

		expect(await screen.findByText('No service has reported holding this key set.')).toBeInTheDocument()
		expect(rowsOf('Holders')).toEqual([])
		expect(screen.getByRole('region', { name: 'Holders' })).toMatchSnapshot()
	})
})

/**
 * ⚠️ Every test below asserts a blocked round-trip or a sent one. This is the one button in the app
 * whose effect is fleet-wide and cannot be undone — a new key cannot be un-minted — so "the button
 * looks right" and "the button does the right thing" have to be told apart by the call count.
 */
describe('rotating the key', () => {
	it('asks first, and sends nothing when the admin says no', async () => {
		const confirm = respond(false)
		const stub = stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		await loaded()
		await rotate()

		expect(confirm).toHaveBeenCalledWith(
			'Rotate the cookie-signing key for the whole platform?\n\n' +
				'Every service picks the new key up on its own, with no restart. Sessions stay signed in — the ' +
				'previous keys are kept until nothing can still be verified with them.'
		)
		expect(callsTo(stub.calls, 'KeygripRotate')).toHaveLength(0)
	})

	/**
	 * No variables, and to the admin-resource endpoint. The absence is the assertion: a `version` or a key
	 * argument would let its sender install a key of their choosing, which is the ability to mint a
	 * session cookie for any account on the platform.
	 */
	it('sends the rotation with no arguments once the admin agrees', async () => {
		respond(true)
		const stub = stubGraphQL({ KeygripStatus: [READ, READ_AFTER], KeygripRotate: ROTATED })
		await renderRoute('/security')

		await loaded()
		await rotate()

		await waitFor(() => {
			expect(callsTo(stub.calls, 'KeygripRotate')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'KeygripRotate')[0]?.variables).toEqual({})
		expect(callsTo(stub.calls, 'KeygripRotate')[0]?.url).toBe(ENDPOINT.adminResource)
	})

	/**
	 * The `additionalTypenames` on the call site, proven rather than assumed. `keygripRotate` answers a
	 * bare boolean, which names no typename to invalidate, so without it the panel would go on showing
	 * the record the rotation replaced — on the one screen where a stale read is the entire failure: the
	 * admin rotated in order to watch the fleet converge, and would be watching the old fingerprint
	 * converge on itself.
	 */
	it('re-reads the record after a rotation and shows the new one', async () => {
		respond(true)
		const stub = stubGraphQL({ KeygripStatus: [READ, READ_AFTER], KeygripRotate: ROTATED })
		await renderRoute('/security')

		await loaded()
		await rotate()

		expect(await screen.findByText('0102030405f0')).toBeInTheDocument()
		expect(callsTo(stub.calls, 'KeygripStatus')).toHaveLength(2)
		expect(rowsOf('Keys')[0]).toEqual(['k4', '12 August 2026 at 10:00:00', '0', 'Signing'])
	})

	it('confirms a rotation that landed', async () => {
		respond(true)
		stubGraphQL({ KeygripStatus: [READ, READ_AFTER], KeygripRotate: ROTATED })
		await renderRoute('/security')

		await loaded()
		await rotate()

		// `status`, not `alert`: a confirmation is announced politely, without interrupting the reader.
		expect(await screen.findByText('The key set was rotated')).toBeInTheDocument()
	})

	/**
	 * 409 is the compare-and-set losing: another admin, or another tab, swapped the record first. The
	 * refusal has to be visible, because the record on screen after it is somebody else's rotation and
	 * not this one's — and a silent failure here reads as "nothing happened", which is the one reading
	 * that is wrong.
	 */
	it('reports a rotation the service refused', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: READ,
			KeygripRotate: {
				errors: [graphQLError('Conflict', 'The key set changed while this rotation was being prepared', 409)],
				status: 409
			}
		})
		await renderRoute('/security')

		await loaded()
		await rotate()

		expect(await screen.findByRole('alert')).toHaveTextContent('The key set changed while this rotation was being prepared')
		expect(screen.queryByText('The key set was rotated')).not.toBeInTheDocument()
	})

	// GraphQL allows a response to carry data *and* errors. "The key set was rotated" under a red toast
	// would leave the admin to guess which half is true.
	it('does not confirm when the answer carries an error alongside the data', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: READ,
			KeygripRotate: {
				data: { keygripRotate: true },
				errors: [graphQLError('Conflict', 'The key set changed while this rotation was being prepared', 409)],
				status: 409
			}
		})
		await renderRoute('/security')

		await loaded()
		await rotate()

		expect(await screen.findByRole('alert')).toHaveTextContent('The key set changed while this rotation was being prepared')
		expect(screen.queryByText('The key set was rotated')).not.toBeInTheDocument()
	})

	// `false` with no error is the service refusing without saying why. Announcing a rotation would tell
	// the admin the fleet is about to converge on a key that was never minted.
	it('does not confirm when the mutation answers false', async () => {
		respond(true)
		const stub = stubGraphQL({ KeygripStatus: READ, KeygripRotate: { data: { keygripRotate: false } } })
		await renderRoute('/security')

		await loaded()
		await rotate()

		await waitFor(() => {
			expect(callsTo(stub.calls, 'KeygripRotate')).toHaveLength(1)
		})
		expect(screen.queryByText('The key set was rotated')).not.toBeInTheDocument()
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	// A rotation in flight is the window in which a second click would mint a second key. The button
	// carries its own spinner rather than the panel doing so: the table beside it is still valid, and
	// replacing it with a spinner would hide the fingerprint the admin is about to compare against.
	it('holds the button while the rotation is in flight', async () => {
		respond(true)
		stubGraphQL({ KeygripStatus: READ, KeygripRotate: { pending: true } })
		await renderRoute('/security')

		await loaded()
		await rotate()

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Rotate the key/ })).toBeDisabled()
		})
		expect(screen.getByRole('region', { name: 'Holders' })).toBeInTheDocument()
	})
})

/**
 * ⚠️ Retiring a key is the one action this app can send that signs customers out on purpose. Every test
 * below asserts either a blocked round-trip, a sent one, or a refusal made visible — "the button looks
 * right" and "the button did the right thing" are told apart by the call count, and a refusal that renders
 * as nothing is the specific failure the server-side 404 exists to prevent.
 */
describe('retiring a key', () => {
	/** The retire button on one row of the Keys table, found through the row rather than by position. */
	const retireButtonFor = (id: string) => {
		const row = within(screen.getByRole('region', { name: 'Keys' }))
			.getAllByRole('row')
			.find((candidate) => within(candidate).queryByText(id) !== null)

		return within(row as HTMLElement).queryByRole('button', { name: /Retire/ })
	}

	const retire = async (id: string) => {
		await userEvent.click(retireButtonFor(id) as HTMLElement)
	}

	/**
	 * ⚠️ The key the platform signs with is **not offered at all**, not offered and disabled.
	 * `retireKeygripKey` refuses it server-side with a 409, because removing it would leave the platform
	 * signing with a key an admin has just declared untrustworthy — rotation is what moves a suspect key down
	 * the array, from where this action can take it. A disabled button would teach that rule as a dead end;
	 * the word "Signing" says which key it is and why.
	 */
	it('offers no retire on the key the platform is signing with', async () => {
		stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		await loaded()
		expect(retireButtonFor('k3')).toBeNull()
		expect(within(screen.getByRole('region', { name: 'Keys' })).getByText('Signing')).toBeInTheDocument()
		expect(retireButtonFor('k2')).toBeInTheDocument()
		expect(retireButtonFor('k1')).toBeInTheDocument()
	})

	it('asks first, naming the key and who is signed out, and sends nothing when the admin says no', async () => {
		const confirm = respond(false)
		const stub = stubGraphQL({ KeygripStatus: READ })
		await renderRoute('/security')

		await loaded()
		await retire('k2')

		expect(confirm).toHaveBeenCalledWith(
			'Retire the signing key k2 from the whole platform?\n\n' +
				'Every cookie this key signed stops verifying, so everyone still holding one is signed out — customers ' +
				'included. This is the answer to a key you believe has leaked, not routine maintenance: rotation is ' +
				'what retires keys safely, on age, without ending a single session.'
		)
		expect(callsTo(stub.calls, 'KeygripRetire')).toHaveLength(0)
	})

	// The id of the row that was clicked, and nothing else. Never key material, never a version: the id is
	// public by construction — the panel renders it and the fingerprint is computed over the ids.
	it('sends the id of the clicked row once the admin agrees', async () => {
		respond(true)
		const stub = stubGraphQL({ KeygripStatus: READ, KeygripRetire: { data: { keygripRetire: true } } })
		await renderRoute('/security')

		await loaded()
		await retire('k1')

		await waitFor(() => {
			expect(callsTo(stub.calls, 'KeygripRetire')).toHaveLength(1)
		})
		expect(callsTo(stub.calls, 'KeygripRetire')[0]?.variables).toEqual({ id: 'k1' })
		expect(callsTo(stub.calls, 'KeygripRetire')[0]?.url).toBe(ENDPOINT.adminResource)
	})

	it('re-reads the key set after a retire and confirms it', async () => {
		respond(true)
		const stub = stubGraphQL({
			KeygripStatus: [READ, { data: { keygripStatus: keygripStatus({ keys: keygripStatus().keys.slice(0, 2) }) } }],
			KeygripRetire: { data: { keygripRetire: true } }
		})
		await renderRoute('/security')

		await loaded()
		await retire('k1')

		expect(await screen.findByText('The key was retired')).toBeInTheDocument()
		expect(callsTo(stub.calls, 'KeygripStatus')).toHaveLength(2)
		expect(rowsOf('Keys').map((row) => row[0])).toEqual(['k3', 'k2'])
	})

	/**
	 * ⚠️ The point this whole screen turns on. The service answers **404** for an id nothing matches rather
	 * than returning the array unchanged, precisely so a retire cannot be closed on a success that never
	 * happened — and the panel has to show that as a failure. An admin who read a silent success here would
	 * stop responding to a compromise that is still live.
	 */
	it('shows a refused retire as a failure rather than as a silent success', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: READ,
			KeygripRetire: {
				errors: [graphQLError('Oops', 'KEYGRIP_RETIRE_UNKNOWN: no key in the current set is called k1', 404)],
				status: 404
			}
		})
		await renderRoute('/security')

		await loaded()
		await retire('k1')

		expect(await screen.findByRole('alert')).toHaveTextContent('KEYGRIP_RETIRE_UNKNOWN: no key in the current set is called k1')
		expect(screen.queryByText('The key was retired')).not.toBeInTheDocument()
	})

	// Data and errors in one answer is legal GraphQL. "The key was retired" under a red toast would leave
	// the admin to guess which half is true, on the one action that cannot be undone.
	it('does not confirm when the answer carries an error alongside the data', async () => {
		respond(true)
		stubGraphQL({
			KeygripStatus: READ,
			KeygripRetire: {
				data: { keygripRetire: true },
				errors: [graphQLError('Conflict', 'The keygrip record changed while k1 was being retired', 409)],
				status: 409
			}
		})
		await renderRoute('/security')

		await loaded()
		await retire('k1')

		expect(await screen.findByRole('alert')).toHaveTextContent('The keygrip record changed while k1 was being retired')
		expect(screen.queryByText('The key was retired')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ `false` with no error is the one refusal that carries nothing to render — no message, no status, no
	 * red anything. The confirmation has to be tied to the answer's *value* and not merely to the absence of
	 * an error, or this exact reply reads as a success: the admin is told a suspect key is out of the set
	 * while every process on the fleet still verifies cookies with it. The 404 covers the unknown id; this
	 * covers the service saying no without saying so.
	 */
	it('does not confirm when the mutation answers false', async () => {
		respond(true)
		const stub = stubGraphQL({ KeygripStatus: READ, KeygripRetire: { data: { keygripRetire: false } } })
		await renderRoute('/security')

		await loaded()
		await retire('k1')

		await waitFor(() => {
			expect(callsTo(stub.calls, 'KeygripRetire')).toHaveLength(1)
		})
		expect(screen.queryByText('The key was retired')).not.toBeInTheDocument()
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('holds the retire buttons while one is in flight', async () => {
		respond(true)
		stubGraphQL({ KeygripStatus: READ, KeygripRetire: { pending: true } })
		await renderRoute('/security')

		await loaded()
		await retire('k1')

		await waitFor(() => {
			expect(retireButtonFor('k1')).toBeDisabled()
		})
		expect(retireButtonFor('k2')).toBeDisabled()
	})
})
