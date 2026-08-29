import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/**
 * `StatsCustomers` sits on `CustomersPage` above `ChartCustomers` and `TblCustomers`, both of which fire
 * their own queries on the same route — left pending here, since this test reads neither.
 */
const rest = {
	UsersPerPeriod: { pending: true },
	UsersActiveTbl: { pending: true }
}

describe('StatsCustomers', () => {
	it('waits before showing a number', async () => {
		stubGraphQL({ ...rest, UsersStats: { pending: true } })
		await renderRoute('/customers')

		expect(screen.getByText('Loading statistics')).toBeInTheDocument()
	})

	it('shows the count the service answered', async () => {
		stubGraphQL({ ...rest, UsersStats: { data: { usersStats: 42 } } })
		await renderRoute('/customers')

		const box = await screen.findByRole('region', { name: 'Customers' })
		expect(box).toHaveTextContent('42')
	})

	// Zero is a real answer — a platform nobody has registered on yet — and it has to read as a count
	// rather than as a blank tile.
	it('shows a zero rather than an empty row', async () => {
		stubGraphQL({ ...rest, UsersStats: { data: { usersStats: 0 } } })
		await renderRoute('/customers')

		const box = await screen.findByRole('region', { name: 'Customers' })
		expect(box).toHaveTextContent('0')
	})

	// urql nulls the whole `data` when the service cannot answer without erroring, so there is no object
	// to read the count off. The tile falls back to 0 rather than rendering `undefined`.
	it('falls back to zero when the answer carries no data at all', async () => {
		stubGraphQL({ ...rest, UsersStats: {} })
		await renderRoute('/customers')

		const box = await screen.findByRole('region', { name: 'Customers' })
		expect(box).toHaveTextContent('0')
	})

	it('reports a failure instead of a count', async () => {
		stubGraphQL({
			...rest,
			UsersStats: { errors: [graphQLError('Error', 'Count unavailable', 500)], status: 500 }
		})
		await renderRoute('/customers')

		expect(await screen.findByRole('alert')).toHaveTextContent('Count unavailable')
	})

	it('renders', async () => {
		stubGraphQL({ ...rest, UsersStats: { data: { usersStats: 42 } } })
		await renderRoute('/customers')

		expect(await screen.findByRole('region', { name: 'Customers' })).toMatchSnapshot()
	})
})
