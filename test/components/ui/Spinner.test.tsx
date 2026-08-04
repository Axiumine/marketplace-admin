import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Spinner } from '@/components/ui/Spinner'

describe('Spinner', () => {
	it('announces a generic wait by default', () => {
		render(<Spinner />)
		expect(screen.getByRole('status')).toHaveTextContent('Caricamento in corso')
	})

	it('announces what is being waited for when told', () => {
		render(<Spinner label="Caricamento imprenditori" />)
		expect(screen.getByRole('status')).toHaveTextContent('Caricamento imprenditori')
	})

	it('renders', () => {
		const { container } = render(<Spinner label="Caricamento sessione" />)
		expect(container.firstChild).toMatchSnapshot()
	})
})
