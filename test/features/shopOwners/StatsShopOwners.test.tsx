import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/**
 * `StatsShopOwners` sits on `ShopOwnersPage` beside `ChartShopOwners`, which fires its own query on the
 * same route — left pending here since this test does not read it.
 */
describe('StatsShopOwners', () => {
	it('renders', async () => {
		stubGraphQL({ ShopOwnersStats: { data: { shopOwnersStats: 42 } }, ShopOwnersPerPeriod: { pending: true } })
		await renderRoute('/shopOwners')

		expect(await screen.findByRole('region', { name: 'ShopOwners' })).toMatchSnapshot()
	})
})
