import { afterEach, describe, expect, it, vi } from 'vitest'

import { shopOwnerSchema } from '@/features/shopOwners/ShopOwnerAddForm'

/**
 * The age rule, asserted on the schema rather than through the form.
 *
 * The date box carries the same limit as a `max`, so a browser — jsdom included — refuses an
 * out-of-range date as a `rangeOverflow` and never submits: driving the form can prove the picker stops
 * there, but never that the resolver would have. This is the layer that decides what is sent, and a
 * `max` is a hint any client that does not render one is free to ignore.
 */
const VALID = {
	email: 'mario@rossi.it',
	password: 'password-lunga',
	confirmPassword: 'password-lunga',
	firstName: 'Mario',
	lastName: 'Rossi',
	birthDate: '1980-06-15',
	street: 'Via Roma 1',
	postalCode: '20100',
	city: 'Milano',
	province: 'MI',
	mobile: '3331234567',
	landline: '021234567',
	contactEmail: 'contatto@rossi.it'
}

const messages = (birthDate: string) => {
	const outcome = shopOwnerSchema.safeParse({ ...VALID, birthDate })
	return outcome.success ? [] : outcome.error.issues.map((issue) => issue.message)
}

// The boundary needs a known "today", so the clock is fixed. Only `Date` is faked — nothing here waits
// on a timer, and faking `setTimeout` would only give the suite a way to hang.
afterEach(() => {
	vi.useRealTimers()
})

const today = (day: string) => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date(day))
}

describe('shopOwnerSchema — data di birth', () => {
	it('refuses someone who turns eighteen tomorrow', () => {
		today('2026-08-02T12:00:00Z')

		expect(messages('2008-08-03')).toEqual(['The shop owner must be of age (at least 18)'])
	})

	it('accepts someone who turns eighteen today', () => {
		today('2026-08-02T12:00:00Z')

		expect(messages('2008-08-02')).toEqual([])
	})

	/*
	 * The boundary is read from the clock at validation time, not captured when the module loaded.
	 *
	 * An operator's panel stays open for days. With a constant, the one working past midnight would be
	 * refused a date the calendar in front of them still offers — the same value, accepted an hour
	 * earlier and rejected now, with an error naming an age that does not match the birthday.
	 */
	it('moves the boundary with the day', () => {
		today('2026-08-02T12:00:00Z')
		expect(messages('2008-08-03')).toHaveLength(1)

		today('2026-08-03T12:00:00Z')
		expect(messages('2008-08-03')).toEqual([])
	})

	it('says the date is malformed before it says anything about age', () => {
		today('2026-08-02T12:00:00Z')

		expect(messages('02/08/2008')).toEqual(['Enter a valid date of birth'])
	})
})
