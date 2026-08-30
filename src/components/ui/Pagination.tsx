/**
 * Page numbers plus totals, not "load more".
 *
 * The admin table is something people scan and come back to, so the position has to be nameable —
 * a page number that lives in the URL is shareable and survives a reload, an infinite scroll offset is
 * neither.
 */
export const totalPages = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize))

/**
 * A window of at most `windowSize` page numbers centred on the current page, clamped to the ends.
 * Exported separately from the component because the clamping is the only real logic here and it is
 * worth testing without a DOM.
 */
export const pageWindow = (current: number, pages: number, windowSize = 5): number[] => {
	const half = Math.floor(windowSize / 2)
	const start = Math.max(1, Math.min(current - half, pages - windowSize + 1))
	const end = Math.min(pages, start + windowSize - 1)

	const result: number[] = []
	for (let page = start; page <= end; page += 1) result.push(page)
	return result
}

export const Pagination = ({
	page,
	pageSize,
	total,
	onPageChange
}: {
	page: number
	pageSize: number
	total: number
	onPageChange: (page: number) => void
}) => {
	const pages = totalPages(total, pageSize)
	const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1
	const lastRow = Math.min(page * pageSize, total)

	return (
		<div className="flex flex-wrap items-center justify-between gap-4 py-3 text-sm">
			<p aria-live="polite">
				{firstRow}–{lastRow} of {total}
			</p>

			<nav aria-label="Pagination" className="flex gap-1">
				<button
					type="button"
					disabled={page <= 1}
					aria-label="Previous page"
					className="rounded-box px-2 py-1 disabled:opacity-40"
					onClick={() => {
						onPageChange(page - 1)
					}}
				>
					‹
				</button>

				{pageWindow(page, pages).map((candidate) => (
					<button
						key={candidate}
						type="button"
						aria-label={`Page ${candidate}`}
						aria-current={candidate === page ? 'page' : undefined}
						className={`rounded-box px-2 py-1 ${candidate === page ? 'bg-third text-palette-white' : ''}`}
						onClick={() => {
							onPageChange(candidate)
						}}
					>
						{candidate}
					</button>
				))}

				<button
					type="button"
					disabled={page >= pages}
					aria-label="Next page"
					className="rounded-box px-2 py-1 disabled:opacity-40"
					onClick={() => {
						onPageChange(page + 1)
					}}
				>
					›
				</button>
			</nav>
		</div>
	)
}
