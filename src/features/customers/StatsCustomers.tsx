import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { UsersStatsDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Infobox, InfoRow } from '@/components/ui/Infobox'
import { Spinner } from '@/components/ui/Spinner'

/**
 * The customers headline count, and the twin of `StatsShopOwners`.
 *
 * One row, for the same reason: `usersStats` is the only customer counter the admin-resource service
 * exposes. The obvious companions — confirmed, unconfirmed, disabled, closed — have no query behind
 * them, and a commented-out row is indistinguishable on screen from one that broke. Add the resolver
 * first, then the row.
 *
 * ⚠️ The number counts every account ever registered, including the disabled and the closed, so it is
 * deliberately larger than the `total` the table shows under its default filter. The two disagreeing
 * is the design, not a bug to reconcile.
 */
export const StatsCustomers = () => {
	const [result] = useQuery({ query: UsersStatsDocument, context: CTX_ADMIN_RESOURCE })

	if (result.fetching) return <Spinner label="Loading statistics" />
	if (result.error !== undefined) return <Alert tone="error">{messageOf(result.error)}</Alert>

	return (
		<Infobox title="Customers">
			<InfoRow label="Total" value={String(result.data?.usersStats ?? 0)} />
		</Infobox>
	)
}
