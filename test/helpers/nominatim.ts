import { vi } from 'vitest'

import type { RestHandler } from './graphql'

/** The prefix every geocoder request starts with. Anything else is not this stub's business. */
export const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'

/** The OSM embed the map frame points at. */
export const OSM_EMBED = 'https://www.openstreetmap.org/export/embed.html'

export interface RispostaOsm {
	/** The parsed array Nominatim answers with. Defaults to no matches. */
	risultati?: readonly unknown[]
	/** HTTP status. Defaults to 200 — 429 and 503 are what a rate-limited client actually gets. */
	status?: number
	/** A raw body, for the answer that is not JSON at all. Wins over `risultati`. */
	body?: string
	/** Never settles unless the request is aborted, pinning the field in its searching state. */
	pending?: boolean
	/**
	 * Milliseconds before the answer settles; immediate by default.
	 *
	 * What makes a slow answer land *after* a fast one that replaced it — the only way to tell a client
	 * that abandons the request it superseded from one that lets both through in whatever order.
	 */
	ritardo?: number
}

/**
 * One Nominatim result, with the keys the real service sends for an Italian street address.
 *
 * `lat`/`lon` are strings and `place_id` a number because that is what jsonv2 puts on the wire — the
 * coercion in `src/lib/nominatim.ts` exists for exactly this, and a fixture that pre-converted them
 * would leave it untested.
 */
export const risultatoOsm = (over: Record<string, unknown> = {}) => ({
	place_id: 240109189,
	display_name: 'Via Roma, 1, Milano, MI, 20121, Italia',
	lat: '45.46420',
	lon: '9.18950',
	address: {
		road: 'Via Roma',
		house_number: '1',
		postcode: '20121',
		city: 'Milano',
		county: 'Milano',
		'ISO3166-2-lvl6': 'IT-MI',
		country_code: 'it'
	},
	...over
})

/**
 * Rejects when the request is aborted, the way the real `fetch` does.
 *
 * Worth the few lines: the address field's whole ordering guarantee is that an abandoned request
 * cannot land after the one that replaced it, and a stub that ignored `signal` would answer both and
 * prove the opposite of what the test claims.
 */
const abortoDi = (signal: AbortSignal | null | undefined): Promise<never> =>
	new Promise<never>((_, reject) => {
		if (signal === null || signal === undefined) return

		const rifiuta = () => {
			reject(new DOMException('The operation was aborted.', 'AbortError'))
		}

		if (signal.aborted) rifiuta()
		else signal.addEventListener('abort', rifiuta)
	})

const rispostaDi = (risposta: RispostaOsm): Response =>
	new Response(risposta.body ?? JSON.stringify(risposta.risultati ?? []), {
		status: risposta.status ?? 200,
		headers: { 'content-type': 'application/json' }
	})

const consegna = (risposta: RispostaOsm): Promise<Response> =>
	risposta.ritardo === undefined
		? Promise.resolve(rispostaDi(risposta))
		: new Promise<Response>((resolve) => {
				setTimeout(() => {
					resolve(rispostaDi(risposta))
				}, risposta.ritardo)
			})

export interface OsmStub {
	/** Every geocoder URL requested, in order. */
	readonly calls: string[]
	/** Pass to `stubGraphQL(replies, rest)` in a test that also talks GraphQL. */
	readonly rest: RestHandler
}

/**
 * A queue of geocoder answers, as a handler `stubGraphQL` can be given.
 *
 * The last answer in the queue repeats, like the GraphQL helper's: a test that does not care how many
 * times the field re-queries does not have to count.
 */
export const osmStub = (risposte: RispostaOsm | readonly RispostaOsm[] = {}): OsmStub => {
	const coda = Array.isArray(risposte) ? [...(risposte as RispostaOsm[])] : [risposte as RispostaOsm]
	const calls: string[] = []

	const rest: RestHandler = (url, init) => {
		if (!url.startsWith(NOMINATIM_SEARCH)) return undefined

		calls.push(url)
		const risposta = coda.length > 1 ? (coda.shift() as RispostaOsm) : (coda[0] as RispostaOsm)
		const aborto = abortoDi(init?.signal)

		return risposta.pending === true ? aborto : Promise.race([consegna(risposta), aborto])
	}

	return { calls, rest }
}

/** The same queue installed as the only `fetch` there is, for a test that sends nothing else. */
export const installaOsm = (risposte: RispostaOsm | readonly RispostaOsm[] = {}): OsmStub => {
	const stub = osmStub(risposte)

	vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
		const risposta = stub.rest(String(input), init)
		if (risposta === undefined) throw new Error(`Richiesta non gestita: ${String(input)}`)

		return Promise.resolve(risposta)
	})

	return stub
}
