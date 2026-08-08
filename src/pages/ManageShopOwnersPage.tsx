import { PageHeader } from '@/components/layout/PageHeader'
import { MenuShopOwners } from '@/features/shopOwners/MenuShopOwners'
import type { ShopOwnersQuery } from '@/features/shopOwners/TblShopOwners'
import { TblShopOwners } from '@/features/shopOwners/TblShopOwners'

/**
 * The table page. It owns nothing: the query state comes from the URL and goes back to the URL, which
 * is what makes "page 3, sorted by city, searching «rivers»" a link an operator can bookmark or send.
 */
export const ManageShopOwnersPage = ({
	query,
	onQueryChange
}: {
	query: ShopOwnersQuery
	onQueryChange: (next: Partial<ShopOwnersQuery>) => void
}) => (
	<>
		<PageHeader
			title="Manage shop owners"
			crumbs={[{ name: 'ShopOwners', to: '/shopOwners' }, { name: 'Manage' }]}
			actions={<MenuShopOwners />}
		/>
		<TblShopOwners query={query} onQueryChange={onQueryChange} />
	</>
)
