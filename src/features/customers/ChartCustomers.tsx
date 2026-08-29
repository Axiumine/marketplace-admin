import type { GraphQlUsersPeriod } from '@gql/adminResource/graphql'
import { useState } from 'react'
import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { UsersPerPeriodDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Infobox } from '@/components/ui/Infobox'
import { SelectField } from '@/components/ui/SelectField'
import { Spinner } from '@/components/ui/Spinner'
import { bars, bounds, seriesTotal } from '@/lib/chart'

/**
 * Customer registrations over time, as a bar per bucket — the twin of `ChartShopOwners`, over the other
 * collection.
 *
 * The range is the operator's choice; the **bucket width is not**, and comes back in the response: the
 * server answers `ALL` by month and the two bounded ranges by day, and the chart labels from
 * `granularity` rather than guessing from the number of points.
 *
 * ⚠️ The whole series is counted off `registeredAt` alone, which is the one field on `user` that was
 * never encrypted. That is why this chart exists while the table beside it still has no search box —
 * ADR-029 blocks matching and ordering ciphertext, and a bucket count is neither.
 */

/**
 * The three ranges, widest first, because the widest is the default and a select whose first option is
 * not its value reads as already changed.
 */
const PERIODS: { value: GraphQlUsersPeriod; label: string }[] = [
	{ value: 'ALL', label: 'From the first sign-up to today' },
	{ value: 'THREE_MONTHS', label: 'Last 3 months' },
	{ value: 'ONE_MONTH', label: 'Last month' }
]

/*
 * viewBox units, not pixels. The SVG scales to whatever width the card gives it, so these fix the
 * chart's ASPECT, and a bar's geometry is computed once against them instead of being remeasured on
 * every resize.
 */
const WIDTH = 600
const HEIGHT = 160

export const ChartCustomers = () => {
	const [period, setPeriod] = useState<GraphQlUsersPeriod>('ALL')
	const [result] = useQuery({
		query: UsersPerPeriodDocument,
		variables: { period },
		context: CTX_ADMIN_RESOURCE
	})

	/*
	 * One guard on the whole series rather than a fallback per field: with no series there are no points
	 * either, so a default granularity would be a value nothing can ever observe and no test could hold
	 * in place. Either the server answered and both fields are real, or there is no chart to draw.
	 */
	const series = result.data?.usersPerPeriod
	const rects = series ? bars(series.points, series.granularity, WIDTH, HEIGHT) : []
	// Summed off the bars, not off `points`: a `Bar` is a `SeriesPoint`, so this is the same number
	// without a second copy of the guard above.
	const total = seriesTotal(rects)

	const selector = (
		<SelectField
			label="Period"
			value={period}
			onChange={(e) => setPeriod(e.target.value as GraphQlUsersPeriod)}
			className="min-w-52"
		>
			{PERIODS.map((p) => (
				<option key={p.value} value={p.value}>
					{p.label}
				</option>
			))}
		</SelectField>
	)

	return (
		<Infobox title="Registrations over time" actions={selector}>
			{result.fetching ? <Spinner label="Loading chart" /> : null}
			{result.error === undefined ? null : <Alert tone="error">{messageOf(result.error)}</Alert>}

			{/* Neither branch above short-circuits the chart: urql keeps the previous `data` while a range
			    change is in flight, so returning early on `fetching` would blank the whole card on every
			    change of the select and make the select feel like it reset something. */}
			{rects.length === 0 ? (
				<p className="py-8 text-center text-sm text-tip">No sign-ups in the selected period.</p>
			) : (
				<>
					<svg
						viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
						className="h-40 w-full"
						role="img"
						aria-label={`Registrations per period: ${total} in ${rects.length} intervals`}
						preserveAspectRatio="none"
					>
						{rects.map((b) => (
							/* One rect per bucket, and a `<title>` inside it — the SVG equivalent of a `title`
							   attribute, which is what gives every bar a hover readout without a tooltip
							   library and without a second copy of the numbers in the DOM. */
							<rect key={b.date} x={b.x} y={b.y} width={b.width} height={b.height} className="fill-third">
								<title>{`${b.label}: ${b.total}`}</title>
							</rect>
						))}
					</svg>

					{/* First and last only. Ninety-three daily labels do not fit, and thinning them to every
					    n-th is a rule that changes what it hides as soon as the range does — the endpoints are
					    what the axis is actually claiming. */}
					<div className="flex justify-between pt-1 text-xs text-tip">
						{bounds(rects).map((e) => (
							<span key={e}>{e}</span>
						))}
					</div>

					<p className="pt-2 text-sm">
						Total in period: <span className="font-semibold">{total}</span>
					</p>
				</>
			)}
		</Infobox>
	)
}
