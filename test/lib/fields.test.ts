import { describe, expect, it } from 'vitest'

import { coordinate, EMPTY_ADDRESS } from '@/lib/fields'

/*
 * The rules themselves are exercised through the two forms that use them — that is where a message
 * reaches an operator, and where a wrong bound is a wrong bound. What is here is the part no form can
 * show: a coordinate has no input of its own, so the only way to state what these answer for a value
 * nobody can type is to hand it over directly.
 */
describe('coordinate', () => {
	const longitude = coordinate('Longitude', 180)

	it('takes a number inside its bound', () => {
		expect(longitude.parse('9.19')).toBe('9.19')
	})

	// The trim is the rule, not a tidy-up: `Number('   ')` is `0`, so a box holding nothing but spaces
	// would otherwise validate as the prime meridian and be written as a position the operator never
	// picked.
	it('refuses a box holding only spaces', () => {
		const outcome = longitude.safeParse('   ')

		expect(outcome.success).toBe(false)
		expect(outcome.error?.issues[0]?.message).toBe('Longitude must be a number')
	})

	it('refuses a value outside its bound', () => {
		expect(longitude.safeParse('181').error?.issues[0]?.message).toBe('Longitude is outside -180..180')
	})
})

/*
 * The seven strings a blank address card starts on. Five of them have no input, and the message the box
 * shows is the first error of the seven whatever the other six hold — so an empty `postalCode` and a `postalCode`
 * holding a sentence look identical through the form. Stated here instead.
 */
describe('ADDRESS_VUOTO', () => {
	it('is every address field empty, and nothing else', () => {
		expect(EMPTY_ADDRESS).toEqual({
			addressComplete: '',
			street: '',
			postalCode: '',
			city: '',
			province: '',
			longitude: '',
			latitude: ''
		})
	})
})
