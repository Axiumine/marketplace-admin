import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { RICERCA_DEBOUNCE_MS } from '@/components/ui/AddressField'
import { MAX_PWD_LENGTH } from '@/features/imprenditori/ImprenditoreAddForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import type { RispostaOsm } from '../../helpers/nominatim'
import { osmStub, risultatoOsm } from '../../helpers/nominatim'
import { renderRoute } from '../../helpers/render'

const AGGIUNGI = '/p/imprenditori/aggiungi-imprenditore'

const emptyTable = { ImprenditoriAttiviTbl: { data: { imprenditoriAttiviTbl: { total: 0, items: [] } } } }

/**
 * Every test stubs the geocoder as well as GraphQL.
 *
 * Filling the address box is typing, and typing is what the field debounces into a Nominatim request —
 * so a test that stubbed only GraphQL would have that request fall through to the operation queue and
 * throw as an unconfigured operation, in a test about something else entirely.
 */
const stubRete = (replies: GraphQLReplies, osm: RispostaOsm | readonly RispostaOsm[] = {}) => {
	const geocoder = osmStub(osm)
	return { ...stubGraphQL(replies, geocoder.rest), geocoder }
}

/** A form that passes every check. Individual tests override one field to exercise one rule. */
const VALIDO = {
	Email: 'mario@rossi.it',
	Password: 'password-lunga',
	'Ripeti password': 'password-lunga',
	Nome: 'Mario',
	Cognome: 'Rossi',
	'Data di nascita': '1980-06-15',
	Indirizzo: 'Via Roma 1',
	CAP: '20100',
	Comune: 'Milano',
	Provincia: 'MI',
	Cellulare: '3331234567',
	Fisso: '021234567',
	'Email di contatto': 'contatto@rossi.it'
}

const fillIn = async (override: Partial<Record<keyof typeof VALIDO, string>> = {}) => {
	for (const [label, value] of Object.entries({ ...VALIDO, ...override })) {
		const field = screen.getByLabelText(label)

		// `fireEvent` rather than `type`: several of these fields carry a `maxLength`, and a test for the
		// rule that rejects an over-long value cannot type past it. A date input takes a value the same
		// way — there is no typing into one.
		fireEvent.change(field, { target: { value } })
	}
}

const submit = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Crea imprenditore' }))
}

/**
 * The suggestion for `risultatoOsm()`, once the debounce has run out.
 *
 * Real timers, and a timeout wide enough to contain the wait: the geocoder's own tests fake the clock,
 * but this file drives the whole route through `userEvent`, and faking `setTimeout` under it means
 * teaching every click to advance the clock. One 700 ms wait in two tests is the cheaper trade.
 */
const suggerimentoOsm = (nome: string) => screen.findByRole('button', { name: nome }, { timeout: RICERCA_DEBOUNCE_MS + 2000 })

/**
 * The date the clock is pinned to wherever this file needs one.
 *
 * The form's date-of-birth field carries `max={dataMassimaNascita(new Date())}` — today less eighteen
 * years — so anything that reads the rendered markup reads the day it ran on. The snapshot below
 * recorded `2008-08-02` and then failed the next morning, on a working tree nobody had touched: not a
 * flake, a test that expires. Noon rather than midnight so the offset cannot walk the date over into
 * the neighbouring day on a machine that is not on UTC.
 */
const OGGI = '2026-08-02T12:00:00Z'

const fermaOrologio = () => {
	// Only `Date`. `setTimeout` stays real, or `userEvent` and `waitFor` never advance.
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date(OGGI))
}

// Restored here for every test that froze the clock, without a nested describe around each of them.
afterEach(() => {
	vi.useRealTimers()
})

/**
 * Only the create calls. A successful creation navigates to the table, which issues its own query — so
 * counting every request would make "sent once" fail for the reason the test is trying to confirm.
 */
const addCalls = (stub: { calls: readonly { operationName: string }[] }) =>
	stub.calls.filter((call) => call.operationName === 'ImprenditoreAdd')

/**
 * The only caller of `imprenditoreAdd` on the platform. Nothing else creates an imprenditore — there is
 * no signup — so every field the resolver requires has to be gathered here or an account cannot exist
 * at all; that is why the variables are asserted whole rather than sampled.
 */
describe('ImprenditoreAddForm', () => {
	it('renders', async () => {
		// The clock is frozen for the `max` on the date of birth, which is otherwise whatever day the suite
		// happens to run on — see `OGGI`.
		fermaOrologio()
		stubRete({})
		await renderRoute(AGGIUNGI)

		expect(screen.getByRole('main')).toMatchSnapshot()
	})

	// ⚠️ Not covered by the snapshot above, and that is the point: `Toast` renders into a stack appended to
	// the body, outside `main` entirely, so a form that opened with an error message standing over it would
	// leave that snapshot untouched. A blank form has failed at nothing and must say nothing.
	it('opens with no error message over it', async () => {
		stubRete({})
		await renderRoute(AGGIUNGI)

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	/**
	 * The login email and the contact email are separate fields because the backend keeps them in
	 * separate places: `login.email` is the credential and carries the unique index, `contatti.email` is
	 * where the shop is written to. They are usually the same and the form does not assume it.
	 */
	it('sends the whole imprenditore, nested the way the input type is', async () => {
		const stub = stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		await renderRoute(AGGIUNGI)

		await fillIn()
		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
		expect(stub.calls[0]?.url).toBe(ENDPOINT.adminResource)
		expect(stub.calls[0]?.variables).toEqual({
			login: { email: 'mario@rossi.it', password: 'password-lunga' },
			anagrafica: {
				nome: 'Mario',
				cognome: 'Rossi',
				nascita: { data: '1980-06-15' },
				indirizzo: { indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano', provincia: 'MI' },
				contatti: { cellulare: '3331234567', fisso: '021234567', email: 'contatto@rossi.it' }
			}
		})
	})

	it('lands on the table once the imprenditore exists', async () => {
		stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		const { router } = await renderRoute(AGGIUNGI)

		await fillIn()
		await submit()

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/p/imprenditori/gestione-imprenditori')
		})
	})

	// `fisso` is the one nullable field on the input. An empty box means "not given"; sending `''` would
	// store a landline number of no digits, which then renders as an empty cell on the detail page.
	it('sends an empty landline as null, not as an empty string', async () => {
		const stub = stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		await renderRoute(AGGIUNGI)

		await fillIn({ Fisso: '' })
		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
		expect((stub.calls[0]?.variables.anagrafica as { contatti: { fisso: string | null } }).contatti.fisso).toBeNull()
	})

	// The collection's `$jsonSchema` wants the two-letter code upper-case. Correcting it here costs
	// nothing; refusing it would be pedantry, and sending it lower-case is a validation error 200 ms later.
	it('upper-cases the province before sending it', async () => {
		const stub = stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		await renderRoute(AGGIUNGI)

		await fillIn({ Provincia: 'mi' })
		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
		expect((stub.calls[0]?.variables.anagrafica as { indirizzo: { provincia: string } }).indirizzo.provincia).toBe('MI')
	})

	/*
	 * The two trimming rules, each proved by a value that is *only* valid once trimmed. Padding is what a
	 * paste out of a spreadsheet cell or a PDF leaves behind, and it is invisible in the box.
	 *
	 * A province of `' mi '` is four characters and fails the two-letter rule unless the trim runs first,
	 * so the assertion is that the form submits at all — and submits the code the backend will accept.
	 */
	it('trims the province before checking and sending it', async () => {
		const stub = stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		await renderRoute(AGGIUNGI)

		await fillIn({ Provincia: ' mi ' })
		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
		expect((stub.calls[0]?.variables.anagrafica as { indirizzo: { provincia: string } }).indirizzo.provincia).toBe('MI')
	})

	// `fisso` has no format rule to fail, so an untrimmed landline is accepted and stored with its
	// padding — where it stays until someone tries to match it against a number typed by hand.
	it('trims the landline before sending it', async () => {
		const stub = stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		await renderRoute(AGGIUNGI)

		await fillIn({ Fisso: '  021234567  ' })
		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
		expect((stub.calls[0]?.variables.anagrafica as { contatti: { fisso: string } }).contatti.fisso).toBe('021234567')
	})

	it.each([
		// `mario@rossi`, not `mario@`: the field is `type="email"`, so a value with no domain at all fails
		// the browser's own check and the form never submits — there is nothing of this app's to assert.
		// A missing TLD is the gap between the two validators, and the branch that belongs to zod.
		['Email', 'mario@rossi', 'Inserisci un indirizzo email valido'],
		['Password', 'corta', 'La password deve avere almeno 10 caratteri'],
		['Nome', '   ', 'Il nome è obbligatorio'],
		['Cognome', '', 'Il cognome è obbligatorio'],
		['Data di nascita', '', 'Inserisci una data di nascita valida'],
		['Indirizzo', '', "L'indirizzo è obbligatorio"],
		['CAP', '2010', 'Il CAP deve essere di 5 cifre'],
		['Comune', '', 'Il comune è obbligatorio'],
		['Provincia', 'M', 'La provincia è la sigla di 2 lettere'],
		['Cellulare', '', 'Il cellulare è obbligatorio'],
		['Email di contatto', 'contatto@rossi', 'Inserisci un indirizzo email di contatto valido']
	])('refuses a bad %s without a round-trip', async (label, value, message) => {
		const stub = stubRete({})
		await renderRoute(AGGIUNGI)

		await fillIn({ [label]: value })
		await submit()

		expect(await screen.findByText(message)).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// 72 is where bcrypt truncates, so a longer password has a silent suffix that is not part of it. The
	// input caps typing at 72; a password manager fills the field programmatically and does not.
	it('refuses a password past the bcrypt truncation point', async () => {
		const stub = stubRete({})
		await renderRoute(AGGIUNGI)

		await fillIn({ Password: 'x'.repeat(MAX_PWD_LENGTH + 1) })
		await submit()

		expect(await screen.findByText('La password non può superare 72 caratteri')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// A CAP of five letters is five characters and not a postcode. The regex is digits, and the test
	// exists because `.length === 5` is the mistake it is easy to make.
	it('refuses a five-character CAP that is not five digits', async () => {
		const stub = stubRete({})
		await renderRoute(AGGIUNGI)

		await fillIn({ CAP: 'abcde' })
		await submit()

		expect(await screen.findByText('Il CAP deve essere di 5 cifre')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	/*
	 * Both rules are anchored at both ends, and each anchor is tested with a value the *other* anchor
	 * would already have caught — `20100x` is only rejected by the `$`, `x20100` only by the `^`.
	 *
	 * An unanchored regex is a substring search, so `/\d{5}/` would accept a whole address line that
	 * happens to contain a postcode. The `maxLength` on the box is no defence: it caps typing and does
	 * nothing to a paste or to an autofill, which is where a value like this comes from.
	 */
	it.each([
		['CAP', '20100x', 'Il CAP deve essere di 5 cifre'],
		['CAP', 'x20100', 'Il CAP deve essere di 5 cifre'],
		['Provincia', 'MIX', 'La provincia è la sigla di 2 lettere'],
		['Provincia', 'XMI', 'La provincia è la sigla di 2 lettere']
	])('refuses %s with anything around it: %s', async (label, value, message) => {
		const stub = stubRete({})
		await renderRoute(AGGIUNGI)

		await fillIn({ [label]: value })
		await submit()

		expect(await screen.findByText(message)).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('reports the backend error and stays on the form', async () => {
		stubRete({
			ImprenditoreAdd: {
				errors: [graphQLError('Email già registrata', "L'indirizzo è già in uso", 412)],
				status: 412
			}
		})
		const { router } = await renderRoute(AGGIUNGI)

		await fillIn()
		await submit()

		expect(await screen.findByRole('alert')).toHaveTextContent("L'indirizzo è già in uso")
		expect(router.state.location.pathname).toBe(AGGIUNGI)
		// Nothing typed is thrown away: twelve fields is a lot to re-enter because one of them collided.
		expect(screen.getByLabelText('Nome')).toHaveValue('Mario')
	})

	/*
	 * The repeat box, which exists because the password is typed blind and is never seen again: a typo in
	 * it creates an account nobody can sign into, and the only cure is an operator resetting it by hand.
	 *
	 * The error is reported under the repeat, not under the password. Both values are equally "wrong" to
	 * a comparison, and the one the operator meant is almost always the first.
	 */
	it('refuses two passwords that do not match', async () => {
		const stub = stubRete({})
		await renderRoute(AGGIUNGI)

		await fillIn({ 'Ripeti password': 'password-diversa' })
		await submit()

		expect(await screen.findByText('Le due password non coincidono')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('sends the password once the repeat agrees with it', async () => {
		const stub = stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		await renderRoute(AGGIUNGI)

		await fillIn()
		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables.login).toEqual({ email: 'mario@rossi.it', password: 'password-lunga' })
	})

	/*
	 * An imprenditore signs contracts, so the platform has no under-18 accounts — and the backend does not
	 * check, which makes the form the only gate there is.
	 *
	 * The gate is two layers, and this is the outer one: the box carries the limit as a `max`, so the
	 * picker will not open past it and a date typed past it is a `rangeOverflow` the browser refuses
	 * before any resolver runs. That is why nothing is asserted about an error message here — there is
	 * none to read. The zod half is asserted in `imprenditoreSchema.test.ts`, where it is reachable.
	 *
	 * The clock is fixed for these two because the rule is a boundary and a boundary needs a known
	 * "today" — the same `OGGI` the snapshot is pinned to.
	 */
	it('will not submit a date of birth the calendar puts out of range', async () => {
		fermaOrologio()
		const stub = stubRete({})
		await renderRoute(AGGIUNGI)

		const nascita = screen.getByLabelText<HTMLInputElement>('Data di nascita')
		expect(nascita).toHaveAttribute('max', '2008-08-02')

		await fillIn({ 'Data di nascita': '2008-08-03' })
		await submit()

		expect(nascita.validity.rangeOverflow).toBe(true)
		expect(stub.calls).toHaveLength(0)
	})

	// Majority is reached *on* the eighteenth birthday, so the day itself goes through — the limit is the
	// last accepted date and not the first rejected one.
	it('accepts someone who turns eighteen today', async () => {
		fermaOrologio()
		const stub = stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable })
		await renderRoute(AGGIUNGI)

		await fillIn({ 'Data di nascita': '2008-08-02' })
		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
	})

	/*
	 * The OpenStreetMap side, end to end: what is typed is geocoded, and picking one answer fills all four
	 * address fields from it rather than leaving three of them to be typed again by hand.
	 *
	 * Asserting the submitted variables and not only the boxes is the point — the four fields exist to be
	 * sent, and a geocoded address that lands in the DOM but not in the mutation is the failure worth
	 * catching.
	 */
	it('fills the whole address from one OpenStreetMap answer', async () => {
		const stub = stubRete(
			{ ImprenditoreAdd: { data: { imprenditoreAdd: true } }, ...emptyTable },
			{ risultati: [risultatoOsm()] }
		)
		await renderRoute(AGGIUNGI)

		await fillIn({ Indirizzo: 'via roma milano', CAP: '', Comune: '', Provincia: '' })
		fireEvent.click(await suggerimentoOsm('Via Roma, 1, Milano, MI, 20121, Italia'))

		expect(screen.getByLabelText('Indirizzo')).toHaveValue('Via Roma 1')
		expect(screen.getByLabelText('CAP')).toHaveValue('20121')
		expect(screen.getByLabelText('Comune')).toHaveValue('Milano')
		expect(screen.getByLabelText('Provincia')).toHaveValue('MI')

		await submit()

		await waitFor(() => {
			expect(addCalls(stub)).toHaveLength(1)
		})
		expect((stub.calls[0]?.variables.anagrafica as { indirizzo: unknown }).indirizzo).toEqual({
			indirizzo: 'Via Roma 1',
			cap: '20121',
			comune: 'Milano',
			provincia: 'MI'
		})
	})

	/*
	 * Not every point OpenStreetMap can find is an address. A bridge, a hamlet, a motorway junction —
	 * they match a search and answer with no street and no CAP, and the form fills four boxes with
	 * nothing.
	 *
	 * Saying so at the pick rather than at submit is the difference between one correction and a form
	 * that looked accepted until the operator pressed the button.
	 */
	it('says at once when the picked point is not a street address', async () => {
		stubRete({}, { risultati: [risultatoOsm({ address: undefined, display_name: 'Ponte sul Ticino, Pavia, Italia' })] })
		await renderRoute(AGGIUNGI)

		fireEvent.change(screen.getByLabelText('Indirizzo'), { target: { value: 'ponte ticino' } })
		fireEvent.click(await suggerimentoOsm('Ponte sul Ticino, Pavia, Italia'))

		expect(await screen.findByText("L'indirizzo è obbligatorio")).toBeInTheDocument()
		expect(screen.getByText('Il CAP deve essere di 5 cifre')).toBeInTheDocument()
		expect(screen.getByText('Il comune è obbligatorio')).toBeInTheDocument()
		expect(screen.getByText('La provincia è la sigla di 2 lettere')).toBeInTheDocument()
	})

	// A pick is a correction, and a correction that leaves the old red text under the boxes reads as
	// rejected. All four are re-checked as they are written, which is also what says out loud that OSM
	// answered without a CAP when it does.
	it('clears the address errors a failed submit left behind', async () => {
		stubRete({}, { risultati: [risultatoOsm()] })
		await renderRoute(AGGIUNGI)

		await submit()
		expect(await screen.findByText("L'indirizzo è obbligatorio")).toBeInTheDocument()
		expect(screen.getByText('Il CAP deve essere di 5 cifre')).toBeInTheDocument()
		expect(screen.getByText('Il comune è obbligatorio')).toBeInTheDocument()
		expect(screen.getByText('La provincia è la sigla di 2 lettere')).toBeInTheDocument()

		fireEvent.change(screen.getByLabelText('Indirizzo'), { target: { value: 'via roma milano' } })
		fireEvent.click(await suggerimentoOsm('Via Roma, 1, Milano, MI, 20121, Italia'))

		await waitFor(() => {
			expect(screen.queryByText("L'indirizzo è obbligatorio")).not.toBeInTheDocument()
		})
		expect(screen.queryByText('Il CAP deve essere di 5 cifre')).not.toBeInTheDocument()
		expect(screen.queryByText('Il comune è obbligatorio')).not.toBeInTheDocument()
		expect(screen.queryByText('La provincia è la sigla di 2 lettere')).not.toBeInTheDocument()
	})

	// `false` with no error is the backend refusing without saying why. Navigating away would announce a
	// creation that did not happen, and the table would be the proof — without the new row in it.
	it('stays on the form when the mutation answers false', async () => {
		stubRete({ ImprenditoreAdd: { data: { imprenditoreAdd: false } } })
		const { router } = await renderRoute(AGGIUNGI)

		await fillIn()
		await submit()

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Crea imprenditore' })).toBeEnabled()
		})
		expect(router.state.location.pathname).toBe(AGGIUNGI)
	})
})
