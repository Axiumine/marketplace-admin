import { describe, expect, it } from 'vitest'

import { dataMassimaNascita, eMaggiorenne, ETA_MINIMA } from '@/lib/maggiorenne'

describe('dataMassimaNascita', () => {
	it('is the same calendar day, eighteen years earlier', () => {
		expect(dataMassimaNascita(new Date('2026-08-02T10:30:00Z'))).toBe('2008-08-02')
	})

	// `Date.UTC(2010, 1, 29)` is 1 March: 2010 is not a leap year. Left alone, the limit would move a day
	// into the future and accept someone whose eighteenth birthday is tomorrow.
	it('steps back to 28 February when the day eighteen years earlier does not exist', () => {
		expect(dataMassimaNascita(new Date('2028-02-29T00:00:00Z'))).toBe('2010-02-28')
	})

	// The last instant of the day and the first must answer the same thing: the limit is a calendar day,
	// and an hour of the clock has no business being in it.
	it('does not move with the time of day', () => {
		expect(dataMassimaNascita(new Date('2026-08-02T00:00:00Z'))).toBe(dataMassimaNascita(new Date('2026-08-02T23:59:59Z')))
	})

	it('is a bare date, with no time on the end', () => {
		expect(dataMassimaNascita(new Date('2026-08-02T10:30:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	})

	it('is eighteen years back, not some other number of them', () => {
		expect(ETA_MINIMA).toBe(18)
		expect(dataMassimaNascita(new Date('2026-08-02T00:00:00Z')).slice(0, 4)).toBe('2008')
	})
})

const OGGI = new Date('2026-08-02T12:00:00Z')

describe('eMaggiorenne', () => {
	// The boundary is the whole rule: majority is reached *on* the eighteenth birthday, so the day itself
	// is accepted and the day after it is not. Either comparison one step off fails exactly one of these.
	it('accepts someone who turns eighteen today', () => {
		expect(eMaggiorenne('2008-08-02', OGGI)).toBe(true)
	})

	it('refuses someone who turns eighteen tomorrow', () => {
		expect(eMaggiorenne('2008-08-03', OGGI)).toBe(false)
	})

	it('accepts a birth date well before the limit', () => {
		expect(eMaggiorenne('1980-06-15', OGGI)).toBe(true)
	})

	it('refuses a child', () => {
		expect(eMaggiorenne('2020-01-01', OGGI)).toBe(false)
	})
})
