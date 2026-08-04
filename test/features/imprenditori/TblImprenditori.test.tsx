import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { nextSort } from '@/features/imprenditori/TblImprenditori'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

const GESTIONE = '/p/imprenditori/gestione-imprenditori'

const rossi = {
	_id: '65f0000000000000000000f1',
	iscrizione: '2026-02-01T08:05:45.000Z',
	anagrafica: {
		nome: 'Mario',
		cognome: 'Rossi',
		indirizzo: { indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano', provincia: 'MI' }
	}
}

const bianchi = {
	_id: '65f0000000000000000000f2',
	iscrizione: '2026-03-15T10:00:00.000Z',
	anagrafica: {
		nome: 'Anna',
		cognome: 'Bianchi',
		indirizzo: { indirizzo: 'Corso Italia 9', cap: '00100', comune: 'Roma', provincia: 'RM' }
	}
}

const page = (items: unknown[], total = items.length) => ({ data: { imprenditoriAttiviTbl: { total, items } } })

const header = (name: string) => screen.getByRole('button', { name })

describe('nextSort', () => {
	it('starts a new column ascending', () => {
		expect(nextSort('NOME', 'COGNOME', 'DESC')).toEqual({ sortBy: 'NOME', sortDir: 'ASC' })
	})

	it('flips the column already sorted', () => {
		expect(nextSort('COGNOME', 'COGNOME', 'ASC')).toEqual({ sortBy: 'COGNOME', sortDir: 'DESC' })
	})

	it('flips back', () => {
		expect(nextSort('COGNOME', 'COGNOME', 'DESC')).toEqual({ sortBy: 'COGNOME', sortDir: 'ASC' })
	})
})

describe('TblImprenditori', () => {
	it('waits before claiming the list is empty', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: { pending: true } })
		await renderRoute(GESTIONE)

		expect(screen.getByText('Caricamento imprenditori')).toBeInTheDocument()
		expect(screen.queryByText('Nessun imprenditore trovato.')).not.toBeInTheDocument()
	})

	it('renders a row per imprenditore', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi, bianchi]) })
		await renderRoute(GESTIONE)

		const row = (await screen.findByText('Rossi')).closest('tr')
		expect(row).not.toBeNull()

		const cells = within(row as HTMLElement)
		expect(cells.getByText('Mario')).toBeInTheDocument()
		expect(cells.getByText('01/02/2026')).toBeInTheDocument()
		expect(cells.getByText('Via Roma 1, 20100 Milano (MI)')).toBeInTheDocument()
	})

	/**
	 * ⚠️ `nome` and `cognome` stay two columns. Merging them into one "Nome" cell holding `nome cognome`
	 * looks tidier and is not a sortable thing — the backend indexes the two fields separately and there
	 * is no index on a concatenation, so the merged column could only sort in the browser, over one page.
	 * The link lives on the cognome cell alone: one link per row rather than two pointing at the same
	 * page, which is what the length assertion below pins.
	 */
	it('links each row to its detail page, once', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		await renderRoute(GESTIONE)

		const row = (await screen.findByText('Rossi')).closest('tr') as HTMLElement
		const links = within(row).getAllByRole('link')

		expect(links).toHaveLength(1)
		expect(links[0]).toHaveAttribute('href', `/p/imprenditori/id/${rossi._id}`)
	})

	it('opens the detail page from a row', async () => {
		stubGraphQL({
			ImprenditoriAttiviTbl: page([rossi]),
			ImprenditoreById: { pending: true },
			ImprenditorePuntiVendita: { pending: true }
		})
		const { router } = await renderRoute(GESTIONE)

		await userEvent.click(await screen.findByRole('link', { name: 'Rossi' }))
		expect(router.state.location.pathname).toBe(`/p/imprenditori/id/${rossi._id}`)
	})

	it('says so when nothing matches', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([]) })
		await renderRoute(GESTIONE)

		expect(await screen.findByText('Nessun imprenditore trovato.')).toBeInTheDocument()
	})

	it('reports a failure', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: { errors: [graphQLError('Errore', 'Elenco non disponibile', 500)], status: 500 } })
		await renderRoute(GESTIONE)

		expect(await screen.findByRole('alert')).toHaveTextContent('Elenco non disponibile')
	})

	/**
	 * ⚠️ Search, sort and paging are all the server's job, and these variables are what assert it. Doing
	 * any of the three in the browser means fetching the whole `imprenditore` collection first — every
	 * operator downloading every record to look at twenty rows, on a collection that grows without
	 * bound. The table component must never gain a client-side filter or comparator.
	 */
	it('asks the server for one page, sorted and unfiltered', async () => {
		const stub = stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		await renderRoute(GESTIONE)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({
			offset: 0,
			limit: 20,
			// `null`, not `''`: an empty box is "no filter". An empty string is a filter that matches
			// everything by accident, and the backend has to special-case it.
			search: null,
			sortBy: 'COGNOME',
			sortDir: 'ASC'
		})
	})

	it('turns the page number into an offset', async () => {
		const stub = stubGraphQL({ ImprenditoriAttiviTbl: page([rossi], 100) })
		await renderRoute(`${GESTIONE}?page=3&pageSize=25`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ offset: 50, limit: 25 })
		})
	})

	it('sends the search term from the URL', async () => {
		const stub = stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		await renderRoute(`${GESTIONE}?search=rossi`)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ search: 'rossi' })
		})
		expect(screen.getByLabelText('Cerca imprenditore')).toHaveValue('rossi')
	})

	// The search box is debounced, so the URL — and the round-trip — happens once the operator stops
	// typing rather than once per keystroke.
	it('pushes a typed search into the URL and returns to the first page', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi], 100) })
		const { router } = await renderRoute(`${GESTIONE}?page=4`)

		await userEvent.type(screen.getByLabelText('Cerca imprenditore'), 'ross')

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ search: 'ross', page: 1 })
		})
	})

	it('sorts by the column that was clicked, ascending', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		const { router } = await renderRoute(GESTIONE)

		await userEvent.click(header('Nome'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'NOME', sortDir: 'ASC' })
	})

	it('flips the direction when the sorted column is clicked again', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		const { router } = await renderRoute(GESTIONE)

		await userEvent.click(header('Cognome'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'COGNOME', sortDir: 'DESC' })
	})

	// Sorting reorders the whole result set, so page 4 of the old order has nothing to do with page 4 of
	// the new one. Staying put would land the operator on a page of unrelated rows.
	it('returns to the first page when the sort changes', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi], 100) })
		const { router } = await renderRoute(`${GESTIONE}?page=4`)

		await userEvent.click(header('Iscrizione'))

		expect(router.state.location.search).toMatchObject({ page: 1 })
	})

	// The address column sorts by COMUNE: the full string is composed client-side and is not an index,
	// and sorting people by street name is not a thing anyone wants.
	it('sorts the address column by town', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		const { router } = await renderRoute(GESTIONE)

		await userEvent.click(header('Indirizzo'))

		expect(router.state.location.search).toMatchObject({ sortBy: 'COMUNE' })
	})

	it('tells assistive technology which column is sorted, and which way', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		await renderRoute(`${GESTIONE}?sortBy=NOME&sortDir=DESC`)

		expect(await screen.findByRole('columnheader', { name: 'Nome' })).toHaveAttribute('aria-sort', 'descending')
		expect(screen.getByRole('columnheader', { name: 'Cognome' })).toHaveAttribute('aria-sort', 'none')
	})

	it('reports an ascending sort as ascending', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi]) })
		await renderRoute(`${GESTIONE}?sortBy=NOME&sortDir=ASC`)

		expect(await screen.findByRole('columnheader', { name: 'Nome' })).toHaveAttribute('aria-sort', 'ascending')
	})

	it('pages through the result set from the URL', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi], 41) })
		const { router } = await renderRoute(GESTIONE)

		await userEvent.click(await screen.findByRole('button', { name: 'Pagina 3' }))

		expect(router.state.location.search).toMatchObject({ page: 3 })
	})

	it('sizes the pager from the server total, not from the rows on screen', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi, bianchi], 41) })
		await renderRoute(GESTIONE)

		expect(await screen.findByText('1–20 di 41')).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: page([rossi, bianchi], 41) })
		await renderRoute(GESTIONE)

		await screen.findByText('Rossi')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
