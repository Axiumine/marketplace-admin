/** The age of majority. A shopOwner signs contracts, so the platform has no under-18 accounts. */
export const MIN_AGE = 18

/**
 * The latest birth date that is already `MIN_AGE` years old on `today`, as `YYYY-MM-DD`.
 *
 * Two things make this less trivial than a subtraction.
 *
 * The calendar parts are read **local** (`getFullYear`, not `getUTCFullYear`) because "today" is the
 * operator's day, not UTC's — east of Greenwich they disagree for the first hours of every date. They
 * are then packed into a `Date.UTC` instant used purely as a calendar container: `toISOString` on a
 * locally-constructed date would convert back to UTC and hand back the previous day.
 *
 * `Date.UTC` also rolls an impossible day forward — 29 February minus 18 years lands in a non-leap
 * year and becomes 1 March, which would accept someone whose eighteenth birthday is the day *after*
 * `today`. `setUTCDate(0)` steps back to the last day of the intended month instead.
 */
export const maxBirthDate = (today: Date): string => {
	const month = today.getMonth()
	const limit = new Date(Date.UTC(today.getFullYear() - MIN_AGE, month, today.getDate()))

	if (limit.getUTCMonth() !== month) limit.setUTCDate(0)

	return limit.toISOString().slice(0, 10)
}

/**
 * Whether someone born on `date` (`YYYY-MM-DD`) is of age on `today`.
 *
 * Compared as strings: `YYYY-MM-DD` sorts lexicographically the same way it sorts chronologically, so
 * this needs no parsing and cannot pick up a timezone on the way. The boundary is inclusive — someone
 * turning 18 today is 18 today.
 */
export const isAdult = (date: string, today: Date): boolean => date <= maxBirthDate(today)
