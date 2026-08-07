import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { MAX_PWD_LENGTH } from '@/features/settings/PasswordChangeForm'

import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const CURRENT = 'password-vecchia'
const NEW = 'password-new'

const fillIn = async (current: string, newPwd: string, repeat: string) => {
	if (current !== '') await userEvent.type(screen.getByLabelText('Current password'), current)
	if (newPwd !== '') await userEvent.type(screen.getByLabelText('New password'), newPwd)
	if (repeat !== '') await userEvent.type(screen.getByLabelText('Repeat the new password'), repeat)
}

const submit = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Cambia password' }))
}

describe('SettingsPage', () => {
	it('shows the page title and the password form', async () => {
		stubGraphQL({})
		await renderRoute('/settings')

		expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Change password', level: 2 })).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/settings')

		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})

/**
 * ⚠️ Every test below asserts either a blocked round-trip or a sent one. A password form is the one
 * screen where "looks right" and "works" are indistinguishable by eye: the fields fill, the button
 * clicks and the operator walks away believing the password changed. Only the call count says whether
 * it did.
 */
describe('PasswordChangeForm', () => {
	it('refuses an empty current password', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/settings')

		await fillIn('', NEW, NEW)
		await submit()

		expect(await screen.findByText('Enter the current password')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// 10 is `MIN_PWD_LENGTH` from koa-utils' `Constants.mts`. The backend re-checks it; this only saves
	// the round-trip.
	it('refuses a new password below the minimum length', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/settings')

		await fillIn(CURRENT, 'corta', 'corta')
		await submit()

		expect(await screen.findByText('The new password must be at least 10 characters')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	/**
	 * 72 is where bcrypt truncates, so anything past it is silently not part of the password — an
	 * operator who set a 90-character password would find the first 72 of it also worked.
	 *
	 * Set through `fireEvent` rather than typed, because the input carries `maxLength={72}` and typing
	 * stops there. That is not a contrived path: a password manager fills a field programmatically, and
	 * `maxlength` does not apply to a value set that way.
	 */
	it('refuses a new password past the bcrypt truncation point', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/settings')

		const tooLong = 'x'.repeat(MAX_PWD_LENGTH + 1)
		await userEvent.type(screen.getByLabelText('Current password'), CURRENT)
		fireEvent.change(screen.getByLabelText('New password'), { target: { value: tooLong } })
		fireEvent.change(screen.getByLabelText('Repeat the new password'), { target: { value: tooLong } })
		await submit()

		expect(await screen.findByText('The new password cannot exceed 72 characters')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('refuses two new passwords that do not match', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/settings')

		await fillIn(CURRENT, NEW, `${NEW}-diversa`)
		await submit()

		expect(await screen.findByText('The two passwords do not match')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// A "change" that changes nothing still ends with a success message, which is the worst outcome: the
	// operator believes the old password is retired when it is the one still in use.
	it('refuses a new password identical to the current one', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/settings')

		await fillIn(CURRENT, CURRENT, CURRENT)
		await submit()

		expect(await screen.findByText('The new password must differ from the current one')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	/**
	 * The mutation takes no `_id`: the account comes from the Redis session server-side. The exact
	 * variables are asserted, not just the call count, because an `_id` added here would be a value the
	 * sender controls — and the platform has no role field to check it against, so it would let any
	 * operator set another operator's password.
	 */
	it('sends only the two passwords, to the admin-resource endpoint', async () => {
		const stub = stubGraphQL({ AdminUpdatePwd: { data: { adminUpdatePwd: true } } })
		await renderRoute('/settings')

		await fillIn(CURRENT, NEW, NEW)
		await submit()

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({ passwordOld: CURRENT, passwordNew: NEW })
		expect(stub.calls[0]?.url).toBe(ENDPOINT.adminResource)
	})

	// Clearing the fields is not tidiness: they hold two live passwords, and leaving them in the DOM
	// leaves them in any screenshot, screen share or accessibility dump of the page.
	it('confirms and empties the fields on success', async () => {
		stubGraphQL({ AdminUpdatePwd: { data: { adminUpdatePwd: true } } })
		await renderRoute('/settings')

		await fillIn(CURRENT, NEW, NEW)
		await submit()

		// `status`, not `alert`: success is announced politely, without interrupting the screen reader.
		expect(await screen.findByRole('status')).toHaveTextContent('Password updated')
		expect(screen.getByLabelText('Current password')).toHaveValue('')
		expect(screen.getByLabelText('New password')).toHaveValue('')
		expect(screen.getByLabelText('Repeat the new password')).toHaveValue('')
	})

	it('reports the backend error and keeps what was typed', async () => {
		stubGraphQL({
			AdminUpdatePwd: { errors: [graphQLError('Wrong password', 'The current password is not correct', 400)], status: 400 }
		})
		await renderRoute('/settings')

		await fillIn(CURRENT, NEW, NEW)
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('The current password is not correct')
		expect(screen.getByLabelText('Current password')).toHaveValue(CURRENT)
	})

	/**
	 * Two changes in a row, the first accepted and the second refused — the one sequence that separates
	 * "empty the fields when it worked" from "empty the fields whenever the answer changes".
	 *
	 * A single failed attempt cannot tell them apart: the effect is keyed on the success flag, which
	 * starts false, so a failure never moves it and the effect never re-runs. It takes a success to raise
	 * the flag and a failure to lower it again before the difference is observable — and by then the
	 * operator has typed two more passwords that would be thrown away.
	 */
	it('keeps what was typed when a second attempt fails after a first one succeeded', async () => {
		const THIRD = 'password-terza'
		stubGraphQL({
			AdminUpdatePwd: [
				{ data: { adminUpdatePwd: true } },
				{ errors: [graphQLError('Wrong password', 'The current password is not correct', 400)], status: 400 }
			]
		})
		await renderRoute('/settings')

		await fillIn(CURRENT, NEW, NEW)
		await submit()
		expect(await screen.findByRole('status')).toHaveTextContent('Password updated')

		await fillIn(NEW, THIRD, THIRD)
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('The current password is not correct')
		expect(screen.getByLabelText('Current password')).toHaveValue(NEW)
		expect(screen.getByLabelText('New password')).toHaveValue(THIRD)
		expect(screen.getByLabelText('Repeat the new password')).toHaveValue(THIRD)
	})

	// GraphQL allows a response to carry data *and* errors. Announcing "Password updated" next to a
	// red alert would leave the operator to guess which half is true.
	it('does not confirm when the answer carries an error alongside the data', async () => {
		stubGraphQL({
			AdminUpdatePwd: {
				data: { adminUpdatePwd: true },
				errors: [graphQLError('Wrong password', 'The current password is not correct', 400)],
				status: 400
			}
		})
		await renderRoute('/settings')

		await fillIn(CURRENT, NEW, NEW)
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('The current password is not correct')
		expect(screen.queryByText('Password updated')).not.toBeInTheDocument()
		expect(screen.getByLabelText('Current password')).toHaveValue(CURRENT)
	})

	// `false` with no error is the backend refusing without saying why. Treating it as success would
	// tell the operator their password changed when it did not.
	it('does not confirm when the mutation answers false', async () => {
		stubGraphQL({ AdminUpdatePwd: { data: { adminUpdatePwd: false } } })
		await renderRoute('/settings')

		await fillIn(CURRENT, NEW, NEW)
		await submit()

		await waitFor(() => {
			expect(screen.getByLabelText('Current password')).toHaveValue(CURRENT)
		})
		expect(screen.queryByText('Password updated')).not.toBeInTheDocument()
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})
})
