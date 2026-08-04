import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The detail page's write schema, asserted directly instead of through the form.
 *
 * Every rule here is the last thing that runs before a value is put on the wire — `save()` parses with
 * this schema and sends what comes out, not what is in the boxes — so the transforms are as much a part
 * of the payload as the messages are a part of the page. Driving the form to reach them costs a click
 * per row and cannot reach half of them at all: a `maxLength` on the box means the over-length case
 * never arrives from a keyboard, and a `type="date"` refuses a malformed date before React sees it.
 *
 * ⚠️ The schema is built at module scope, so it is imported **inside** `beforeEach` and not at the top
 * of this file. A top-level import evaluates it once, before Stryker activates the mutant for the test
 * about to run, and every rule on it then reads as untested however hard this file asserts.
 */
type Modulo = typeof import('@/features/shopOwners/ShopOwnerPersonalData')

let shopOwnerDetailSchema: Modulo['shopOwnerDetailSchema']

beforeEach(async () => {
	vi.resetModules()
	;({ shopOwnerDetailSchema } = await import('@/features/shopOwners/ShopOwnerPersonalData'))
})

afterEach(() => {
	vi.useRealTimers()
})

// The age boundary is read from the clock at parse time, so a test that names it has to own the clock.
// Only `Date` is faked: nothing here waits on a timer, and faking `setTimeout` would only give the suite
// a way to hang.
const today = (day: string) => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date(day))
}

const VALID = {
	emailLogin: 'mario@rossi.it',
	firstName: 'Mario',
	lastName: 'Rossi',
	birthDate: '1980-06-15',
	// The composite rule at the bottom of the schema compares this line against the four fields under it,
	// so the two have to agree in the baseline or every single test would fail on the address.
	addressComplete: 'Via Roma 1, 20100 Milano (MI)',
	street: 'Via Roma 1',
	postalCode: '20100',
	city: 'Milano',
	province: 'MI',
	longitude: '9.19',
	latitude: '45.4642',
	mobile: '3331234567',
	landline: '021234567',
	contactEmail: 'contatto@rossi.it',
	disabled: false,
	waitApprov: false,
	rememberMe: false,
	onboardingDone: false,
	onboardingStep: '3',
	notes: ''
}

/** A syntactically valid address of 254 characters — long enough for the cap, short enough to exist. */
const EMAIL_TOO_LONG = `${'a'.repeat(245)}@rossi.it`

const outcome = (patch: Record<string, unknown> = {}) => shopOwnerDetailSchema.safeParse({ ...VALID, ...patch })

const messages = (patch: Record<string, unknown> = {}) => {
	const result = outcome(patch)
	return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

/** The parsed payload. Throws with the refusals attached, because a silent `undefined` reads as a null assertion. */
const value = (patch: Record<string, unknown>) => {
	const result = outcome(patch)
	if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join(' / '))
	return result.data
}

describe('shopOwnerDetailSchema — fields obbligatori', () => {
	it('accepts a row that came back from the collection unchanged', () => {
		expect(messages()).toEqual([])
	})

	/*
	 * The two address fields answer twice: a field that is wrong is also a field the composed line no
	 * longer spells out, and the rule at the bottom of the schema says so. Both are true, and the card
	 * shows the field's own message first — see the order `addressError` reads them in.
	 */
	it('names the field that was emptied', () => {
		expect(messages({ firstName: '   ' })).toEqual(['First name is required'])
		expect(messages({ lastName: '' })).toEqual(['Last name is required'])
		expect(messages({ address: '' })).toEqual(["Address is required", "Select the address from the list"])
		expect(messages({ city: '' })).toEqual(['City is required', "Select the address from the list"])
		expect(messages({ mobile: '' })).toEqual(['Mobile is required'])
	})

	/*
	 * The box carries the same number as a `maxLength`, so this case cannot be typed — but it can be
	 * pasted past a client that renders no `maxLength` at all, and the bound is the collection's.
	 */
	it('names the cap it exceeded', () => {
		expect(messages({ firstName: 'M'.repeat(101) })).toEqual(['First name cannot exceed 100 characters'])
		expect(messages({ lastName: 'R'.repeat(101) })).toEqual(['Last name cannot exceed 100 characters'])
		// ⚠️ 250 here and 100 on the shop — same field name, same fragment, two collections.
		expect(messages({ address: 'V'.repeat(251) })).toEqual([
			"Address cannot exceed 250 characters",
			"Select the address from the list"
		])
		expect(messages({ city: 'M'.repeat(101) })).toEqual([
			'City cannot exceed 100 characters',
			"Select the address from the list"
		])
		expect(messages({ mobile: '3'.repeat(13) })).toEqual(['Mobile cannot exceed 12 characters'])
	})
})

describe('shopOwnerDetailSchema — email', () => {
	// Two addresses, two messages: the operator has to know which of the two boxes to go back to, and
	// they usually hold the same string.
	it('tells the login address apart from the contact one', () => {
		expect(messages({ emailLogin: 'mario@rossi' })).toEqual(['Enter a valid login email address'])
		expect(messages({ contactEmail: 'contatto@rossi' })).toEqual(['Enter a valid contact email address'])
	})

	it("caps both at the collection's length", () => {
		expect(messages({ emailLogin: EMAIL_TOO_LONG })).toEqual(["L'email di accesso cannot exceed 250 characters"])
		expect(messages({ contactEmail: EMAIL_TOO_LONG })).toEqual(["L'email di contatto cannot exceed 250 characters"])
	})
})

describe('shopOwnerDetailSchema — data di birth', () => {
	it('refuses a date the calendar does not spell', () => {
		expect(messages({ birthDate: '15/06/1980' })).toEqual(['Enter a valid date of birth'])
	})

	it('refuses someone who turns eighteen tomorrow', () => {
		today('2026-08-02T12:00:00Z')

		expect(messages({ birthDate: '2008-08-03' })).toEqual(["The shop owner must be of age (at least 18)"])
	})

	it('accepts someone who turns eighteen today', () => {
		today('2026-08-02T12:00:00Z')

		expect(messages({ birthDate: '2008-08-02' })).toEqual([])
	})
})

describe('shopOwnerDetailSchema — CAP e province', () => {
	/*
	 * Both ends of the CAP are asserted because both ends are anchors: dropping either one turns "five
	 * digits" into "five digits somewhere in there", and `A20100` is a postcode the collection refuses
	 * after the page approved it.
	 */
	it('refuses a CAP with anything either side of the five digits', () => {
		expect(messages({ postalCode: 'a12345' })).toEqual(['The postal code must be 5 digits', "Select the address from the list"])
		expect(messages({ postalCode: '12345a' })).toEqual(['The postal code must be 5 digits', "Select the address from the list"])
		expect(messages({ postalCode: '1234' })).toEqual(['The postal code must be 5 digits', "Select the address from the list"])
	})

	it('refuses a province with anything either side of the two letters', () => {
		expect(messages({ province: '1MI' })).toEqual(['The province is the 2-letter code', "Select the address from the list"])
		expect(messages({ province: 'MI1' })).toEqual(['The province is the 2-letter code', "Select the address from the list"])
	})

	// The value the form keeps is the value that gets written, so the upper-casing has to survive the
	// parse and the padding must not reach the regex.
	it('trims and upper-cases the province', () => {
		expect(value({ province: '  mi  ' }).province).toBe('MI')
	})
})

describe('shopOwnerDetailSchema — fields facoltativi', () => {
	it('trims the landline before measuring it', () => {
		expect(value({ landline: '  021234567  ' }).landline).toBe('021234567')
	})

	it("caps the landline at the collection's length", () => {
		expect(messages({ landline: '0'.repeat(13) })).toEqual(['The landline cannot exceed 12 characters'])
	})

	it('trims the onboarding step before measuring it', () => {
		expect(value({ onboardingStep: '  12  ' }).onboardingStep).toBe('12')
	})

	it("caps the onboarding step at the collection's length", () => {
		expect(messages({ onboardingStep: '12345' })).toEqual(['Il passo onboarding cannot exceed 4 characters'])
	})
})

/*
 * ⚠️ The rule that makes the single address box safe — the shop's, word for word, because the
 * card is the same one.
 *
 * The box is the only address input the card has; the four fields under it and the coordinate pair are
 * written by picking a geocoder answer and by nothing else. Free text left in the box would save the
 * *stored* street, CAP, city and position under a line reading like some other address — a save that
 * reports success and writes none of what is on screen.
 *
 * One thing is only true here: an shopOwner's coordinates may legitimately be missing, so this rule
 * is also what guarantees that when the address does change, a point comes with it.
 */
describe('shopOwnerDetailSchema — address composto', () => {
	it('refuses a line that is not the address the fields under it spell out', () => {
		expect(messages({ addressComplete: 'Via Roma 2, 20100 Milano (MI)' })).toEqual(["Select the address from the list"])
		expect(messages({ addressComplete: 'Via Roma 1' })).toEqual(["Select the address from the list"])
		expect(messages({ addressComplete: '' })).toEqual(["Select the address from the list"])
	})

	// Whichever of the four moved, the line stops matching — the rule is the whole address and not the
	// street half of it.
	it('refuses a line left behind by any one of the four fields', () => {
		expect(messages({ postalCode: '20121' })).toEqual(["Select the address from the list"])
		expect(messages({ city: 'Roma' })).toEqual(["Select the address from the list"])
		expect(messages({ province: 'RM' })).toEqual(["Select the address from the list"])
	})

	// It is reported on the box, because the box is where the operator can do something about it: the
	// four fields it is really about have no input on the page at all.
	it('reports it on the box and not on a field with no input', () => {
		const result = outcome({ addressComplete: 'Via Roma 2, 20100 Milano (MI)' })

		expect(result.success).toBe(false)
		expect(result.error?.issues.map((issue) => issue.path)).toEqual([['addressComplete']])
	})

	// The sigla is upper-cased by the schema, so the comparison sees `MI` however the box was filled —
	// which is what lets the geocoder's own `IT-mi` reach the form without the rule refusing the address
	// the operator picked out of the list a moment earlier.
	it('compares against the upper-cased province code, not the one that was typed', () => {
		expect(messages({ province: '  mi  ' })).toEqual([])
	})
})

/*
 * ⚠️ Not the shop's rule. There the pair is required, because the field is required on that
 * collection; here `position` was added as optional and nothing backfilled it, so *both boxes blank* is
 * the normal state of every shopOwner registered before it existed and has to keep saving.
 */
describe('shopOwnerDetailSchema — coordinate', () => {
	it('accepts an address with no point behind it at all', () => {
		expect(messages({ longitude: '', latitude: '' })).toEqual([])
	})

	// Blank passes both rules, so the pair of them is asserted through a value that is neither blank nor a
	// number: `Number('12,5')` is `NaN`, which is not finite and whose `Math.abs` is not `<= 90` either.
	it('refuses a box that holds something other than a number', () => {
		expect(messages({ latitude: '12,5' })).toEqual(['Latitude is not a number', 'Latitude is outside -90..90'])
	})

	// The poles and the antimeridian are on the map, so each bound includes its own limit — and the two
	// limits differ. A single ±180 rule for both lets through a latitude a `2dsphere` index cannot key.
	it('accepts each axis at its own limit and refuses the step past it', () => {
		expect(messages({ longitude: '180', latitude: '90' })).toEqual([])
		expect(messages({ longitude: '-180', latitude: '-90' })).toEqual([])
		expect(messages({ longitude: '180.1' })).toEqual(['Longitude is outside -180..180'])
		expect(messages({ latitude: '90.1' })).toEqual(['Latitude is outside -90..90'])
		expect(messages({ latitude: '120' })).toEqual(['Latitude is outside -90..90'])
	})

	it('trims the pair before reading it', () => {
		expect(value({ longitude: '  9.19  ' }).longitude).toBe('9.19')
	})
})

describe('shopOwnerDetailSchema — note', () => {
	// Blank is a value and not a missing one: it is what `shopOwnerUpdateNote` reads as "remove the
	// note", so the field carries no `min` and an empty box has to parse.
	it('accepts an empty note', () => {
		expect(messages({ notes: '' })).toEqual([])
	})

	it('trims the note before measuring it', () => {
		expect(value({ notes: '  memo  ' }).notes).toBe('memo')
	})

	// The textarea carries the same number as a `maxLength`, and the service checks it again — this is the
	// pasted case, and the bound is the collection's.
	it("caps it at the collection's length", () => {
		expect(messages({ notes: 'n'.repeat(2000) })).toEqual([])
		expect(messages({ notes: 'n'.repeat(2001) })).toEqual(['The notes cannot exceed 2000 characters'])
	})
})
