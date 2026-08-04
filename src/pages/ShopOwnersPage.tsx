import { PageHeader } from '@/components/layout/PageHeader'
import { ChartShopOwners } from '@/features/shopOwners/ChartShopOwners'
import { MenuShopOwners } from '@/features/shopOwners/MenuShopOwners'
import { StatsShopOwners } from '@/features/shopOwners/StatsShopOwners'

/*
 * The chart is a row of its own rather than a fifth tile in the grid above. A bar per day over three
 * months in a quarter-width card is bars a pixel wide; the counters beside it are a number each and
 * lose nothing by being narrow. Two different shapes of thing, two rows.
 */
export const ShopOwnersPage = () => (
	<>
		<PageHeader title="ShopOwners" crumbs={[{ name: 'ShopOwners' }]} actions={<MenuShopOwners />} />
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatsShopOwners />
		</div>
		<div className="mt-4">
			<ChartShopOwners />
		</div>
	</>
)
