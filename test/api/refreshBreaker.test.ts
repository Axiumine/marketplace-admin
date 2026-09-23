import { describe, expect, it, vi } from 'vitest'

import { createRefreshBreaker } from '@/api/refreshBreaker'

describe('createRefreshBreaker', () => {
	it('starts closed', () => {
		const breaker = createRefreshBreaker(() => 0)
		expect(breaker.isOpen()).toBe(false)
	})

	it('opens a 1s window on the first transport failure', () => {
		let time = 10_000
		const breaker = createRefreshBreaker(() => time)

		breaker.recordTransportFailure()
		expect(breaker.isOpen()).toBe(true)

		time += 999
		expect(breaker.isOpen()).toBe(true)

		// `now() < openUntil`, so the boundary itself already reads as closed.
		time += 1
		expect(breaker.isOpen()).toBe(false)
	})

	it('doubles the window on each further consecutive failure: 2s, then 4s', () => {
		let time = 0
		const breaker = createRefreshBreaker(() => time)

		breaker.recordTransportFailure() // n=1 → 1s
		time += 1_000
		expect(breaker.isOpen()).toBe(false)

		breaker.recordTransportFailure() // n=2 → 2s
		time += 1_999
		expect(breaker.isOpen()).toBe(true)
		time += 1
		expect(breaker.isOpen()).toBe(false)

		breaker.recordTransportFailure() // n=3 → 4s
		time += 3_999
		expect(breaker.isOpen()).toBe(true)
		time += 1
		expect(breaker.isOpen()).toBe(false)
	})

	it('caps the window at 30s', () => {
		let time = 0
		const breaker = createRefreshBreaker(() => time)

		// n=1..5 is 1s,2s,4s,8s,16s — the 6th (2^5 * 1s = 32s) is where the cap first bites.
		for (let n = 0; n < 5; n++) breaker.recordTransportFailure()
		breaker.recordTransportFailure() // n=6, uncapped would be 32s

		time += 29_999
		expect(breaker.isOpen()).toBe(true)
		time += 1
		expect(breaker.isOpen()).toBe(false)
	})

	it('never opens a window past the cap on further consecutive failures either', () => {
		let time = 0
		const breaker = createRefreshBreaker(() => time)

		for (let n = 0; n < 9; n++) breaker.recordTransportFailure()

		time += 29_999
		expect(breaker.isOpen()).toBe(true)
		time += 1
		expect(breaker.isOpen()).toBe(false)
	})

	it('closes immediately on reset', () => {
		const breaker = createRefreshBreaker(() => 0)

		breaker.recordTransportFailure()
		expect(breaker.isOpen()).toBe(true)

		breaker.reset()
		expect(breaker.isOpen()).toBe(false)
	})

	it('forgets the run of failures on reset, so the next one reopens at 1s rather than continuing to double', () => {
		let time = 0
		const breaker = createRefreshBreaker(() => time)

		breaker.recordTransportFailure() // n=1
		breaker.recordTransportFailure() // n=2, would open 2s if unreset
		breaker.reset()

		breaker.recordTransportFailure() // first failure since the reset: back to 1s
		time += 999
		expect(breaker.isOpen()).toBe(true)
		time += 1
		expect(breaker.isOpen()).toBe(false)
	})

	// The injectable clock is what makes every test above deterministic; this confirms the parameter
	// really is optional and falls back to the wall clock rather than, say, always reading 0.
	it('defaults its clock to Date.now', () => {
		const dateNow = vi.spyOn(Date, 'now').mockReturnValue(5_000)
		try {
			const breaker = createRefreshBreaker()
			breaker.recordTransportFailure()
			expect(breaker.isOpen()).toBe(true)

			dateNow.mockReturnValue(6_000) // 1s later, the window has closed
			expect(breaker.isOpen()).toBe(false)
		} finally {
			dateNow.mockRestore()
		}
	})
})
