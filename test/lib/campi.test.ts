import { describe, expect, it } from 'vitest'

import { coordinata, INDIRIZZO_VUOTO } from '@/lib/campi'

/*
 * The rules themselves are exercised through the two forms that use them — that is where a message
 * reaches an operator, and where a wrong bound is a wrong bound. What is here is the part no form can
 * show: a coordinate has no input of its own, so the only way to state what these answer for a value
 * nobody can type is to hand it over directly.
 */
describe('coordinata', () => {
	const longitudine = coordinata('La longitudine', 180)

	it('takes a number inside its bound', () => {
		expect(longitudine.parse('9.19')).toBe('9.19')
	})

	// The trim is the rule, not a tidy-up: `Number('   ')` is `0`, so a box holding nothing but spaces
	// would otherwise validate as the prime meridian and be written as a position the operator never
	// picked.
	it('refuses a box holding only spaces', () => {
		const esito = longitudine.safeParse('   ')

		expect(esito.success).toBe(false)
		expect(esito.error?.issues[0]?.message).toBe('La longitudine deve essere un numero')
	})

	it('refuses a value outside its bound', () => {
		expect(longitudine.safeParse('181').error?.issues[0]?.message).toBe('La longitudine è fuori da -180..180')
	})
})

/*
 * The seven strings a blank address card starts on. Five of them have no input, and the message the box
 * shows is the first error of the seven whatever the other six hold — so an empty `cap` and a `cap`
 * holding a sentence look identical through the form. Stated here instead.
 */
describe('INDIRIZZO_VUOTO', () => {
	it('is every address field empty, and nothing else', () => {
		expect(INDIRIZZO_VUOTO).toEqual({
			indirizzoCompleto: '',
			indirizzo: '',
			cap: '',
			comune: '',
			provincia: '',
			longitudine: '',
			latitudine: ''
		})
	})
})
