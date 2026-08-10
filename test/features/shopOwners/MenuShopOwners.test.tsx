import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/**
 * `MenuShopOwners` sits in the `ShopOwnersPage` header and needs a real router for its three `Link`s, so
 * it is rendered through that page. The other two queries the page fires are left pending: the menu
 * reads neither, and a reply nobody needs would only be one more fixture to keep in sync.
 */
describe('MenuShopOwners', () => {
	it('renders', async () => {
		stubGraphQL({ ShopOwnersStats: { pending: true }, ShopOwnersPerPeriod: { pending: true } })
		await renderRoute('/shopOwners')

		expect(screen.getByRole('navigation', { name: 'Sections shopOwners' })).toMatchSnapshot()
	})
})
