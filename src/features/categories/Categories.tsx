import type { ItemCategoriesQuery } from '@gql/adminResource/graphql'
import { zodResolver } from '@hookform/resolvers/zod'
import type { OperationContext } from '@urql/core'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from 'urql'
import { z } from 'zod'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import {
	ItemCategoryAddDocument,
	ItemCategoryDelDocument,
	ItemCategoryUpdateDocument
} from '@/api/operations/adminResource/mutations'
import { ItemCategoriesDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { EditableRow } from '@/components/ui/EditableRow'
import { IconButton } from '@/components/ui/IconButton'
import { IconPlus, IconTrash } from '@/components/ui/icons'
import { Infobox } from '@/components/ui/Infobox'
import { SelectField } from '@/components/ui/SelectField'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import { Toast } from '@/components/ui/Toast'
import { ToastValidation } from '@/components/ui/ToastValidation'
import { required } from '@/lib/fields'
import { emptyInNull, handleNull, NO_VALUE } from '@/lib/format'

import type { RegisterSection } from '../saving'
import { saveValidated, useSavableSection } from '../saving'
import { refusalOf } from './refusals'

/*
 * From marketplace-db-setup/lib/schemas/itemCategory.js, by way of the service's own
 * `validateItemCategory.mts`.
 *
 * ⚠️ `position` is a **sort ordinal**, not a coordinate. The word means a GeoJSON point everywhere else
 * in this app — a company's address carries one — and this collection stores no coordinates at all.
 */
const MAX_NAME = 100
const MIN_SLUG = 2
const MAX_SLUG = 120

/**
 * Nine digits, which is the widest ordinal that still fits `bsonType: 'int'`.
 *
 * The cap is this app's alone: the service checks that the position is a whole number and not negative,
 * and nothing on either side checks the int32 range. A larger number therefore passes every validator
 * and is refused by the collection with `Document failed validation`, which Apollo turns into a 500
 * naming no field — the exact failure the validation layer exists to prevent. Stated twice, as the box's
 * `maxLength` and as a rule of the schema, because a `maxLength` is not reached by a paste.
 */
const POSITION_DIGITS = 9
const MAX_POSITION = 999999999

/**
 * The URL segment's own grammar, copied from the collection validator rather than loosened for the form:
 * lowercase letters and digits in groups, joined by single hyphens, with no hyphen at either end.
 *
 * Checked here as well as there because the database's refusal arrives as a validation error naming a
 * field the operator cannot see, while this one arrives under the box they typed into.
 */
const SHAPE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * What a whole number looks like *as typed*, which is not what `Number()` accepts.
 *
 * `Number('0x10')` is 16 and `Number('1e3')` is 1000 — both whole, both integers, and neither is what an
 * operator meant by an ordinal. The shape is checked on the characters and the arithmetic only afterwards,
 * so the box holds a decimal number and the sign is the one thing left for the next rule to judge.
 */
const SHAPE_POSITION = /^-?\d+$/

/** What separates a parent from its subcategory in a card's heading. */
const CATEGORY_SEPARATOR = '/'

/** What the parent picker offers instead of a category, and what a top-level card's closed row reads. */
const TOP_LEVEL = 'Top-level category'

/**
 * One category, flat — the card is one form and one Save, exactly as the mutation is one `$set`.
 *
 * `idParent` is a plain string with no rule of its own: the picker offers ids that came back from
 * `itemCategories` and the empty option, which is what a top-level category is. It travels as `null`,
 * and on the update path that `null` is the promotion — there is no other value that clears a parent.
 *
 * `position` is text in the box and an `Int!` on the wire. Three mistakes, three sentences — "1.5", "-1"
 * and a number wider than the collection can store are not the same thing to whoever has to fix them —
 * and one `superRefine` rather than three `.refine`s so that only one of the three is ever on screen: a
 * chain reports every rule that failed, and `abc` fails all three at once.
 *
 * ⚠️ The blank box is inside the first of them. `Number('')` is `0`, so an empty position would otherwise
 * validate as the first place in the menu — a place the operator never chose.
 */
export const categorySchema = z.object({
	name: required('Name', MAX_NAME),
	slug: z
		.string()
		.trim()
		.min(MIN_SLUG, `The slug is at least ${MIN_SLUG} characters`)
		.max(MAX_SLUG, `The slug cannot exceed ${MAX_SLUG} characters`)
		.regex(SHAPE_SLUG, 'The slug is lowercase letters and digits, joined by single hyphens'),
	idParent: z.string(),
	position: z
		.string()
		.trim()
		.superRefine((value, ctx) => {
			if (!SHAPE_POSITION.test(value)) {
				ctx.addIssue({ code: 'custom', message: 'The position is a whole number' })
				return
			}

			if (Number(value) < 0) {
				ctx.addIssue({ code: 'custom', message: 'The position cannot be negative' })
				return
			}

			if (Number(value) > MAX_POSITION) ctx.addIssue({ code: 'custom', message: `The position cannot exceed ${MAX_POSITION}` })
		})
})

type CategoryValues = z.infer<typeof categorySchema>

type Category = ItemCategoriesQuery['itemCategories'][number]

/** One card: the category, and the heading that says where in the tree it sits. */
interface CategoryRow {
	category: Category
	heading: string
}

/**
 * The flat taxonomy in tree order — each top-level category followed by its own subcategories.
 *
 * `itemCategories` answers sorted by `position` then `_id`, which orders the two levels *against each
 * other* rather than nesting them: a subcategory at position 1 arrives before a top-level category at
 * position 2, and the list reads as an alphabet soup. The tree is rebuilt here rather than asked for
 * nested, because the depth cap of two lives in this service's resolvers and a recursive GraphQL type
 * would outlive it.
 *
 * ⚠️ A subcategory whose parent is not in the list is kept, at the end, under its bare name. The
 * platform's own writes cannot produce that state — `itemCategoryDel` refuses a category while a live
 * subcategory points at it — but the collection has been reachable by hand since before this screen
 * existed, and this is the one screen that can repair such a document. A card that is not drawn is a
 * category the operator cannot fix.
 */
const orderedCategories = (categories: readonly Category[]): readonly CategoryRow[] => {
	const tops = categories.filter((category) => category.idParent === null)
	const topIds = new Set(tops.map((top) => top._id))

	const nested = tops.flatMap((top) => [
		{ category: top, heading: top.name },
		...categories
			.filter((category) => category.idParent === top._id)
			.map((child) => ({ category: child, heading: `${top.name} ${CATEGORY_SEPARATOR} ${child.name}` }))
	])

	const orphans = categories
		.filter((category) => category.idParent !== null && !topIds.has(category.idParent))
		.map((orphan) => ({ category: orphan, heading: orphan.name }))

	return [...nested, ...orphans]
}

/**
 * What one card may be filed under: the top-level categories, minus itself.
 *
 * Top-level only, because that is the depth cap read forwards — `throwIfParentNotTopLevel` refuses
 * anything else, so offering a subcategory here would be offering a save that cannot succeed. Minus
 * itself, because a category cannot be its own parent and the picker is the only place that choice could
 * be made by hand.
 *
 * `_id` is `null` for a card that does not exist yet, which no category's own id can equal.
 */
const parentOptions = (categories: readonly Category[], _id: string | null): readonly Category[] =>
	categories.filter((category) => category.idParent === null && category._id !== _id)

/** True while a live subcategory points at this one — the half of the depth cap that looks downwards. */
const hasChildren = (categories: readonly Category[], _id: string): boolean =>
	categories.some((category) => category.idParent === _id)

/** The closed parent row's value: the parent's name, or what a top-level category reads instead. */
const parentLabel = (categories: readonly Category[], idParent: string | null): string =>
	idParent === null ? TOP_LEVEL : handleNull(categories.find((category) => category._id === idParent)?.name)

/**
 * The save context: this endpoint, plus the typename the document cache has to be told about.
 *
 * All three writes answer a bare `Boolean!`, so no response here mentions `GraphQLItemCategory` and the
 * cached taxonomy would survive every save untouched. One typename, because `itemCategories` is the only
 * query on this page.
 */
const CTX_SAVE_CATEGORY: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLItemCategory']
})

/**
 * A blank card, for a category that does not exist yet.
 *
 * Every field is `''` and not absent, for the reason the company form's own `NEW_VALUES` gives: an
 * `undefined` reaching the schema answers with zod's "expected string, received undefined" instead of
 * this form's messages. `position` included — a new category has no place in the menu until the operator
 * says which, and a default of `0` would put every new one first without anybody choosing it.
 */
// Stryker disable next-line ObjectLiteral: react-hook-form reads a registered uncontrolled input back
// off the DOM, and an input rendered with no value attribute is `''` anyway — so `{}` here produces the
// same four empty strings at submit time and the same messages under the same boxes. Verified by hand,
// not assumed: with `{}` in place all 50 screen tests still pass, including the untouched-card refusal.
// The literal stays because it is what makes the seed *explicit* and typed — nothing about `{}` says
// which four fields a new card has, and nothing would catch a fifth being added without one.
const NEW_VALUES: CategoryValues = {
	name: '',
	slug: '',
	idParent: '',
	position: ''
}

const dataOf = (category: Category): CategoryValues => ({
	name: category.name,
	slug: category.slug,
	idParent: category.idParent ?? '',
	position: String(category.position)
})

/** What a card's boxes hold before anybody types: the category as stored, or a blank one. */
const valuesInitial = (category: Category | null): CategoryValues => (category === null ? NEW_VALUES : dataOf(category))

/**
 * One category, editable — or one that does not exist yet.
 *
 * The deletion is queued rather than written on the spot, and masked while it is: the card sits under
 * the page's one Save button, and a trash icon that wrote immediately would be the only control here
 * that did not wait for it.
 *
 * ⚠️ Every refusal goes through `refusalOf` rather than through `messageOf`, and that is the point of
 * this screen. The taxonomy is the only thing in this app whose writes are turned down for reasons that
 * are neither "that box is wrong" nor "no such document" — the depth cap, the slug's global uniqueness,
 * and the two things a delete refuses to cascade over — and each of them needs its own sentence naming
 * its own box. One "Save failed." for all seven would leave the operator guessing which of the two
 * levels they had broken.
 */
const FormCategory = ({
	category,
	cardKey,
	heading,
	categories,
	registerSection,
	discard
}: {
	category: Category | null
	/** What the page's save registry files this card under: the category's `_id`, or a new card's own key. */
	cardKey: string
	/** Where the card sits in the tree — `Parent / Child` for a subcategory, the bare name otherwise. */
	heading: string
	/** The whole taxonomy: what the parent picker offers, and what says whether this card has children. */
	categories: readonly Category[]
	registerSection: RegisterSection
	/** Removes a new card from the list — pressing its trash, and succeeding at saving it. */
	discard: (key: string) => void
}) => {
	const isNew = category === null

	const [error, setError] = useState<string | undefined>(undefined)
	const [deleted, setDeleted] = useState(false)
	const [, runAdd] = useMutation(ItemCategoryAddDocument)
	const [, runUpdate] = useMutation(ItemCategoryUpdateDocument)
	const [, runDel] = useMutation(ItemCategoryDelDocument)

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isDirty }
	} = useForm<CategoryValues>({
		resolver: zodResolver(categorySchema),
		defaultValues: valuesInitial(category)
	})

	const parents = parentOptions(categories, category?._id ?? null)

	// A new card counts as a pending change from the moment it appears: it is a category the operator
	// asked for and the page has not written yet, so Save has to be live and leaving has to warn.
	const changed = isNew || isDirty || deleted

	/**
	 * The whole input both writes take. `values` is the resolver's output rather than what is in the
	 * boxes, so the trimmed strings are the ones that travel.
	 *
	 * ⚠️ `idParent` goes out as `null` when the empty option is chosen, and on the update path that is
	 * not "leave it alone" — `funItemCategoryUpdate` `$unset`s the field, which is how a subcategory is
	 * promoted back to the top level. `position` is `Number`ed here because the box holds text and the
	 * argument is an `Int!`; the schema has already refused everything `Number` would mangle.
	 */
	const fieldsToSave = (values: CategoryValues) => ({
		name: values.name,
		slug: values.slug,
		idParent: emptyInNull(values.idParent),
		position: Number(values.position)
	})

	const add = async (values: CategoryValues): Promise<boolean> => {
		const result = await runAdd({ itemCategory: fieldsToSave(values) }, CTX_SAVE_CATEGORY)

		if (result.data?.itemCategoryAdd !== true) {
			setError(refusalOf(result.error, 'Save failed.'))
			return false
		}

		// The card has done its job. `additionalTypenames` refetches the taxonomy, the stored category
		// takes its place, and a placeholder left behind would offer to add it a second time.
		discard(cardKey)

		return true
	}

	const save = async (): Promise<boolean> => {
		if (!changed) return true

		// Everything below reads `category._id`, and a new card has none: the add is the whole save.
		if (category === null) return await saveValidated(handleSubmit, add)

		// Deletion wins over the field edits: a category about to be retired does not need its card
		// written first. It is the one delete in this app that is refused rather than cascaded, and the
		// message says which of the two things is still pointing at it.
		if (deleted) {
			const outcome = await runDel({ _id: category._id }, CTX_SAVE_CATEGORY)

			if (outcome.data?.itemCategoryDel !== true) {
				setError(refusalOf(outcome.error, 'Deletion failed.'))
				return false
			}

			return true
		}

		// Read out here rather than inside the closure below: TypeScript drops the `category !== null`
		// narrowing across a function boundary, since the prop is a binding it cannot prove was never
		// reassigned. A const carries it through.
		const _id = category._id

		const update = async (values: CategoryValues): Promise<boolean> => {
			const result = await runUpdate({ _id, itemCategory: fieldsToSave(values) }, CTX_SAVE_CATEGORY)

			if (result.data?.itemCategoryUpdate !== true) {
				setError(refusalOf(result.error, 'Save failed.'))
				return false
			}

			reset(values)

			// The card's own toast, cleared by the save that fixed what it was about — see the company
			// card's copy of this line for why the page-level remount does not cover it.
			setError(undefined)

			return true
		}

		return await saveValidated(handleSubmit, update)
	}

	useSavableSection(cardKey, registerSection, changed, save)

	return (
		<section>
			<div className="mb-1 flex items-center justify-between gap-2">
				{/* The heading is the stored tree position, not what is in the boxes: it is what tells two
				    cards apart, and a heading that followed the keystrokes would rename the card the
				    operator is still deciding about. */}
				<h3 className={`text-lg font-bold ${deleted ? 'text-tip line-through' : ''}`}>
					{category === null ? 'New category' : heading}
				</h3>
				<IconButton
					name={isNew ? 'Cancel new category' : deleted ? 'Cancel category deletion' : 'Delete category'}
					onClick={() => {
						// A card with nothing behind it is thrown away rather than queued: there is no
						// document to retire, and discarding it is also the only way out of the leave guard
						// it arms.
						if (isNew) discard(cardKey)
						else setDeleted((current) => !current)
					}}
				>
					<IconTrash />
				</IconButton>
			</div>

			{error === undefined ? null : <Toast tone="error">{error}</Toast>}
			<ToastValidation errors={errors} />

			{/* `relative` so the mask below covers exactly the category's fields — the title row keeps its
			    trash, which is the only way back out of a queued deletion, and the toast above stays sharp
			    because a refused delete is reported through it. */}
			<div className="relative">
				<Infobox title="Category data">
					{/* `openInitial={isNew}` on every row, and `value` read through `?.`: a new category has
					    nothing stored, so each row opens on its editor and the closed value is never
					    rendered — the optional chain is there so the expression is evaluable. */}
					<EditableRow label="Name" value={category?.name} openInitial={isNew}>
						<TextField label="Name" maxLength={MAX_NAME} error={errors.name?.message} {...register('name')} />
					</EditableRow>
					<EditableRow label="Slug" value={category?.slug} openInitial={isNew}>
						<TextField label="Slug" maxLength={MAX_SLUG} error={errors.slug?.message} {...register('slug')} />
					</EditableRow>
					<EditableRow
						label="Parent"
						value={category === null ? NO_VALUE : parentLabel(categories, category.idParent)}
						openInitial={isNew}
					>
						<SelectField label="Parent" error={errors.idParent?.message} {...register('idParent')}>
							{/* The empty option is the top level itself rather than "choose something": a
							    category with no parent is the ordinary case, and it is the value that promotes
							    a subcategory back out of one. */}
							<option value="">{TOP_LEVEL}</option>
							{parents.map((parent) => (
								<option key={parent._id} value={parent._id}>
									{parent.name}
								</option>
							))}
						</SelectField>
						{/* Said before the save rather than after it. The service refuses this move — it would
						    push every child to a third level — and the refusal is still what arrives if the
						    list on screen is behind, but an operator should not have to press Save to find out
						    that the picker above them cannot be used. */}
						{category !== null && hasChildren(categories, category._id) ? (
							<p className="mt-1 text-xs text-tip">
								This category has subcategories, so it cannot be filed under a parent until they are moved.
							</p>
						) : null}
					</EditableRow>
					<EditableRow label="Position" value={handleNull(category?.position)} openInitial={isNew}>
						<TextField
							label="Position"
							inputMode="numeric"
							maxLength={POSITION_DIGITS}
							error={errors.position?.message}
							{...register('position')}
						/>
					</EditableRow>
				</Infobox>

				{/* The mask — the company card's own, which this matches deliberately. */}
				{deleted ? (
					<div className="absolute inset-0 z-10 flex items-center justify-center rounded-box bg-palette-bg1/60 backdrop-blur-sm">
						<p className="rounded-box border border-third bg-white px-4 py-2 text-sm font-semibold text-third shadow">
							It will be retired on save.
						</p>
					</div>
				) : null}
			</div>
		</section>
	)
}

/** The stored taxonomy in tree order, plus whatever new cards the operator has open. */
const ListCategories = ({
	categories,
	registerSection,
	newKeys,
	discard
}: {
	categories: readonly Category[]
	registerSection: RegisterSection
	newKeys: string[]
	discard: (key: string) => void
}) => {
	// "None" is about the collection, but it cannot be on screen under an open new card: the card is the
	// answer to it.
	if (categories.length === 0 && newKeys.length === 0) {
		return <p className="text-tip">No category yet. Until one exists, no shop owner can file an item.</p>
	}

	return (
		<div className="flex flex-col gap-6">
			{orderedCategories(categories).map((row) => (
				<FormCategory
					key={row.category._id}
					cardKey={row.category._id}
					category={row.category}
					heading={row.heading}
					categories={categories}
					registerSection={registerSection}
					discard={discard}
				/>
			))}
			{/* New cards last, under the categories that exist: the list is the record, and what is being
			    added to it belongs at the bottom rather than pushing the record down the page. */}
			{newKeys.map((cardKey) => (
				<FormCategory
					key={cardKey}
					cardKey={cardKey}
					category={null}
					heading=""
					categories={categories}
					registerSection={registerSection}
					discard={discard}
				/>
			))}
		</div>
	)
}

/**
 * The whole taxonomy: a heading, the plus that adds a category, and the cards.
 *
 * ⚠️ **This is the only screen on the platform that writes this collection.** A shop owner picks from the
 * list and cannot add to it, and the public site draws it — so a taxonomy nobody has filled in is a
 * catalogue no item can be filed into, which is what the empty state says rather than "no data".
 *
 * The query is issued here rather than inside the list so the heading and the plus survive its three
 * outcomes: an empty taxonomy is exactly the one that needs the button, and a failed fetch is no reason
 * to take it away.
 */
export const Categories = ({ registerSection }: { registerSection: RegisterSection }) => {
	const [newKeys, setNewKeys] = useState<string[]>([])

	const [result] = useQuery({ query: ItemCategoriesDocument, context: CTX_ADMIN_RESOURCE })

	const categories = result.data?.itemCategories ?? []

	return (
		<>
			<div className="mt-8 mb-2 flex items-center justify-between gap-2">
				<h2 className="text-lg font-bold">Taxonomy</h2>
				<IconButton
					name="Add category"
					onClick={() => {
						setNewKeys((current) => [...current, crypto.randomUUID()])
					}}
				>
					<IconPlus />
				</IconButton>
			</div>

			{result.fetching ? (
				<Spinner label="Loading categories" />
			) : result.error !== undefined ? (
				<Alert tone="error">{messageOf(result.error)}</Alert>
			) : (
				<ListCategories
					categories={categories}
					registerSection={registerSection}
					newKeys={newKeys}
					discard={(key) => {
						setNewKeys((current) => current.filter((open) => open !== key))
					}}
				/>
			)}
		</>
	)
}
