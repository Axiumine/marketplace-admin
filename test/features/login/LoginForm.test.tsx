import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { trackUnhandledRejections } from '../../helpers/rejections'
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

	// `result.data?.loginAdmin.accessToken` reads the mutation's answer through an optional chain
	// precisely because a response that carries `errors` and no `data` is the expected shape of a
	// failed login, not an exceptional one. Without the `?.` this line throws instead of reading
	// `undefined`, inside the async submit handler that `onSubmit={(event) => { void onSubmit(event) }}`
	// never awaits — a throw there is a promise rejection nothing on screen ever shows, so the only way
	// to see it is to catch it the way Node itself does.
	it('reads a data-less error response without throwing inside the submit handler', async () => {
		const rejections = trackUnhandledRejections()

		stubGraphQL({ LoginAdmin: { errors: [graphQLError('Invalid credentials', 'Email or password not correct')] } })
		await renderRoute('/', { token: null, session: null })

		await userEvent.type(screen.getByLabelText('Email'), 'admin@marketplace.test')
		await userEvent.type(screen.getByLabelText('Password'), 'password123')
		await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('Email or password not correct')

		await rejections.settle()
		rejections.stop()
		expect(rejections.reasons).toEqual([])
	})
})
