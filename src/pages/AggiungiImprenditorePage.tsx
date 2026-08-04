import { PageHeader } from '@/components/layout/PageHeader'
import { ImprenditoreAddForm } from '@/features/imprenditori/ImprenditoreAddForm'
import { MenuImprenditori } from '@/features/imprenditori/MenuImprenditori'

export const AggiungiImprenditorePage = () => (
	<>
		<PageHeader
			title="Aggiungi imprenditore"
			crumbs={[{ name: 'Imprenditori', to: '/imprenditori' }, { name: 'Aggiungi' }]}
			actions={<MenuImprenditori />}
		/>
		<ImprenditoreAddForm />
	</>
)
