import { PageHeader } from '@/components/layout/PageHeader'
import type { CustomersQuery } from '@/features/customers/TblCustomers'
import { TblCustomers } from '@/features/customers/TblCustomers'

/**
 * The customers screen — the operator's fourth surface, and a section of its own rather than a page under
 * a shop owner: a customer belongs to the platform, orders from many shops, and is reached from no shop's
 * detail page.
 *
 * One page and no stats tile beside it, unlike ShopOwners. `usersStats` and `usersPerPeriod` do not exist
 * on this tier — both are countable without touching an encrypted field, so neither is blocked, they are
 * simply not asked for yet (E19 §6, question 2). A chart drawn from the table's own `total` would be a
 * chart of whatever filter happened to be selected.
 *
 * It owns nothing: the query state comes from the URL and goes back to it.
 */
export const CustomersPage = ({
	query,
	onQueryChange
}: {
	query: CustomersQuery
	onQueryChange: (next: Partial<CustomersQuery>) => void
}) => (
	<>
		<PageHeader title="Customers" crumbs={[{ name: 'Customers' }]} />
		<TblCustomers query={query} onQueryChange={onQueryChange} />
	</>
)
