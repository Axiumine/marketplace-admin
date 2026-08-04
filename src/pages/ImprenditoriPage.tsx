import { PageHeader } from '@/components/layout/PageHeader'
import { GraficoImprenditori } from '@/features/imprenditori/GraficoImprenditori'
import { MenuImprenditori } from '@/features/imprenditori/MenuImprenditori'
import { StatsImprenditori } from '@/features/imprenditori/StatsImprenditori'

/*
 * The chart is a row of its own rather than a fifth tile in the grid above. A bar per day over three
 * months in a quarter-width card is bars a pixel wide; the counters beside it are a number each and
 * lose nothing by being narrow. Two different shapes of thing, two rows.
 */
export const ImprenditoriPage = () => (
	<>
		<PageHeader title="Imprenditori" crumbs={[{ name: 'Imprenditori' }]} actions={<MenuImprenditori />} />
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatsImprenditori />
		</div>
		<div className="mt-4">
			<GraficoImprenditori />
		</div>
	</>
)
