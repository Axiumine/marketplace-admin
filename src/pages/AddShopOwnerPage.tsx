import { PageHeader } from '@/components/layout/PageHeader'
import { MenuShopOwners } from '@/features/shopOwners/MenuShopOwners'
import { ShopOwnerAddForm } from '@/features/shopOwners/ShopOwnerAddForm'

export const AddShopOwnerPage = () => (
	<>
		<PageHeader
			title="Add shopOwner"
			crumbs={[{ name: 'ShopOwners', to: '/shopOwners' }, { name: 'Add' }]}
			actions={<MenuShopOwners />}
		/>
		<ShopOwnerAddForm />
	</>
)
