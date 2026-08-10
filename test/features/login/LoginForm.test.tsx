import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubGraphQL } from '../../helpers/graphql'
import { renderRoute } from '../../helpers/render'

/**
 * `LoginForm` calls `useNavigate`, so it needs a real router — rendered through the root route it
 * actually sits on, the same way `LoginPage.test.tsx` does, and signed out: the interesting default the
 * app renders this form under.
 */
describe('LoginForm', () => {
	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/', { token: null, session: null })

		expect(screen.getByRole('heading', { name: 'Login', level: 2 }).closest('form')).toMatchSnapshot()
	})
})
