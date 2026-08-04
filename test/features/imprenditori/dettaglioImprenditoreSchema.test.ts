import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The detail page's write schema, asserted directly instead of through the form.
 *
 * Every rule here is the last thing that runs before a value is put on the wire — `salva()` parses with
 * this schema and sends what comes out, not what is in the boxes — so the transforms are as much a part
 * of the payload as the messages are a part of the page. Driving the form to reach them costs a click
 * per row and cannot reach half of them at all: a `maxLength` on the box means the over-length case
 * never arrives from a keyboard, and a `type="date"` refuses a malformed date before React sees it.
 *
 * ⚠️ The schema is built at module scope, so it is imported **inside** `beforeEach` and not at the top
 * of this file. A top-level import evaluates it once, before Stryker activates the mutant for the test
 * about to run, and every rule on it then reads as untested however hard this file asserts.
 */
type Modulo = typeof import('@/features/imprenditori/AnagraficaImprenditore')

let dettaglioImprenditoreSchema: Modulo['dettaglioImprenditoreSchema']

beforeEach(async () => {
	vi.resetModules()
	;({ dettaglioImprenditoreSchema } = await import('@/features/imprenditori/AnagraficaImprenditore'))
})

afterEach(() => {
	vi.useRealTimers()
})

// The age boundary is read from the clock at parse time, so a test that names it has to own the clock.
// Only `Date` is faked: nothing here waits on a timer, and faking `setTimeout` would only give the suite
// a way to hang.
const oggi = (giorno: string) => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date(giorno))
}

const VALIDO = {
	emailLogin: 'mario@rossi.it',
	nome: 'Mario',
	cognome: 'Rossi',
	dataNascita: '1980-06-15',
	// The composite rule at the bottom of the schema compares this line against the four fields under it,
	// so the two have to agree in the baseline or every single test would fail on the address.
	indirizzoCompleto: 'Via Roma 1, 20100 Milano (MI)',
	indirizzo: 'Via Roma 1',
	cap: '20100',
	comune: 'Milano',
	provincia: 'MI',
	longitudine: '9.19',
	latitudine: '45.4642',
	cellulare: '3331234567',
	fisso: '021234567',
	contattoEmail: 'contatto@rossi.it',
	disabled: false,
	waitApprov: false,
	rememberMe: false,
	onboardingDone: false,
	onboardingStep: '3',
	note: ''
}

/** A syntactically valid address of 254 characters — long enough for the cap, short enough to exist. */
const EMAIL_LUNGA = `${'a'.repeat(245)}@rossi.it`

const esito = (patch: Record<string, unknown> = {}) => dettaglioImprenditoreSchema.safeParse({ ...VALIDO, ...patch })

const messaggi = (patch: Record<string, unknown> = {}) => {
	const risultato = esito(patch)
	return risultato.success ? [] : risultato.error.issues.map((issue) => issue.message)
}

/** The parsed payload. Throws with the refusals attached, because a silent `undefined` reads as a null assertion. */
const valore = (patch: Record<string, unknown>) => {
	const risultato = esito(patch)
	if (!risultato.success) throw new Error(risultato.error.issues.map((issue) => issue.message).join(' / '))
	return risultato.data
}

describe('dettaglioImprenditoreSchema — campi obbligatori', () => {
	it('accepts a row that came back from the collection unchanged', () => {
		expect(messaggi()).toEqual([])
	})

	/*
	 * The two address fields answer twice: a field that is wrong is also a field the composed line no
	 * longer spells out, and the rule at the bottom of the schema says so. Both are true, and the card
	 * shows the field's own message first — see the order `erroreIndirizzo` reads them in.
	 */
	it('names the field that was emptied', () => {
		expect(messaggi({ nome: '   ' })).toEqual(['Il nome è obbligatorio'])
		expect(messaggi({ cognome: '' })).toEqual(['Il cognome è obbligatorio'])
		expect(messaggi({ indirizzo: '' })).toEqual(["L'indirizzo è obbligatorio", "Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ comune: '' })).toEqual(['Il comune è obbligatorio', "Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ cellulare: '' })).toEqual(['Il cellulare è obbligatorio'])
	})

	/*
	 * The box carries the same number as a `maxLength`, so this case cannot be typed — but it can be
	 * pasted past a client that renders no `maxLength` at all, and the bound is the collection's.
	 */
	it('names the cap it exceeded', () => {
		expect(messaggi({ nome: 'M'.repeat(101) })).toEqual(['Il nome non può superare 100 caratteri'])
		expect(messaggi({ cognome: 'R'.repeat(101) })).toEqual(['Il cognome non può superare 100 caratteri'])
		// ⚠️ 250 here and 100 on the punto vendita — same field name, same fragment, two collections.
		expect(messaggi({ indirizzo: 'V'.repeat(251) })).toEqual([
			"L'indirizzo non può superare 250 caratteri",
			"Seleziona l'indirizzo dall'elenco"
		])
		expect(messaggi({ comune: 'M'.repeat(101) })).toEqual([
			'Il comune non può superare 100 caratteri',
			"Seleziona l'indirizzo dall'elenco"
		])
		expect(messaggi({ cellulare: '3'.repeat(13) })).toEqual(['Il cellulare non può superare 12 caratteri'])
	})
})

describe('dettaglioImprenditoreSchema — email', () => {
	// Two addresses, two messages: the operator has to know which of the two boxes to go back to, and
	// they usually hold the same string.
	it('tells the login address apart from the contact one', () => {
		expect(messaggi({ emailLogin: 'mario@rossi' })).toEqual(['Inserisci un indirizzo email di accesso valido'])
		expect(messaggi({ contattoEmail: 'contatto@rossi' })).toEqual(['Inserisci un indirizzo email di contatto valido'])
	})

	it("caps both at the collection's length", () => {
		expect(messaggi({ emailLogin: EMAIL_LUNGA })).toEqual(["L'email di accesso non può superare 250 caratteri"])
		expect(messaggi({ contattoEmail: EMAIL_LUNGA })).toEqual(["L'email di contatto non può superare 250 caratteri"])
	})
})

describe('dettaglioImprenditoreSchema — data di nascita', () => {
	it('refuses a date the calendar does not spell', () => {
		expect(messaggi({ dataNascita: '15/06/1980' })).toEqual(['Inserisci una data di nascita valida'])
	})

	it('refuses someone who turns eighteen tomorrow', () => {
		oggi('2026-08-02T12:00:00Z')

		expect(messaggi({ dataNascita: '2008-08-03' })).toEqual(["L'imprenditore deve essere maggiorenne (almeno 18 anni)"])
	})

	it('accepts someone who turns eighteen today', () => {
		oggi('2026-08-02T12:00:00Z')

		expect(messaggi({ dataNascita: '2008-08-02' })).toEqual([])
	})
})

describe('dettaglioImprenditoreSchema — CAP e provincia', () => {
	/*
	 * Both ends of the CAP are asserted because both ends are anchors: dropping either one turns "five
	 * digits" into "five digits somewhere in there", and `A20100` is a postcode the collection refuses
	 * after the page approved it.
	 */
	it('refuses a CAP with anything either side of the five digits', () => {
		expect(messaggi({ cap: 'a12345' })).toEqual(['Il CAP deve essere di 5 cifre', "Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ cap: '12345a' })).toEqual(['Il CAP deve essere di 5 cifre', "Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ cap: '1234' })).toEqual(['Il CAP deve essere di 5 cifre', "Seleziona l'indirizzo dall'elenco"])
	})

	it('refuses a provincia with anything either side of the two letters', () => {
		expect(messaggi({ provincia: '1MI' })).toEqual(['La provincia è la sigla di 2 lettere', "Seleziona l'indirizzo dall'elenco"])
		expect(messaggi({ provincia: 'MI1' })).toEqual(['La provincia è la sigla di 2 lettere', "Seleziona l'indirizzo dall'elenco"])
	})

	// The value the form keeps is the value that gets written, so the upper-casing has to survive the
	// parse and the padding must not reach the regex.
	it('trims and upper-cases the provincia', () => {
		expect(valore({ provincia: '  mi  ' }).provincia).toBe('MI')
	})
})

describe('dettaglioImprenditoreSchema — campi facoltativi', () => {
	it('trims the landline before measuring it', () => {
		expect(valore({ fisso: '  021234567  ' }).fisso).toBe('021234567')
	})

	it("caps the landline at the collection's length", () => {
		expect(messaggi({ fisso: '0'.repeat(13) })).toEqual(['Il fisso non può superare 12 caratteri'])
	})

	it('trims the onboarding step before measuring it', () => {
		expect(valore({ onboardingStep: '  12  ' }).onboardingStep).toBe('12')
	})

	it("caps the onboarding step at the collection's length", () => {
		expect(messaggi({ onboardingStep: '12345' })).toEqual(['Il passo onboarding non può superare 4 caratteri'])
	})
})

/*
 * ⚠️ The rule that makes the single address box safe — the punto vendita's, word for word, because the
 * card is the same one.
 *
 * The box is the only address input the card has; the four fields under it and the coordinate pair are
 * written by picking a geocoder answer and by nothing else. Free text left in the box would save the
 * *stored* street, CAP, comune and position under a line reading like some other address — a save that
 * reports success and writes none of what is on screen.
 *
 * One thing is only true here: an imprenditore's coordinates may legitimately be missing, so this rule
 * is also what guarantees that when the address does change, a point comes with it.
 */
describe('dettaglioImprenditoreSchema — indirizzo composto', () => {
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

	// The sigla is upper-cased by the schema, so the comparison sees `MI` however the box was filled —
	// which is what lets the geocoder's own `IT-mi` reach the form without the rule refusing the address
	// the operator picked out of the list a moment earlier.
	it('compares against the upper-cased sigla, not the one that was typed', () => {
		expect(messaggi({ provincia: '  mi  ' })).toEqual([])
	})
})

/*
 * ⚠️ Not the punto vendita's rule. There the pair is required, because the field is required on that
 * collection; here `position` was added as optional and nothing backfilled it, so *both boxes blank* is
 * the normal state of every imprenditore registered before it existed and has to keep saving.
 */
describe('dettaglioImprenditoreSchema — coordinate', () => {
	it('accepts an address with no point behind it at all', () => {
		expect(messaggi({ longitudine: '', latitudine: '' })).toEqual([])
	})

	// Blank passes both rules, so the pair of them is asserted through a value that is neither blank nor a
	// number: `Number('12,5')` is `NaN`, which is not finite and whose `Math.abs` is not `<= 90` either.
	it('refuses a box that holds something other than a number', () => {
		expect(messaggi({ latitudine: '12,5' })).toEqual(['La latitudine non è un numero', 'La latitudine è fuori da -90..90'])
	})

	// The poles and the antimeridian are on the map, so each bound includes its own limit — and the two
	// limits differ. A single ±180 rule for both lets through a latitude a `2dsphere` index cannot key.
	it('accepts each axis at its own limit and refuses the step past it', () => {
		expect(messaggi({ longitudine: '180', latitudine: '90' })).toEqual([])
		expect(messaggi({ longitudine: '-180', latitudine: '-90' })).toEqual([])
		expect(messaggi({ longitudine: '180.1' })).toEqual(['La longitudine è fuori da -180..180'])
		expect(messaggi({ latitudine: '90.1' })).toEqual(['La latitudine è fuori da -90..90'])
		expect(messaggi({ latitudine: '120' })).toEqual(['La latitudine è fuori da -90..90'])
	})

	it('trims the pair before reading it', () => {
		expect(valore({ longitudine: '  9.19  ' }).longitudine).toBe('9.19')
	})
})

describe('dettaglioImprenditoreSchema — note', () => {
	// Blank is a value and not a missing one: it is what `imprenditoreUpdateNote` reads as "remove the
	// note", so the field carries no `min` and an empty box has to parse.
	it('accepts an empty note', () => {
		expect(messaggi({ note: '' })).toEqual([])
	})

	it('trims the note before measuring it', () => {
		expect(valore({ note: '  memo  ' }).note).toBe('memo')
	})

	// The textarea carries the same number as a `maxLength`, and the service checks it again — this is the
	// pasted case, and the bound is the collection's.
	it("caps it at the collection's length", () => {
		expect(messaggi({ note: 'n'.repeat(2000) })).toEqual([])
		expect(messaggi({ note: 'n'.repeat(2001) })).toEqual(['La nota non può superare 2000 caratteri'])
	})
})
