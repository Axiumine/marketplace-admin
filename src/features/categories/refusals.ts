import type { CombinedError } from '@urql/core'

import { messageOf } from '@/api/errors'

/**
 * The taxonomy's refusals, in the operator's words.
 *
 * The three category mutations are the only writes in this app that can be turned down for a reason
 * other than "that field is wrong" or "no such document": the depth cap, the slug's global uniqueness
 * and the two things a delete refuses to cascade over. Handed to `messageOf` like every other failure
 * they arrive as the service's own sentences — `itemCategory.idParent: the taxonomy is two levels deep`
 * names a GraphQL input path the operator never typed, and `slug already used by another category` does
 * not say that a subcategory cannot reuse a top-level slug either, which is the part that surprises.
 * Each one is therefore rewritten here, naming the box it is about and what to do next.
 *
 * ⚠️ **The `match` strings are the service's, duplicated, and nothing checks that the two agree.** They
 * live in `marketplace-dev-admin-authenticated-resource` — `funItemCategoryAdd`, `funItemCategoryUpdate`,
 * `funItemCategoryDelete`, `throwIfParentNotTopLevel` and `throwIfHasChildren` — and a rephrasing there
 * turns one of these back into the raw server sentence rather than into nothing: an unmatched refusal
 * falls through to `messageOf` below, so the operator is never left without a message. They are
 * duplicated rather than imported because those services are Node-only ESM packages this bundle does not
 * depend on, and matched on a distinctive *fragment* rather than on the whole sentence so that the em
 * dashes and the trailing advice can be reworded without breaking the match.
 *
 * ⚠️ **The order is load-bearing in one place**: `parent category not found` contains
 * `category not found`, and the first match wins, so the parent line has to stay above the last one. The
 * other six share no substring.
 */
const REFUSALS: readonly { readonly match: string; readonly message: string }[] = [
	{
		match: 'slug already used',
		message:
			'Slug: already used by another category. A slug is unique across the whole taxonomy, not within a parent — a subcategory cannot reuse a top-level one.'
	},
	{
		match: 'two levels deep',
		message:
			'Parent: that category is itself a subcategory. The taxonomy is two levels deep, so only a top-level category can be a parent.'
	},
	{
		match: 'this category has subcategories',
		message:
			'Parent: this category has subcategories of its own. Move or remove them first — filing it under a parent would push every one of them to a third level.'
	},
	{ match: 'cannot be its own parent', message: 'Parent: a category cannot be its own parent.' },
	{
		match: 'parent category not found',
		message: 'Parent: that category no longer exists. Reload the page to see the taxonomy as it stands.'
	},
	{
		match: 'still has subcategories',
		message: 'The category still has subcategories. Retire those first — deleting a parent does not delete what is under it.'
	},
	{
		match: 'still holds items',
		message:
			'Items are still filed under this category. Their shop owners have to move them first — deleting a category never withdraws the items under it.'
	},
	{ match: 'category not found', message: 'That category no longer exists. Reload the page to see the taxonomy as it stands.' }
]

/**
 * What to put in the card's toast when a write comes back refused.
 *
 * `fallback` is for the failure that carried no error at all — a mutation answering `false` — which is
 * the one case the service has no sentence for.
 */
export const refusalOf = (error: CombinedError | undefined, fallback: string): string => {
	if (error === undefined) return fallback

	const message = messageOf(error)

	return REFUSALS.find((refusal) => message.includes(refusal.match))?.message ?? message
}
