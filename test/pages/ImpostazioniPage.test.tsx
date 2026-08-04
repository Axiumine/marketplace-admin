import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { MAX_PWD_LENGTH } from '@/features/impostazioni/CambioPasswordForm'

import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const ATTUALE = 'password-vecchia'
const NUOVA = 'password-nuova'

const fillIn = async (attuale: string, nuova: string, ripeti: string) => {
	if (attuale !== '') await userEvent.type(screen.getByLabelText('Password attuale'), attuale)
	if (nuova !== '') await userEvent.type(screen.getByLabelText('Nuova password'), nuova)
	if (ripeti !== '') await userEvent.type(screen.getByLabelText('Ripeti la nuova password'), ripeti)
}

const submit = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Cambia password' }))
}

describe('ImpostazioniPage', () => {
	it('shows the page title and the password form', async () => {
		stubGraphQL({})
		await renderRoute('/impostazioni')

		expect(screen.getByRole('heading', { name: 'Impostazioni', level: 1 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Cambio password', level: 2 })).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/impostazioni')

		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})

/**
 * ⚠️ Every test below asserts either a blocked round-trip or a sent one. A password form is the one
 * screen where "looks right" and "works" are indistinguishable by eye: the fields fill, the button
 * clicks and the operator walks away believing the password changed. Only the call count says whether
 * it did.
 */
describe('CambioPasswordForm', () => {
	it('refuses an empty current password', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/impostazioni')

		await fillIn('', NUOVA, NUOVA)
		await submit()

		expect(await screen.findByText('Inserisci la password attuale')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// 10 is `MIN_PWD_LENGTH` from koa-utils' `Constants.mts`. The backend re-checks it; this only saves
	// the round-trip.
	it('refuses a new password below the minimum length', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, 'corta', 'corta')
		await submit()

		expect(await screen.findByText('La nuova password deve avere almeno 10 caratteri')).toBeInTheDocument()
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
		await renderRoute('/impostazioni')

		const troppoLunga = 'x'.repeat(MAX_PWD_LENGTH + 1)
		await userEvent.type(screen.getByLabelText('Password attuale'), ATTUALE)
		fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: troppoLunga } })
		fireEvent.change(screen.getByLabelText('Ripeti la nuova password'), { target: { value: troppoLunga } })
		await submit()

		expect(await screen.findByText('La nuova password non può superare 72 caratteri')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('refuses two new passwords that do not match', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, NUOVA, `${NUOVA}-diversa`)
		await submit()

		expect(await screen.findByText('Le due password non coincidono')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// A "change" that changes nothing still ends with a success message, which is the worst outcome: the
	// operator believes the old password is retired when it is the one still in use.
	it('refuses a new password identical to the current one', async () => {
		const stub = stubGraphQL({})
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, ATTUALE, ATTUALE)
		await submit()

		expect(await screen.findByText('La nuova password deve essere diversa da quella attuale')).toBeInTheDocument()
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
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, NUOVA, NUOVA)
		await submit()

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toEqual({ passwordOld: ATTUALE, passwordNew: NUOVA })
		expect(stub.calls[0]?.url).toBe(ENDPOINT.adminResource)
	})

	// Clearing the fields is not tidiness: they hold two live passwords, and leaving them in the DOM
	// leaves them in any screenshot, screen share or accessibility dump of the page.
	it('confirms and empties the fields on success', async () => {
		stubGraphQL({ AdminUpdatePwd: { data: { adminUpdatePwd: true } } })
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, NUOVA, NUOVA)
		await submit()

		// `status`, not `alert`: success is announced politely, without interrupting the screen reader.
		expect(await screen.findByRole('status')).toHaveTextContent('Password aggiornata')
		expect(screen.getByLabelText('Password attuale')).toHaveValue('')
		expect(screen.getByLabelText('Nuova password')).toHaveValue('')
		expect(screen.getByLabelText('Ripeti la nuova password')).toHaveValue('')
	})

	it('reports the backend error and keeps what was typed', async () => {
		stubGraphQL({
			AdminUpdatePwd: { errors: [graphQLError('Password errata', 'La password attuale non è corretta', 400)], status: 400 }
		})
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, NUOVA, NUOVA)
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('La password attuale non è corretta')
		expect(screen.getByLabelText('Password attuale')).toHaveValue(ATTUALE)
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
		const TERZA = 'password-terza'
		stubGraphQL({
			AdminUpdatePwd: [
				{ data: { adminUpdatePwd: true } },
				{ errors: [graphQLError('Password errata', 'La password attuale non è corretta', 400)], status: 400 }
			]
		})
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, NUOVA, NUOVA)
		await submit()
		expect(await screen.findByRole('status')).toHaveTextContent('Password aggiornata')

		await fillIn(NUOVA, TERZA, TERZA)
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('La password attuale non è corretta')
		expect(screen.getByLabelText('Password attuale')).toHaveValue(NUOVA)
		expect(screen.getByLabelText('Nuova password')).toHaveValue(TERZA)
		expect(screen.getByLabelText('Ripeti la nuova password')).toHaveValue(TERZA)
	})

	// GraphQL allows a response to carry data *and* errors. Announcing "Password aggiornata" next to a
	// red alert would leave the operator to guess which half is true.
	it('does not confirm when the answer carries an error alongside the data', async () => {
		stubGraphQL({
			AdminUpdatePwd: {
				data: { adminUpdatePwd: true },
				errors: [graphQLError('Password errata', 'La password attuale non è corretta', 400)],
				status: 400
			}
		})
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, NUOVA, NUOVA)
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent('La password attuale non è corretta')
		expect(screen.queryByText('Password aggiornata')).not.toBeInTheDocument()
		expect(screen.getByLabelText('Password attuale')).toHaveValue(ATTUALE)
	})

	// `false` with no error is the backend refusing without saying why. Treating it as success would
	// tell the operator their password changed when it did not.
	it('does not confirm when the mutation answers false', async () => {
		stubGraphQL({ AdminUpdatePwd: { data: { adminUpdatePwd: false } } })
		await renderRoute('/impostazioni')

		await fillIn(ATTUALE, NUOVA, NUOVA)
		await submit()

		await waitFor(() => {
			expect(screen.getByLabelText('Password attuale')).toHaveValue(ATTUALE)
		})
		expect(screen.queryByText('Password aggiornata')).not.toBeInTheDocument()
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})
})
