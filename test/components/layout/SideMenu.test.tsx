import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { clearSession } from '@/auth/session'
import { isSectionActive } from '@/components/layout/SideMenu'

import { stubGraphQL } from '../../helpers/graphql'
import { ADMIN, renderRoute } from '../../helpers/render'

const emptyTable = { data: { imprenditoriAttiviTbl: { total: 0, items: [] } } }

describe('isSectionActive', () => {
	it('matches the prefix exactly', () => {
		expect(isSectionActive('/home', ['/home'])).toBe(true)
	})

	it('matches a path below the prefix', () => {
		expect(isSectionActive('/p/imprenditori/gestione-imprenditori', ['/imprenditori', '/p/imprenditori'])).toBe(true)
	})

	// `/impostazioni-avanzate` is not inside `/impostazioni`. A bare `startsWith` says it is, which is
	// why the check tests for the separator too.
	it('does not match a sibling that merely starts with the same letters', () => {
		expect(isSectionActive('/impostazionix', ['/impostazioni'])).toBe(false)
	})

	it('does not match an unrelated path', () => {
		expect(isSectionActive('/home', ['/impostazioni'])).toBe(false)
	})

	it('is false when there is no prefix to match', () => {
		expect(isSectionActive('/home', [])).toBe(false)
	})
})

describe('SideMenu', () => {
	it('lists the three sections', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		const menu = screen.getByRole('navigation', { name: 'Menu principale' })
		expect(menu).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/home')
		expect(screen.getByRole('link', { name: 'Imprenditori' })).toHaveAttribute('href', '/imprenditori')
		expect(screen.getByRole('link', { name: 'Impostazioni' })).toHaveAttribute('href', '/impostazioni')
	})

	it('highlights the section the operator is standing in', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('font-bold')
		expect(screen.getByRole('link', { name: 'Impostazioni' })).not.toHaveClass('font-bold')
	})

	// The reason `isSectionActive` exists at all: the gestione page lives under `/p/imprenditori/…`, a
	// different prefix from the section's own `/imprenditori`, so exact matching would unlight the
	// sidebar the moment an operator opened the table.
	it('keeps Imprenditori highlighted on a page under the other prefix', async () => {
		stubGraphQL({ ImprenditoriAttiviTbl: emptyTable })
		await renderRoute('/p/imprenditori/gestione-imprenditori')

		// Scoped to the sidebar: the page's own breadcrumb trail and its section menu both carry a link
		// called "Imprenditori", and an unscoped query matches all three.
		const menu = within(screen.getByRole('navigation', { name: 'Menu principale' }))
		expect(menu.getByRole('link', { name: 'Imprenditori' })).toHaveClass('font-bold')
		expect(menu.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('font-bold')
	})

	it('shows who is signed in', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByText(ADMIN.email)).toBeInTheDocument()
	})

	// The window `useLogout` opens: it clears the session and only then navigates, so the menu renders
	// once with no operator. The address has to go with it — a stale email under a "Esci" button that
	// has already fired is worse than none.
	//
	// The two positive assertions are what make this a test of the empty state rather than a test that
	// something went wrong: reading `session.email` unconditionally throws during render, React 19
	// unmounts the whole root when a render throws, and an unmounted root satisfies an assertion that
	// only asks for the address to be absent. Requiring the menu to still be standing tells the two
	// apart.
	it('shows nobody once the session is cleared', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		act(() => {
			clearSession()
		})

		expect(screen.queryByText(ADMIN.email)).not.toBeInTheDocument()
		expect(screen.getByRole('navigation', { name: 'Menu principale' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Esci' })).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByRole('navigation', { name: 'Menu principale' })).toMatchSnapshot()
	})
})
