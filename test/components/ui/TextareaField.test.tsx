import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { TextareaField } from '@/components/ui/TextareaField'

describe('TextareaField', () => {
	it('associates its label with the textarea', () => {
		render(<TextareaField label="Note" />)

		const area = screen.getByLabelText('Note')
		expect(area.tagName).toBe('TEXTAREA')

		// `fireEvent.change`, not `userEvent.type`: the box this component exists for carries a `maxLength`
		// of two thousand, and typing a note a character at a time is a test that measures the keyboard.
		fireEvent.change(area, { target: { value: 'Chiamare\nprima delle 18.' } })
		expect(area).toHaveValue('Chiamare\nprima delle 18.')
	})

	it('generates an id when none is given, so two fields on one page do not collide', () => {
		render(
			<>
				<TextareaField label="Note" />
				<TextareaField label="Memo" />
			</>
		)

		const note = screen.getByLabelText('Note')
		const memo = screen.getByLabelText('Memo')
		expect(note.id).not.toBe('')
		expect(note.id).not.toBe(memo.id)
	})

	it('uses a caller-supplied id verbatim', () => {
		render(<TextareaField label="Note" id="campo-note" />)
		expect(screen.getByLabelText('Note')).toHaveAttribute('id', 'campo-note')
	})

	it('is valid and describes nothing when there is no error', () => {
		render(<TextareaField label="Note" />)

		const area = screen.getByLabelText('Note')
		expect(area).toHaveAttribute('aria-invalid', 'false')
		expect(area).not.toHaveAttribute('aria-describedby')
	})

	// The message has to be announced *with* the field, not float unattached beneath it — otherwise a
	// screen-reader user hears "Note, casella di testo" and never learns why the form refused.
	it('wires the error message to the textarea', () => {
		render(<TextareaField label="Note" id="campo-note" error="La nota non può superare 2000 caratteri" />)

		const area = screen.getByLabelText('Note')
		expect(area).toHaveAttribute('aria-invalid', 'true')
		expect(area).toHaveAttribute('aria-describedby', 'campo-note-error')
		expect(document.getElementById('campo-note-error')).toHaveTextContent('La nota non può superare 2000 caratteri')
	})

	// Without the forwarded ref, react-hook-form's `register()` never reaches the real control: the field
	// is both uncontrolled and unregistered, and the form reads it as permanently empty.
	it('forwards its ref to the textarea element', () => {
		const ref = createRef<HTMLTextAreaElement>()
		render(<TextareaField label="Note" ref={ref} />)

		expect(ref.current).toBe(screen.getByLabelText('Note'))
	})

	// Five lines is a note rather than a paragraph, and `resize-y` covers whoever disagrees — but a caller
	// asking for a different height has to get it, or the default is a hard-coded number in disguise.
	it('starts five lines tall and takes a height from the caller', () => {
		const { rerender } = render(<TextareaField label="Note" />)

		expect(screen.getByLabelText('Note')).toHaveAttribute('rows', '5')

		rerender(<TextareaField label="Note" rows={12} />)

		expect(screen.getByLabelText('Note')).toHaveAttribute('rows', '12')
	})

	it('passes the remaining textarea attributes through', () => {
		render(<TextareaField label="Note" maxLength={2000} placeholder="Appunti sull'account" />)

		const area = screen.getByLabelText('Note')
		expect(area).toHaveAttribute('maxlength', '2000')
		expect(area).toHaveAttribute('placeholder', "Appunti sull'account")
	})

	// Every class is asserted absent in the other state: the two pairs set two properties, so a box
	// carrying both halves of either would be resolved by stylesheet order rather than by the error.
	it('doubles its border and turns red when it is invalid', () => {
		const { rerender } = render(<TextareaField label="Note" />)

		expect(screen.getByLabelText('Note')).toHaveClass('border', 'bg-white')
		expect(screen.getByLabelText('Note')).not.toHaveClass('border-2')
		expect(screen.getByLabelText('Note')).not.toHaveClass('bg-app-error/10')

		rerender(<TextareaField label="Note" error="La nota non può superare 2000 caratteri" />)

		expect(screen.getByLabelText('Note')).toHaveClass('border-2', 'bg-app-error/10')
		expect(screen.getByLabelText('Note')).not.toHaveClass('border')
		expect(screen.getByLabelText('Note')).not.toHaveClass('bg-white')
	})

	/*
	 * The count is the caller's number, not one this component measures.
	 *
	 * ⚠️ That is not a style choice: the box is uncontrolled, `register()` writes the stored value in
	 * through a ref without an `onChange`, and a length measured here would read zero for a note of two
	 * hundred characters until the first keystroke corrected it.
	 */
	it('shows the remaining characters, and nothing at all when no count is given', () => {
		const { rerender } = render(<TextareaField label="Note" />)

		expect(screen.queryByText(/caratteri rimanenti$/)).not.toBeInTheDocument()
		expect(screen.getByLabelText('Note')).not.toHaveAttribute('aria-describedby')

		rerender(<TextareaField label="Note" id="campo-note" rimanenti={1985} />)

		expect(screen.getByText('1985 caratteri rimanenti')).toBeInTheDocument()
		expect(screen.getByLabelText('Note')).toHaveAttribute('aria-describedby', 'campo-note-rimanenti')
	})

	// `0` is a count, not a missing one — the box is exactly full and that is the moment the number matters
	// most. A truthiness test here would hide it precisely then.
	it('shows a count of zero', () => {
		render(<TextareaField label="Note" rimanenti={0} />)

		expect(screen.getByText('0 caratteri rimanenti')).toBeInTheDocument()
	})

	// The number changes while the operator types and nothing else on screen reports it, so it has to be
	// announced rather than merely rendered.
	it('announces the count as it changes', () => {
		render(<TextareaField label="Note" rimanenti={12} />)

		expect(screen.getByText('12 caratteri rimanenti')).toHaveAttribute('aria-live', 'polite')
	})

	// Both ids, in one attribute: the message says what is wrong and the count says how far past the cap it
	// is, and a screen reader handed only one of the two is handed the half that cannot be acted on.
	it('describes the textarea by its error and its count together', () => {
		render(<TextareaField label="Note" id="campo-note" error="La nota non può superare 2000 caratteri" rimanenti={-3} />)

		expect(screen.getByLabelText('Note')).toHaveAttribute('aria-describedby', 'campo-note-error campo-note-rimanenti')
	})

	it('renders', () => {
		const { container } = render(<TextareaField label="Note" id="campo-note" />)
		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders with a count', () => {
		const { container } = render(<TextareaField label="Note" id="campo-note" rimanenti={1985} />)
		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders with an error', () => {
		const { container } = render(<TextareaField label="Note" id="campo-note" error="La nota non può superare 2000 caratteri" />)
		expect(container.firstChild).toMatchSnapshot()
	})
})
