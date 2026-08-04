import { afterEach, describe, expect, it, vi } from 'vitest'

import { imprenditoreSchema } from '@/features/imprenditori/ImprenditoreAddForm'

/**
 * The age rule, asserted on the schema rather than through the form.
 *
 * The date box carries the same limit as a `max`, so a browser — jsdom included — refuses an
 * out-of-range date as a `rangeOverflow` and never submits: driving the form can prove the picker stops
 * there, but never that the resolver would have. This is the layer that decides what is sent, and a
 * `max` is a hint any client that does not render one is free to ignore.
 */
const VALIDO = {
	email: 'mario@rossi.it',
	password: 'password-lunga',
	confermaPassword: 'password-lunga',
	nome: 'Mario',
	cognome: 'Rossi',
	dataNascita: '1980-06-15',
	indirizzo: 'Via Roma 1',
	cap: '20100',
	comune: 'Milano',
	provincia: 'MI',
	cellulare: '3331234567',
	fisso: '021234567',
	contattoEmail: 'contatto@rossi.it'
}

const messaggi = (dataNascita: string) => {
	const esito = imprenditoreSchema.safeParse({ ...VALIDO, dataNascita })
	return esito.success ? [] : esito.error.issues.map((issue) => issue.message)
}

// The boundary needs a known "today", so the clock is fixed. Only `Date` is faked — nothing here waits
// on a timer, and faking `setTimeout` would only give the suite a way to hang.
afterEach(() => {
	vi.useRealTimers()
})

const oggi = (giorno: string) => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date(giorno))
}

describe('imprenditoreSchema — data di nascita', () => {
	it('refuses someone who turns eighteen tomorrow', () => {
		oggi('2026-08-02T12:00:00Z')

		expect(messaggi('2008-08-03')).toEqual(["L'imprenditore deve essere maggiorenne (almeno 18 anni)"])
	})

	it('accepts someone who turns eighteen today', () => {
		oggi('2026-08-02T12:00:00Z')

		expect(messaggi('2008-08-02')).toEqual([])
	})

	/*
	 * The boundary is read from the clock at validation time, not captured when the module loaded.
	 *
	 * An operator's panel stays open for days. With a constant, the one working past midnight would be
	 * refused a date the calendar in front of them still offers — the same value, accepted an hour
	 * earlier and rejected now, with an error naming an age that does not match the birthday.
	 */
	it('moves the boundary with the day', () => {
		oggi('2026-08-02T12:00:00Z')
		expect(messaggi('2008-08-03')).toHaveLength(1)

		oggi('2026-08-03T12:00:00Z')
		expect(messaggi('2008-08-03')).toEqual([])
	})

	it('says the date is malformed before it says anything about age', () => {
		oggi('2026-08-02T12:00:00Z')

		expect(messaggi('02/08/2008')).toEqual(['Inserisci una data di nascita valida'])
	})
})
