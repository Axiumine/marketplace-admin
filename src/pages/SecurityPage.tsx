import { PageHeader } from '@/components/layout/PageHeader'
import { KeygripPanel } from '@/features/security/KeygripPanel'

/**
 * The platform's security section. One panel so far — the cookie-signing keys.
 *
 * Its own page rather than a card under Settings: Settings is where an operator changes something about
 * their own account, and everything here is about the platform every operator shares.
 */
export const SecurityPage = () => (
	<>
		<PageHeader title="Security" />
		<h2 className="mb-4 text-lg font-bold">Cookie-signing keys</h2>
		<KeygripPanel />
	</>
)
