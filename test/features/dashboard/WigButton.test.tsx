import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/**
 * `WigButton` needs a real router — it renders a `Link` — so it is exercised through the dashboard
 * route it actually sits on rather than mounted by hand.
 */
describe('WigButton', () => {
	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByRole('link', { name: /ShopOwners\s*Manage shop owners/ })).toMatchSnapshot()
	})
})
