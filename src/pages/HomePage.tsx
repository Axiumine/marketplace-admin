import { PageHeader } from '@/components/layout/PageHeader'
import { WigBottone } from '@/features/dashboard/WigBottone'

/**
 * The dashboard. One tile, because one section exists. The grid is already four-wide, so a second
 * section is a second `<WigBottone>` here and nothing else.
 */
export const HomePage = () => (
	<>
		<PageHeader title="Dashboard" />
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<WigBottone title="Imprenditori" frase="Gestione degli imprenditori" to="/p/imprenditori/gestione-imprenditori" />
		</div>
	</>
)
