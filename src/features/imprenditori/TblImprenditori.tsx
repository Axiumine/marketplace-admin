import type { GraphQlImprenditoriTblSortField, GraphQlSortDirection } from '@gql/adminResource/graphql'
import { Link } from '@tanstack/react-router'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import { useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { ImprenditoriAttiviTblDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Pagination } from '@/components/ui/Pagination'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import { formatDate, formatIndirizzo } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

/** How long the search box waits after the last keystroke before it costs a round-trip. */
export const SEARCH_DEBOUNCE_MS = 300

export interface ImprenditoriQuery {
	search: string
	page: number
	pageSize: number
	sortBy: GraphQlImprenditoriTblSortField
	sortDir: GraphQlSortDirection
}

interface Row {
	_id: string
	nome: string
	cognome: string
	iscrizione: string
	indirizzo: string
}

/**
 * Columns, in display order, each paired with the backend sort field it maps to.
 *
 * Nome and cognome are two columns, not one composed "Nome" cell. A concatenation is not a sortable
 * thing — the backend indexes `anagrafica.nome` and `anagrafica.cognome` separately and nothing
 * indexes the pair joined by a space — so splitting them is what makes either sort reachable at all.
 * Surname-first is the ordering an operator scanning a list of people expects. The row's link lives on
 * the cognome cell only: one link per row rather than two pointing at the same place.
 *
 * `Indirizzo` sorts by COMUNE: the full address string is composed client-side and, again, is not an
 * index. Sorting by town is the part that is actually useful.
 */
const SORT_FIELD = {
	cognome: 'COGNOME',
	nome: 'NOME',
	iscrizione: 'ISCRIZIONE',
	indirizzo: 'COMUNE'
} as const satisfies Record<string, GraphQlImprenditoriTblSortField>

type SortableColumn = keyof typeof SORT_FIELD

const column = createColumnHelper<Row>()

/**
 * The next sort state for a header click: a new column starts ascending, the current column flips.
 * Pure, and exported, because it is the only branch in the header that can be wrong.
 */
export const nextSort = (
	clicked: GraphQlImprenditoriTblSortField,
	current: GraphQlImprenditoriTblSortField,
	dir: GraphQlSortDirection
): { sortBy: GraphQlImprenditoriTblSortField; sortDir: GraphQlSortDirection } =>
	clicked === current ? { sortBy: clicked, sortDir: dir === 'ASC' ? 'DESC' : 'ASC' } : { sortBy: clicked, sortDir: 'ASC' }

const ariaSort = (
	field: GraphQlImprenditoriTblSortField,
	current: GraphQlImprenditoriTblSortField,
	dir: GraphQlSortDirection
): 'ascending' | 'descending' | 'none' => {
	if (field !== current) return 'none'
	return dir === 'ASC' ? 'ascending' : 'descending'
}

/**
 * The imprenditori table.
 *
 * Pure with respect to the URL: it receives the whole query state as props and reports changes through
 * `onQueryChange`. The route owns the search params, so a sort or a page is a real navigation — back
 * works, and a link to page 4 sorted by town is a link someone can send.
 *
 * ⚠️ Search, sort and paging all happen in MongoDB, against the indexes marketplace-db-setup builds for
 * exactly these four fields. Never move any of the three into the browser: doing so means fetching the
 * whole `imprenditore` collection to show twenty rows, and the cost grows with every signup.
 *
 * There is deliberately no row-selection checkbox column. Nothing here acts on a selection, and a
 * checkbox that collects one is a control that promises a bulk action the app does not have.
 */
export const TblImprenditori = ({
	query,
	onQueryChange
}: {
	query: ImprenditoriQuery
	onQueryChange: (next: Partial<ImprenditoriQuery>) => void
}) => {
	const [searchInput, setSearchInput] = useState(query.search)
	const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

	// Pushing the debounced value up rather than querying on it directly keeps a single source of truth:
	// the URL. Resetting to page 1 matters — a narrower search almost always has fewer pages than the
	// one the operator is standing on, and page 7 of 2 renders empty.
	useEffect(() => {
		if (debouncedSearch !== query.search) onQueryChange({ search: debouncedSearch, page: 1 })
	}, [debouncedSearch, query.search, onQueryChange])

	const [result] = useQuery({
		query: ImprenditoriAttiviTblDocument,
		variables: {
			offset: (query.page - 1) * query.pageSize,
			limit: query.pageSize,
			search: query.search === '' ? null : query.search,
			sortBy: query.sortBy,
			sortDir: query.sortDir
		},
		context: CTX_ADMIN_RESOURCE
	})

	const page = result.data?.imprenditoriAttiviTbl
	const rows: Row[] = (page?.items ?? []).map((item) => ({
		_id: item._id,
		nome: item.anagrafica.nome,
		cognome: item.anagrafica.cognome,
		iscrizione: formatDate(item.iscrizione),
		indirizzo: formatIndirizzo(item.anagrafica.indirizzo)
	}))

	const columns = [
		column.accessor('cognome', {
			header: 'Cognome',
			cell: (info) => (
				<Link to="/p/imprenditori/id/$_id" params={{ _id: info.row.original._id }} className="underline">
					{info.getValue()}
				</Link>
			)
		}),
		column.accessor('nome', { header: 'Nome' }),
		column.accessor('iscrizione', { header: 'Iscrizione' }),
		column.accessor('indirizzo', { header: 'Indirizzo' })
	]

	// The React Compiler skips auto-memoizing this component because `useReactTable` hands back functions
	// it cannot prove stable — see the `react-hooks/incompatible-library` override in eslint.config.js
	// for why that is accepted here rather than worked around.
	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		// Paging, sorting and searching are all the server's job — `rows` is already the one page that was
		// asked for. `getCoreRowModel` is the only row model registered, which is what actually keeps the
		// table from re-sorting or re-filtering the page it was handed; `manualSorting` and
		// `manualFiltering` would only be read by the sorted and filtered row models, and there are none.
		// `manualPagination` is not decoration in the same way: it is what stops `getPageCount()` from
		// being derived from the length of the current page.
		manualPagination: true
	})

	return (
		<div className="flex flex-col gap-4">
			<TextField
				label="Cerca imprenditore"
				type="search"
				value={searchInput}
				onChange={(event) => {
					setSearchInput(event.target.value)
				}}
			/>

			{result.error === undefined ? null : <Alert tone="error">{messageOf(result.error)}</Alert>}

			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead>
						{table.getHeaderGroups().map((group) => (
							<tr key={group.id}>
								{group.headers.map((header) => {
									const field = SORT_FIELD[header.column.id as SortableColumn]

									return (
										<th
											key={header.id}
											scope="col"
											className="border-b border-palette-bg3/20 p-2"
											aria-sort={ariaSort(field, query.sortBy, query.sortDir)}
										>
											<button
												type="button"
												className="font-bold"
												onClick={() => {
													onQueryChange({ ...nextSort(field, query.sortBy, query.sortDir), page: 1 })
												}}
											>
												{flexRender(header.column.columnDef.header, header.getContext())}
											</button>
										</th>
									)
								})}
							</tr>
						))}
					</thead>

					<tbody>
						{table.getRowModel().rows.map((row) => (
							<tr key={row.id} className="border-b border-palette-bg3/10">
								{row.getVisibleCells().map((cell) => (
									<td key={cell.id} className="p-2">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{result.fetching ? <Spinner label="Caricamento imprenditori" /> : null}
			{!result.fetching && rows.length === 0 ? <p className="text-tip">Nessun imprenditore trovato.</p> : null}

			<Pagination
				page={query.page}
				pageSize={query.pageSize}
				total={page?.total ?? 0}
				onPageChange={(next) => {
					onQueryChange({ page: next })
				}}
			/>
		</div>
	)
}
