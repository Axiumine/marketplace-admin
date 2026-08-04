import type { GraphQlPeriodoImprenditori } from '@gql/adminResource/graphql'
import { useState } from 'react'
import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { ImprenditoriPerPeriodoDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Infobox } from '@/components/ui/Infobox'
import { SelectField } from '@/components/ui/SelectField'
import { Spinner } from '@/components/ui/Spinner'
import { barre, estremi, totaleSerie } from '@/lib/grafico'

/**
 * Iscrizioni over time, as a bar per bucket.
 *
 * The range is the operator's choice; the **bucket width is not**, and comes back in the response. A
 * day-by-day series over the whole life of the platform is one bar per day since it opened, which is
 * neither readable nor cheap to group, so the server answers `TUTTO` by month and the two bounded
 * ranges by day. The chart reads `granularita` to label the axis rather than deciding from the number
 * of points, which would guess wrong for a platform three days old.
 */

/**
 * The three ranges, in the order the select offers them: widest first, because the widest is the
 * default and a select whose first option is not its value reads as already changed.
 */
const PERIODI: { valore: GraphQlPeriodoImprenditori; label: string }[] = [
	{ valore: 'TUTTO', label: 'Dal primo iscritto a oggi' },
	{ valore: 'TRE_MESI', label: 'Ultimi 3 mesi' },
	{ valore: 'UN_MESE', label: 'Ultimo mese' }
]

/*
 * viewBox units, not pixels. The SVG scales to whatever width the card gives it, so these fix the
 * chart's ASPECT, and a bar's geometry is computed once against them instead of being remeasured on
 * every resize.
 */
const LARGHEZZA = 600
const ALTEZZA = 160

export const GraficoImprenditori = () => {
	const [periodo, setPeriodo] = useState<GraphQlPeriodoImprenditori>('TUTTO')
	const [result] = useQuery({
		query: ImprenditoriPerPeriodoDocument,
		variables: { periodo },
		context: CTX_ADMIN_RESOURCE
	})

	/*
	 * One guard on the whole series rather than a fallback per field, and that is not a tidying. A
	 * default bucket width — `serie?.granularita ?? 'GIORNO'` — would be a value nothing can ever
	 * observe: with no series there are no points either, so `barre` maps over an empty array and never
	 * reads the granularity. No assertion could tell that default from any other, which makes it a
	 * branch no test can hold in place. Either the server answered and both fields are real, or there
	 * is no chart to draw.
	 */
	const serie = result.data?.imprenditoriPerPeriodo
	const rettangoli = serie ? barre(serie.punti, serie.granularita, LARGHEZZA, ALTEZZA) : []
	// Summed off the bars, not off `punti`: a `Barra` is a `PuntoSerie`, so this is the same number
	// without a second copy of the guard above.
	const totale = totaleSerie(rettangoli)

	const selettore = (
		<SelectField
			label="Periodo"
			value={periodo}
			onChange={(e) => setPeriodo(e.target.value as GraphQlPeriodoImprenditori)}
			className="min-w-52"
		>
			{PERIODI.map((p) => (
				<option key={p.valore} value={p.valore}>
					{p.label}
				</option>
			))}
		</SelectField>
	)

	return (
		<Infobox title="Iscrizioni nel tempo" azioni={selettore}>
			{result.fetching ? <Spinner label="Caricamento grafico" /> : null}
			{result.error === undefined ? null : <Alert tone="error">{messageOf(result.error)}</Alert>}

			{/* Neither branch above short-circuits the chart: urql keeps the previous `data` while a range
			    change is in flight, so returning early on `fetching` would blank the whole card on every
			    change of the select and make the select feel like it reset something. */}
			{rettangoli.length === 0 ? (
				<p className="py-8 text-center text-sm text-tip">Nessuna iscrizione nel periodo selezionato.</p>
			) : (
				<>
					<svg
						viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}
						className="h-40 w-full"
						role="img"
						aria-label={`Iscrizioni per periodo: ${totale} in ${rettangoli.length} intervalli`}
						preserveAspectRatio="none"
					>
						{rettangoli.map((b) => (
							/* One rect per bucket, and a `<title>` inside it — the SVG equivalent of a `title`
							   attribute, which is what gives every bar a hover readout without a tooltip
							   library and without a second copy of the numbers in the DOM. */
							<rect key={b.data} x={b.x} y={b.y} width={b.larghezza} height={b.altezza} className="fill-third">
								<title>{`${b.etichetta}: ${b.totale}`}</title>
							</rect>
						))}
					</svg>

					{/* First and last only. Ninety-three daily labels do not fit, and thinning them to every
					    n-th is a rule that changes what it hides as soon as the range does — the endpoints are
					    what the axis is actually claiming. */}
					<div className="flex justify-between pt-1 text-xs text-tip">
						{estremi(rettangoli).map((e) => (
							<span key={e}>{e}</span>
						))}
					</div>

					<p className="pt-2 text-sm">
						Totale nel periodo: <span className="font-semibold">{totale}</span>
					</p>
				</>
			)}
		</Infobox>
	)
}
