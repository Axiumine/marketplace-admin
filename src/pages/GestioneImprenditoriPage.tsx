import { PageHeader } from '@/components/layout/PageHeader'
import { MenuImprenditori } from '@/features/imprenditori/MenuImprenditori'
import type { ImprenditoriQuery } from '@/features/imprenditori/TblImprenditori'
import { TblImprenditori } from '@/features/imprenditori/TblImprenditori'

/**
 * The table page. It owns nothing: the query state comes from the URL and goes back to the URL, which
 * is what makes "page 3, sorted by comune, searching «rossi»" a link an operator can bookmark or send.
 */
export const GestioneImprenditoriPage = ({
	query,
	onQueryChange
}: {
	query: ImprenditoriQuery
	onQueryChange: (next: Partial<ImprenditoriQuery>) => void
}) => (
	<>
		<PageHeader
			title="Gestione degli imprenditori"
			crumbs={[{ name: 'Imprenditori', to: '/imprenditori' }, { name: 'Gestione' }]}
			actions={<MenuImprenditori />}
		/>
		<TblImprenditori query={query} onQueryChange={onQueryChange} />
	</>
)
