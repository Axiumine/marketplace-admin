import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/**
 * The frontend half: **no security screen can put a credential on a page or on the wire.**
 *
 * The backend half proves the resolvers never serialise one. This half proves the app never renders one it
 * was handed anyway, which is a different failure and not implied by the first: a response is a JSON
 * document the app receives in full, and urql hands `data` through as it arrived — a field nobody selected
 * is still sitting in memory. Rendering it takes one `Object.entries` in a table, and the type system says
 * nothing, because the generated types describe the selection set rather than the payload.
 *
 * So the fixtures below are **deliberately worse than anything a service can send**: every object carries
 * extra fields holding a real-shaped signing key and a real-shaped refresh token, none of them selected by
 * any document. The assertion is that none of it reaches the DOM, and that nothing the app sends back
 * carries it either.
 *
 * The loop is over the operation list rather than over hand-written cases, so an operation added to these
 * screens later is either in the list — and checked — or fails the coverage test at the bottom.
 */

/** A real-shaped access token. Seeded into the token store, so it travels on every request for real. */
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI2NWYwMDAwMDAwMDAwMDAwMDAwMDAwYTEifQ.s3cr3t-s1gnatur3-nobody-may-see'

/** Its signature alone, asserted separately: a truncated token is still a token. */
const TOKEN_BODY = 's3cr3t-s1gnatur3-nobody-may-see'

/** A real-shaped cookie-signing key: what `keygripStatus` unwraps and must never hand out. */
const KEY = 'DhX2p9qLmR7vT4wZ0nB6yF8kC1sJ3aE5gU7iO9dQ2xM='

/** A real-shaped refresh token, the value a session row is *indexed* by the digest of. */
const REFRESH = 'r3fr3sh.7f4c1b90e2a6d853.nobody-may-see-this-either'

const ACCOUNT = '68b0f2c1a2b3c4d5e6f70819'
const AT_ACCOUNT = `/security?tier=shopOwner&accountId=${ACCOUNT}`

/** Every secret the fixtures carry, checked as one list so a new one cannot be added and left unasserted. */
const SECRETS = [TOKEN, TOKEN_BODY, KEY, REFRESH] as const

const session = (id: string, familyId: string) => ({
	__typename: 'GraphQLSession',
	id,
	tier: 'shopOwner',
	mintedAt: '1786352400000',
	familyId,
	// Not fields of `GraphQLSession`. Here precisely because no document selects them.
	refreshToken: REFRESH,
	signingKey: KEY
})

const REPLIES = {
	KeygripStatus: {
		data: {
			keygripStatus: {
				__typename: 'GraphQLKeygripStatus',
				version: 3,
				fingerprint: 'a1b2c3d4e5f6',
				keys: [
					{ id: 'k3', createdAt: '2026-08-12T09:00:00.000Z', ageDays: 0, value: KEY },
					{ id: 'k1', createdAt: '2026-06-10T09:00:00.000Z', ageDays: 63, value: KEY }
				],
				holders: [
					{
						service: 'marketplace-dev-authenticated-authorization',
						fingerprint: 'a1b2c3d4e5f6',
						lastSeen: '2026-08-12T09:05:00.000Z',
						current: true,
						secret: KEY
					}
				],
				secret: KEY
			}
		}
	},
	Sessions: {
		data: {
			sessions: [
				session('a3f1'.repeat(16), '2f0b1d3c-8a55-4c1e-9d10-7c2f4a6b8e01'),
				session('b7c2'.repeat(16), '6d4e9a17-2b30-4f8a-8e21-0c5b7d9f3a42')
			]
		}
	},
	ReuseEvents: {
		data: {
			reuseEvents: [
				{
					__typename: 'GraphQLReuseEvent',
					familyId: '6d4e9a17-2b30-4f8a-8e21-0c5b7d9f3a42',
					tier: 'shopOwner',
					accountId: ACCOUNT,
					action: 'refreshTokenReplayed',
					at: '1785312300000',
					// Not a field of `GraphQLReuseEvent`. The replayed token is the obvious thing a well-meaning
					// change would add to a reuse record, and the obvious thing this trail must never carry.
					presentedToken: REFRESH
				}
			]
		}
	},
	RevokeSession: { data: { revokeSession: true } },
	RevokeAllSessions: { data: { revokeAllSessions: 2 } },
	KeygripRotate: { data: { keygripRotate: true } },
	KeygripRetire: { data: { keygripRetire: true } }
}

/**
 * Every operation the two security screens can send.
 *
 * The list is asserted against what the screens actually sent, at the bottom of this file, so an eighth
 * operation added to either screen fails that test until it is named here — and naming it here puts it
 * through the leak loop.
 */
const SECURITY_OPERATIONS = [
	'KeygripStatus',
	'Sessions',
	'ReuseEvents',
	'RevokeSession',
	'RevokeAllSessions',
	'KeygripRotate',
	'KeygripRetire'
] as const

type SecurityOperation = (typeof SECURITY_OPERATIONS)[number]

const sessionsShown = () => screen.findByRole('region', { name: 'Sessions' })
const keysShown = () => screen.findByRole('button', { name: /Rotate the key/ })

const clickIn = async (region: string, name: RegExp) => {
	await userEvent.click(within(screen.getByRole('region', { name: region })).getAllByRole('button', { name })[0] as HTMLElement)
}

const retireOldest = async () => {
	const row = within(screen.getByRole('region', { name: 'Keys' }))
		.getAllByRole('row')
		.find((candidate) => within(candidate).queryByText('k1') !== null)

	await userEvent.click(within(row as HTMLElement).getByRole('button', { name: /Retire/ }))
}

/** What it takes to make each operation happen, from a freshly rendered page. */
const DRIVE: Record<SecurityOperation, () => Promise<void>> = {
	KeygripStatus: async () => {
		await keysShown()
	},
	Sessions: async () => {
		await sessionsShown()
	},
	ReuseEvents: async () => {
		await screen.findByRole('region', { name: 'Revoked lineages' })
	},
	RevokeSession: async () => {
		await sessionsShown()
		await clickIn('Sessions', /^End$/)
	},
	RevokeAllSessions: async () => {
		await sessionsShown()
		await clickIn('Sessions', /End every session/)
	},
	KeygripRotate: async () => {
		await keysShown()
		await clickIn('Current key set', /Rotate the key/)
	},
	KeygripRetire: async () => {
		await keysShown()
		await retireOldest()
	}
}

describe('the security screens leak no credential', () => {
	/**
	 * ⚠️ The loop this file exists for. Every operation the security screens send is driven for real, against
	 * fixtures carrying a signing key, a refresh token and an access token in fields no document selects — and
	 * the page is then read in full.
	 *
	 * `document.body.textContent` and not a query for a particular element: the point is that the value is
	 * nowhere at all, including in a title attribute's neighbour, a debug block or a stray `JSON.stringify`.
	 */
	it.each(SECURITY_OPERATIONS)('renders none of it while %s runs', async (operation) => {
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		const stub = stubGraphQL(REPLIES)
		await renderRoute(AT_ACCOUNT, { token: TOKEN })

		await DRIVE[operation]()

		await waitFor(() => {
			expect(stub.calls.filter((call) => call.operationName === operation).length).toBeGreaterThan(0)
		})

		for (const secret of SECRETS) expect(document.body.textContent).not.toContain(secret)
	})

	/**
	 * ⚠️ The other direction. The access token belongs in the `Authorization` header and nowhere else: a
	 * variable carrying it would put it in a request body, which is the half of a request that gets logged,
	 * proxied and kept.
	 */
	it.each(SECURITY_OPERATIONS)('sends none of it in the variables of %s', async (operation) => {
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		const stub = stubGraphQL(REPLIES)
		await renderRoute(AT_ACCOUNT, { token: TOKEN })

		await DRIVE[operation]()

		await waitFor(() => {
			expect(stub.calls.filter((call) => call.operationName === operation).length).toBeGreaterThan(0)
		})

		for (const call of stub.calls) {
			const body = JSON.stringify(call.variables)
			for (const secret of SECRETS) expect(body).not.toContain(secret)
		}
	})

	/**
	 * The control. Without it every assertion above would also pass on an app that had simply stopped
	 * authenticating — a screen that sends no token leaks no token, and proves nothing.
	 *
	 * `Bearer access:<token>`: the `access:` prefix is part of the Redis key the backend looks the session up
	 * under, and is added by the auth exchange rather than stored with the token.
	 */
	it('does send the token, in the header where it belongs', async () => {
		const stub = stubGraphQL(REPLIES)
		await renderRoute(AT_ACCOUNT, { token: TOKEN })

		await sessionsShown()
		expect(stub.calls.length).toBeGreaterThan(0)
		expect(stub.calls.every((call) => call.authorization === `Bearer access:${TOKEN}`)).toBe(true)
	})

	/**
	 * ⚠️ The list above, checked against reality. One pass over both screens, exercising every control they
	 * have; the set of operations that reached the wire must be exactly the set the loop covers. An eighth
	 * operation added to either screen fails here, and the fix is to name it — which puts it through the two
	 * loops above rather than leaving it as the one unchecked query on a security page.
	 */
	it('covers every operation the two screens can send', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		const stub = stubGraphQL(REPLIES)
		await renderRoute(AT_ACCOUNT, { token: TOKEN })

		await sessionsShown()
		await clickIn('Sessions', /^End$/)
		await clickIn('Sessions', /End every session/)
		await keysShown()
		await clickIn('Current key set', /Rotate the key/)
		await retireOldest()

		await waitFor(() => {
			expect(stub.calls.filter((call) => call.operationName === 'KeygripRetire').length).toBeGreaterThan(0)
		})

		expect([...new Set(stub.calls.map((call) => call.operationName))].sort()).toEqual([...SECURITY_OPERATIONS].sort())
	})
})

/**
 * ⚠️ The same rule, as a check over the security sources rather than over a diff: no log statement anywhere
 * in them.
 *
 * A `console.log` of a query result is how a credential reaches a browser's console and, through any error
 * reporter wired to it later, a third party's servers — and it is exactly the line somebody adds while
 * debugging a table that will not render. There is no logging framework in this app, so the rule is simply
 * that these files contain no `console.` at all, which is a rule with no judgement in it to get wrong.
 */
describe('the security sources log nothing', () => {
	const TOUCHED = [
		'src/features/security/SessionConsole.tsx',
		'src/features/security/KeygripPanel.tsx',
		'src/pages/SecurityPage.tsx',
		'src/api/operations/adminResource/queries.ts',
		'src/api/operations/adminResource/mutations.ts',
		'src/components/ui/tableClass.ts',
		'src/lib/format.ts',
		'src/router.tsx'
	]

	it.each(TOUCHED)('%s carries no log statement', (file) => {
		expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toContain('console.')
	})
})
