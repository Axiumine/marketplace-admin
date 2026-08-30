import { Link } from '@tanstack/react-router'

/**
 * The three shopOwners sections.
 *
 * ⚠️ "Add" goes to `/p/shopOwners/add-shopOwner` — **singular**. Its siblings are
 * plural, which makes the wrong spelling the natural one to type, and TanStack's typed `to` is the
 * only thing standing between that and a 404 nobody sees until an admin clicks it.
 *
 * `Link` handles the active state itself: `activeProps` fires on exact match, which is what these want
 * (unlike the sidebar, where `/shopOwners` must stay lit while a detail page is open).
 */
const ITEM_CLASS = 'rounded-box border border-palette-bg3/20 px-3 py-2 text-sm'
const ACTIVE_CLASS = 'bg-third text-palette-white'

export const MenuShopOwners = () => (
	<nav aria-label="Sections shopOwners" className="flex flex-wrap gap-2">
		<Link to="/shopOwners" className={ITEM_CLASS} activeProps={{ className: ACTIVE_CLASS }}>
			Stats
		</Link>
		<Link to="/p/shopOwners/manage-shopOwners" className={ITEM_CLASS} activeProps={{ className: ACTIVE_CLASS }}>
			Manage
		</Link>
		<Link to="/p/shopOwners/add-shopOwner" className={ITEM_CLASS} activeProps={{ className: ACTIVE_CLASS }}>
			Add
		</Link>
	</nav>
)
