import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { clearSession } from '@/auth/session'
import { isSectionActive } from '@/components/layout/SideMenu'

import { stubGraphQL } from '../../helpers/graphql'
import { ADMIN, renderRoute } from '../../helpers/render'

const emptyTable = { data: { shopOwnersActiveTbl: { total: 0, items: [] } } }

describe('isSectionActive', () => {
	it('matches the prefix exactly', () => {
		expect(isSectionActive('/home', ['/home'])).toBe(true)
	})

	it('matches a path below the prefix', () => {
		expect(isSectionActive('/p/shopOwners/manage-shopOwners', ['/shopOwners', '/p/shopOwners'])).toBe(true)
	})

	// `/settings-advanced` is not inside `/settings`. A bare `startsWith` says it is, which is
	// why the check tests for the separator too.
	it('does not match a sibling that merely starts with the same letters', () => {
		expect(isSectionActive('/settingsx', ['/settings'])).toBe(false)
	})

	it('does not match an unrelated path', () => {
		expect(isSectionActive('/home', ['/settings'])).toBe(false)
	})

	it('is false when there is no prefix to match', () => {
		expect(isSectionActive('/home', [])).toBe(false)
	})
})

describe('SideMenu', () => {
	it('lists the six sections', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		const menu = screen.getByRole('navigation', { name: 'Main menu' })
		expect(menu).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/home')
		expect(screen.getByRole('link', { name: 'ShopOwners' })).toHaveAttribute('href', '/shopOwners')
		expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute('href', '/customers')
		expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories')
		expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
		expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/security')
	})

	it('highlights the section the admin is standing in', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('font-bold')
		expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveClass('font-bold')
	})

	// The reason `isSectionActive` exists at all: the manage page lives under `/p/shopOwners/…`, a
	// different prefix from the section's own `/shopOwners`, so exact matching would unlight the
	// sidebar the moment an admin opened the table.
	it('keeps ShopOwners highlighted on a page under the other prefix', async () => {
		stubGraphQL({ ShopOwnersActiveTbl: emptyTable })
		await renderRoute('/p/shopOwners/manage-shopOwners')

		// Scoped to the sidebar: the page's own breadcrumb trail and its section menu both carry a link
		// called "ShopOwners", and an unscoped query matches all three.
		const menu = within(screen.getByRole('navigation', { name: 'Main menu' }))
		expect(menu.getByRole('link', { name: 'ShopOwners' })).toHaveClass('font-bold')
		expect(menu.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('font-bold')
	})

	it('shows who is signed in', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByText(ADMIN.email)).toBeInTheDocument()
	})

	// The window `useLogout` opens: it clears the session and only then navigates, so the menu renders
	// once with no admin. The address has to go with it — a stale email under a "Sign out" button that
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
		expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL({})
		await renderRoute('/home')

		expect(screen.getByRole('navigation', { name: 'Main menu' })).toMatchSnapshot()
	})
})
