import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * One category's write schema, asserted directly rather than through the card.
 *
 * `save()` sends the *parsed* values, so the trims are payload rather than cosmetics — and `position`
 * leaves this schema as text and reaches the wire as an `Int`, which is the one conversion nothing else
 * on the page checks.
 *
 * ⚠️ Imported inside `beforeEach`, not at the top of the file — the schema is built at module scope, and
 * a top-level import evaluates it before Stryker activates the mutant under test.
 */
type Module = typeof import('@/features/categories/Categories')

let categorySchema: Module['categorySchema']

beforeEach(async () => {
	vi.resetModules()
	;({ categorySchema } = await import('@/features/categories/Categories'))
})

const VALID = {
	name: 'Home and garden',
	// Deliberately not the name lower-cased with a hyphen: nothing derives one from the other, and a
	// fixture that looked derived would hide a form that had started doing so.
	slug: 'house-and-garden',
	idParent: '',
	position: '10'
}

const outcome = (patch: Record<string, unknown> = {}) => categorySchema.safeParse({ ...VALID, ...patch })

const messages = (patch: Record<string, unknown> = {}) => {
	const result = outcome(patch)
	return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

const value = (patch: Record<string, unknown> = {}) => {
	const result = outcome(patch)
	if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join(' / '))
	return result.data
}

describe('categorySchema — name', () => {
	it('accepts a category that came back from the collection unchanged', () => {
		expect(messages()).toEqual([])
	})

	// Three spaces is an empty name: the trim runs before the rule, and the trimmed value is what travels.
	it.each([['   '], ['']])('refuses a blank name «%s»', (name) => {
		expect(messages({ name })).toEqual(['Name is required'])
	})

	it('caps the name at the collection bound', () => {
		expect(messages({ name: 'x'.repeat(100) })).toEqual([])
		expect(messages({ name: 'x'.repeat(101) })).toEqual(['Name cannot exceed 100 characters'])
	})

	it('trims what it stores', () => {
		expect(value({ name: '  Home and garden  ' }).name).toBe('Home and garden')
	})
})

/**
 * The slug is the URL segment the public site builds a category page out of, so its grammar is the
 * collection's own rather than a looser one: a stored slug this form would refuse is a page that cannot be
 * addressed.
 */
describe('categorySchema — slug', () => {
	it('holds both ends of the length bound', () => {
		expect(messages({ slug: 'ab' })).toEqual([])
		expect(messages({ slug: 'a' })).toEqual(['The slug is at least 2 characters'])
		expect(messages({ slug: 'a'.repeat(120) })).toEqual([])
		expect(messages({ slug: 'a'.repeat(121) })).toEqual(['The slug cannot exceed 120 characters'])
	})

	it.each([['home-and-garden'], ['home'], ['h2o'], ['2026']])('accepts «%s»', (slug) => {
		expect(messages({ slug })).toEqual([])
	})

	/*
	 * Everything the grammar turns down, and each for its own reason: an upper-case letter and an accent
	 * are not URL-safe lowercase, a space and an underscore are not the separator, and a hyphen at either
	 * end or doubled is the shape that produces an empty segment.
	 */
	it.each([['Home'], ['home garden'], ['home_garden'], ['-home'], ['home-'], ['home--garden'], ['città'], ['home/garden']])(
		'refuses «%s»',
		(slug) => {
			expect(messages({ slug })).toEqual(['The slug is lowercase letters and digits, joined by single hyphens'])
		}
	)

	/*
	 * A blank slug fails the length rule *and* the grammar — a chain of `.min`/`.regex` reports both, unlike
	 * the `superRefine` behind `position`. Only the first reaches the operator: react-hook-form keeps one
	 * error per field, and the box shows the one that is about the box being empty rather than the one about
	 * hyphens.
	 */
	// Trimmed before the grammar is applied, which is the only reason a pasted slug with a trailing space
	// is accepted at all: the regex anchors at both ends and a space is not in its alphabet.
	it('trims what it stores', () => {
		expect(value({ slug: '  house-and-garden  ' }).slug).toBe('house-and-garden')
	})

	it('reports a blank slug as too short first of all', () => {
		expect(messages({ slug: '' })).toEqual([
			'The slug is at least 2 characters',
			'The slug is lowercase letters and digits, joined by single hyphens'
		])
	})
})

/**
 * The parent has no rule of its own, deliberately: the picker offers ids that came back from
 * `itemCategories` and the empty option, and the depth cap is the service's to enforce — a form that
 * guessed at it would refuse a save the server would have accepted.
 */
describe('categorySchema — parent', () => {
	it('accepts the empty option and an id alike', () => {
		expect(messages({ idParent: '' })).toEqual([])
		expect(messages({ idParent: '65f0000000000000000000c1' })).toEqual([])
	})
})

/**
 * The ordinal the menu is sorted by. Text in the box, `Int!` on the wire.
 *
 * Two rules for the number and one for its size, because "1.5", "-1" and "99999999999" are three
 * different mistakes: the last is the one nothing on the server catches, and the collection answers it
 * with a validation failure naming no field.
 */
describe('categorySchema — position', () => {
	it.each([['0'], ['1'], ['999999999']])('accepts «%s»', (position) => {
		expect(messages({ position })).toEqual([])
	})

	// `Number('')` is 0, so a blank box would otherwise validate as the first place in the menu — which is
	// a position the operator never chose, on a category nobody has placed yet.
	it.each([[''], ['   ']])('refuses a blank position «%s»', (position) => {
		expect(messages({ position })).toEqual(['The position is a whole number'])
	})

	/*
	 * ⚠️ The last two are what the arithmetic alone would let through: `Number('0x10')` is 16 and
	 * `Number('1e3')` is 1000, both whole and both integers, so an ordinal is checked on its characters
	 * before it is read as a number. An operator who typed either did not mean sixteenth or thousandth.
	 */
	it.each([['1.5'], ['abc'], ['0x10'], ['1e3']])('refuses «%s»', (position) => {
		expect(messages({ position })).toEqual(['The position is a whole number'])
	})

	// A whole number, and refused for the other reason — one sentence and not two, which is what the
	// `superRefine` is for: `abc` fails all three rules and would otherwise be reported three times.
	it('refuses a negative position', () => {
		expect(messages({ position: '-1' })).toEqual(['The position cannot be negative'])
	})

	// ⚠️ The int32 ceiling, which is this app's rule alone — the service checks that the position is whole
	// and not negative, and neither it nor the GraphQL `Int` refuses a value the collection cannot store.
	it('refuses a position past what the collection can hold', () => {
		expect(messages({ position: '1000000000' })).toEqual(['The position cannot exceed 999999999'])
	})

	// Trimmed before it is read, like every other box: ` 10 ` is the number the operator typed.
	it('trims what it stores', () => {
		expect(value({ position: ' 10 ' }).position).toBe('10')
	})
})
