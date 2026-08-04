import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * One company's write schema, asserted directly instead of through the company card.
 *
 * Same reasoning as `puntoVenditaSchema.test.ts`: `salva()` sends the *parsed* values, so the trims and
 * the upper-casing are payload, not cosmetics, and the length caps sit behind a `maxLength` the keyboard
 * cannot get past.
 *
 * ⚠️ Imported inside `beforeEach`, not at the top of the file — the schema is built at module scope, and
 * a top-level import evaluates it before Stryker activates the mutant under test.
 */
type Modulo = typeof import('@/features/imprenditori/Aziende')

let aziendaSchema: Modulo['aziendaSchema']

beforeEach(async () => {
	vi.resetModules()
	;({ aziendaSchema } = await import('@/features/imprenditori/Aziende'))
})

const VALIDO = {
	ragionesociale: 'Pizzeria Rossi S.r.l.',
	piva: '12345678901',
	// Kept different from the partita IVA even though a company's usually equals it: a fixture that shared
	// one string would let a swapped pair pass every assertion in this file.
	cf: '98765432109',
	referente: 'Mario Rossi',
	amministratore: 'Anna Bianchi',
	univoco: 'ABC1234',
	pec: 'pec@rossi.it',
	visura: 'visura.pdf',
	// The one line the operator sees, spelling out the four fields under it. The rule at the bottom of the
	// schema is the only thing that holds them together, so a fixture where they disagreed would fail
	// every test in this file for a reason none of them are about.
	indirizzoCompleto: 'Via Roma 1, 20100 Milano (MI)',
	indirizzo: 'Via Roma 1',
	cap: '20100',
	comune: 'Milano',
	provincia: 'MI',
	longitudine: '9.19',
	latitudine: '45.46'
}

const esito = (patch: Record<string, unknown> = {}) => aziendaSchema.safeParse({ ...VALIDO, ...patch })

const messaggi = (patch: Record<string, unknown> = {}) => {
	const risultato = esito(patch)
	return risultato.success ? [] : risultato.error.issues.map((issue) => issue.message)
}

const valore = (patch: Record<string, unknown>) => {
	const risultato = esito(patch)
	if (!risultato.success) throw new Error(risultato.error.issues.map((issue) => issue.message).join(' / '))
	return risultato.data
}

describe('aziendaSchema — campi obbligatori', () => {
	it('accepts a company that came back from the collection unchanged', () => {
		expect(messaggi()).toEqual([])
	})

	// `obbligatoria` for the ragione sociale and the visura, `obbligatorio` for the two people: the
	// agreement is the whole reason `richiesto` takes the word as an argument.
	it('agrees with the noun it is refusing', () => {
		expect(messaggi({ ragionesociale: '  ' })).toEqual(['La ragione sociale è obbligatoria'])
		expect(messaggi({ visura: '' })).toEqual(['La visura è obbligatoria'])
		expect(messaggi({ referente: '' })).toEqual(['Il referente è obbligatorio'])
		expect(messaggi({ amministratore: '' })).toEqual(["L'amministratore è obbligatorio"])
	})

	/*
	 * ⚠️ `indirizzo` is capped at 100 here and at 250 on the imprenditore — same field name, same GraphQL
	 * fragment, three collections now. A 180-character street would pass the anagrafica and be refused
	 * here.
	 *
	 * `visura` is capped at all only since 20260803000000: the field it was extracted from had no
	 * `maxLength` in `puntoVendita`, and the new collection gave it one.
	 *
	 * The two address fields answer twice: an address field that is wrong is also an address field the
	 * composed line no longer spells out, and the rule at the bottom of the schema says so.
	 */
	it('caps each field where its own collection does', () => {
		expect(messaggi({ ragionesociale: 'P'.repeat(101) })).toEqual(['La ragione sociale non può superare 100 caratteri'])
		expect(messaggi({ referente: 'R'.repeat(51) })).toEqual(['Il referente non può superare 50 caratteri'])
		expect(messaggi({ amministratore: 'A'.repeat(51) })).toEqual(["L'amministratore non può superare 50 caratteri"])
		expect(messaggi({ visura: 'v'.repeat(1001) })).toEqual(['La visura non può superare 1000 caratteri'])
		expect(messaggi({ indirizzo: 'V'.repeat(101) })).toEqual([
			"L'indirizzo non può superare 100 caratteri",
			"Seleziona l'indirizzo dall'elenco"
		])
		expect(messaggi({ comune: 'M'.repeat(101) })).toEqual([
			'Il comune non può superare 100 caratteri',
			"Seleziona l'indirizzo dall'elenco"
		])
	})

	it('trims a required field before measuring it', () => {
		expect(valore({ referente: '  Mario Rossi  ' }).referente).toBe('Mario Rossi')
	})
})

describe('aziendaSchema — identificativi fiscali', () => {
	it('refuses a partita IVA with anything either side of the eleven digits', () => {
		expect(messaggi({ piva: 'a12345678901' })).toEqual(['La partita IVA è di 11 cifre'])
		expect(messaggi({ piva: '12345678901a' })).toEqual(['La partita IVA è di 11 cifre'])
	})

	it('trims the partita IVA before matching it', () => {
		expect(valore({ piva: '  12345678901  ' }).piva).toBe('12345678901')
	})

	/*
	 * Eleven and not sixteen: this is the company's codice fiscale, which for a legal entity is the
	 * eleven-digit form. Blank is how it is removed — no company stored before the extraction has one,
	 * because the field did not exist — and the collection checks the length and not the characters, so
	 * neither does this.
	 */
	it('accepts an empty codice fiscale and refuses one of the wrong length', () => {
		expect(messaggi({ cf: '' })).toEqual([])
		expect(messaggi({ cf: '9876543210' })).toEqual(['Il codice fiscale è di 11 caratteri'])
		expect(messaggi({ cf: '987654321098' })).toEqual(['Il codice fiscale è di 11 caratteri'])
	})

	it('accepts a codice fiscale that is not digits, because the collection does', () => {
		expect(messaggi({ cf: 'RSSMRA80A01' })).toEqual([])
	})

	it('trims the codice fiscale before measuring it', () => {
		expect(valore({ cf: '  98765432109  ' }).cf).toBe('98765432109')
	})

	// Blank is how the code is removed — the SDI recipient code is optional on the collection.
	it('accepts an empty codice univoco and refuses a malformed one', () => {
		expect(messaggi({ univoco: '' })).toEqual([])
		expect(messaggi({ univoco: '-ABC1234' })).toEqual(['Il codice univoco è di 7 caratteri alfanumerici'])
		expect(messaggi({ univoco: 'ABC1234-' })).toEqual(['Il codice univoco è di 7 caratteri alfanumerici'])
	})

	it('trims the codice univoco before matching it', () => {
		expect(valore({ univoco: '  ABC1234  ' }).univoco).toBe('ABC1234')
	})
})

describe('aziendaSchema — PEC', () => {
	it('trims the PEC before matching it', () => {
		expect(valore({ pec: '  pec@rossi.it  ' }).pec).toBe('pec@rossi.it')
	})

	/*
	 * The address rule is deliberately loose — one `@`, a dot in the domain, no whitespace — but it is
	 * anchored at both ends. Unanchored it would approve "Mario Rossi <mario@rossi.it>", which the
	 * collection stores verbatim and no mail server will ever accept.
	 */
	it('refuses a PEC that is not an address', () => {
		expect(messaggi({ pec: 'pec-rossi.it' })).toEqual(['La PEC non è un indirizzo valido'])
		expect(messaggi({ pec: 'a b@c.de' })).toEqual(['La PEC non è un indirizzo valido'])
		expect(messaggi({ pec: 'a@b.cd e' })).toEqual(['La PEC non è un indirizzo valido'])
	})

	// Required, unlike the shop's own contact PEC: the collection has it as a required unique field, and
	// blank would be a company with no certified address rather than a company that removed one.
	it('refuses a blank PEC', () => {
		expect(messaggi({ pec: '' })).toEqual(['La PEC non è un indirizzo valido'])
	})
})

describe('aziendaSchema — CAP e provincia', () => {
	// The composed line comes back with each of these for the reason above: a CAP that is not five digits
	// is also a CAP the line in the box no longer spells out.
	it('refuses a CAP with anything either side of the five digits', () => {
		expect(messaggi({ cap: 'a12345' })).toEqual(['Il CAP deve essere di 5 cifre', "Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ cap: '12345a' })).toEqual(['Il CAP deve essere di 5 cifre', "Seleziona l'indirizzo dall'elenco"])
	})

	it('refuses a provincia with anything either side of the two letters', () => {
		expect(messaggi({ provincia: '1MI' })).toEqual(['La provincia è la sigla di 2 lettere', "Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ provincia: 'MI1' })).toEqual(['La provincia è la sigla di 2 lettere', "Seleziona l'indirizzo dall'elenco"])
	})

	it('trims and upper-cases the provincia', () => {
		expect(valore({ provincia: '  mi  ' }).provincia).toBe('MI')
	})
})

/*
 * ⚠️ The rule that makes the single address box safe — the same one the shop card relies on.
 *
 * The box is the only address input the card has; the four fields under it and the coordinate pair are
 * written by picking a geocoder answer and by nothing else. Free text left in the box would therefore
 * save the *stored* street, CAP, comune and position under a line reading like some other address — a
 * save that reports success and writes none of what is on screen.
 */
describe('aziendaSchema — indirizzo composto', () => {
	it('refuses a line that is not the address the fields under it spell out', () => {
		expect(messaggi({ indirizzoCompleto: 'Via Roma 2, 20100 Milano (MI)' })).toEqual(["Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ indirizzoCompleto: 'Via Roma 1' })).toEqual(["Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ indirizzoCompleto: '' })).toEqual(["Seleziona l'indirizzo dall'elenco"])
	})

	// Whichever of the four moved, the line stops matching — the rule is the whole address and not the
	// street half of it.
	it('refuses a line left behind by any one of the four fields', () => {
		expect(messaggi({ cap: '20121' })).toEqual(["Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ comune: 'Roma' })).toEqual(["Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ provincia: 'RM' })).toEqual(["Seleziona l'indirizzo dall'elenco"])
	})

	// It is reported on the box, because the box is where the operator can do something about it: the
	// four fields it is really about have no input on the page at all.
	it('reports it on the box and not on a field with no input', () => {
		const risultato = esito({ indirizzoCompleto: 'Via Roma 2, 20100 Milano (MI)' })

		expect(risultato.success).toBe(false)
		expect(risultato.error?.issues.map((issue) => issue.path)).toEqual([['indirizzoCompleto']])
	})

	it('compares against the upper-cased sigla, not the one that was typed', () => {
		expect(messaggi({ provincia: '  mi  ' })).toEqual([])
	})
})

describe('aziendaSchema — coordinate', () => {
	/*
	 * The blank test lives inside the "is a number" rule because `Number('')` is `0`, which is finite and
	 * in range — an empty box would otherwise validate as the middle of the Atlantic. A decimal comma is
	 * the other half: `Number('12,5')` is `NaN`, which fails the range rule too, so both lines come back.
	 */
	it('refuses a box that holds no number, blank included', () => {
		expect(messaggi({ longitudine: '' })).toEqual(['La longitudine deve essere un numero'])
		expect(messaggi({ latitudine: '12,5' })).toEqual(['La latitudine deve essere un numero', 'La latitudine è fuori da -90..90'])
	})

	// The poles and the antimeridian are on the map, so the bound includes them — and it differs per axis.
	it('accepts each axis at its own limit and refuses the step past it', () => {
		expect(messaggi({ longitudine: '180', latitudine: '90' })).toEqual([])
		expect(messaggi({ longitudine: '-180', latitudine: '-90' })).toEqual([])
		expect(messaggi({ longitudine: '180.1' })).toEqual(['La longitudine è fuori da -180..180'])
		expect(messaggi({ latitudine: '90.1' })).toEqual(['La latitudine è fuori da -90..90'])
	})
})
