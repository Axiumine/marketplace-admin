import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DISCARD_WARNING } from '@/features/saving'

import { stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const CATEGORIES = '/categories'

const ID_HOME = '65f0000000000000000000c1'

const taxonomy = {
	ItemCategories: {
		data: {
			itemCategories: [
				{ __typename: 'GraphQLItemCategory', _id: ID_HOME, idParent: null, name: 'Home', slug: 'home', position: 1 }
			]
		}
	}
}

const OK = { ItemCategoryUpdate: { data: { itemCategoryUpdate: true } } }

/**
 * jsdom has no `window.confirm` worth calling — the real one is `Not implemented` — so every test that
 * reaches the guard has to say what the operator answered. The spy is also what proves the question was
 * asked at all, which is the half a `location.pathname` assertion cannot tell apart from a broken route.
 */
const respond = (response: boolean) => vi.spyOn(window, 'confirm').mockReturnValue(response)

const dirty = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Change Name' }))
	fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'House' } })
	await waitFor(() => {
		expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
	})
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('CategoriesPage', () => {
	it('renders', async () => {
		stubGraphQL(taxonomy)
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })

		expect(screen.getByRole('main')).toMatchSnapshot()
	})

	// The page's own title, above the section's. The route is reachable from the sidebar, so this is the
	// heading that says which of the five sections the operator landed in.
	it('titles the page', async () => {
		stubGraphQL(taxonomy)
		await renderRoute(CATEGORIES)

		expect(screen.getByRole('heading', { name: 'Categories', level: 1 })).toBeInTheDocument()
	})
})

/*
 * Nothing on this page is written until Save is pressed, so every edit lives in the browser and nowhere
 * else — including a new category, which has no server-side draft to go back to.
 */
describe('CategoriesPage — unsaved changes', () => {
	it('asks before leaving a page holding unsaved edits, and stays when the answer is no', async () => {
		stubGraphQL(taxonomy)
		const { router } = await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await dirty()

		const confirm = respond(false)
		// ⚠️ Not awaited. A blocked `navigate()` never settles — the promise resolves when the navigation
		// completes, and this one never does — so awaiting it here is a five-second test timeout, not a
		// failed assertion. The `waitFor` below is what makes the test wait for the right thing.
		void router.navigate({ to: '/settings' })

		await waitFor(() => {
			expect(confirm).toHaveBeenCalledWith(DISCARD_WARNING)
		})
		expect(router.state.location.pathname).toBe(CATEGORIES)
		expect(screen.getByLabelText('Name')).toHaveValue('House')
	})

	it('leaves when the answer is yes', async () => {
		stubGraphQL(taxonomy)
		const { router } = await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await dirty()

		const confirm = respond(true)
		await router.navigate({ to: '/settings' })

		expect(confirm).toHaveBeenCalledWith(DISCARD_WARNING)
		expect(router.state.location.pathname).toBe('/settings')
	})

	// A queued deletion is an unsaved change like any other, and the one whose loss is least visible: it
	// opened no editor and left no typing behind, so the guard is all there is to notice it by.
	it('asks about a deletion that has only been queued', async () => {
		stubGraphQL(taxonomy)
		const { router } = await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await userEvent.click(screen.getByRole('button', { name: 'Delete category' }))

		const confirm = respond(false)
		void router.navigate({ to: '/settings' })

		await waitFor(() => {
			expect(confirm).toHaveBeenCalledWith(DISCARD_WARNING)
		})
		expect(router.state.location.pathname).toBe(CATEGORIES)
	})

	// The question is the cost of the guard, and a page nobody touched must not pay it: an operator who
	// only came to read the taxonomy has done nothing that leaving would lose.
	it('says nothing when the page is untouched', async () => {
		stubGraphQL(taxonomy)
		const { router } = await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })

		const confirm = respond(false)
		await router.navigate({ to: '/settings' })

		expect(confirm).not.toHaveBeenCalled()
		expect(router.state.location.pathname).toBe('/settings')
	})
})

/*
 * A save leaves the page looking the way it loaded: every row the operator opened is a value and a pen
 * again. Done by remounting the section on a counter the successful save bumps, because `EditableRow` has
 * no close of its own — a row that closed while react-hook-form still held its edited value would show the
 * server's value and save a different one.
 */
describe('CategoriesPage — after saving', () => {
	it('puts every row it opened back to read-only', async () => {
		stubGraphQL({ ...taxonomy, ...OK })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await dirty()

		expect(screen.queryByRole('button', { name: 'Change Name' })).not.toBeInTheDocument()

		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		// The pen is back, the editor is gone, and the row shows what the server has — not the value that was
		// typed into a form which no longer exists.
		expect(await screen.findByRole('button', { name: 'Change Name' })).toBeInTheDocument()
		expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
		// Scoped to the card's own box: the category's name is also its heading, one level up.
		expect(within(screen.getByRole('region', { name: 'Category data' })).getByText('Home')).toBeInTheDocument()
	})

	// Only a save that went all the way through. A page left half-written still holds edits, and closing
	// those rows would hide values the operator would have to type again.
	it('leaves the open rows alone when the save was refused', async () => {
		stubGraphQL({ ...taxonomy, ItemCategoryUpdate: { data: { itemCategoryUpdate: false } } })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await dirty()

		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
		expect(screen.getByLabelText('Name')).toHaveValue('House')
	})
})
