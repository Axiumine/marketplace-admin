import { PageHeader } from '@/components/layout/PageHeader'
import { CambioPasswordForm } from '@/features/impostazioni/CambioPasswordForm'

export const ImpostazioniPage = () => (
	<>
		<PageHeader title="Impostazioni" />
		<h2 className="mb-4 text-lg font-bold">Cambio password</h2>
		<CambioPasswordForm />
	</>
)
