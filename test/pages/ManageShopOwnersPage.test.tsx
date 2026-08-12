import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const MANAGE = '/p/shopOwners/manage-shopOwners'

const rivers = {
	_id: '65f0000000000000000000f1',
	registeredAt: '2026-02-01T08:05:45.000Z',
	email: 'mark.rivers@example.com',
	waitApprov: null,
	personalData: {
		firstName: 'Mark',
		lastName: 'Rivers',
		address: { street: '1 Main Street', postalCode: '02109', city: 'Boston', province: 'MA' }
	}
}

describe('ManageShopOwnersPage', () => {
	it('renders', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: { data: { shopOwnersActiveTbl: { total: 1, items: [rivers] } } } })
		await renderRoute(MANAGE)

		expect(await screen.findByText('Rivers')).toBeInTheDocument()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
