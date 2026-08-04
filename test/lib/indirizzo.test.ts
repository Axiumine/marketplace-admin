import { describe, expect, it } from 'vitest'

import { coordinateTesto, erroreIndirizzo, indirizzoComposto, puntoDiMappa } from '@/lib/indirizzo'

/**
 * A GeoJSON Point is `[longitude, latitude]` — longitude first. Every mapping UI and every human writes
 * it the other way round, so a pair passed on in the order it arrived puts the marker in the sea off
 * Somalia about half the time.
 */
describe('puntoDiMappa', () => {
	it('reads the pair longitude first and hands it on by name', () => {
		expect(puntoDiMappa([9.19, 45.4642])).toEqual({ lat: 45.4642, lon: 9.19 })
	})

	// No map at all rather than a map of somewhere else: an address whose position did not arrive has no
	// place on one, and a frame centred on a fallback would be a claim instead of a gap.
	it('is nothing for a malformed pair', () => {
		expect(puntoDiMappa([9.19])).toBeNull()
	})

	// The case an imprenditore is normally in: `position` is optional on that collection and the caller
	// hands the empty array over for a record that has none.
	it('is nothing for no coordinates at all', () => {
		expect(puntoDiMappa([])).toBeNull()
	})

	// The same gap as the empty array, and the reason the caller no longer writes `?? []`: an absent
	// `position` is answered here rather than turned into an array on the way in.
	it('is nothing for an absent position', () => {
		expect(puntoDiMappa(undefined)).toBeNull()
	})

	// `0` is the prime meridian and the equator, not a missing value.
	it('keeps a zero coordinate', () => {
		expect(puntoDiMappa([0, 0])).toEqual({ lat: 0, lon: 0 })
	})
})

/*
 * The two boxes behind an address field, which no test can reach through a form: neither coordinate has
 * an input, and a blank one and one holding nonsense are refused with the same sentence. Both cards seed
 * them from here, so this is where the seeded value is stated.
 */
describe('coordinateTesto', () => {
	it('writes the pair as the two strings the form holds, longitude first', () => {
		expect(coordinateTesto([9.19, 45.4642])).toEqual({ longitudine: '9.19', latitudine: '45.4642' })
	})

	// Empty boxes, not the word "undefined" for the operator to delete: a pair of the wrong length is the
	// one broken shape a `[Float!]!` can carry.
	it('leaves both boxes empty for a pair that never arrived', () => {
		expect(coordinateTesto([])).toEqual({ longitudine: '', latitudine: '' })
	})

	it('leaves the missing half empty and keeps the one that came', () => {
		expect(coordinateTesto([9.19])).toEqual({ longitudine: '9.19', latitudine: '' })
	})

	// `0` again: the equator is a position, and `String(0)` is `'0'` rather than the fallback.
	it('keeps a zero coordinate', () => {
		expect(coordinateTesto([0, 0])).toEqual({ longitudine: '0', latitudine: '0' })
	})
})

describe('indirizzoComposto', () => {
	it('writes the four fields as one line', () => {
		expect(indirizzoComposto({ indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano', provincia: 'MI' })).toBe(
			'Via Roma 1, 20100 Milano (MI)'
		)
	})

	// Both form schemas upper-case their own provincia, so a record stored with a lower-case sigla would
	// otherwise seed a box that disagrees with the composite rule before anything was typed — and the
	// save would demand an address be re-picked for a letter nobody can see.
	it('upper-cases the provincia, as the schemas do', () => {
		expect(indirizzoComposto({ indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano', provincia: 'mi' })).toBe(
			'Via Roma 1, 20100 Milano (MI)'
		)
	})
})

/*
 * The address box of all three cards. Only one of the seven is ever on screen, so the card tests can pin
 * down which message shows but not why the other six were passed over — this is where the whole set is
 * stated, one field at a time.
 */
describe('erroreIndirizzo', () => {
	// Nothing wrong, nothing under the box. The `?.` this asserts is the difference between an empty
	// message and a TypeError on every render of a valid form.
	it('is nothing when no field is in error', () => {
		expect(erroreIndirizzo({})).toBeUndefined()
	})

	/*
	 * Each of the seven named on its own, and not as a set: a key dropped from the list would fall through
	 * to `undefined` and read exactly like a key that was never in error — the save blocked with a silent
	 * form, which is the failure the whole helper exists to prevent.
	 */
	it.each([
		['indirizzo', "L'indirizzo è obbligatorio"],
		['cap', 'Il CAP deve essere di 5 cifre'],
		['comune', 'Il comune è obbligatorio'],
		['provincia', 'La provincia è la sigla di 2 lettere'],
		['latitudine', 'La latitudine non è un numero'],
		['longitudine', 'La longitudine è fuori da -180..180'],
		['indirizzoCompleto', "Seleziona l'indirizzo dall'elenco"]
	])('shows the message of a broken %s', (campo, message) => {
		expect(erroreIndirizzo({ [campo]: { message } })).toBe(message)
	})

	/*
	 * The order, which is the reason the list is a list and not an `??` chain written any which way.
	 *
	 * A wrong field makes the composed line stop matching too, so the composite rule fires alongside it
	 * every single time — and it is the one that says nothing useful. "Seleziona l'indirizzo dall'elenco"
	 * over an address that *was* selected, and whose CAP is what the geocoder left out, sends the operator
	 * back to the list to pick the same address again.
	 */
	it('prefers the broken field over the composite rule that broke with it', () => {
		expect(
			erroreIndirizzo({
				cap: { message: 'Il CAP deve essere di 5 cifre' },
				indirizzoCompleto: { message: "Seleziona l'indirizzo dall'elenco" }
			})
		).toBe('Il CAP deve essere di 5 cifre')
	})

	// Between two broken fields the list order decides, and it is the order the box reads top to bottom.
	it('shows the first broken field when more than one is', () => {
		expect(
			erroreIndirizzo({ comune: { message: 'Il comune è obbligatorio' }, indirizzo: { message: "L'indirizzo è obbligatorio" } })
		).toBe("L'indirizzo è obbligatorio")
	})

	// An error object with no message of its own still counts as the one that is broken — the search stops
	// there rather than walking on to a later field and describing that instead.
	it('is nothing for a broken field that carries no message', () => {
		expect(erroreIndirizzo({ cap: {}, indirizzoCompleto: { message: "Seleziona l'indirizzo dall'elenco" } })).toBeUndefined()
	})
})
