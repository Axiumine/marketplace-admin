import { PageHeader } from '@/components/layout/PageHeader'
import { AnagraficaImprenditore } from '@/features/imprenditori/AnagraficaImprenditore'
import { Aziende } from '@/features/imprenditori/Aziende'
import { MenuImprenditori } from '@/features/imprenditori/MenuImprenditori'
import { SalvaModifiche, useAvvisoAbbandono, useSalvataggio } from '@/features/imprenditori/salvataggio'

/**
 * The two sections of the imprenditore detail: the anagrafica, then the companies.
 *
 * Each fetches independently rather than sharing one query: they hit different backend resolvers, and a
 * slow companies list should not hold back the anagrafica.
 *
 * Everything on the page is editable in place and nothing is written until the one Save button at the
 * bottom is pressed, which is why this component holds the registry: it is the only ancestor both
 * halves share. `registra` goes down, dirtiness comes back up, and the button reaches forms rendered
 * two levels below it — one per company — without either half knowing the other exists.
 */
export const ImprenditoreDetailPage = ({ idImprenditore }: { idImprenditore: string }) => {
	const { registra, salvaTutto, modificato, versione } = useSalvataggio()

	// Same `modificato` the Save button reads: whatever makes the button worth pressing is what makes
	// leaving worth a question.
	useAvvisoAbbandono(modificato)

	return (
		<>
			<PageHeader
				title="Info imprenditore"
				crumbs={[
					{ name: 'Imprenditori', to: '/imprenditori' },
					{ name: 'Gestione', to: '/p/imprenditori/gestione-imprenditori' },
					{ name: 'Info imprenditore' }
				]}
				actions={<MenuImprenditori />}
			/>

			{/* Keyed on the save counter, so a successful save puts the page back the way it loaded: every
			    row that was opened for editing closes, its pen comes back, and the form re-seeds itself from
			    the values the save has just invalidated in the cache. The key is the whole mechanism —
			    `EditableRow` has no close of its own, deliberately, because a row that closed while the form
			    still held its edited value would display one value and save another.

			    ⚠️ The counter alone would not do: siblings share one key space, so two elements keyed on the
			    same number are two children with the same key, and React keeps one of them. Hence the
			    prefixes. */}
			<AnagraficaImprenditore key={`anagrafica-${versione}`} idImprenditore={idImprenditore} registra={registra} />

			<Aziende key={`aziende-${versione}`} idImprenditore={idImprenditore} registra={registra} />

			<SalvaModifiche modificato={modificato} salvaTutto={salvaTutto} />
		</>
	)
}
