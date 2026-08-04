import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { pageWindow, Pagination, totalPages } from '@/components/ui/Pagination'

describe('totalPages', () => {
	it('rounds a partial last page up', () => {
		expect(totalPages(41, 20)).toBe(3)
	})

	it('does not invent a page for an exact fit', () => {
		expect(totalPages(40, 20)).toBe(2)
	})

	// One page, always: an empty table still has a "page 1", and zero pages would render a `‹ ›` pair
	// with nothing between them and both arrows enabled.
	it('is 1 for an empty result set', () => {
		expect(totalPages(0, 20)).toBe(1)
	})

	it('is 1 when the whole result set fits on one page', () => {
		expect(totalPages(7, 20)).toBe(1)
	})
})

describe('pageWindow', () => {
	it('shows every page when there are fewer than the window', () => {
		expect(pageWindow(1, 3)).toEqual([1, 2, 3])
	})

	it('centres on the current page in the middle of a long list', () => {
		expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12])
	})

	it('clamps to the start', () => {
		expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5])
		expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5])
	})

	it('clamps to the end', () => {
		expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20])
		expect(pageWindow(19, 20)).toEqual([16, 17, 18, 19, 20])
	})

	it('honours a narrower window', () => {
		expect(pageWindow(5, 20, 3)).toEqual([4, 5, 6])
	})

	it('is a single page when there is only one', () => {
		expect(pageWindow(1, 1)).toEqual([1])
	})
})

describe('Pagination', () => {
	const setup = (props: Partial<{ page: number; pageSize: number; total: number }> = {}) => {
		const onPageChange = vi.fn()
		const result = render(<Pagination page={1} pageSize={20} total={41} onPageChange={onPageChange} {...props} />)
		return { ...result, onPageChange }
	}

	it('reports the visible range and the total', () => {
		setup({ page: 2 })
		expect(screen.getByText('21–40 di 41')).toBeInTheDocument()
	})

	it('reports a short last page honestly', () => {
		setup({ page: 3 })
		expect(screen.getByText('41–41 di 41')).toBeInTheDocument()
	})

	// Not "1–0 di 0": the first row of an empty set is not row one.
	it('reports zero for an empty result set', () => {
		setup({ total: 0 })
		expect(screen.getByText('0–0 di 0')).toBeInTheDocument()
	})

	it('marks the current page for assistive technology', () => {
		setup({ page: 2 })
		expect(screen.getByRole('button', { name: 'Pagina 2' })).toHaveAttribute('aria-current', 'page')
		expect(screen.getByRole('button', { name: 'Pagina 1' })).not.toHaveAttribute('aria-current')
	})

	it('moves to the page that was clicked', async () => {
		const { onPageChange } = setup({ page: 1 })

		await userEvent.click(screen.getByRole('button', { name: 'Pagina 3' }))
		expect(onPageChange).toHaveBeenCalledWith(3)
	})

	it('steps forward and back', async () => {
		const { onPageChange } = setup({ page: 2 })

		await userEvent.click(screen.getByRole('button', { name: 'Pagina successiva' }))
		expect(onPageChange).toHaveBeenLastCalledWith(3)

		await userEvent.click(screen.getByRole('button', { name: 'Pagina precedente' }))
		expect(onPageChange).toHaveBeenLastCalledWith(1)
	})

	it('disables the arrows at the ends', () => {
		setup({ page: 1 })
		expect(screen.getByRole('button', { name: 'Pagina precedente' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Pagina successiva' })).toBeEnabled()
	})

	it('disables the forward arrow on the last page', () => {
		setup({ page: 3 })
		expect(screen.getByRole('button', { name: 'Pagina successiva' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Pagina precedente' })).toBeEnabled()
	})

	it('renders', () => {
		const { container } = setup({ page: 2 })
		expect(container.firstChild).toMatchSnapshot()
	})
})
