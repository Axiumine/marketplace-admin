import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The module is re-imported per test rather than imported at the top of the file, and that is a
 * mutation-testing requirement rather than a style choice.
 *
 * The three `Intl.DateTimeFormat` instances are module-level constants, so with a plain static import
 * they are built once — when this file loads, before any test runs. Stryker's vitest runner keeps the
 * module registry between mutants, so a mutant inside one of those constructor calls never re-executes
 * and survives every assertion below no matter how strict it is. `vi.resetModules()` plus a dynamic
 * `import()` puts the construction back inside the test, where the mutant is live. See COVERAGE.md.
 *
 * `@/lib/format` imports nothing, so resetting the registry for it cannot desynchronise a singleton
 * some other module is holding a reference to.
 */
let format: typeof import('@/lib/format')

beforeEach(async () => {
	vi.resetModules()
	format = await import('@/lib/format')
})

/**
 * The zone is pinned to UTC in vitest.config.ts, so these are the exact strings an admin sees.
 * Asserting the literal output rather than re-deriving it through `Intl` is the point: a test that
 * formats its own expectation passes whatever the formatter does.
 */
const ISO = '2026-02-01T08:05:45.000Z'

describe('formatDateTime', () => {
	it('renders an ISO timestamp in long form', () => {
		expect(format.formatDateTime(ISO)).toBe('1 February 2026 at 08:05:45')
	})

	it('renders NO_VALUE for an unparseable timestamp instead of "Invalid Date"', () => {
		expect(format.formatDateTime('not a date')).toBe(format.NO_VALUE)
		expect(format.NO_VALUE).toBe('---')
	})
})

describe('formatDate', () => {
	it('renders a date without its time half', () => {
		expect(format.formatDate(ISO)).toBe('01/02/2026')
	})

	it('accepts the bare `YYYY-MM-DD` the Date scalar sends', () => {
		expect(format.formatDate('2026-02-01')).toBe('01/02/2026')
	})

	it('renders NO_VALUE for an unparseable date', () => {
		expect(format.formatDate('')).toBe(format.NO_VALUE)
	})
})

describe('formatEpochMillis', () => {
	/**
	 * ⚠️ The whole reason this function exists: `new Date('1769933145000')` is `Invalid Date`, because a bare
	 * digit string is not an ISO-8601 date and `Date` does not fall back to a numeric parse for one. Sent
	 * through `formatDateTime`, every session row and every line of the reuse trail would render as `---`.
	 */
	it('renders a Redis epoch-millis string in the same long form as every other date', () => {
		expect(format.formatEpochMillis('1769933145000')).toBe('1 February 2026 at 08:05:45')
		expect(format.formatDateTime('1769933145000')).toBe(format.NO_VALUE)
	})

	/**
	 * ⚠️ `Number('')` is `0`, which is 1 January 1970 — a plausible-looking date for a field the service
	 * failed to write. An admin reading it on a session row would take a write fault for a session minted
	 * before the platform existed, so the empty string is refused with the rest.
	 */
	it('renders NO_VALUE for an empty or blank value rather than 1 January 1970', () => {
		expect(format.formatEpochMillis('')).toBe(format.NO_VALUE)
		expect(format.formatEpochMillis('   ')).toBe(format.NO_VALUE)
	})

	it('renders NO_VALUE for a value that is not a number', () => {
		expect(format.formatEpochMillis('not a number')).toBe(format.NO_VALUE)
	})

	// Beyond ±8.64e15 the `Date` is out of range. It formats as nothing rather than throwing, which is what
	// keeps a corrupt record from taking the screen down with it.
	it('renders NO_VALUE for a value beyond the range a Date can hold', () => {
		expect(format.formatEpochMillis('9999999999999999')).toBe(format.NO_VALUE)
	})

	it('renders the epoch itself when the value really is zero', () => {
		expect(format.formatEpochMillis('0')).toBe('1 January 1970 at 00:00:00')
	})
})

describe('handleNull', () => {
	it('renders NO_VALUE for null and for undefined', () => {
		expect(format.handleNull(null)).toBe(format.NO_VALUE)
		expect(format.handleNull(undefined)).toBe(format.NO_VALUE)
	})

	it('renders a present value as a string, including the falsy ones', () => {
		expect(format.handleNull('0331 123456')).toBe('0331 123456')
		expect(format.handleNull(0)).toBe('0')
		expect(format.handleNull('')).toBe('')
	})
})

describe('handleNullDate', () => {
	it('renders NO_VALUE for null and for undefined', () => {
		expect(format.handleNullDate(null)).toBe(format.NO_VALUE)
		expect(format.handleNullDate(undefined)).toBe(format.NO_VALUE)
	})

	it('formats a present timestamp', () => {
		expect(format.handleNullDate(ISO)).toBe('1 February 2026 at 08:05:45')
	})
})

describe('handleNullBoolYN', () => {
	it('renders only `true` as Yes', () => {
		expect(format.handleNullBoolYN(true)).toBe('Yes')
	})

	it('renders false, null and undefined alike as No', () => {
		expect(format.handleNullBoolYN(false)).toBe('No')
		expect(format.handleNullBoolYN(null)).toBe('No')
		expect(format.handleNullBoolYN(undefined)).toBe('No')
	})
})

describe('toDateInput', () => {
	it('keeps the date half an `input type="date"` accepts', () => {
		expect(format.toDateInput('1980-06-15T00:00:00.000Z')).toBe('1980-06-15')
	})

	// Midnight UTC is what the collection stores, and reading it in local time would seed the box with
	// the previous day everywhere west of Greenwich — a field dirty on arrival and written back a day
	// early on the next save that touched anything else.
	it('reads the stored timestamp in UTC', () => {
		expect(format.toDateInput('1980-06-15T23:30:00.000Z')).toBe('1980-06-15')
	})

	// The empty string, not NO_VALUE: this feeds a form control, where `---` is three characters the
	// admin has to delete rather than an empty field.
	it('is empty for an unparseable value', () => {
		expect(format.toDateInput('not a date')).toBe('')
	})
})

describe('toTimeInput', () => {
	it('keeps the `HH:MM` half an `input type="time"` accepts', () => {
		expect(format.toTimeInput('2026-01-10T11:30:00.000Z')).toBe('11:30')
	})

	it('is empty for an unparseable value', () => {
		expect(format.toTimeInput('noon')).toBe('')
	})
})

describe('toTimeWire', () => {
	// The `Z` is the whole point: graphql-scalars' `Time` throws on a value with no timezone designator.
	it('stamps the seconds and the designator the Time scalar insists on', () => {
		expect(format.toTimeWire('11:30')).toBe('11:30:00Z')
	})
})

describe('emptyInNull', () => {
	// `''` is a string of the right bsonType, so it would be *written* — a landline of no digits — while
	// `null` is what the services' validators turn into an absent key.
	it('turns a cleared box into null', () => {
		expect(format.emptyInNull('')).toBeNull()
	})

	it('leaves anything else alone, including a lone space', () => {
		expect(format.emptyInNull('021234567')).toBe('021234567')
		expect(format.emptyInNull(' ')).toBe(' ')
	})
})

describe('formatAddress', () => {
	it('composes the one-line address the tables and cards show', () => {
		expect(format.formatAddress({ street: '1 main street', postalCode: '02109', city: 'Boston', province: 'MA' })).toBe(
			'1 main street, 02109 Boston (MA)'
		)
	})
})

describe('the two placeholders', () => {
	/*
	 * ⚠️ Two different characters, and the pair is the assertion. `EMPTY_CELL` is one em dash in a dense
	 * grid; `NO_VALUE` is three hyphens in a form field. Collapsing them into one constant would make
	 * every table cell three characters wide or every detail field one, and both tables assert on the
	 * dash by its literal text.
	 */
	it('keeps the table cell and the detail field distinct', () => {
		expect(format.EMPTY_CELL).toBe('—')
		expect(format.NO_VALUE).toBe('---')
	})
})
