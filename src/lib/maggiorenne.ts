/** Italian age of majority. An imprenditore signs contracts, so the platform has no under-18 accounts. */
export const ETA_MINIMA = 18

/**
 * The latest birth date that is already `ETA_MINIMA` years old on `oggi`, as `YYYY-MM-DD`.
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
 * `oggi`. `setUTCDate(0)` steps back to the last day of the intended month instead.
 */
export const dataMassimaNascita = (oggi: Date): string => {
	const mese = oggi.getMonth()
	const limite = new Date(Date.UTC(oggi.getFullYear() - ETA_MINIMA, mese, oggi.getDate()))

	if (limite.getUTCMonth() !== mese) limite.setUTCDate(0)

	return limite.toISOString().slice(0, 10)
}

/**
 * Whether someone born on `data` (`YYYY-MM-DD`) is of age on `oggi`.
 *
 * Compared as strings: `YYYY-MM-DD` sorts lexicographically the same way it sorts chronologically, so
 * this needs no parsing and cannot pick up a timezone on the way. The boundary is inclusive — someone
 * turning 18 today is 18 today.
 */
export const eMaggiorenne = (data: string, oggi: Date): boolean => data <= dataMassimaNascita(oggi)
