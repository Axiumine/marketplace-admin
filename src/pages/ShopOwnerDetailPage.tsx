import { PageHeader } from '@/components/layout/PageHeader'
import { ShopOwnerPersonalData } from '@/features/shopOwners/ShopOwnerPersonalData'
import { Companies } from '@/features/shopOwners/Companies'
import { MenuShopOwners } from '@/features/shopOwners/MenuShopOwners'
import { SaveChanges, useDiscardWarning, useSaving } from '@/features/shopOwners/saving'

/**
 * The two sections of the shopOwner detail: the personalData, then the companies.
 *
 * Each fetches independently rather than sharing one query: they hit different backend resolvers, and a
 * slow companies list should not hold back the personalData.
 *
 * Everything on the page is editable in place and nothing is written until the one Save button at the
 * bottom is pressed, which is why this component holds the registry: it is the only ancestor both
 * halves share. `register` goes down, dirtiness comes back up, and the button reaches forms rendered
 * two levels below it — one per company — without either half knowing the other exists.
 */
export const ShopOwnerDetailPage = ({ idShopOwner }: { idShopOwner: string }) => {
	const { register, saveAll, changed, version } = useSaving()

	// Same `changed` the Save button reads: whatever makes the button worth pressing is what makes
	// leaving worth a question.
	useDiscardWarning(changed)

	return (
		<>
			<PageHeader
				title="Shop owner info"
				crumbs={[
					{ name: 'ShopOwners', to: '/shopOwners' },
					{ name: 'Manage', to: '/p/shopOwners/manage-shopOwners' },
					{ name: 'Shop owner info' }
				]}
				actions={<MenuShopOwners />}
			/>

			{/* Keyed on the save counter, so a successful save puts the page back the way it loaded: every
			    row that was opened for editing closes, its pen comes back, and the form re-seeds itself from
			    the values the save has just invalidated in the cache. The key is the whole mechanism —
			    `EditableRow` has no close of its own, deliberately, because a row that closed while the form
			    still held its edited value would display one value and save another.

			    ⚠️ The counter alone would not do: siblings share one key space, so two elements keyed on the
			    same number are two children with the same key, and React keeps one of them. Hence the
			    prefixes. */}
			<ShopOwnerPersonalData key={`personalData-${version}`} idShopOwner={idShopOwner} registerSection={register} />

			<Companies key={`companies-${version}`} idShopOwner={idShopOwner} registerSection={register} />

			<SaveChanges changed={changed} saveAll={saveAll} />
		</>
	)
}
