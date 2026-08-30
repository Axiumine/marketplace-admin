import { Link } from '@tanstack/react-router'

import { useSession } from '@/auth/session'
import { useLogout } from '@/auth/useLogout'
import { Button } from '@/components/ui/Button'

/**
 * The six sections of the admin app.
 *
 * `/shopOwners` uses `activeOptions.exact: false` on purpose: the manage, add and detail
 * pages all live under `/p/shopOwners/…`, a different path prefix entirely, so the highlight is
 * driven by an explicit prefix list rather than by the router's path matching. The prefixes live in
 * this one table so that adding a page cannot leave the sidebar pointing at the wrong section —
 * anything that makes each page announce its own highlight goes stale the first time a page forgets.
 */
const SECTIONS = [
	{ to: '/home', label: 'Dashboard', prefixes: ['/home'] },
	{ to: '/shopOwners', label: 'ShopOwners', prefixes: ['/shopOwners', '/p/shopOwners'] },
	// Alongside ShopOwners rather than under it: a customer belongs to the platform and orders from many
	// shops, so there is no shop owner whose section they would sit inside (E19-S04).
	{ to: '/customers', label: 'Customers', prefixes: ['/customers'] },
	{ to: '/categories', label: 'Categories', prefixes: ['/categories'] },
	{ to: '/settings', label: 'Settings', prefixes: ['/settings'] },
	{ to: '/security', label: 'Security', prefixes: ['/security'] }
] as const

export const isSectionActive = (pathname: string, prefixes: readonly string[]): boolean =>
	prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

export const SideMenu = ({ pathname }: { pathname: string }) => {
	const session = useSession()
	const logout = useLogout()

	return (
		<nav aria-label="Main menu" className="flex h-full w-56 flex-col bg-secondary p-4">
			<p className="mb-6 text-lg font-bold text-third">Marketplace</p>

			<ul className="flex flex-col gap-1">
				{SECTIONS.map((section) => (
					<li key={section.to}>
						<Link
							to={section.to}
							className={`block rounded-box px-3 py-2 text-sm ${
								isSectionActive(pathname, section.prefixes) ? 'bg-palette-bg1 font-bold' : ''
							}`}
						>
							{section.label}
						</Link>
					</li>
				))}
			</ul>

			<div className="mt-auto flex flex-col gap-2">
				{/*
				 * Signed out is a real state here, briefly: `useLogout` clears the session before it
				 * navigates away, so this menu re-renders once with nothing to show. An empty string in
				 * place of the address would leave the paragraph's border and padding behind — a blank
				 * strip that reads as a failed load rather than as a logout in progress.
				 */}
				{session === null ? null : <p className="text-xs break-all text-tip">{session.email}</p>}
				<Button
					variant="ghost"
					onClick={() => {
						void logout()
					}}
				>
					Logout
				</Button>
			</div>
		</nav>
	)
}
