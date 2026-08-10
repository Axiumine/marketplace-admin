import { describe, expect, it } from 'vitest'

import { ChangePasswordForm } from '@/features/settings/PasswordChangeForm'

import { renderWithClient } from '../../helpers/render'

/**
 * `ChangePasswordForm` needs the urql client for its mutation but reads nothing from the URL, so it is
 * mounted directly rather than through the router — see `renderWithClient` in `test/helpers/render.tsx`.
 */
describe('ChangePasswordForm', () => {
	it('renders', () => {
		const { container } = renderWithClient(<ChangePasswordForm />)

		expect(container.firstChild).toMatchSnapshot()
	})
})
