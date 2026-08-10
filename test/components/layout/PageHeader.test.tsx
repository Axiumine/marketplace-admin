import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

const emptyTable = { data: { shopOwnersActiveTbl: { total: 0, items: [] } } }

describe('PageHeader', () => {
	/*
	 * Rendered through a real page rather than mounted by hand: a crumb with `to` renders a router
	 * `Link`, which throws outside a `RouterProvider`. `ManageShopOwnersPage` is the one screen that
	 * gives PageHeader both crumb shapes at once — one linked, one plain — alongside a title and actions.
	 */
	it('renders', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: emptyTable })
		await renderRoute('/p/shopOwners/manage-shopOwners')

		const header = screen.getByRole('heading', { name: 'Manage shop owners', level: 1 }).closest('header')
		expect(header).toMatchSnapshot()
	})
})
