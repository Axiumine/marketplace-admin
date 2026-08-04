import type { LinkProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'

/**
 * A dashboard tile: title, one-line description, link to a section.
 *
 * `to` is typed as the router's `LinkProps['to']` rather than `string`, so a tile pointing at a route
 * that does not exist is a compile error rather than a 404 nobody notices until an operator clicks it.
 * A navigation target is exactly the kind of string that goes stale silently when a route is renamed.
 */
export const WigBottone = ({ title, frase, to }: { title: string; frase: string; to: NonNullable<LinkProps['to']> }) => (
	<Link to={to} className="block rounded-box border-4 border-third bg-white p-4 shadow transition-shadow hover:shadow-lg">
		<h2 className="font-bold">{title}</h2>
		<p className="text-sm text-tip">{frase}</p>
	</Link>
)
