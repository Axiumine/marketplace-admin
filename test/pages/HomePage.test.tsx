import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const emptyTable = { data: { shopOwnersActiveTbl: { total: 0, items: [] } } }

describe('HomePage', () => {
	it('shows the dashboard title and no breadcrumbs', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
		// `PageHeader` renders the breadcrumb list only when there is a trail. The dashboard is the top
		// of the tree, and a one-item trail pointing at the page you are on is noise.
		expect(screen.queryByRole('navigation', { name: 'Path' })).not.toBeInTheDocument()
	})

	// The tile's `to` is typed as the router's own union of route paths, so a destination that serves no
	// page fails `tsc` rather than 404ing at run time. Both halves are still asserted — the href it
	// renders, and that clicking it actually lands there.
	it('opens the shopOwners table from the tile', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: emptyTable })
		const { router } = await renderRoute('/home')

		const tile = screen.getByRole('link', { name: /ShopOwners\s*Manage shop owners/ })
		expect(tile).toHaveAttribute('href', '/p/shopOwners/manage-shopOwners')

		await userEvent.click(tile)
		expect(router.state.location.pathname).toBe('/p/shopOwners/manage-shopOwners')
	})

	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
