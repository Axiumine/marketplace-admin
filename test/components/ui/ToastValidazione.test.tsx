import { render, screen, within } from '@testing-library/react'
import type { FieldErrors } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { INTESTAZIONE_VALIDAZIONE, ToastValidazione } from '@/components/ui/ToastValidazione'

/** See `erroriForm.test.ts`: `FieldErrors` is the untyped error map, and an object literal needs the cast. */
const errori = (albero: Record<string, unknown>): FieldErrors => albero as unknown as FieldErrors

describe('ToastValidazione', () => {
	// Nothing at all, not an empty toast: the operator has nothing to correct, and a box in the corner
	// saying so is one more thing to dismiss.
	it('is nothing when there is nothing to correct', () => {
		render(<ToastValidazione errori={errori({})} />)

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	// One `<li>` per box, under a line that says what the list is — the messages themselves do not.
	it('lists what has to be corrected', () => {
		render(
			<ToastValidazione
				errori={errori({ nome: { message: 'Il nome è obbligatorio' }, pec: { message: 'La PEC non è un indirizzo valido' } })}
			/>
		)

		const avviso = screen.getByRole('alert')
		// Spelled out rather than compared against the constant, which would pass whatever the constant
		// holds — the sentence is the requirement, not the export.
		expect(avviso).toHaveTextContent('Correggi questi campi prima di salvare:')
		expect(INTESTAZIONE_VALIDAZIONE).toBe('Correggi questi campi prima di salvare:')
		expect(
			within(avviso)
				.getAllByRole('listitem')
				.map((riga) => riga.textContent)
		).toEqual(['Il nome è obbligatorio', 'La PEC non è un indirizzo valido'])
	})

	// `role="alert"` and not `status`: a refused save is assertive, and the tone is what carries that —
	// see `Toast`, which this leans on rather than reimplementing.
	it('is an error toast', () => {
		render(<ToastValidazione errori={errori({ nome: { message: 'Il nome è obbligatorio' } })} />)

		expect(screen.getByRole('alert')).toHaveClass('border-app-error')
	})

	/*
	 * The whole point of deriving the list from `formState.errors` on every render rather than from a
	 * snapshot taken when Save was pressed: a corrected field takes its line with it, and the last one
	 * takes the toast.
	 */
	it('shrinks as the fields are corrected, and goes away with the last of them', () => {
		const { rerender } = render(
			<ToastValidazione
				errori={errori({ nome: { message: 'Il nome è obbligatorio' }, pec: { message: 'La PEC non è un indirizzo valido' } })}
			/>
		)

		expect(screen.getAllByRole('listitem')).toHaveLength(2)

		rerender(<ToastValidazione errori={errori({ pec: { message: 'La PEC non è un indirizzo valido' } })} />)

		expect(screen.getAllByRole('listitem').map((riga) => riga.textContent)).toEqual(['La PEC non è un indirizzo valido'])

		rerender(<ToastValidazione errori={errori({})} />)

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('renders', () => {
		render(
			<ToastValidazione
				errori={errori({ nome: { message: 'Il nome è obbligatorio' }, pec: { message: 'La PEC non è un indirizzo valido' } })}
			/>
		)
		expect(screen.getByRole('alert')).toMatchSnapshot()
	})
})
