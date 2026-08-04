import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { CheckboxField } from '@/components/ui/CheckboxField'

describe('CheckboxField', () => {
	it('renders a labelled checkbox', () => {
		render(<CheckboxField label="Disabilitato" />)

		const box = screen.getByRole('checkbox', { name: 'Disabilitato' })
		expect(box).toHaveAttribute('type', 'checkbox')
		expect(box).not.toBeChecked()
	})

	// A real `<label for>`, not text placed beside the box: clicking the word has to toggle the control,
	// and a screen reader has to announce the two as one thing.
	it('toggles when its label is clicked', async () => {
		render(<CheckboxField label="Disabilitato" />)

		await userEvent.click(screen.getByText('Disabilitato'))

		expect(screen.getByRole('checkbox', { name: 'Disabilitato' })).toBeChecked()
	})

	it('forwards its ref to the input', () => {
		const ref = createRef<HTMLInputElement>()
		render(<CheckboxField label="Disabilitato" ref={ref} />)

		expect(ref.current).toBe(screen.getByRole('checkbox', { name: 'Disabilitato' }))
	})

	// Two fields on one page must not share an id, or the second label points at the first box.
	it('generates a distinct id per instance', () => {
		render(
			<>
				<CheckboxField label="Disabilitato" />
				<CheckboxField label="In attesa di approvazione" />
			</>
		)

		const primo = screen.getByRole('checkbox', { name: 'Disabilitato' })
		const secondo = screen.getByRole('checkbox', { name: 'In attesa di approvazione' })
		expect(primo.id).not.toBe(secondo.id)
	})

	it('lets the caller name the id', () => {
		render(<CheckboxField label="Disabilitato" id="campo-disabled" />)

		expect(screen.getByRole('checkbox', { name: 'Disabilitato' })).toHaveAttribute('id', 'campo-disabled')
	})

	it('renders', () => {
		const { container } = render(<CheckboxField label="Disabilitato" id="campo-disabled" />)

		expect(container.firstChild).toMatchSnapshot()
	})
})
