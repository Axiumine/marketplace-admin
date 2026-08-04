import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/** The counter beside the chart. Every test here has to answer it, or its request throws unconfigured. */
const stats = { ImprenditoriStats: { data: { imprenditoriStats: 42 } } }

const serie = (granularita: string, punti: { data: string; totale: number }[]) => ({
	data: { imprenditoriPerPeriodo: { granularita, punti } }
})

const tremesi = serie('GIORNO', [
	{ data: '2026-05-02', totale: 3 },
	{ data: '2026-05-03', totale: 0 },
	{ data: '2026-05-04', totale: 1 }
])

const grafico = () => screen.getByRole('img', { name: /Iscrizioni per periodo/ })
const barre = () => grafico().querySelectorAll('rect')

/*
 * The hover readouts, in order. Read with `querySelectorAll` rather than `getByTitle`, which only
 * matches a `<title>` that is a direct child of the `<svg>` — these hang off each `<rect>`, which is
 * what scopes the tooltip to one bar instead of to the whole chart.
 */
const tooltip = () => [...grafico().querySelectorAll('title')].map((t) => t.textContent)

describe('GraficoImprenditori', () => {
	it('waits before drawing anything', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: { pending: true } })
		await renderRoute('/imprenditori')

		expect(screen.getByText('Caricamento grafico')).toBeInTheDocument()
	})

	it('draws one bar per bucket', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		await waitFor(() => expect(barre()).toHaveLength(3))
	})

	// The `<title>` inside each rect is the hover readout. It is also the only place the exact number
	// behind a bar appears, since a bar's height is a proportion and cannot be read off the screen.
	it('names every bar with its bucket and its count', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		await waitFor(() => expect(barre()).toHaveLength(3))
		expect(tooltip()).toEqual(['02/05: 3', '03/05: 0', '04/05: 1'])
	})

	it('labels the axis with the ends of the range', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('02/05')).toBeInTheDocument()
		expect(screen.getByText('04/05')).toBeInTheDocument()
		// The middle bucket is a bar and a tooltip, never an axis label — ninety-odd of them do not fit.
		expect(screen.queryByText('03/05')).not.toBeInTheDocument()
	})

	it('sums the range under the chart', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('Totale nel periodo:')).toBeInTheDocument()
		expect(screen.getByText('4')).toBeInTheDocument()
	})

	// The server decides the bucket width and sends it back; the chart must label from that and not from
	// the number of points, which would guess wrong for a platform three days old.
	it('labels month buckets by month when the server says MESE', async () => {
		stubGraphQL({
			...stats,
			ImprenditoriPerPeriodo: serie('MESE', [
				{ data: '2026-07-01', totale: 2 },
				{ data: '2026-08-01', totale: 5 }
			])
		})
		await renderRoute('/imprenditori')

		await waitFor(() => expect(barre()).toHaveLength(2))
		expect(tooltip()).toEqual(['lug 2026: 2', 'ago 2026: 5'])
	})

	it('asks for the whole history first', async () => {
		const stub = stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		await waitFor(() => expect(barre()).toHaveLength(3))
		const chiamata = stub.calls.find((c) => c.operationName === 'ImprenditoriPerPeriodo')
		expect(chiamata?.variables).toEqual({ periodo: 'TUTTO' })
	})

	it('re-asks with the range the operator picked', async () => {
		const stub = stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		await waitFor(() => expect(barre()).toHaveLength(3))
		await userEvent.selectOptions(screen.getByLabelText('Periodo'), 'UN_MESE')

		await waitFor(() => {
			const periodi = stub.calls.filter((c) => c.operationName === 'ImprenditoriPerPeriodo').map((c) => c.variables['periodo'])
			expect(periodi).toContain('UN_MESE')
		})
	})

	// ⚠️ The chart is NOT unmounted while the next range loads. urql keeps the previous `data` during a
	// variables change, so returning early on `fetching` would blank the card on every use of the select
	// and make the control feel like it had cleared the screen rather than narrowed it.
	it('keeps the current chart on screen while the next range loads', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: [tremesi, { pending: true }] })
		await renderRoute('/imprenditori')

		await waitFor(() => expect(barre()).toHaveLength(3))
		await userEvent.selectOptions(screen.getByLabelText('Periodo'), 'TRE_MESI')

		expect(await screen.findByText('Caricamento grafico')).toBeInTheDocument()
		expect(barre()).toHaveLength(3)
	})

	// An empty answer is a real one — a platform with no imprenditori, or a month in which nobody
	// registered. It gets a sentence, because an empty box is indistinguishable from a broken query.
	it('says so when the range holds nothing', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: serie('MESE', []) })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('Nessuna iscrizione nel periodo selezionato.')).toBeInTheDocument()
		expect(screen.queryByRole('img', { name: /Iscrizioni per periodo/ })).not.toBeInTheDocument()
	})

	// urql does not validate an answer against the schema, so a service that cannot produce the series
	// nulls the whole `data` rather than the one key — leaving no object to read `punti` off.
	it('says the same when the answer carries no data at all', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: {} })
		await renderRoute('/imprenditori')

		expect(await screen.findByText('Nessuna iscrizione nel periodo selezionato.')).toBeInTheDocument()
	})

	it('reports a failure instead of an empty chart', async () => {
		stubGraphQL({
			...stats,
			ImprenditoriPerPeriodo: { errors: [graphQLError('Errore', 'Serie non disponibile', 500)], status: 500 }
		})
		await renderRoute('/imprenditori')

		expect(await screen.findByRole('alert')).toHaveTextContent('Serie non disponibile')
	})

	it('offers the three ranges', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		const select = await screen.findByLabelText<HTMLSelectElement>('Periodo')
		expect([...select.options].map((o) => o.value)).toEqual(['TUTTO', 'TRE_MESI', 'UN_MESE'])
		expect([...select.options].map((o) => o.text)).toEqual(['Dal primo iscritto a oggi', 'Ultimi 3 mesi', 'Ultimo mese'])
	})

	it('renders', async () => {
		stubGraphQL({ ...stats, ImprenditoriPerPeriodo: tremesi })
		await renderRoute('/imprenditori')

		await waitFor(() => expect(barre()).toHaveLength(3))
		expect(screen.getByRole('region', { name: 'Iscrizioni nel tempo' })).toMatchSnapshot()
	})
})
