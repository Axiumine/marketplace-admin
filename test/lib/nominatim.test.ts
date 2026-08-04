import { describe, expect, it } from 'vitest'

import { cercaIndirizzi, DELTA_BBOX, MAX_RISULTATI, urlMappa } from '@/lib/nominatim'

import { installaOsm, NOMINATIM_SEARCH, OSM_EMBED, risultatoOsm } from '../helpers/nominatim'

const cerca = (query = 'Via Roma 1 Milano') => cercaIndirizzi(query, new AbortController().signal)

describe('cercaIndirizzi', () => {
	/**
	 * The query string is the whole contract with Nominatim, asserted whole rather than sampled.
	 *
	 * `countrycodes=it` is not a nicety: every field around this one is an Italian address — five-digit
	 * CAP, two-letter province — so a Roman street in Texas is noise the operator reads past. `limit`
	 * keeps one answer small, which is what the usage policy asks of a client that fires on every pause
	 * in typing.
	 */
	it('asks Nominatim for Italian addresses only, in Italian, five at a time', async () => {
		const osm = installaOsm({ risultati: [] })

		await cerca('Via Roma 1')

		expect(osm.calls).toEqual([
			`${NOMINATIM_SEARCH}?q=Via+Roma+1&format=jsonv2&addressdetails=1&limit=${MAX_RISULTATI}&countrycodes=it&accept-language=it`
		])
	})

	it('flattens one result into the four fields the anagrafica stores', async () => {
		installaOsm({ risultati: [risultatoOsm()] })

		await expect(cerca()).resolves.toEqual([
			{
				id: '240109189',
				etichetta: 'Via Roma, 1, Milano, MI, 20121, Italia',
				indirizzo: 'Via Roma 1',
				cap: '20121',
				comune: 'Milano',
				provincia: 'MI',
				lat: 45.4642,
				lon: 9.1895
			}
		])
	})

	// A comune is tagged by size — `city`, `town`, `village` — and which one is present is not something
	// an address form can care about. Each spelling is one of the three, and the fallthrough is a place
	// with none of them: a motorway junction matches, and its comune is simply unknown.
	it.each([
		[{ town: 'Cantù' }, 'Cantù'],
		[{ village: 'Sirmione' }, 'Sirmione'],
		[{}, '']
	])('reads the comune out of %o', async (comune, atteso) => {
		installaOsm({
			risultati: [risultatoOsm({ address: { road: 'Via Verdi', house_number: '3', postcode: '22063', ...comune } })]
		})

		const [trovato] = await cerca()
		expect(trovato?.comune).toBe(atteso)
	})

	// A rural address has no `house_number` key at all. Joining regardless would store `Via Verdi ` with
	// a trailing space — invisible in the box, and never equal to the same street typed by hand.
	it('leaves no trailing space when the street has no number', async () => {
		installaOsm({ risultati: [risultatoOsm({ address: { road: 'Strada Provinciale 12' } })] })

		const [trovato] = await cerca()
		expect(trovato?.indirizzo).toBe('Strada Provinciale 12')
	})

	// `ISO3166-2-lvl6` is the province, and its value already is the code the form wants — prefixed with
	// the country. `county` is the province's *name*, spelled however the mappers wrote it.
	it('takes the province code off the ISO level-6 tag', async () => {
		installaOsm({
			risultati: [risultatoOsm({ address: { county: 'Città Metropolitana di Milano', 'ISO3166-2-lvl6': 'IT-MI' } })]
		})

		const [trovato] = await cerca()
		expect(trovato?.provincia).toBe('MI')
	})

	it('leaves the province empty when OSM has no level-6 tag for the point', async () => {
		installaOsm({ risultati: [risultatoOsm({ address: { road: 'Via Verdi' } })] })

		const [trovato] = await cerca()
		expect(trovato?.provincia).toBe('')
	})

	// Nominatim omits `address` entirely for some matches. Every field is then empty and the operator
	// fills them — which is a usable form, unlike a crash.
	it('survives a result with no address block at all', async () => {
		installaOsm({ risultati: [risultatoOsm({ address: undefined })] })

		const [trovato] = await cerca()
		expect(trovato).toMatchObject({ indirizzo: '', cap: '', comune: '', provincia: '' })
	})

	// 429 is what a client over the one-per-second limit is answered with, and 503 what the service sends
	// when it is shedding load. Both arrive as a body that parses — an HTML page — so the status is the
	// only thing that says the answer is not an address.
	it.each([429, 503])('throws on HTTP %i rather than reporting no matches', async (status) => {
		installaOsm({ status, body: '<html>Bandwidth limit exceeded</html>' })

		await expect(cerca()).rejects.toThrow(`Nominatim ha risposto ${String(status)}`)
	})

	it('throws when the answer is not the shape jsonv2 promises', async () => {
		installaOsm({ risultati: [{ display_name: 'Via Roma' }] })

		await expect(cerca()).rejects.toThrow()
	})

	// The signal is what keeps the answers in order: an abandoned request must not be able to land after
	// the one that replaced it.
	it('gives the request up when its signal is aborted', async () => {
		installaOsm({ pending: true })
		const controller = new AbortController()

		const pendente = cercaIndirizzi('Via Roma', controller.signal)
		controller.abort()

		await expect(pendente).rejects.toThrow('The operation was aborted.')
	})
})

describe('urlMappa', () => {
	it('frames a fixed box around the point, with a marker on it', () => {
		expect(urlMappa(45.4642, 9.1895)).toBe(
			`${OSM_EMBED}?bbox=9.18550,45.46020,9.19350,45.46820&layer=mapnik&marker=45.46420,9.18950`
		)
	})

	// The box is a constant, not Nominatim's own `boundingbox`: that one is the extent of the matched
	// object, so a house and a comune would zoom to wildly different scales in the same suggestion list.
	it('is the same width whatever the point', () => {
		expect(DELTA_BBOX).toBe(0.004)
		expect(urlMappa(41.9028, 12.4964)).toContain('bbox=12.49240,41.89880,12.50040,41.90680')
	})

	// Binary floating point writes `9.190000000000001` into a URL given the chance, which changes the
	// frame's `src` for nothing and reloads the map.
	it('rounds to five decimals so the URL is a pure function of the point', () => {
		expect(urlMappa(45.1, 9.2)).toBe(`${OSM_EMBED}?bbox=9.19600,45.09600,9.20400,45.10400&layer=mapnik&marker=45.10000,9.20000`)
	})
})
