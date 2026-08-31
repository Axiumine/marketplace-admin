import { screen, within } from '@testing-library/react'
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

/*
 * Three rows since the platform owner asked for them: the counter, the chart, then the table. The
 * page fires all three queries on entry, so all three are answered here — an unstubbed one throws
 * rather than rendering empty.
 */
describe('CustomersPage', () => {
	it('renders', async () => {
		stubGraphQL({
			UsersStats: { data: { usersStats: 7 } },
			UsersPerPeriod: {
				data: {
					usersPerPeriod: {
						granularity: 'MONTH',
						points: [
							{ date: '2026-07-01', total: 3 },
							{ date: '2026-08-01', total: 4 }
						]
					}
				}
			},
			UsersActiveTbl: { data: { usersActiveTbl: { __typename: 'GraphQLUsersActiveTblPage', total: 1, items: [stone] } } }
		})
		await renderRoute(CUSTOMERS)

		expect(await screen.findByText('ada.stone@example.com')).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Customers', level: 1 })).toBeInTheDocument()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})

	// The counter is unfiltered and the table's own total is not, so the two numbers on this screen are
	// allowed to disagree — 7 registrations ever against 1 live row. Asserted here because a later
	// "tidy" that fed the counter from the page's `total` would look correct on any fixture where they
	// happen to match.
	it('shows the platform-wide count beside a filtered table', async () => {
		stubGraphQL({
			UsersStats: { data: { usersStats: 7 } },
			UsersPerPeriod: { pending: true },
			UsersActiveTbl: { data: { usersActiveTbl: { __typename: 'GraphQLUsersActiveTblPage', total: 1, items: [stone] } } }
		})
		await renderRoute(CUSTOMERS)

		const counter = await screen.findByRole('region', { name: 'Customers' })
		expect(within(counter).getByText('7')).toBeInTheDocument()
	})
})
