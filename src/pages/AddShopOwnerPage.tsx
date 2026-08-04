import { PageHeader } from '@/components/layout/PageHeader'
import { ShopOwnerAddForm } from '@/features/shopOwners/ShopOwnerAddForm'
import { MenuShopOwners } from '@/features/shopOwners/MenuShopOwners'

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
