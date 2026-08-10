import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IconButton } from '@/components/ui/IconButton'
import { IconTrash } from '@/components/ui/icons'

describe('IconButton', () => {
	it('renders', () => {
		const { container } = render(
			<IconButton name="Delete" onClick={vi.fn()}>
				<IconTrash />
			</IconButton>
		)
		expect(container.firstChild).toMatchSnapshot()
	})

	// The disabled attribute is the real gate, not a class alone — see the component's own doc comment —
	// so it is markup a snapshot is worth keeping honest.
	it('renders disabled', () => {
		const { container } = render(
			<IconButton name="Delete" onClick={vi.fn()} disabled>
				<IconTrash />
			</IconButton>
		)
		expect(container.firstChild).toMatchSnapshot()
	})
})
