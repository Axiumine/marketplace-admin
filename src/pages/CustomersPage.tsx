import { PageHeader } from '@/components/layout/PageHeader'
import { ChartCustomers } from '@/features/customers/ChartCustomers'
import { StatsCustomers } from '@/features/customers/StatsCustomers'
import type { CustomersQuery } from '@/features/customers/TblCustomers'
import { TblCustomers } from '@/features/customers/TblCustomers'

/**
 * The customers screen — the operator's fourth surface, and a section of its own rather than a page under
 * a shop owner: a customer belongs to the platform, orders from many shops, and is reached from no shop's
 * detail page.
 *
 * Counter, chart, table — the same three rows as ShopOwners since the platform owner answered E19 §6
 * question 2 on 2026-08-29. `usersStats` and `usersPerPeriod` were never blocked by ADR-029: a count
 * touches no field and the series reads only `registeredAt`, which was never encrypted. What the
 * encryption still blocks is the table's search box, which is why this page has a counter above a table
 * that cannot be searched.
 *
 * ⚠️ The counter and the table's `total` are different numbers on purpose. The counter is every account
 * ever registered; the `total` is the size of whatever the status filter currently selects. A chart drawn
 * from the table's own `total` would be a chart of that filter instead of of the platform.
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
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatsCustomers />
		</div>
		<div className="mt-4">
			<ChartCustomers />
		</div>
		<div className="mt-4">
			<TblCustomers query={query} onQueryChange={onQueryChange} />
		</div>
	</>
)
