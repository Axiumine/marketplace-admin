import { Link } from '@tanstack/react-router'

/**
 * The three imprenditori sections.
 *
 * ⚠️ "Aggiungi" goes to `/p/imprenditori/aggiungi-imprenditore` — **singular**. Its siblings are
 * plural, which makes the wrong spelling the natural one to type, and TanStack's typed `to` is the
 * only thing standing between that and a 404 nobody sees until an operator clicks it.
 *
 * `Link` handles the active state itself: `activeProps` fires on exact match, which is what these want
 * (unlike the sidebar, where `/imprenditori` must stay lit while a detail page is open).
 */
const ITEM_CLASS = 'rounded-box border border-palette-bg3/20 px-3 py-2 text-sm'
const ACTIVE_CLASS = 'bg-third text-palette-white'

export const MenuImprenditori = () => (
	<nav aria-label="Sezioni imprenditori" className="flex flex-wrap gap-2">
		<Link to="/imprenditori" className={ITEM_CLASS} activeProps={{ className: ACTIVE_CLASS }}>
			Stats
		</Link>
		<Link to="/p/imprenditori/gestione-imprenditori" className={ITEM_CLASS} activeProps={{ className: ACTIVE_CLASS }}>
			Gestione
		</Link>
		<Link to="/p/imprenditori/aggiungi-imprenditore" className={ITEM_CLASS} activeProps={{ className: ACTIVE_CLASS }}>
			Aggiungi
		</Link>
	</nav>
)
