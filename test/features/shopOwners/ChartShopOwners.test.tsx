import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/** The counter beside the chart. Every test here has to answer it, or its request throws unconfigured. */
const stats = { ShopOwnersStats: { data: { shopOwnersStats: 42 } } }

const series = (granularity: string, points: { date: string; total: number }[]) => ({
	data: { shopOwnersPerPeriod: { granularity, points } }
})

const threeMonths = series('DAY', [
	{ date: '2026-05-02', total: 3 },
	{ date: '2026-05-03', total: 0 },
	{ date: '2026-05-04', total: 1 }
])

const chart = () => screen.getByRole('img', { name: /Registrations per period/ })
const bars = () => chart().querySelectorAll('rect')

/*
 * The hover readouts, in order. Read with `querySelectorAll` rather than `getByTitle`, which only
 * matches a `<title>` that is a direct child of the `<svg>` — these hang off each `<rect>`, which is
 * what scopes the tooltip to one bar instead of to the whole chart.
 */
const tooltip = () => [...chart().querySelectorAll('title')].map((t) => t.textContent)

describe('ChartShopOwners', () => {
	it('waits before drawing anything', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: { pending: true } })
		await renderRoute('/shopOwners')

		expect(screen.getByText('Loading chart')).toBeInTheDocument()
	})

	it('draws one bar per bucket', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		await waitFor(() => expect(bars()).toHaveLength(3))
	})

	// The `<title>` inside each rect is the hover readout. It is also the only place the exact number
	// behind a bar appears, since a bar's height is a proportion and cannot be read off the screen.
	it('names every bar with its bucket and its count', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		await waitFor(() => expect(bars()).toHaveLength(3))
		expect(tooltip()).toEqual(['02/05: 3', '03/05: 0', '04/05: 1'])
	})

	it('labels the axis with the ends of the range', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('02/05')).toBeInTheDocument()
		expect(screen.getByText('04/05')).toBeInTheDocument()
		// The middle bucket is a bar and a tooltip, never an axis label — ninety-odd of them do not fit.
		expect(screen.queryByText('03/05')).not.toBeInTheDocument()
	})

	it('sums the range under the chart', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('Total in period:')).toBeInTheDocument()
		expect(screen.getByText('4')).toBeInTheDocument()
	})

	// The server decides the bucket width and sends it back; the chart must label from that and not from
	// the number of points, which would guess wrong for a platform three days old.
	it('labels month buckets by month when the server says MONTH', async () => {
		stubGraphQL({
			...stats,
			ShopOwnersPerPeriod: series('MONTH', [
				{ date: '2026-07-01', total: 2 },
				{ date: '2026-08-01', total: 5 }
			])
		})
		await renderRoute('/shopOwners')

		await waitFor(() => expect(bars()).toHaveLength(2))
		expect(tooltip()).toEqual(['Jul 2026: 2', 'Aug 2026: 5'])
	})

	it('asks for the whole history first', async () => {
		const stub = stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		await waitFor(() => expect(bars()).toHaveLength(3))
		const call = stub.calls.find((c) => c.operationName === 'ShopOwnersPerPeriod')
		expect(call?.variables).toEqual({ period: 'ALL' })
	})

	it('re-asks with the range the admin picked', async () => {
		const stub = stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		await waitFor(() => expect(bars()).toHaveLength(3))
		await userEvent.selectOptions(screen.getByLabelText('Period'), 'ONE_MONTH')

		await waitFor(() => {
			const periods = stub.calls.filter((c) => c.operationName === 'ShopOwnersPerPeriod').map((c) => c.variables['period'])
			expect(periods).toContain('ONE_MONTH')
		})
	})

	// ⚠️ The chart is NOT unmounted while the next range loads. urql keeps the previous `data` during a
	// variables change, so returning early on `fetching` would blank the card on every use of the select
	// and make the control feel like it had cleared the screen rather than narrowed it.
	it('keeps the current chart on screen while the next range loads', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: [threeMonths, { pending: true }] })
		await renderRoute('/shopOwners')

		await waitFor(() => expect(bars()).toHaveLength(3))
		await userEvent.selectOptions(screen.getByLabelText('Period'), 'THREE_MONTHS')

		expect(await screen.findByText('Loading chart')).toBeInTheDocument()
		expect(bars()).toHaveLength(3)
	})

	// An empty answer is a real one — a platform with no shopOwners, or a month in which nobody
	// registered. It gets a sentence, because an empty box is indistinguishable from a broken query.
	it('says so when the range holds nothing', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: series('MONTH', []) })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('No sign-ups in the selected period.')).toBeInTheDocument()
		expect(screen.queryByRole('img', { name: /Registrations per period/ })).not.toBeInTheDocument()
	})

	// urql does not validate an answer against the schema, so a service that cannot produce the series
	// nulls the whole `data` rather than the one key — leaving no object to read `points` off.
	it('says the same when the answer carries no data at all', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: {} })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('No sign-ups in the selected period.')).toBeInTheDocument()
	})

	it('reports a failure instead of an empty chart', async () => {
		stubGraphQL({
			...stats,
			ShopOwnersPerPeriod: { errors: [graphQLError('Error', 'Series unavailable', 500)], status: 500 }
		})
		await renderRoute('/shopOwners')

		expect(await screen.findByRole('alert')).toHaveTextContent('Series unavailable')
	})

	it('offers the three ranges', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		const select = await screen.findByLabelText<HTMLSelectElement>('Period')
		expect([...select.options].map((o) => o.value)).toEqual(['ALL', 'THREE_MONTHS', 'ONE_MONTH'])
		expect([...select.options].map((o) => o.text)).toEqual(['From the first sign-up to today', 'Last 3 months', 'Last month'])
	})

	it('renders', async () => {
		stubGraphQL({ ...stats, ShopOwnersPerPeriod: threeMonths })
		await renderRoute('/shopOwners')

		await waitFor(() => expect(bars()).toHaveLength(3))
		expect(screen.getByRole('region', { name: 'Registrations over time' })).toMatchSnapshot()
	})
})
