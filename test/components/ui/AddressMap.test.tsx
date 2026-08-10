import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AddressMap } from '@/components/ui/AddressMap'

describe('AddressMap', () => {
	// The root is a fragment, not a single element — the frame and the attribution line are siblings, so
	// the whole container is snapshotted rather than just its first child.
	it('renders', () => {
		const { container } = render(<AddressMap lat={41.9028} lon={12.4964} title="Marketplace HQ" />)
		expect(container).toMatchSnapshot()
	})
})
