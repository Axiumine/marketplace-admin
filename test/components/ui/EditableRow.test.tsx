import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { EditableRow } from '@/components/ui/EditableRow'

describe('EditableRow', () => {
	it('starts read-only, with the value and a pen beside it', () => {
		render(
			<EditableRow label="Cellulare" value="3331234567">
				<input aria-label="Cellulare" />
			</EditableRow>
		)

		expect(screen.getByText('Cellulare')).toBeInTheDocument()
		expect(screen.getByText('3331234567')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Modifica Cellulare' })).toBeInTheDocument()
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
	})

	it('swaps the value for the editor when the pen is pressed', async () => {
		render(
			<EditableRow label="Cellulare" value="3331234567">
				<input aria-label="Cellulare" />
			</EditableRow>
		)

		await userEvent.click(screen.getByRole('button', { name: 'Modifica Cellulare' }))

		expect(screen.getByRole('textbox', { name: 'Cellulare' })).toBeInTheDocument()
		expect(screen.queryByText('3331234567')).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Modifica Cellulare' })).not.toBeInTheDocument()
	})

	/*
	 * The name is built from the label, so the default has to be asserted against a *different* label
	 * than the one above — a hard-coded string would satisfy both otherwise.
	 */
	it('names the pen after the row it opens', () => {
		render(
			<EditableRow label="Passo onboarding" value="3">
				<input aria-label="Passo onboarding" />
			</EditableRow>
		)

		expect(screen.getByRole('button', { name: 'Modifica Passo onboarding' })).toBeInTheDocument()
	})

	// Opening hours are the reason: a shop may open twice on the same day, so two rows carry the same
	// visible label and the two pens would otherwise announce identically.
	it('takes an explicit name when the label would not be unique', () => {
		render(
			<EditableRow label="lunedì" azione="Modifica orario 2" value="18:30 – 23:00">
				<input aria-label="Dalle" />
			</EditableRow>
		)

		expect(screen.getByRole('button', { name: 'Modifica orario 2' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Modifica lunedì' })).not.toBeInTheDocument()
	})

	// Icon-only, so `aria-label` is the only thing naming it and the glyph has to stay out of the
	// accessibility tree — otherwise the row announces an unnamed control next to an unnamed image.
	it('names the icon-only pen and hides the glyph from assistive tech', () => {
		render(
			<EditableRow label="Nome" value="Mario">
				<input aria-label="Nome" />
			</EditableRow>
		)

		const penna = screen.getByRole('button', { name: 'Modifica Nome' })
		expect(penna.textContent).toBe('')
		expect(penna.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
		expect(penna).toHaveAttribute('title', 'Modifica Nome')
	})

	// The rows live inside the page's form: a pen that defaulted to `type="submit"` would save the whole
	// imprenditore on the way into editing one field.
	it('does not submit the form it sits in', async () => {
		let inviato = false

		render(
			<form
				onSubmit={(event) => {
					event.preventDefault()
					inviato = true
				}}
			>
				<EditableRow label="Nome" value="Mario">
					<input aria-label="Nome" />
				</EditableRow>
			</form>
		)

		await userEvent.click(screen.getByRole('button', { name: 'Modifica Nome' }))

		expect(inviato).toBe(false)
	})

	// A row of a fixed document — every field of the anagrafica — has nothing to delete. The bin is opt-in
	// so those rows do not grow a control that could only ever be a mistake.
	it('has no bin unless one is asked for', () => {
		render(
			<EditableRow label="Nome" value="Mario">
				<input aria-label="Nome" />
			</EditableRow>
		)

		expect(screen.queryByRole('button', { name: 'Elimina Nome' })).not.toBeInTheDocument()
	})

	it('puts a bin beside the pen, named after the row', async () => {
		let eliminato = false

		render(
			<EditableRow
				label="Passo onboarding"
				value="3"
				onElimina={() => {
					eliminato = true
				}}
			>
				<input aria-label="Passo onboarding" />
			</EditableRow>
		)

		await userEvent.click(screen.getByRole('button', { name: 'Elimina Passo onboarding' }))

		expect(eliminato).toBe(true)
	})

	it('takes an explicit name for the bin when the label would not be unique', () => {
		render(
			<EditableRow
				label="lunedì"
				azioneElimina="Elimina orario 2"
				value="18:30 – 23:00"
				onElimina={() => {
					/* not pressed here */
				}}
			>
				<input aria-label="Dalle" />
			</EditableRow>
		)

		expect(screen.getByRole('button', { name: 'Elimina orario 2' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Elimina lunedì' })).not.toBeInTheDocument()
	})

	// The whole point of keeping it reachable: a row is usually opened *before* the operator decides it
	// should not exist at all.
	it('keeps the bin once the row is open', async () => {
		let eliminato = false

		render(
			<EditableRow
				label="lunedì"
				value="11:30 – 14:30"
				onElimina={() => {
					eliminato = true
				}}
			>
				<input aria-label="Dalle" />
			</EditableRow>
		)

		await userEvent.click(screen.getByRole('button', { name: 'Modifica lunedì' }))
		await userEvent.click(screen.getByRole('button', { name: 'Elimina lunedì' }))

		expect(screen.getByRole('textbox', { name: 'Dalle' })).toBeInTheDocument()
		expect(eliminato).toBe(true)
	})

	// A row that was just added has no stored value: closed, it would read as an empty label beside an
	// empty value, and the operator would have to find the pen of a row that looks like a rendering bug.
	it('can start open', () => {
		render(
			<EditableRow label="" value="" apertoIniziale>
				<input aria-label="Giorno" />
			</EditableRow>
		)

		expect(screen.getByRole('textbox', { name: 'Giorno' })).toBeInTheDocument()
	})

	it('does not submit the form it sits in when the bin is pressed', async () => {
		let inviato = false

		render(
			<form
				onSubmit={(event) => {
					event.preventDefault()
					inviato = true
				}}
			>
				<EditableRow
					label="lunedì"
					value="11:30 – 14:30"
					onElimina={() => {
						/* the submit is what is under test */
					}}
				>
					<input aria-label="Dalle" />
				</EditableRow>
			</form>
		)

		await userEvent.click(screen.getByRole('button', { name: 'Elimina lunedì' }))

		expect(inviato).toBe(false)
	})

	it('renders read-only', () => {
		const { container } = render(
			<EditableRow label="Nome" value="Mario">
				<input aria-label="Nome" />
			</EditableRow>
		)

		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders open', async () => {
		const { container } = render(
			<EditableRow label="Nome" value="Mario">
				<input aria-label="Nome" />
			</EditableRow>
		)
		await userEvent.click(screen.getByRole('button', { name: 'Modifica Nome' }))

		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders with a bin', () => {
		const { container } = render(
			<EditableRow
				label="lunedì"
				value="11:30 – 14:30"
				onElimina={() => {
					/* not pressed here */
				}}
			>
				<input aria-label="Dalle" />
			</EditableRow>
		)

		expect(container.firstChild).toMatchSnapshot()
	})
})
