import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_PAGE_SIZE } from '@/router'

import { stubGraphQL } from './helpers/graphql'
import { renderRoute } from './helpers/render'

const emptyTable = { data: { shopOwnersActiveTbl: { total: 0, items: [] } } }

const MANAGE = '/p/shopOwners/manage-shopOwners'

/** The search state the route hands the table when the URL says nothing. */
const DEFAULTS = { page: 1, pageSize: DEFAULT_PAGE_SIZE, search: '', sortBy: 'LAST_NAME', sortDir: 'ASC' }

describe('route guard', () => {
	/**
	 * The guard redirects to `/loading`, not to `/`. An empty session means one of two things — never
	 * signed in, or signed in and reloaded — and only `/loading` can tell them apart, because only a
	 * round-trip can say whether the httpOnly refresh cookie is still good.
	 */
	it('sends an unauthenticated visitor to the bootstrap page, remembering where they were going', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { pending: true } })
		const { router } = await renderRoute('/settings', { session: null })

		expect(router.state.location.pathname).toBe('/loading')
		expect(router.state.location.search).toEqual({ redirect: '/settings' })
	})

	// The remembered target is the *validated* URL, not the one that was typed: the guard runs after
	// `validateSearch`, so the defaults are already filled in. That is what makes the round trip lossless
	// — an operator who followed a link to page 3 comes back to page 3, not to page 1.
	it('carries the search params of the page that was asked for', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { pending: true } })
		const { router } = await renderRoute(`${MANAGE}?page=3`, { session: null })

		expect(router.state.location.search).toEqual({
			redirect: `${MANAGE}?page=3&pageSize=20&search=&sortBy=LAST_NAME&sortDir=ASC`
		})
	})

	it('lets a signed-in operator through', async () => {
		stubGraphQL({})
		const { router } = await renderRoute('/settings')

		expect(router.state.location.pathname).toBe('/settings')
	})

	// The login and loading pages sit outside the guarded frame, so they are reachable with no session.
	it('does not guard the login page', async () => {
		stubGraphQL({})
		const { router } = await renderRoute('/', { token: null, session: null })

		expect(router.state.location.pathname).toBe('/')
	})
})

describe('shopOwners search params', () => {
	const searchOf = async (url: string) => {
		stubGraphQL({ ShopOwnersActiveTbl: emptyTable })
		const { router } = await renderRoute(url)
		return router.state.location.search
	}

	it('fills in every default when the URL carries none', async () => {
		expect(await searchOf(MANAGE)).toEqual(DEFAULTS)
	})

	it('reads the whole state out of the URL', async () => {
		expect(await searchOf(`${MANAGE}?page=3&pageSize=50&search=rivers&sortBy=CITY&sortDir=DESC`)).toEqual({
			page: 3,
			pageSize: 50,
			search: 'rivers',
			sortBy: 'CITY',
			sortDir: 'DESC'
		})
	})

	// Every field `.catch()`es rather than throwing. A hand-edited or truncated URL is a typo, not an
	// error worth a crash screen — and `?page=abc` crashing would be a self-inflicted denial of service
	// on anyone who was sent a mangled link.
	it('falls back on a page that is not a number', async () => {
		expect((await searchOf(`${MANAGE}?page=abc`)).page).toBe(1)
	})

	it('falls back on a page below the first one', async () => {
		expect((await searchOf(`${MANAGE}?page=0`)).page).toBe(1)
	})

	it('falls back on a fractional page', async () => {
		expect((await searchOf(`${MANAGE}?page=2.5`)).page).toBe(1)
	})

	// The upper bound is what stops `?pageSize=100000` from asking the backend for the whole collection
	// in one document. The value reaches Mongo as a `limit`, so without a ceiling here any operator with
	// a URL bar can turn a paged query back into a full scan.
	it('falls back on a page size past the maximum', async () => {
		expect((await searchOf(`${MANAGE}?pageSize=100000`)).pageSize).toBe(DEFAULT_PAGE_SIZE)
	})

	it('falls back on a page size below the minimum', async () => {
		expect((await searchOf(`${MANAGE}?pageSize=1`)).pageSize).toBe(DEFAULT_PAGE_SIZE)
	})

	it('keeps a page size inside the bounds', async () => {
		expect((await searchOf(`${MANAGE}?pageSize=5`)).pageSize).toBe(5)
	})

	// The enums are the backend's own sort vocabulary, so a column it does not index never reaches the
	// query — it comes back as a schema validation error rather than as a blocking in-memory sort.
	it('falls back on a sort column the backend does not know', async () => {
		expect((await searchOf(`${MANAGE}?sortBy=PASSWORD`)).sortBy).toBe('LAST_NAME')
	})

	it('falls back on a sort direction that is not a direction', async () => {
		expect((await searchOf(`${MANAGE}?sortDir=SIDEWAYS`)).sortDir).toBe('ASC')
	})

	// Each column named one at a time, not as a set: `sortBy=FIRST_NAME` reaching the query unchanged is the
	// only thing that says FIRST_NAME is in the accepted list, because a column that fell out of it would come
	// back as the default and look identical to a column that was never asked for.
	it.each(['LAST_NAME', 'FIRST_NAME', 'REGISTERED_AT', 'CITY'])('carries %s through to the query', async (sortBy) => {
		expect((await searchOf(`${MANAGE}?sortBy=${sortBy}`)).sortBy).toBe(sortBy)
	})

	it.each(['ASC', 'DESC'])('carries %s through to the query', async (sortDir) => {
		expect((await searchOf(`${MANAGE}?sortDir=${sortDir}`)).sortDir).toBe(sortDir)
	})

	/*
	 * An empty parameter is the one input that tells the accepted list apart from the fallback: every
	 * other value either belongs to the list or is rejected into the default, and the default is itself
	 * the first entry of the list. `?sortBy=` is neither — it must be rejected, and a list that had
	 * quietly grown an empty entry would accept it and send a blank column name to MongoDB.
	 */
	it('falls back on an empty sort column', async () => {
		expect((await searchOf(`${MANAGE}?sortBy=`)).sortBy).toBe('LAST_NAME')
	})

	it('falls back on an empty sort direction', async () => {
		expect((await searchOf(`${MANAGE}?sortDir=`)).sortDir).toBe('ASC')
	})
})

describe('routes', () => {
	it('serves the shopOwners stats page', async () => {
		stubGraphQL({
			ShopOwnersStats: { data: { shopOwnersStats: 7 } },
			ShopOwnersPerPeriod: { data: { shopOwnersPerPeriod: { granularity: 'MONTH', points: [] } } }
		})
		await renderRoute('/shopOwners')

		expect(screen.getByRole('heading', { name: 'ShopOwners', level: 1 })).toBeInTheDocument()
	})

	it('serves the add page', async () => {
		stubGraphQL({})
		await renderRoute('/p/shopOwners/add-shopOwner')

		expect(screen.getByRole('heading', { name: 'Add shopOwner', level: 1 })).toBeInTheDocument()
	})

	// The `$_id` param is what the detail page queries on, so a wrong reading of it is a page about
	// somebody else.
	it('passes the id segment of the detail route to the query', async () => {
		const stub = stubGraphQL({
			ShopOwnerById: { pending: true },
			ShopOwnerCompanies: { pending: true }
		})
		await renderRoute('/p/shopOwners/id/65f0000000000000000000ff')

		// Two sections, two queries, one id — and the same id in both, which is the whole assertion: a
		// section reading the wrong param renders somebody else's data beside the right shopOwner's.
		await waitFor(() => {
			expect(stub.calls).toHaveLength(2)
		})
		expect(stub.calls.map((call) => call.variables)).toEqual([
			{ idShopOwner: '65f0000000000000000000ff' },
			{ idShopOwner: '65f0000000000000000000ff' }
		])
	})
})
