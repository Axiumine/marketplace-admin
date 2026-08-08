import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { ShopOwnersStatsDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Infobox, InfoRow } from '@/components/ui/Infobox'
import { Spinner } from '@/components/ui/Spinner'

/**
 * The shopOwners headline count.
 *
 * One row, because `shopOwnersStats` is the only counter the admin-resource service exposes. The
 * obvious companions — email to confirm, confirmed, disabled, deleted — have no query behind
 * them, and a commented-out row is indistinguishable on screen from one that broke. Add the resolver
 * first, then the row.
 */
export const StatsShopOwners = () => {
	const [result] = useQuery({ query: ShopOwnersStatsDocument, context: CTX_ADMIN_RESOURCE })

	if (result.fetching) return <Spinner label="Loading statistics" />
	if (result.error !== undefined) return <Alert tone="error">{messageOf(result.error)}</Alert>

	return (
		<Infobox title="ShopOwners">
			<InfoRow label="Total" value={String(result.data?.shopOwnersStats ?? 0)} />
		</Infobox>
	)
}
