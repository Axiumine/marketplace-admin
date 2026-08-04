import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Re-imported per test rather than imported at the top of the file, for the same reason
 * `test/lib/format.test.ts` is — a mutation-testing requirement, not a style choice.
 *
 * The two `Intl.DateTimeFormat` instances are module-level constants, so a static import builds them
 * once, when this file loads and before any test runs. Stryker's vitest runner keeps the module
 * registry between mutants, so a mutant inside one of those constructor calls never re-executes and
 * survives every assertion below however strict it is. `vi.resetModules()` plus a dynamic `import()`
 * puts the construction back inside the test, where the mutant is live. See COVERAGE.md.
 *
 * `@/lib/chart` imports one type and nothing else, so resetting the registry for it cannot
 * desynchronise a singleton another module is holding a reference to.
 */
let chart: typeof import('@/lib/chart')

beforeEach(async () => {
	vi.resetModules()
	chart = await import('@/lib/chart')
})

const series = (...totals: number[]) => totals.map((total, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, total }))

describe('etichettaBucket', () => {
	it('labels a month bucket with month and year', () => {
		expect(chart.bucketLabel('2026-08-01', 'MONTH')).toBe('ago 2026')
	})

	// The year is deliberately absent from the day form: the two ranges that use it span three months at
	// most, so it would repeat on every label to distinguish nothing.
	it('labels a day bucket with day and month only', () => {
		expect(chart.bucketLabel('2026-08-02', 'DAY')).toBe('02/08')
	})

	// ⚠️ `2026-08-01` is UTC midnight by the date-only ISO rule, and `Intl` would render it in the
	// browser's zone unless told otherwise. West of Greenwich that is 31 July — a month bucket labelled
	// with the month before its own. The formatters pin UTC; this is the assertion that says so, since
	// the suite itself runs at TZ=UTC and would not otherwise notice the pin going missing.
	it('reads the bucket in UTC, not in the browser zone', () => {
		expect(chart.bucketLabel('2026-01-01', 'MONTH')).toBe('gen 2026')
		expect(chart.bucketLabel('2026-01-01', 'DAY')).toBe('01/01')
	})

	// The field is String! on the wire, not a Date scalar, so nothing between the aggregation and here
	// checks its shape. Printing "Invalid Date" under a bar is worse than printing what arrived.
	it('falls back to the raw value when the bucket will not parse', () => {
		expect(chart.bucketLabel('non-una-data', 'DAY')).toBe('non-una-data')
	})
})

describe('bars', () => {
	it('scales heights against the tallest bucket', () => {
		const [first, second] = chart.bars(series(1, 2), 'DAY', 600, 160)

		expect(second?.height).toBe(160)
		expect(first?.height).toBe(80)
	})

	// SVG's origin is top-left: a taller bar starts higher up the box, i.e. at a SMALLER y. Getting this
	// backwards still draws a chart — one hanging from the ceiling.
	it('grows bars upwards from the baseline', () => {
		const [first, second] = chart.bars(series(1, 2), 'DAY', 600, 160)

		expect(second?.y).toBe(0)
		expect(first?.y).toBe(80)
		expect(first?.y).toBeGreaterThan(second?.y ?? 0)
	})

	it('divides the width evenly and lays the buckets out oldest first', () => {
		const [first, second, third] = chart.bars(series(1, 1, 1), 'DAY', 600, 160)

		expect(first?.width).toBe(200)
		expect(first?.x).toBe(0)
		expect(second?.x).toBe(200)
		expect(third?.x).toBe(400)
	})

	// One bucket is the platform whose first shopOwner registered this month. A polyline's step would
	// be a division by zero here; a bar's is the full width.
	it('gives a single bucket the whole width', () => {
		const [only] = chart.bars(series(3), 'DAY', 600, 160)

		expect(only?.width).toBe(600)
		expect(only?.x).toBe(0)
		expect(only?.height).toBe(160)
	})

	// A range nobody registered in is a real answer. Without the floor of 1 in the scale, every height
	// would be `0 / 0` — NaN in the `y` of every rect, and an SVG that renders nothing at all.
	it('draws an all-zero range as baseline ticks, not as NaN', () => {
		const barsZero = chart.bars(series(0, 0), 'DAY', 600, 160)

		for (const b of barsZero) {
			expect(b.height).toBe(1)
			expect(b.y).toBe(159)
		}
	})

	// The minimum applies per bar, not only to an all-zero range: a quiet day between two busy ones has
	// to stay visible, because "nobody signed up" and "this day is outside the range" are different
	// claims and the server fills gaps precisely so the chart can make the first one.
	it('keeps an empty bucket visible beside a busy one', () => {
		const [first, empty] = chart.bars(series(100, 0), 'DAY', 600, 160)

		expect(first?.height).toBe(160)
		expect(empty?.height).toBe(1)
	})

	it('carries the bucket value and its label through for the tooltip', () => {
		const [only] = chart.bars([{ date: '2026-08-01', total: 7 }], 'MONTH', 600, 160)

		expect(only?.total).toBe(7)
		expect(only?.date).toBe('2026-08-01')
		expect(only?.label).toBe('ago 2026')
	})

	it('answers nothing for an empty series', () => {
		expect(chart.bars([], 'MONTH', 600, 160)).toEqual([])
	})
})

describe('estremi', () => {
	it('answers the first and the last label', () => {
		expect(chart.bounds(chart.bars(series(1, 2, 3, 4), 'DAY', 600, 160))).toEqual(['01/08', '04/08'])
	})

	// Not two copies of the same label: with one bucket the two ends are the same bucket.
	it('answers one label for a single bucket', () => {
		expect(chart.bounds(chart.bars(series(1), 'DAY', 600, 160))).toEqual(['01/08'])
	})

	it('answers nothing for an empty chart', () => {
		expect(chart.bounds([])).toEqual([])
	})
})

describe('totaleSerie', () => {
	it('sums every bucket', () => {
		expect(chart.seriesTotal(series(1, 2, 3))).toBe(6)
	})

	it('sums an empty series to zero', () => {
		expect(chart.seriesTotal([])).toBe(0)
	})
})
