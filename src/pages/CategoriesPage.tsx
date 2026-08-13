import { PageHeader } from '@/components/layout/PageHeader'
import { Categories } from '@/features/categories/Categories'
import { SaveChanges, useDiscardWarning, useSaving } from '@/features/saving'

/**
 * The platform's taxonomy, on one page.
 *
 * One section, unlike the shopOwner detail, and the registry is here all the same: the cards are the
 * things that save, there is one card per category, and the Save button at the bottom reaches all of them
 * — a per-card button would put twenty of them on a page that is one list.
 *
 * ⚠️ This screen writes a collection **every shop owner reads and none of them can write** (ADR-008): a
 * category retired here is one no seller can file against, and a slug edited here changes what the public
 * site's URLs are built from. It is not a settings page.
 */
export const CategoriesPage = () => {
	const { register, saveAll, changed, version } = useSaving()

	useDiscardWarning(changed)

	return (
		<>
			<PageHeader title="Categories" />

			{/* Keyed on the save counter, for the reason the shopOwner detail page spells out: `EditableRow`
			    has no close of its own, so a successful save puts the whole list back the way it loaded — every
			    open row closed, every form re-seeded from the values the save has just invalidated. */}
			<Categories key={`categories-${version}`} registerSection={register} />

			<SaveChanges changed={changed} saveAll={saveAll} />
		</>
	)
}
