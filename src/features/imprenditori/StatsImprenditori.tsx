import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { ImprenditoriStatsDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Infobox, InfoRow } from '@/components/ui/Infobox'
import { Spinner } from '@/components/ui/Spinner'

/**
 * The imprenditori headline count.
 *
 * One row, because `imprenditoriStats` is the only counter the admin-resource service exposes. The
 * obvious companions — email da confermare, confermati, disabilitati, eliminati — have no query behind
 * them, and a commented-out row is indistinguishable on screen from one that broke. Add the resolver
 * first, then the row.
 */
export const StatsImprenditori = () => {
	const [result] = useQuery({ query: ImprenditoriStatsDocument, context: CTX_ADMIN_RESOURCE })

	if (result.fetching) return <Spinner label="Caricamento statistiche" />
	if (result.error !== undefined) return <Alert tone="error">{messageOf(result.error)}</Alert>

	return (
		<Infobox title="Imprenditori">
			<InfoRow label="Totali" value={String(result.data?.imprenditoriStats ?? 0)} />
		</Infobox>
	)
}
