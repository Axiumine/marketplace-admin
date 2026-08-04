/**
 * Geometry and labelling for the imprenditori-over-time chart.
 *
 * Kept apart from the component because it is the half with answers worth asserting: a rectangle's
 * height either encodes its value or it does not, and that is a number, not a rendering. The component
 * is then a `map` over what this returns.
 */

import type { GraphQlGranularitaPeriodo } from '@gql/adminResource/graphql'

/** One point as the server sends it — `data` is a `YYYY-MM-DD` bucket start, UTC. */
export interface PuntoSerie {
	data: string
	totale: number
}

/** One bar, in viewBox units, with the value it stands for kept alongside for the tooltip. */
export interface Barra extends PuntoSerie {
	x: number
	y: number
	larghezza: number
	altezza: number
	etichetta: string
}

/*
 * `timeZone: 'UTC'` on both, and it is load-bearing rather than tidy. `new Date('2026-08-01')` is
 * specified to parse the date-only form as UTC midnight, so an operator east of Greenwich formatting it
 * in the browser's own zone still reads 1 August — but one west of it reads 31 July, and a month bucket
 * would be labelled with the month before its own. The server buckets in UTC; so does the axis.
 */
const MESE_FORMAT = new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const GIORNO_FORMAT = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/**
 * The axis label for one bucket: `ago 2026` for a month, `02/08` for a day.
 *
 * The year is dropped from the day form on purpose — the two bounded ranges span at most three months,
 * so it would repeat on every one of ninety-odd labels to disambiguate nothing.
 */
export const etichettaBucket = (data: string, granularita: GraphQlGranularitaPeriodo): string => {
	const date = new Date(data)
	if (Number.isNaN(date.getTime())) return data

	return granularita === 'MESE' ? MESE_FORMAT.format(date) : GIORNO_FORMAT.format(date)
}

/**
 * A bucket nobody registered in is still drawn, as a one-unit tick on the baseline. Zero and "no bar
 * at all" are different claims — the first says nobody signed up that day, the second says the day is
 * outside the range — and the server fills gaps precisely so the chart can make the first one.
 */
const ALTEZZA_MINIMA = 1

/**
 * The bars, in the viewBox's own units, oldest first.
 *
 * ⚠️ **Bars and not a polyline**, and the reason is arithmetic rather than taste. A line's step is
 * `larghezza / (n - 1)`, which is a division by zero for a platform whose first imprenditore registered
 * this month — one bucket, one point, no segment to draw and an `Infinity` in the coordinates. A bar's
 * step is `larghezza / n`, which needs no special case at n = 1 and none at n = 0 either, since the
 * `map` below never runs.
 *
 * The scale floor of 1 is the other end of the same argument: a range in which nobody registered is a
 * legitimate answer, and `totale / 0` would put `NaN` in every coordinate. With a floor, that series
 * draws as a flat row of baseline ticks — which is what it is — instead of an empty box that reads as
 * a failed query.
 */
export const barre = (
	punti: readonly PuntoSerie[],
	granularita: GraphQlGranularitaPeriodo,
	larghezza: number,
	altezza: number
): Barra[] => {
	const massimo = Math.max(...punti.map((p) => p.totale), 1)
	const passo = larghezza / punti.length

	return punti.map((punto, i) => {
		const alta = Math.max((punto.totale / massimo) * altezza, ALTEZZA_MINIMA)

		return {
			...punto,
			x: i * passo,
			// SVG's origin is top-left, so a bar grows upwards by starting lower: the taller it is, the
			// smaller its `y`. Getting this the wrong way round hangs every bar from the ceiling, which
			// still looks like a chart.
			y: altezza - alta,
			larghezza: passo,
			altezza: alta,
			etichetta: etichettaBucket(punto.data, granularita)
		}
	})
}

/**
 * The axis' end labels — one entry for a single-bucket range, two otherwise.
 *
 * A `filter` on the index rather than `[0]` and `[length - 1]`: `noUncheckedIndexedAccess` types both
 * of those as possibly-undefined, and the `?.` that satisfies it would be a branch whose false arm is
 * unreachable — nothing could ever exercise it, so nothing could ever hold it in place either.
 */
export const estremi = (barre: readonly Barra[]): string[] =>
	barre.filter((_, i) => i === 0 || i === barre.length - 1).map((b) => b.etichetta)

/** The headline the chart sits under: how many registered across the whole range. */
export const totaleSerie = (punti: readonly PuntoSerie[]): number => punti.reduce((somma, p) => somma + p.totale, 0)
