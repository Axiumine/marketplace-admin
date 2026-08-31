import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { GraphQLStub } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { page } from '../../helpers/page'
import { renderRoute } from '../../helpers/render'

const CATEGORIES = '/categories'

const ID_HOME = '65f0000000000000000000c1'
const ID_GARDEN = '65f0000000000000000000c2'
const ID_BOOKS = '65f0000000000000000000c3'

/**
 * ⚠️ The `__typename` is load-bearing. urql's document cache invalidates by the typenames a *response*
 * mentions, and all three writes here answer a bare `Boolean` that mentions none — so the call site names
 * the type itself through `additionalTypenames`, which can only match a cached result carrying it.
 */
const home = { __typename: 'GraphQLItemCategory', _id: ID_HOME, idParent: null, name: 'Home', slug: 'home', position: 1 }

/** A subcategory of `home`, which is what makes this a taxonomy rather than a list. */
const garden = { ...home, _id: ID_GARDEN, idParent: ID_HOME, name: 'Garden', slug: 'garden', position: 2 }

/**
 * A second top-level category, at position 0 — before its siblings, and before the subcategory above.
 *
 * The positions are deliberately interleaved across the two levels: `itemCategories` sorts by position
 * alone, so a screen that rendered the answer in the order it arrived would put Garden between the two
 * top-level names it does not belong between.
 */
const books = { ...home, _id: ID_BOOKS, idParent: null, name: 'Books', slug: 'books', position: 0 }

const taxonomy = (items: unknown[]) => ({ ItemCategories: { data: { itemCategories: items } } })

/**
 * One category's card, by its heading — which is the tree position, so a subcategory is found by
 * `Parent / Child` rather than by its bare name.
 *
 * `closest('section')`, not `parentElement`: the heading shares a flex row with the trash icon.
 */
const card = (name = 'Home') => within(screen.getByRole('heading', { name: name, level: 3 }).closest('section') as HTMLElement)

const box = (name?: string) => within(card(name).getByRole('region', { name: 'Category data' }))

/** The right-hand half of an `EditableRow` while it is closed. */
const rowValue = (label: string, name?: string): string => {
	const row = box(name).getByText(label, { selector: 'span' }).parentElement as HTMLElement
	return row.lastElementChild?.textContent ?? ''
}

const open = async (label: string, name?: string) => {
	await userEvent.click(box(name).getByRole('button', { name: `Change ${label}` }))
}

/** `fireEvent.change`, never `userEvent.type`: every box on this form carries a `maxLength`. */
const write = (label: string, value: string, name?: string) => {
	fireEvent.change(box(name).getByLabelText(label), { target: { value: value } })
}

const parent = (name?: string) => box(name).getByLabelText('Parent')

const save = () => screen.getByRole('button', { name: 'Save' })

/** The overlay a queued deletion draws over a category's fields, or `null` when there is none. */
const mask = () => screen.queryByText('It will be retired on save.')?.parentElement ?? null

const adds = (stub: GraphQLStub) => stub.calls.filter((call) => call.operationName === 'ItemCategoryAdd')
const writes = (stub: GraphQLStub) => stub.calls.filter((call) => call.operationName === 'ItemCategoryUpdate')
const deletes = (stub: GraphQLStub) => stub.calls.filter((call) => call.operationName === 'ItemCategoryDel')
const reads = (stub: GraphQLStub) => stub.calls.filter((call) => call.operationName === 'ItemCategories')

const OK = { ItemCategoryUpdate: { data: { itemCategoryUpdate: true } } }
const OK_ADD = { ItemCategoryAdd: { data: { itemCategoryAdd: true } } }
const OK_DEL = { ItemCategoryDel: { data: { itemCategoryDel: true } } }

/** A refusal as `throwGraphQLError(status, title, description)` puts it on the wire. */
const refused = (description: string, status = 400) => ({
	errors: [graphQLError('Error', description, status)],
	status
})

/**
 * ⚠️ The only screen on the platform that writes `itemCategory`. A shop owner picks from this list and
 * cannot add to it, and the public site builds its URLs out of the slugs — so a category retired here is
 * one no seller can file against, and a slug edited here changes an address the world already has.
 */
describe('Categories', () => {
	it('waits before claiming the taxonomy is empty', async () => {
		stubGraphQL({ ItemCategories: { pending: true } })
		await renderRoute(CATEGORIES)

		expect(screen.getByText('Loading categories')).toBeInTheDocument()
		expect(screen.queryByText(/No category yet/)).not.toBeInTheDocument()
	})

	// Not "no data": an empty taxonomy is a catalogue nothing can be filed into, and the admin reading
	// this screen is the only person who can fix that.
	it('says what an empty taxonomy costs', async () => {
		stubGraphQL(taxonomy([]))
		await renderRoute(CATEGORIES)

		expect(await screen.findByText('No category yet. Until one exists, no shop owner can file an item.')).toBeInTheDocument()
	})

	/*
	 * `data: null` with no error beside it: the query resolved and answered with nothing, which is a shape
	 * the wire allows and urql passes straight through. The list reads it as the empty taxonomy it is.
	 */
	it('says so when the query resolves with no data at all', async () => {
		stubGraphQL({ ItemCategories: { data: null } })
		await renderRoute(CATEGORIES)

		expect(await screen.findByText(/No category yet/)).toBeInTheDocument()
	})

	it('reports a failure instead of an empty taxonomy', async () => {
		stubGraphQL({ ItemCategories: refused('Taxonomy unavailable', 500) })
		await renderRoute(CATEGORIES)

		expect(await screen.findByRole('alert')).toHaveTextContent('Taxonomy unavailable')
		expect(screen.queryByText(/No category yet/)).not.toBeInTheDocument()
	})

	it('shows every field the collection holds', async () => {
		stubGraphQL(taxonomy([home]))
		await renderRoute(CATEGORIES)

		expect(await screen.findByRole('heading', { name: 'Home', level: 3 })).toBeInTheDocument()
		expect(rowValue('Name')).toBe('Home')
		expect(rowValue('Slug')).toBe('home')
		expect(rowValue('Position')).toBe('1')
		// Not a dash: a category with no parent is the ordinary case, and the row says which case it is.
		expect(rowValue('Parent')).toBe('Top-level category')
	})

	// The row a subcategory has instead: the parent's name, resolved out of the same flat list.
	it('names the parent of a subcategory', async () => {
		stubGraphQL(taxonomy([home, garden]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home / Garden', level: 3 })

		expect(rowValue('Parent', 'Home / Garden')).toBe('Home')
	})

	/*
	 * ⚠️ The order the screen is for. `itemCategories` sorts by position across both levels at once, so the
	 * answer arrives Books (0), Home (1), Garden (2) — with the subcategory last, three cards away from the
	 * category it belongs to. The tree is rebuilt here: each top-level card, then its own children.
	 */
	it('puts each subcategory under its parent rather than in position order', async () => {
		stubGraphQL(taxonomy([books, home, garden]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home / Garden', level: 3 })

		// Filtered, because `Infobox` titles are `h3` too — every card contributes one of its own.
		const headings = screen
			.getAllByRole('heading', { level: 3 })
			.map((heading) => heading.textContent)
			.filter((text) => text !== 'Category data')
		expect(headings).toEqual(['Books', 'Home', 'Home / Garden'])
	})

	/*
	 * ⚠️ A subcategory whose parent is not in the list. The platform's own writes cannot produce it —
	 * `itemCategoryDel` refuses a category while a live subcategory points at it — but this collection has
	 * been reachable by hand since before the screen existed, and a card that is not drawn is a category the
	 * admin cannot repair. It goes last, under its bare name, and its parent row says the id resolved to
	 * nothing rather than inventing a name for it.
	 */
	it('keeps a subcategory whose parent is gone, at the end', async () => {
		stubGraphQL(taxonomy([{ ...garden, idParent: '65f0000000000000000000ff' }, home]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Garden', level: 3 })

		const headings = screen
			.getAllByRole('heading', { level: 3 })
			.map((heading) => heading.textContent)
			.filter((text) => text !== 'Category data')
		expect(headings).toEqual(['Home', 'Garden'])
		expect(rowValue('Parent', 'Garden')).toBe('---')
	})

	it('renders', async () => {
		stubGraphQL(taxonomy([home, garden]))
		await renderRoute(CATEGORIES)

		const title = await screen.findByRole('heading', { name: 'Home', level: 3 })

		expect(title.closest('section')).toMatchSnapshot()
	})
})

/**
 * A category edited in place: one form, one Save, and one input object covering all four fields — the
 * update saves the document whole, so every card sends everything it holds.
 */
describe('Categories — editing', () => {
	it('turns a row into its editor, seeded with the stored value', async () => {
		stubGraphQL(taxonomy([home]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open('Slug')

		expect(box().getByLabelText('Slug')).toHaveValue('home')
		expect(save()).toBeDisabled()
	})

	// The whole document, with `position` as a number: the box holds text and the argument is an `Int!`.
	it('sends every field, and the position as a number', async () => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open('Name')
		write('Name', 'House')
		await userEvent.click(save())

		expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
		expect(writes(stub)).toEqual([
			expect.objectContaining({
				variables: {
					_id: ID_HOME,
					itemCategory: { name: 'House', slug: 'home', idParent: null, position: 1 }
				}
			})
		])
	})

	/*
	 * ⚠️ `null` is not "leave the parent alone" — the resolver `$unset`s the field, and that is the only way
	 * a subcategory is promoted back to the top level. A form that omitted the key, or sent `''`, would
	 * leave the category exactly where it was.
	 */
	it('promotes a subcategory by sending a null parent', async () => {
		const stub = stubGraphQL({ ...taxonomy([home, garden]), ...OK })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home / Garden', level: 3 })
		await open('Parent', 'Home / Garden')
		await userEvent.selectOptions(parent('Home / Garden'), '')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({ _id: ID_GARDEN, itemCategory: { idParent: null } })
	})

	it('files a top-level category under a parent', async () => {
		const stub = stubGraphQL({ ...taxonomy([home, books]), ...OK })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Books', level: 3 })
		await open('Parent', 'Books')
		await userEvent.selectOptions(parent('Books'), ID_HOME)
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({ _id: ID_BOOKS, itemCategory: { idParent: ID_HOME } })
	})

	/*
	 * The picker is the depth cap read forwards: only top-level categories are on offer, so the one save
	 * that cannot succeed is not one the admin can ask for. Its own card is out too — a category cannot
	 * be its own parent, and this is the only place that choice could be made by hand.
	 */
	it('offers only top-level categories, and never the card itself', async () => {
		stubGraphQL(taxonomy([home, garden, books]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open('Parent')

		const offered = within(parent())
			.getAllByRole('option')
			.map((option) => option.textContent)
		expect(offered).toEqual(['Top-level category', 'Books'])
	})

	// Said before the save rather than after it: the service refuses this move, and an admin should not
	// have to press Save to find out that the picker in front of them cannot be used.
	it('warns on a card whose own subcategories block the move', async () => {
		stubGraphQL(taxonomy([home, garden]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open('Parent')

		expect(
			box().getByText('This category has subcategories, so it cannot be filed under a parent until they are moved.')
		).toBeInTheDocument()
		// And not on the subcategory below it, which has none of its own.
		await open('Parent', 'Home / Garden')
		expect(box('Home / Garden').queryByText(/has subcategories, so it cannot be filed/)).toBeNull()
	})

	/*
	 * ⚠️ The save context names `GraphQLItemCategory` and nothing else, so the refresh rests entirely on the
	 * cached taxonomy carrying that typename.
	 *
	 * Counted as requests rather than read off the screen: the page remounts its section after a save and a
	 * remount re-executes the query — off the cache, silently, unless the mutation invalidated it.
	 */
	it('refetches the taxonomy after a rename', async () => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })

		expect(reads(stub)).toHaveLength(1)

		await open('Name')
		write('Name', 'House')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		await waitFor(() => {
			expect(reads(stub)).toHaveLength(2)
		})
	})

	/*
	 * A category nobody touched is not merely nothing to send — it must not be *validated* either, or a
	 * stored category the current rules would reject blocks a save made on a different card. A slug of one
	 * character is what such a category looks like: nothing backfilled the collection when the bound was
	 * written.
	 */
	it('leaves an untouched category alone while another is saved', async () => {
		const stub = stubGraphQL({ ...taxonomy([{ ...home, slug: 'h' }, books]), ...OK })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Books', level: 3 })
		await open('Name', 'Books')
		write('Name', 'Reading', 'Books')
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)).toHaveLength(1)
		expect(writes(stub)[0]?.variables).toMatchObject({ _id: ID_BOOKS })
		expect(screen.queryByText('The slug is at least 2 characters')).not.toBeInTheDocument()
	})

	it.each([
		['Name', '   ', 'Name is required'],
		['Slug', 'Home Garden', 'The slug is lowercase letters and digits, joined by single hyphens'],
		['Position', '1.5', 'The position is a whole number'],
		['Position', '-1', 'The position cannot be negative'],
		// ⚠️ The int32 ceiling, which nothing on the server refuses: the collection answers it with a
		// validation failure naming no field, which Apollo turns into a 500.
		['Position', '1000000000', 'The position cannot exceed 999999999']
	])('refuses %s = «%s»', async (field, value, message) => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open(field)
		write(field, value)
		await userEvent.click(save())

		expect(await page().findByText(message)).toBeInTheDocument()
		expect(writes(stub)).toEqual([])
	})

	// `false` with no error at all: no resolver answers that way, but `Boolean!` says it could, and a save
	// reported as successful would be worse than a generic line.
	it('reports a bare refusal', async () => {
		stubGraphQL({ ...taxonomy([home]), ItemCategoryUpdate: { data: { itemCategoryUpdate: false } } })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open('Name')
		write('Name', 'House')
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
		expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument()
	})

	/*
	 * The card's toast belongs to the card, and a save that fixed it has to take it down.
	 *
	 * ⚠️ Not something the page's remount does for it: the remount only happens when *every* section
	 * succeeded, so the interesting case is exactly this one — the first category is written on the second
	 * press while the second is refused, nothing remounts, and the first card's old refusal would otherwise
	 * still be on screen beside the new one.
	 */
	it('clears its own refusal when the retry goes through', async () => {
		stubGraphQL({
			...taxonomy([home, books]),
			ItemCategoryUpdate: [
				refused('slug already used by another category', 409),
				{ data: { itemCategoryUpdate: true } },
				refused('category not found', 404)
			]
		})
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Books', level: 3 })
		await open('Name')
		write('Name', 'House')
		await open('Name', 'Books')
		write('Name', 'Reading', 'Books')
		await userEvent.click(save())

		expect(await screen.findByText(/Slug: already used by another category/)).toBeInTheDocument()

		await userEvent.click(save())

		expect(await screen.findByText(/That category no longer exists/)).toBeInTheDocument()
		expect(screen.queryByText(/Slug: already used/)).toBeNull()
	})
})

/**
 * ⚠️ **The reason this screen has a `refusals` map.**
 *
 * The taxonomy is the only thing in this app whose writes are turned down for reasons that are neither
 * "that box is wrong" nor "no such document": the depth cap, the slug's global uniqueness, and the two
 * things a delete refuses to cascade over. Each arrives from the service as a sentence naming a GraphQL
 * input path — `itemCategory.idParent: …` — and each has to reach the admin naming a box on screen and
 * a next step instead.
 *
 * The distinctness is the point: the depth cap and the duplicate slug are different mistakes about
 * different boxes, and one shared "Save failed." would leave the admin guessing which of the two levels
 * they had broken.
 */
describe('Categories — the refusals, as the admin reads them', () => {
	const refuse = async (description: string, status: number) => {
		stubGraphQL({ ...taxonomy([home, books]), ItemCategoryUpdate: refused(description, status) })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open('Parent')
		await userEvent.selectOptions(parent(), ID_BOOKS)
		await userEvent.click(save())

		return await screen.findByRole('alert')
	}

	it('names the slug box for a duplicate slug', async () => {
		const alert = await refuse('slug already used by another category', 409)

		expect(alert).toHaveTextContent('Slug: already used by another category.')
		// The half of it the service never says, and the half that surprises: the index is global.
		expect(alert).toHaveTextContent('A slug is unique across the whole taxonomy, not within a parent')
	})

	it('names the parent box for the depth cap', async () => {
		const alert = await refuse(
			'itemCategory.idParent: the taxonomy is two levels deep — a subcategory cannot have children',
			400
		)

		expect(alert).toHaveTextContent('Parent: that category is itself a subcategory.')
		expect(alert).not.toHaveTextContent('itemCategory.idParent')
	})

	it('tells the admin which of their own subcategories is in the way', async () => {
		const alert = await refuse('itemCategory.idParent: this category has subcategories — move or remove them first', 400)

		expect(alert).toHaveTextContent('Parent: this category has subcategories of its own.')
	})

	// The two the delete answers with, which are the whole reason it is refused rather than cascaded: a
	// category is never removed out from under the items or the subcategories still pointing at it.
	it.each([
		['the category still has subcategories', 'The category still has subcategories.'],
		['the category still holds items', 'Items are still filed under this category.']
	])('explains «%s» on the way out', async (sent, shown) => {
		stubGraphQL({ ...taxonomy([home]), ItemCategoryDel: refused(sent, 400) })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await userEvent.click(card().getByRole('button', { name: 'Delete category' }))
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent(shown)
	})

	// A refusal nobody mapped still reaches the admin in the service's own words — never as silence, and
	// never as a generic line that throws away what the server took the trouble to say.
	it('passes an unmapped refusal through', async () => {
		const alert = await refuse('itemCategory.position: whole number required', 400)

		expect(alert).toHaveTextContent('itemCategory.position: whole number required')
	})
})

/**
 * The trash beside a category's name. Queued exactly like the field editors: a click marks the card and
 * nothing reaches the server until Save.
 *
 * ⚠️ The delete is **refused rather than cascaded** while a live subcategory or a live item still points
 * at the category, which is why the card's toast sits outside the mask that covers everything else.
 */
describe('Categories — deletion', () => {
	const trash = (name?: string) => card(name).getByRole('button', { name: 'Delete category' })

	it('queues the deletion behind the mask instead of writing it', async () => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK_DEL })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })

		expect(mask()).toBeNull()

		await userEvent.click(trash())

		expect(mask()).toHaveClass('backdrop-blur-sm')
		expect(deletes(stub)).toEqual([])
		expect(save()).toBeEnabled()
	})

	// The one way back out, and the reason the title row stays sharp: the trash the admin has to press
	// again is the only control the mask must not cover.
	it('takes the deletion back', async () => {
		stubGraphQL(taxonomy([home]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await userEvent.click(trash())
		await userEvent.click(card().getByRole('button', { name: 'Cancel category deletion' }))

		expect(mask()).toBeNull()
		expect(save()).toBeDisabled()
	})

	// The heading is the one part of the card the mask does not cover, so it is the only place the queued
	// state can be read at all — struck through, and in the muted colour.
	it('strikes the name through while the deletion is queued', async () => {
		stubGraphQL(taxonomy([home]))
		await renderRoute(CATEGORIES)

		const title = await screen.findByRole('heading', { name: 'Home', level: 3 })

		// The whole class list, not just the absence of `line-through`: the queued state is expressed by what
		// the ternary adds, so its *empty* alternative is as much a part of the rule as the struck branch.
		expect(title.className.trim()).toBe('text-lg font-bold')

		await userEvent.click(trash())

		expect(title).toHaveClass('text-tip', 'line-through')
	})

	it('deletes on Save', async () => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK_DEL })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await userEvent.click(trash())
		await userEvent.click(save())

		await waitFor(() => {
			expect(deletes(stub)).toHaveLength(1)
		})
		expect(deletes(stub)[0]?.variables).toEqual({ _id: ID_HOME })
		expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
		expect(screen.queryByRole('alert')).toBeNull()
	})

	// Deletion wins over an edit made in the same press — asserted with both queued at once, because
	// "nothing was written" is otherwise indistinguishable from "nothing was edited".
	it('does not write the fields of a card it is about to delete', async () => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK, ...OK_DEL })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await open('Name')
		write('Name', 'House')
		await userEvent.click(trash())
		await userEvent.click(save())

		await waitFor(() => {
			expect(deletes(stub)).toHaveLength(1)
		})
		expect(writes(stub)).toEqual([])
	})

	it('reports a bare refusal', async () => {
		stubGraphQL({ ...taxonomy([home]), ItemCategoryDel: { data: { itemCategoryDel: false } } })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await userEvent.click(trash())
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Deletion failed.')
	})

	// The card stays queued and stays undoable while the refusal is on screen: the mask covers the
	// category's fields and neither the toast nor the trash that takes the deletion back.
	it('leaves the card queued when the delete is refused', async () => {
		stubGraphQL({ ...taxonomy([home]), ItemCategoryDel: refused('the category still holds items', 400) })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await userEvent.click(trash())
		await userEvent.click(save())

		await screen.findByRole('alert')

		expect(mask()).not.toBeNull()
		expect(mask()).not.toContainElement(card().getByRole('button', { name: 'Cancel category deletion' }))
	})
})

/**
 * A category the admin is adding: the same four fields as the card above it, the same schema and the
 * same Save button, sent to `itemCategoryAdd` — which takes no id, because the taxonomy belongs to the
 * platform rather than to anybody in it.
 */
describe('Categories — new category', () => {
	const NEW = 'New category'

	const newCard = () => screen.getByRole('heading', { name: NEW, level: 3 }).closest('section') as HTMLElement

	/** Both of them, in the order they were opened — two cards share one heading, so `card()` cannot. */
	const newCards = () =>
		screen.getAllByRole('heading', { name: NEW, level: 3 }).map((title) => title.closest('section') as HTMLElement)

	const add = async () => {
		await userEvent.click(screen.getByRole('button', { name: 'Add category' }))
	}

	const fill = () => {
		write('Name', 'Kitchen', NEW)
		write('Slug', 'kitchen', NEW)
		write('Position', '3', NEW)
	}

	// The plus belongs to the section rather than to the list, so it is there before the query answers and
	// stays there when it fails — an empty taxonomy is exactly the one that needs it.
	it('offers the plus while the taxonomy is still loading', async () => {
		stubGraphQL({ ItemCategories: { pending: true } })
		await renderRoute(CATEGORIES)

		expect(screen.getByRole('button', { name: 'Add category' })).toBeInTheDocument()
	})

	it('offers the plus when the taxonomy could not be loaded', async () => {
		stubGraphQL({ ItemCategories: refused('Taxonomy unavailable', 500) })
		await renderRoute(CATEGORIES)

		await screen.findByRole('alert')
		expect(screen.getByRole('button', { name: 'Add category' })).toBeInTheDocument()
	})

	/*
	 * The empty-taxonomy line is about the collection, and an open card is the answer to it — the two on
	 * screen together would be the page contradicting itself.
	 *
	 * The card counts as a pending change from the moment it appears, before a character is typed.
	 */
	it('replaces the empty-taxonomy message with a card, already worth saving', async () => {
		stubGraphQL(taxonomy([]))
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		expect(save()).toBeDisabled()

		await add()

		expect(screen.getByRole('heading', { name: NEW, level: 3 })).toBeInTheDocument()
		expect(screen.queryByText(/No category yet/)).not.toBeInTheDocument()
		expect(save()).toBeEnabled()
	})

	// New cards go under the categories that exist: the list is the record, and what is being added to it
	// does not push the record down the page.
	it('adds the card below the taxonomy already stored', async () => {
		stubGraphQL(taxonomy([home]))
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await add()

		const headings = screen
			.getAllByRole('heading', { level: 3 })
			.map((heading) => heading.textContent)
			.filter((text) => text !== 'Category data')
		expect(headings).toEqual(['Home', NEW])
	})

	// Every row opens on its editor, because there is no stored value for a closed row to show — a card of
	// dashes with a pen beside each would read as a rendering bug.
	it('opens every row of the card on its editor', async () => {
		stubGraphQL(taxonomy([]))
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		await add()

		expect(box(NEW).getByLabelText('Name')).toHaveValue('')
		expect(box(NEW).getByLabelText('Slug')).toHaveValue('')
		expect(box(NEW).getByLabelText('Position')).toHaveValue('')
		// The empty option, which is what a top-level category is — and the ordinary case for a new one.
		expect(parent(NEW)).toHaveValue('')
		// No pen anywhere on the card: a row that is already open has nothing to open.
		expect(within(newCard()).queryByRole('button', { name: 'Change Name' })).toBeNull()
	})

	// The one icon it carries, and it is not a delete: there is nothing stored to remove. It is also the
	// only way out of the leave guard the card arms the moment it appears.
	it('throws the card away when its trash is pressed', async () => {
		stubGraphQL(taxonomy([]))
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		await add()
		await userEvent.click(within(newCard()).getByRole('button', { name: 'Cancel new category' }))

		expect(screen.queryByRole('heading', { name: NEW, level: 3 })).toBeNull()
		expect(screen.getByText(/No category yet/)).toBeInTheDocument()
		expect(save()).toBeDisabled()
	})

	/*
	 * ⚠️ Each card is keyed by a uuid of its own, and this is what says so. Keyed by position instead,
	 * discarding the first of two would hand its React state — an empty form — to the second, and the typing
	 * would vanish from a card the admin never touched.
	 */
	it("keeps a second card's contents when the first is discarded", async () => {
		stubGraphQL(taxonomy([]))
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		await add()
		await add()

		fireEvent.change(within(newCards()[1] as HTMLElement).getByLabelText('Name'), { target: { value: 'Kitchen' } })
		await userEvent.click(within(newCards()[0] as HTMLElement).getByRole('button', { name: 'Cancel new category' }))

		expect(newCards()).toHaveLength(1)
		expect(within(newCards()[0] as HTMLElement).getByLabelText('Name')).toHaveValue('Kitchen')
	})

	/*
	 * ⚠️ The card is seeded with an empty string per field rather than with nothing at all. react-hook-form
	 * hands the schema whatever it was given: `''` fails the rule the form wrote under the box it belongs
	 * to — `undefined` fails zod's type check instead, with "expected string, received undefined" shown to
	 * an admin.
	 */
	it("refuses an untouched card in this form's own words", async () => {
		const stub = stubGraphQL({ ...taxonomy([]), ...OK_ADD })
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		await add()
		await userEvent.click(save())

		expect(await page().findByText('Name is required')).toBeInTheDocument()
		expect(page().getByText('The slug is at least 2 characters')).toBeInTheDocument()
		// The blank position, which `Number('')` would otherwise make the first place in the menu.
		expect(page().getByText('The position is a whole number')).toBeInTheDocument()
		expect(adds(stub)).toEqual([])
		expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument()
	})

	// The whole point of the card. No owner id, no `_id`: one input object, and the empty parent option as
	// `null` — which is what a top-level category is.
	it('sends the category and drops the card once it is stored', async () => {
		const stub = stubGraphQL({ ...taxonomy([]), ...OK_ADD })
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		await add()
		fill()
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(adds(stub)).toHaveLength(1)
		expect(adds(stub)[0]?.variables).toEqual({
			itemCategory: { name: 'Kitchen', slug: 'kitchen', idParent: null, position: 3 }
		})
		// The list refetches on `additionalTypenames` and the stored category takes the card's place. A
		// placeholder left behind would offer to add the same category a second time.
		expect(screen.queryByRole('heading', { name: NEW, level: 3 })).toBeNull()
	})

	// A subcategory added directly, which is the other half of the picker: the parent is chosen on the new
	// card exactly as it is on a stored one.
	it('sends a new subcategory under the parent that was picked', async () => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK_ADD })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await add()
		fill()
		await userEvent.selectOptions(parent(NEW), ID_HOME)
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(adds(stub)[0]?.variables).toMatchObject({ itemCategory: { idParent: ID_HOME } })
	})

	// `false` with no error at all: no resolver answers that way, but `Boolean!` says it could — and a card
	// that vanished on it would have thrown away a category nobody stored.
	it('reports a bare refusal and keeps the card', async () => {
		stubGraphQL({ ...taxonomy([]), ItemCategoryAdd: { data: { itemCategoryAdd: false } } })
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		await add()
		fill()
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.')
		expect(screen.getByRole('heading', { name: NEW, level: 3 })).toBeInTheDocument()
		expect(save()).toBeEnabled()
	})

	// The duplicate slug is the refusal this mutation really answers with, and it arrives on a new card in
	// the same words as on a stored one.
	it('surfaces the mapped refusal when the add is turned down', async () => {
		stubGraphQL({ ...taxonomy([]), ItemCategoryAdd: refused('slug already used by another category', 409) })
		await renderRoute(CATEGORIES)

		await screen.findByText(/No category yet/)
		await add()
		fill()
		await userEvent.click(save())

		expect(await screen.findByRole('alert')).toHaveTextContent('Slug: already used by another category.')
		expect(screen.getByRole('heading', { name: NEW, level: 3 })).toBeInTheDocument()
	})

	// The card is one more section of the page's save, registered after the categories that exist: an edit
	// to a stored category and a new card are written in that order, by one press of one button.
	it('saves an edited category and a new card in the same press', async () => {
		const stub = stubGraphQL({ ...taxonomy([home]), ...OK, ...OK_ADD })
		await renderRoute(CATEGORIES)

		await screen.findByRole('heading', { name: 'Home', level: 3 })
		await add()
		await open('Name')
		write('Name', 'House')
		fill()
		await userEvent.click(save())

		await screen.findByText('Changes saved.')
		expect(writes(stub)[0]?.variables).toMatchObject({ _id: ID_HOME, itemCategory: { name: 'House' } })
		expect(adds(stub)[0]?.variables).toMatchObject({ itemCategory: { slug: 'kitchen' } })
	})
})
