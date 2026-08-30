import { CombinedError } from '@urql/core'
import { GraphQLError } from 'graphql'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The taxonomy's refusals, turned into the sentences the admin reads.
 *
 * Asserted here rather than through the screen: there are eight of them, the screen renders each one the
 * same way, and a render per refusal would buy nothing but eight seconds. What the screen's own tests
 * still hold is that a refusal reaches the card's toast at all — one for a save, one for a delete.
 *
 * ⚠️ Imported inside `beforeEach`, not at the top of the file. `REFUSALS` is a module-scope array, so a
 * top-level import builds it once — before Stryker activates the mutant under test, which would then be
 * unobservable no matter what this file asserts.
 */
type Module = typeof import('@/features/categories/refusals')

let refusalOf: Module['refusalOf']

beforeEach(async () => {
	vi.resetModules()
	;({ refusalOf } = await import('@/features/categories/refusals'))
})

/**
 * A refusal in the shape `throwGraphQLError(status, title, description)` puts on the wire: the sentence
 * worth reading is the *description*, and `messageOf` is what digs it out.
 */
const refusal = (description: string, status = 400): CombinedError =>
	new CombinedError({
		graphQLErrors: [new GraphQLError('Error', { extensions: { http: { status }, description } })]
	})

describe('refusalOf', () => {
	it('answers the fallback when there is no error at all', () => {
		expect(refusalOf(undefined, 'Save failed.')).toBe('Save failed.')
	})

	/*
	 * The eight sentences, keyed off the service's own. The left column is verbatim what
	 * `marketplace-dev-admin-authenticated-resource` sends, em dashes included, so a rewording there that
	 * still contains the matched fragment goes on being recognised — and one that does not shows up here as
	 * the raw sentence rather than as silence.
	 */
	it.each([
		[
			'slug already used by another category',
			'Slug: already used by another category. A slug is unique across the whole taxonomy, not within a parent — a subcategory cannot reuse a top-level one.'
		],
		[
			'itemCategory.idParent: the taxonomy is two levels deep — a subcategory cannot have children',
			'Parent: that category is itself a subcategory. The taxonomy is two levels deep, so only a top-level category can be a parent.'
		],
		[
			'itemCategory.idParent: this category has subcategories — move or remove them first',
			'Parent: this category has subcategories of its own. Move or remove them first — filing it under a parent would push every one of them to a third level.'
		],
		['itemCategory.idParent: a category cannot be its own parent', 'Parent: a category cannot be its own parent.'],
		['parent category not found', 'Parent: that category no longer exists. Reload the page to see the taxonomy as it stands.'],
		[
			'the category still has subcategories',
			'The category still has subcategories. Retire those first — deleting a parent does not delete what is under it.'
		],
		[
			'the category still holds items',
			'Items are still filed under this category. Their shop owners have to move them first — deleting a category never withdraws the items under it.'
		],
		['category not found', 'That category no longer exists. Reload the page to see the taxonomy as it stands.']
	])('rewrites «%s»', (sent, shown) => {
		expect(refusalOf(refusal(sent), 'Save failed.')).toBe(shown)
	})

	/*
	 * ⚠️ The one ordering dependency in the table, asserted from both sides.
	 *
	 * `parent category not found` contains `category not found` and the first match wins, so the two lines
	 * swapped would answer the *delete*'s sentence for a refusal about the parent picker — a message telling
	 * the admin to reload while the box that has to change is on screen in front of them. Only a pair of
	 * assertions catches it: either one alone still passes with the order reversed.
	 */
	it('tells the two "not found" refusals apart', () => {
		expect(refusalOf(refusal('parent category not found', 404), 'Save failed.')).toContain('Parent:')
		expect(refusalOf(refusal('category not found', 404), 'Save failed.')).not.toContain('Parent:')
	})

	// A validation refusal, which the service words per field and this map deliberately leaves alone: it
	// already names the box, and the fallthrough is what keeps the admin from being handed nothing.
	it('passes an unmapped refusal through in the service words', () => {
		expect(refusalOf(refusal('itemCategory.position: cannot be negative'), 'Save failed.')).toBe(
			'itemCategory.position: cannot be negative'
		)
	})

	// The fallback is for a mutation that answered `false` with no error. An error that carried no sentence
	// at all is a different thing, and `messageOf` has the last word on it rather than this map.
	it('leaves an empty error to messageOf rather than to the fallback', () => {
		expect(refusalOf(new CombinedError({ graphQLErrors: [] }), 'Save failed.')).toBe('Error while communicating with the server')
	})
})
