import type { FieldErrors } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { messaggiDaCorreggere } from '@/lib/erroriForm'

/**
 * react-hook-form's own error shape, minus the `ref` and the `type` a real one also carries: neither is
 * read here, and a DOM node in a fixture would only suggest one is.
 *
 * `as unknown as FieldErrors` because `FieldErrors` is the untyped form's error map — a mapped type over
 * `Record<string, any>` that resolves to nothing concrete, and so has nothing in common with an object
 * literal. The same assertion the source file has to make.
 */
const errori = (albero: Record<string, unknown>): FieldErrors => albero as unknown as FieldErrors

describe('messaggiDaCorreggere', () => {
	it('is empty for a form with nothing wrong', () => {
		expect(messaggiDaCorreggere(errori({}))).toEqual([])
	})

	it('reads the message off a top-level field', () => {
		expect(messaggiDaCorreggere(errori({ nome: { message: 'Il nome è obbligatorio' } }))).toEqual(['Il nome è obbligatorio'])
	})

	// One line per box, in the order react-hook-form stores them — the toast is read top to bottom beside
	// a form that is read the same way.
	it('lists every field that is wrong', () => {
		const albero = { nome: { message: 'Il nome è obbligatorio' }, pec: { message: 'La PEC non è un indirizzo valido' } }

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Il nome è obbligatorio', 'La PEC non è un indirizzo valido'])
	})

	// A field array puts its rows under numeric keys, and the row's own fields under those: a walk that
	// stopped at the top level would refuse the save over a box it never named.
	it('descends into a field array', () => {
		const albero = {
			orari: [{ giorno: { message: 'Il giorno è obbligatorio' } }, { da: { message: "L'apertura è obbligatoria" } }]
		}

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Il giorno è obbligatorio', "L'apertura è obbligatoria"])
	})

	// The rows of a field array are sparse — react-hook-form leaves a hole where a row is fine — and an
	// object is the only thing that can carry a message.
	it('walks past the holes and the values that are not objects', () => {
		const albero = { orari: [undefined, null, 'rotto', { giorno: { message: 'Il giorno è obbligatorio' } }] }

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Il giorno è obbligatorio'])
	})

	// The array-level rule is the one that describes the problem; repeating the rows' messages under it
	// would say the same thing twice in different words.
	it('stops at a node that has a message of its own', () => {
		const albero = {
			orari: Object.assign([{ giorno: { message: 'Il giorno è obbligatorio' } }], { message: 'Serve almeno un orario' })
		}

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Serve almeno un orario'])
	})

	// Two rows refused for the same reason are one sentence, not two: a toast that says "il campo è
	// obbligatorio" three times says nothing three times.
	it('says the same sentence once', () => {
		const albero = {
			orari: [{ giorno: { message: 'Il giorno è obbligatorio' } }, { giorno: { message: 'Il giorno è obbligatorio' } }]
		}

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Il giorno è obbligatorio'])
	})

	/*
	 * ⚠️ The address is one line however many of its seven fields are wrong, and it is `erroreIndirizzo`
	 * that decides which one — six of the seven have no input of their own, so a list naming them would
	 * send the operator looking for boxes that are not on screen.
	 *
	 * Two of them are wrong here on purpose: the CAP is the one reported, and the provincia's own message
	 * has to be absent rather than merely second.
	 */
	it('collapses the whole address to a single line', () => {
		const albero = {
			cap: { message: 'Il CAP deve essere di 5 cifre' },
			provincia: { message: 'La provincia è la sigla di 2 lettere' }
		}

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Il CAP deve essere di 5 cifre'])
	})

	// The composite rule fires together with whichever field broke it, and it is reported last for the
	// reason written on `erroreIndirizzo`: "seleziona l'indirizzo dall'elenco" under an address that was
	// selected, and whose CAP is the problem, sends the operator back to the list for nothing.
	it('reports the broken field rather than the composite rule that broke with it', () => {
		const albero = {
			cap: { message: 'Il CAP deve essere di 5 cifre' },
			indirizzoCompleto: { message: "Seleziona l'indirizzo dall'elenco" }
		}

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Il CAP deve essere di 5 cifre'])
	})

	// The address line comes first, and the fields the operator can actually see follow it.
	it('puts the address ahead of the rest', () => {
		const albero = { nome: { message: 'Il nome è obbligatorio' }, cap: { message: 'Il CAP deve essere di 5 cifre' } }

		expect(messaggiDaCorreggere(errori(albero))).toEqual(['Il CAP deve essere di 5 cifre', 'Il nome è obbligatorio'])
	})
})
