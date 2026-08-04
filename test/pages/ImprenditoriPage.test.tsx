import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const emptyTable = { data: { imprenditoriAttiviTbl: { total: 0, items: [] } } }

/*
 * The page mounts two independent queries, so every test here has to answer both — an operation nobody
 * configured throws, by design. The chart has its own file; what it needs from this one is only that it
 * does not blow up the counter's tests, hence the empty series.
 */
const grafico = { ImprenditoriPerPeriodo: { data: { imprenditoriPerPeriodo: { granularita: 'MESE', punti: [] } } } }

const sezioni = () => within(screen.getByRole('navigation', { name: 'Sezioni imprenditori' }))

describe('StatsImprenditori', () => {
	it('waits before showing a number', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { pending: true } })
		await renderRoute('/imprenditori')

		expect(screen.getByText('Caricamento statistiche')).toBeInTheDocument()
	})

	it('shows the count', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { data: { imprenditoriStats: 42 } } })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('42')).toBeInTheDocument()
		expect(screen.getByText('Totali')).toBeInTheDocument()
	})

	// Zero is a real answer and has to read as one. Falling back to a dash or an empty cell would make an
	// empty platform look like a failed query.
	it('shows zero as a count, not as a gap', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { data: { imprenditoriStats: 0 } } })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('0')).toBeInTheDocument()
	})

	// urql does not check an answer against the schema, so a body that simply omits the field arrives as
	// a success with nothing in it. Rendering `undefined` would put the literal word on screen.
	it('shows zero when the answer carries no count at all', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { data: {} } })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('0')).toBeInTheDocument()
	})

	// And one step worse: the count is non-null in the schema, so a service that cannot produce it nulls
	// the whole `data` rather than the one key, leaving no object to read the field off.
	it('shows zero when the answer carries no data at all', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: {} })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('0')).toBeInTheDocument()
	})

	it('reports a failure instead of an empty box', async () => {
		stubGraphQL({
			...grafico,
			ImprenditoriStats: { errors: [graphQLError('Errore', 'Statistiche non disponibili', 500)], status: 500 }
		})
		await renderRoute('/imprenditori')

		expect(await screen.findByRole('alert')).toHaveTextContent('Statistiche non disponibili')
	})

	// ⚠️ One statistic, because one query answers one. Rows for "email da confermare", "confermati",
	// "disabilitati" and "eliminati" all read naturally here, and none of them exists on the
	// admin-resource service — add the resolver first. A stat with no backend and a stat that is broken
	// look identical on screen, and the snapshot is what keeps a placeholder from becoming permanent.
	it('renders', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { data: { imprenditoriStats: 42 } } })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('42')).toBeInTheDocument()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})

describe('MenuImprenditori', () => {
	it('links to the three sections', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { pending: true } })
		await renderRoute('/imprenditori')

		expect(sezioni().getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/imprenditori')
		expect(sezioni().getByRole('link', { name: 'Gestione' })).toHaveAttribute('href', '/p/imprenditori/gestione-imprenditori')
		// ⚠️ `aggiungi-imprenditore`, singular. The plural reads more naturally next to the section it
		// sits in and serves no route, so a link written from memory 404s while looking correct in
		// review — hence the literal href here rather than a click assertion alone.
		expect(sezioni().getByRole('link', { name: 'Aggiungi' })).toHaveAttribute('href', '/p/imprenditori/aggiungi-imprenditore')
	})

	it('marks the section being viewed', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { pending: true } })
		await renderRoute('/imprenditori')

		expect(sezioni().getByRole('link', { name: 'Stats' })).toHaveClass('bg-third')
		expect(sezioni().getByRole('link', { name: 'Gestione' })).not.toHaveClass('bg-third')
	})

	it('navigates between sections', async () => {
		stubGraphQL({ ...grafico, ImprenditoriStats: { pending: true }, ImprenditoriAttiviTbl: emptyTable })
		const { router } = await renderRoute('/imprenditori')

		await userEvent.click(sezioni().getByRole('link', { name: 'Gestione' }))
		expect(router.state.location.pathname).toBe('/p/imprenditori/gestione-imprenditori')
	})
})
