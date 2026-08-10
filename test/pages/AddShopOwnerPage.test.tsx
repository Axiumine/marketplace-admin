import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

/**
 * The page mounts `ShopOwnerAddForm`, whose date-of-birth field carries `max={maxBirthDate(new Date())}`
 * — today less eighteen years — so a snapshot taken here records the day it ran on and fails the next
 * morning on a working tree nobody touched. Same freeze, same reason and same value as
 * `test/features/shopOwners/ShopOwnerAddForm.test.tsx`. Noon rather than midnight so the offset cannot
 * walk the date over into the neighbouring day on a machine that is not on UTC.
 */
const TODAY = '2026-08-02T12:00:00Z'

afterEach(() => {
	vi.useRealTimers()
})

describe('AddShopOwnerPage', () => {
	it('renders', async () => {
		// Only `Date`. `setTimeout` stays real, or the router's awaits never advance.
		vi.useFakeTimers({ toFake: ['Date'] })
		vi.setSystemTime(new Date(TODAY))

		stubGraphQL({})
		await renderRoute('/p/shopOwners/add-shopOwner')

		expect(screen.getByRole('heading', { name: 'Add shopOwner' })).toBeInTheDocument()
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
