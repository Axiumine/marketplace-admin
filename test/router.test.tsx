import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_PAGE_SIZE } from '@/router'

import { stubGraphQL } from './helpers/graphql'
import { renderRoute } from './helpers/render'

const emptyTable = { data: { imprenditoriAttiviTbl: { total: 0, items: [] } } }

const GESTIONE = '/p/imprenditori/gestione-imprenditori'

/** The search state the route hands the table when the URL says nothing. */
const DEFAULTS = { page: 1, pageSize: DEFAULT_PAGE_SIZE, search: '', sortBy: 'COGNOME', sortDir: 'ASC' }

describe('route guard', () => {
	/**
	 * The guard redirects to `/loading`, not to `/`. An empty session means one of two things — never
	 * signed in, or signed in and reloaded — and only `/loading` can tell them apart, because only a
	 * round-trip can say whether the httpOnly refresh cookie is still good.
	 */
	it('sends an unauthenticated visitor to the bootstrap page, remembering where they were going', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { pending: true } })
		const { router } = await renderRoute('/impostazioni', { session: null })

		expect(router.state.location.pathname).toBe('/loading')
		expect(router.state.location.search).toEqual({ redirect: '/impostazioni' })
	})

	// The remembered target is the *validated* URL, not the one that was typed: the guard runs after
	// `validateSearch`, so the defaults are already filled in. That is what makes the round trip lossless
	// — an operator who followed a link to page 3 comes back to page 3, not to page 1.
	it('carries the search params of the page that was asked for', async () => {
		stubGraphQL({ InfoAdminAfterLogin: { pending: true } })
		const { router } = await renderRoute(`${GESTIONE}?page=3`, { session: null })

		expect(router.state.location.search).toEqual({
			redirect: `${GESTIONE}?page=3&pageSize=20&search=&sortBy=COGNOME&sortDir=ASC`
		})
	})

	it('lets a signed-in operator through', async () => {
		stubGraphQL({})
		const { router } = await renderRoute('/impostazioni')

		expect(router.state.location.pathname).toBe('/impostazioni')
	})

	// The login and loading pages sit outside the guarded frame, so they are reachable with no session.
	it('does not guard the login page', async () => {
		stubGraphQL({})
		const { router } = await renderRoute('/', { token: null, session: null })

		expect(router.state.location.pathname).toBe('/')
	})
})

describe('imprenditori search params', () => {
	const searchOf = async (url: string) => {
		stubGraphQL({ ImprenditoriAttiviTbl: emptyTable })
		const { router } = await renderRoute(url)
		return router.state.location.search
	}

	it('fills in every default when the URL carries none', async () => {
		expect(await searchOf(GESTIONE)).toEqual(DEFAULTS)
	})

	it('reads the whole state out of the URL', async () => {
		expect(await searchOf(`${GESTIONE}?page=3&pageSize=50&search=rossi&sortBy=COMUNE&sortDir=DESC`)).toEqual({
			page: 3,
			pageSize: 50,
			search: 'rossi',
			sortBy: 'COMUNE',
			sortDir: 'DESC'
		})
	})

	// Every field `.catch()`es rather than throwing. A hand-edited or truncated URL is a typo, not an
	// error worth a crash screen — and `?page=abc` crashing would be a self-inflicted denial of service
	// on anyone who was sent a mangled link.
	it('falls back on a page that is not a number', async () => {
		expect((await searchOf(`${GESTIONE}?page=abc`)).page).toBe(1)
	})

	it('falls back on a page below the first one', async () => {
		expect((await searchOf(`${GESTIONE}?page=0`)).page).toBe(1)
	})

	it('falls back on a fractional page', async () => {
		expect((await searchOf(`${GESTIONE}?page=2.5`)).page).toBe(1)
	})

	// The upper bound is what stops `?pageSize=100000` from asking the backend for the whole collection
	// in one document. The value reaches Mongo as a `limit`, so without a ceiling here any operator with
	// a URL bar can turn a paged query back into a full scan.
	it('falls back on a page size past the maximum', async () => {
		expect((await searchOf(`${GESTIONE}?pageSize=100000`)).pageSize).toBe(DEFAULT_PAGE_SIZE)
	})

	it('falls back on a page size below the minimum', async () => {
		expect((await searchOf(`${GESTIONE}?pageSize=1`)).pageSize).toBe(DEFAULT_PAGE_SIZE)
	})

	it('keeps a page size inside the bounds', async () => {
		expect((await searchOf(`${GESTIONE}?pageSize=5`)).pageSize).toBe(5)
	})

	// The enums are the backend's own sort vocabulary, so a column it does not index never reaches the
	// query — it comes back as a schema validation error rather than as a blocking in-memory sort.
	it('falls back on a sort column the backend does not know', async () => {
		expect((await searchOf(`${GESTIONE}?sortBy=PASSWORD`)).sortBy).toBe('COGNOME')
	})

	it('falls back on a sort direction that is not a direction', async () => {
		expect((await searchOf(`${GESTIONE}?sortDir=SIDEWAYS`)).sortDir).toBe('ASC')
	})

	// Each column named one at a time, not as a set: `sortBy=NOME` reaching the query unchanged is the
	// only thing that says NOME is in the accepted list, because a column that fell out of it would come
	// back as the default and look identical to a column that was never asked for.
	it.each(['COGNOME', 'NOME', 'ISCRIZIONE', 'COMUNE'])('carries %s through to the query', async (sortBy) => {
		expect((await searchOf(`${GESTIONE}?sortBy=${sortBy}`)).sortBy).toBe(sortBy)
	})

	it.each(['ASC', 'DESC'])('carries %s through to the query', async (sortDir) => {
		expect((await searchOf(`${GESTIONE}?sortDir=${sortDir}`)).sortDir).toBe(sortDir)
	})

	/*
	 * An empty parameter is the one input that tells the accepted list apart from the fallback: every
	 * other value either belongs to the list or is rejected into the default, and the default is itself
	 * the first entry of the list. `?sortBy=` is neither — it must be rejected, and a list that had
	 * quietly grown an empty entry would accept it and send a blank column name to MongoDB.
	 */
	it('falls back on an empty sort column', async () => {
		expect((await searchOf(`${GESTIONE}?sortBy=`)).sortBy).toBe('COGNOME')
	})

	it('falls back on an empty sort direction', async () => {
		expect((await searchOf(`${GESTIONE}?sortDir=`)).sortDir).toBe('ASC')
	})
})

describe('routes', () => {
	it('serves the imprenditori stats page', async () => {
		stubGraphQL({
			ImprenditoriStats: { data: { imprenditoriStats: 7 } },
			ImprenditoriPerPeriodo: { data: { imprenditoriPerPeriodo: { granularita: 'MESE', punti: [] } } }
		})
		await renderRoute('/imprenditori')

		expect(screen.getByRole('heading', { name: 'Imprenditori', level: 1 })).toBeInTheDocument()
	})

	it('serves the add page', async () => {
		stubGraphQL({})
		await renderRoute('/p/imprenditori/aggiungi-imprenditore')

		expect(screen.getByRole('heading', { name: 'Aggiungi imprenditore', level: 1 })).toBeInTheDocument()
	})

	// The `$_id` param is what the detail page queries on, so a wrong reading of it is a page about
	// somebody else.
	it('passes the id segment of the detail route to the query', async () => {
		const stub = stubGraphQL({
			ImprenditoreById: { pending: true },
			ImprenditoreAziende: { pending: true },
			ImprenditorePuntiVendita: { pending: true }
		})
		await renderRoute('/p/imprenditori/id/65f0000000000000000000ff')

		// Three sections, three queries, one id — and three requests rather than four, because the shops
		// section reads the companies too and urql keys an operation by document and variables.
		await waitFor(() => {
			expect(stub.calls).toHaveLength(3)
		})
		expect(stub.calls.map((call) => call.variables)).toEqual([
			{ idImprenditore: '65f0000000000000000000ff' },
			{ idImprenditore: '65f0000000000000000000ff' },
			{ idImprenditore: '65f0000000000000000000ff' }
		])
	})
})
