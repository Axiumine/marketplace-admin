import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const emptyTable = { data: { shopOwnersActiveTbl: { total: 0, items: [] } } }

/*
 * The page mounts two independent queries, so every test here has to answer both — an operation nobody
 * configured throws, by design. The chart has its own file; what it needs from this one is only that it
 * does not blow up the counter's tests, hence the empty series.
 */
const chart = { ShopOwnersPerPeriod: { data: { shopOwnersPerPeriod: { granularity: 'MONTH', points: [] } } } }

const sections = () => within(screen.getByRole('navigation', { name: 'Sections shopOwners' }))

describe('StatsShopOwners', () => {
	it('waits before showing a number', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { pending: true } })
		await renderRoute('/shopOwners')

		expect(screen.getByText('Loading statistics')).toBeInTheDocument()
	})

	it('shows the count', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { data: { shopOwnersStats: 42 } } })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('42')).toBeInTheDocument()
		expect(screen.getByText('Total')).toBeInTheDocument()
	})

	// Zero is a real answer and has to read as one. Falling back to a dash or an empty cell would make an
	// empty platform look like a failed query.
	it('shows zero as a count, not as a gap', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { data: { shopOwnersStats: 0 } } })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('0')).toBeInTheDocument()
	})

	// urql does not check an answer against the schema, so a body that simply omits the field arrives as
	// a success with nothing in it. Rendering `undefined` would put the literal word on screen.
	it('shows zero when the answer carries no count at all', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { data: {} } })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('0')).toBeInTheDocument()
	})

	// And one step worse: the count is non-null in the schema, so a service that cannot produce it nulls
	// the whole `data` rather than the one key, leaving no object to read the field off.
	it('shows zero when the answer carries no data at all', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: {} })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('0')).toBeInTheDocument()
	})

	it('reports a failure instead of an empty box', async () => {
		stubGraphQL({
			...chart,
			ShopOwnersStats: { errors: [graphQLError('Error', 'Statistics unavailable', 500)], status: 500 }
		})
		await renderRoute('/shopOwners')

		expect(await screen.findByRole('alert')).toHaveTextContent('Statistics unavailable')
	})

	// ⚠️ One statistic, because one query answers one. Rows for "email to confirm", "confirmed",
	// "disabled" and "deleted" all read naturally here, and none of them exists on the
	// admin-resource service — add the resolver first. A stat with no backend and a stat that is broken
	// look identical on screen, and the snapshot is what keeps a placeholder from becoming permanent.
	it('renders', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { data: { shopOwnersStats: 42 } } })
		await renderRoute('/shopOwners')

		expect(await screen.findByText('42')).toBeInTheDocument()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})

describe('MenuShopOwners', () => {
	it('links to the three sections', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { pending: true } })
		await renderRoute('/shopOwners')

		expect(sections().getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/shopOwners')
		expect(sections().getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/p/shopOwners/manage-shopOwners')
		// ⚠️ `add-shopOwner`, singular. The plural reads more naturally next to the section it
		// sits in and serves no route, so a link written from memory 404s while looking correct in
		// review — hence the literal href here rather than a click assertion alone.
		expect(sections().getByRole('link', { name: 'Add' })).toHaveAttribute('href', '/p/shopOwners/add-shopOwner')
	})

	it('marks the section being viewed', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { pending: true } })
		await renderRoute('/shopOwners')

		expect(sections().getByRole('link', { name: 'Stats' })).toHaveClass('bg-third')
		expect(sections().getByRole('link', { name: 'Manage' })).not.toHaveClass('bg-third')
	})

	it('navigates between sections', async () => {
		stubGraphQL({ ...chart, ShopOwnersStats: { pending: true }, ShopOwnersActiveTbl: emptyTable })
		const { router } = await renderRoute('/shopOwners')

		await userEvent.click(sections().getByRole('link', { name: 'Manage' }))
		expect(router.state.location.pathname).toBe('/p/shopOwners/manage-shopOwners')
	})
})
