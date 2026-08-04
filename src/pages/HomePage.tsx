import { PageHeader } from '@/components/layout/PageHeader'
import { WigButton } from '@/features/dashboard/WigButton'

/**
 * The dashboard. One tile, because one section exists. The grid is already four-wide, so a second
 * section is a second `<WigButton>` here and nothing else.
 */
export const HomePage = () => (
	<>
		<PageHeader title="Dashboard" />
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<WigButton title="ShopOwners" phrase="Manage shop owners" to="/p/shopOwners/manage-shopOwners" />
		</div>
	</>
)
