import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const CUSTOMERS = '/customers'

const stone = {
	__typename: 'GraphQLUserActiveTbl',
	_id: '65f0000000000000000000c1',
	registeredAt: '2026-02-01T08:05:45.000Z',
	email: 'ada.stone@example.com',
	disabled: null,
	deleted: null,
	emailVerified: true
}

describe('CustomersPage', () => {
	it('renders', async () => {
		stubGraphQL({
			UsersActiveTbl: { data: { usersActiveTbl: { __typename: 'GraphQLUsersActiveTblPage', total: 1, items: [stone] } } }
		})
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('ada.stone@example.com')).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Customers', level: 1 })).toBeInTheDocument()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
