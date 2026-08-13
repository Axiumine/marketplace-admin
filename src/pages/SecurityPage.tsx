import { PageHeader } from '@/components/layout/PageHeader'
import { KeygripPanel } from '@/features/security/KeygripPanel'
import type { SessionQuery } from '@/features/security/SessionConsole'
import { SessionConsole } from '@/features/security/SessionConsole'

/**
 * The platform's security section: the sessions one account holds, and the keys the whole platform signs
 * with.
 *
 * Its own page rather than a card under Settings: Settings is where an operator changes something about
 * their own account, and everything here is about the platform every operator shares.
 *
 * One page rather than two, because the two halves are read together during the same incident. A leaked
 * signing key is answered by retiring it, which ends every session it signed; a compromised account is
 * answered by ending that account's sessions and reading why its lineages were revoked before. Splitting
 * them would put the propagation window on one screen and the sessions it applies to on another.
 *
 * The account being looked at arrives as props, from the URL — see `router.tsx`. That is what makes a row
 * linkable from a ticket, and what keeps this page free of any URL reading of its own.
 */
export const SecurityPage = ({ query, onQueryChange }: { query: SessionQuery; onQueryChange: (next: SessionQuery) => void }) => (
	<>
		<PageHeader title="Security" />
		<h2 className="mb-4 text-lg font-bold">Sessions</h2>
		<SessionConsole query={query} onQueryChange={onQueryChange} />
		<h2 className="mt-8 mb-4 text-lg font-bold">Cookie-signing keys</h2>
		<KeygripPanel />
	</>
)
