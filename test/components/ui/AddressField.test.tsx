import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AddressField, LUNGHEZZA_MINIMA, RICERCA_DEBOUNCE_MS } from '@/components/ui/AddressField'
import type { IndirizzoTrovato } from '@/lib/nominatim'

import { installaOsm, risultatoOsm } from '../../helpers/nominatim'

const MILANO = risultatoOsm()

const COMO = risultatoOsm({
	place_id: 12,
	display_name: 'Via Roma, 4, Como, CO, 22100, Italia',
	lat: '45.80800',
	lon: '9.08520',
	address: { road: 'Via Roma', house_number: '4', postcode: '22100', city: 'Como', 'ISO3166-2-lvl6': 'IT-CO' }
})

/**
 * The field is controlled from outside — the form owns the address text — so the test owns it too.
 *
 * Picking a suggestion writes the chosen address back into the box, which is what both real call sites
 * do with `setValue` and what makes the "do not search for what was just picked" rule reachable at all:
 * without the write-back the value never changes and the round-trip it skips never comes round.
 *
 * ⚠️ `componi` is what the two of them disagree on, and the disagreement is the whole reason the rule
 * cannot be a comparison against the box's text. `ImprenditoreAddForm` writes the street and puts the
 * CAP, comune and provincia in boxes of their own; the shop panel has one box and writes the composed
 * line into it. Both are "the address that was just picked" and neither can be recognised as such by
 * looking at it.
 */
const Ospite = ({
	onSelect = () => undefined,
	componi = (indirizzo) => indirizzo.indirizzo,
	valoreIniziale = '',
	centroIniziale
}: {
	onSelect?: (indirizzo: IndirizzoTrovato) => void
	componi?: (indirizzo: IndirizzoTrovato) => string
	valoreIniziale?: string
	centroIniziale?: { lat: number; lon: number }
}) => {
	const [value, setValue] = useState(valoreIniziale)

	return (
		<AddressField
			label="Indirizzo"
			value={value}
			centroIniziale={centroIniziale}
			onChange={(event) => {
				setValue(event.target.value)
			}}
			onSelect={(indirizzo) => {
				setValue(componi(indirizzo))
				onSelect(indirizzo)
			}}
		/>
	)
}

/** The composed line the shop panel writes back — street, CAP, comune and sigla, on one line. */
const composto = (indirizzo: IndirizzoTrovato) =>
	`${indirizzo.indirizzo}, ${indirizzo.cap} ${indirizzo.comune} (${indirizzo.provincia})`

// Fake timers throughout: the debounce is the component's whole rhythm, and waiting 700 ms of wall
// clock per assertion would make this file the slowest in the suite for no added confidence.
beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

const scrivi = (testo: string) => {
	fireEvent.change(screen.getByLabelText('Indirizzo'), { target: { value: testo } })
}

/** Runs out the debounce and lets the request that follows settle. */
const attendiRicerca = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(RICERCA_DEBOUNCE_MS)
	})
}

const mappa = () => screen.getByTitle("Mappa dell'indirizzo")

describe('AddressField', () => {
	it('renders a map of Italy before anything is typed', () => {
		installaOsm()
		const { container } = render(<Ospite />)

		expect(mappa().getAttribute('src')).toContain('marker=41.90280,12.49640')
		expect(container).toMatchSnapshot()
	})

	/*
	 * Nominatim is a donated service with a one-request-per-second policy, so the two guards that keep
	 * requests off it are behaviour, not optimisation.
	 *
	 * The padded value is the one that matters: `'  Via  '` is seven characters and three letters, and a
	 * length check that forgot to trim would spend a request on a box that looks empty.
	 */
	it.each(['Via', '  Via  '])('does not geocode %o — too short to be an address', async (testo) => {
		const osm = installaOsm({ risultati: [MILANO] })
		render(<Ospite />)

		scrivi(testo)
		await attendiRicerca()

		expect(osm.calls).toHaveLength(0)
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
	})

	// Exactly at the minimum, which is the boundary the guard is written on: `Roma` is four characters
	// and is geocodable.
	it('geocodes a value exactly at the minimum length', async () => {
		const osm = installaOsm({ risultati: [MILANO] })
		render(<Ospite />)

		expect(LUNGHEZZA_MINIMA).toBe(4)
		scrivi('Roma')
		await attendiRicerca()

		expect(osm.calls).toHaveLength(1)
	})

	it('waits for the typing to stop before spending a request', async () => {
		const osm = installaOsm({ risultati: [MILANO] })
		render(<Ospite />)

		scrivi('Via Rom')
		await act(async () => {
			await vi.advanceTimersByTimeAsync(RICERCA_DEBOUNCE_MS - 1)
		})
		expect(osm.calls).toHaveLength(0)
		// And says nothing while it waits: the spinner means a request is out, not that the operator paused
		// between two words. One that appears on the first keystroke is on screen for the whole address.
		expect(screen.queryByRole('status')).not.toBeInTheDocument()

		scrivi('Via Roma 1')
		await attendiRicerca()

		expect(osm.calls).toHaveLength(1)
		expect(osm.calls[0]).toContain('q=Via+Roma+1')
	})

	it('shows the suggestions OSM answered with', async () => {
		installaOsm({ risultati: [MILANO, COMO] })
		const { container } = render(<Ospite />)

		scrivi('Via Roma 1')
		await attendiRicerca()

		const suggerimenti = screen.getAllByRole('button')
		expect(suggerimenti.map((b) => b.textContent)).toEqual([
			'Via Roma, 1, Milano, MI, 20121, Italia',
			'Via Roma, 4, Como, CO, 22100, Italia'
		])
		expect(container).toMatchSnapshot()
	})

	it('announces the wait while the geocoder is answering', async () => {
		installaOsm({ pending: true })
		const { container } = render(<Ospite />)

		scrivi('Via Roma 1')
		await attendiRicerca()

		expect(screen.getByRole('status')).toHaveTextContent('Ricerca indirizzi in corso')
		expect(container).toMatchSnapshot()
	})

	// The map follows the best match as the address is typed, before anything is picked — that is what
	// "the map updates as you write" means, and it is the only feedback that says the geocoder
	// understood the address.
	it('moves the map onto the best match while the address is being typed', async () => {
		installaOsm({ risultati: [MILANO, COMO] })
		render(<Ospite />)

		scrivi('Via Roma 1')
		await attendiRicerca()

		expect(mappa().getAttribute('src')).toContain('marker=45.46420,9.18950')
	})

	it('says so when the address matches nothing', async () => {
		installaOsm({ risultati: [] })
		const { container } = render(<Ospite />)

		scrivi('Via Inesistente 99')
		await attendiRicerca()

		expect(screen.getByRole('status')).toHaveTextContent('Nessun indirizzo trovato')
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
		expect(container).toMatchSnapshot()
	})

	// 429 is what a client over the usage limit gets. "Nothing found" would be a lie: the address may
	// well exist and nobody asked.
	it('reports a geocoder failure instead of pretending there are no matches', async () => {
		installaOsm({ status: 429, body: 'Too Many Requests' })
		const { container } = render(<Ospite />)

		scrivi('Via Roma 1')
		await attendiRicerca()

		expect(screen.getByRole('alert')).toHaveTextContent('Ricerca degli indirizzi non disponibile')
		expect(container).toMatchSnapshot()
	})

	/*
	 * The request the operator has already typed past is abandoned, and abandoning it is what keeps the
	 * answers in order.
	 *
	 * Nominatim answers a vague address slowly and a precise one quickly, so the slow answer to `Via
	 * Roma` can land well after the quick one to `Via Roma 4 Como` — and a client that lets both through
	 * shows the older matches last, over the newer ones, with the map on a city the operator has
	 * finished correcting.
	 */
	it('lets the newer answer win over an older one still in flight', async () => {
		installaOsm([{ risultati: [MILANO], ritardo: 3000 }, { risultati: [COMO] }])
		render(<Ospite />)

		scrivi('Via Roma')
		await attendiRicerca()

		scrivi('Via Roma 4 Como')
		await attendiRicerca()

		// Where the first answer would have landed, had it not been given up on.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(3000)
		})

		expect(screen.getByRole('button', { name: 'Via Roma, 4, Como, CO, 22100, Italia' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Via Roma, 1, Milano, MI, 20121, Italia' })).not.toBeInTheDocument()
		expect(mappa().getAttribute('src')).toContain('marker=45.80800,9.08520')
	})

	/*
	 * Giving a request up is not a failure, and must not be reported as one.
	 *
	 * Deleting back to something too short to geocode is the case that shows it: the request in flight is
	 * abandoned and nothing replaces it, so an abandonment mistaken for a failure has the field sitting
	 * there with "ricerca non disponibile" under an almost-empty box.
	 */
	it('does not report the request it abandoned itself', async () => {
		installaOsm({ pending: true })
		render(<Ospite />)

		scrivi('Via Roma')
		await attendiRicerca()
		expect(screen.getByRole('status')).toHaveTextContent('Ricerca indirizzi in corso')

		scrivi('Via')
		await attendiRicerca()

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
	})

	/*
	 * And leaves nothing behind either, which is the half the test above cannot see. What the catch would
	 * write is keyed by the query it belonged to, and a query too short to geocode shows no state at all —
	 * so a failure recorded for the abandoned request stays hidden exactly until that query comes back. An
	 * operator who deletes a word and types it again is asking the same question, and would be told the
	 * geocoder is down while the fresh request for it is still in flight.
	 */
	it('does not report it later either, when the abandoned query is typed again', async () => {
		installaOsm({ pending: true })
		render(<Ospite />)

		scrivi('Via Roma')
		await attendiRicerca()

		scrivi('Via')
		await attendiRicerca()

		scrivi('Via Roma')
		await attendiRicerca()

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
		expect(screen.getByRole('status')).toHaveTextContent('Ricerca indirizzi in corso')
	})

	it('hands the whole geocoded address up and closes the list when one is picked', async () => {
		installaOsm({ risultati: [MILANO, COMO] })
		const onSelect = vi.fn()
		render(<Ospite onSelect={onSelect} />)

		scrivi('Via Roma')
		await attendiRicerca()
		fireEvent.click(screen.getByRole('button', { name: 'Via Roma, 4, Como, CO, 22100, Italia' }))

		expect(onSelect).toHaveBeenCalledWith({
			id: '12',
			etichetta: 'Via Roma, 4, Como, CO, 22100, Italia',
			indirizzo: 'Via Roma 4',
			cap: '22100',
			comune: 'Como',
			provincia: 'CO',
			lat: 45.808,
			lon: 9.0852
		})
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
	})

	it('leaves the map on the address that was picked, not on the best match', async () => {
		installaOsm({ risultati: [MILANO, COMO] })
		render(<Ospite />)

		scrivi('Via Roma')
		await attendiRicerca()
		fireEvent.click(screen.getByRole('button', { name: 'Via Roma, 4, Como, CO, 22100, Italia' }))

		expect(mappa().getAttribute('src')).toContain('marker=45.80800,9.08520')
	})

	/*
	 * Picking writes the chosen address into the box, which is a change like any other and would come
	 * back round as a search for the address that was just chosen — reopening the list under it and
	 * spending a second request to be told what the operator already accepted.
	 */
	it('does not geocode the address it just filled in', async () => {
		const osm = installaOsm({ risultati: [MILANO] })
		render(<Ospite />)

		scrivi('via roma milano')
		await attendiRicerca()
		fireEvent.click(screen.getByRole('button', { name: 'Via Roma, 1, Milano, MI, 20121, Italia' }))
		await attendiRicerca()

		expect(osm.calls).toHaveLength(1)
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ The same rule, for a form that writes back something other than the street.
	 *
	 * This is the one that broke: the guard used to be "is the box holding the street of the address that
	 * was picked", which the shop panel's composed line never is. The list came back a second after the
	 * pick, under a box already holding the answer — a second address input, in a card whose whole point
	 * is having one.
	 *
	 * There is no comparison to fix here, because none can work: what the form writes back is the form's
	 * business. Only the keyboard is geocoded, and a pick is not the keyboard.
	 */
	it('does not geocode what a form writes back, whatever it writes', async () => {
		const osm = installaOsm({ risultati: [MILANO] })
		render(<Ospite componi={composto} />)

		scrivi('via roma milano')
		await attendiRicerca()
		fireEvent.click(screen.getByRole('button', { name: 'Via Roma, 1, Milano, MI, 20121, Italia' }))

		expect(screen.getByLabelText('Indirizzo')).toHaveValue('Via Roma 1, 20121 Milano (MI)')
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
		// Nothing at all under the box, not even the spinner. The debounce is still holding the text that led
		// to the pick, and a field that reads that instead of the keyboard starts searching for it.
		expect(screen.queryByRole('status')).not.toBeInTheDocument()

		await attendiRicerca()

		expect(osm.calls).toHaveLength(1)
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
	})

	// And it stays shut for as long as nobody types: the debounce has nothing left to settle onto, so no
	// number of ticks brings the list back.
	it('leaves the list shut until something is typed again', async () => {
		const osm = installaOsm({ risultati: [MILANO] })
		render(<Ospite componi={composto} />)

		scrivi('via roma milano')
		await attendiRicerca()
		fireEvent.click(screen.getByRole('button', { name: 'Via Roma, 1, Milano, MI, 20121, Italia' }))
		await attendiRicerca()
		await attendiRicerca()

		expect(osm.calls).toHaveLength(1)
		expect(screen.queryByRole('list')).not.toBeInTheDocument()

		scrivi('Via Roma 1, 20121 Milano (MI) 2')
		await attendiRicerca()

		expect(osm.calls).toHaveLength(2)
		expect(screen.getByRole('list')).toBeInTheDocument()
	})

	/*
	 * A form editing an address that already exists hands the field its text, and that text is not
	 * something anybody typed. Geocoding it would open a list of suggestions over an address nobody asked
	 * about, and spend a request on a donated service to do it.
	 */
	it('does not geocode the address it was opened with', async () => {
		const osm = installaOsm({ risultati: [MILANO] })
		render(<Ospite valoreIniziale="Via Verdi 8, 20100 Milano (MI)" />)

		await attendiRicerca()

		expect(osm.calls).toHaveLength(0)
		expect(screen.queryByRole('list')).not.toBeInTheDocument()
	})

	// The shop the editor was opened on, and not the middle of Italy: the position exists, the card was
	// drawing it a moment ago, and the first four characters typed are no reason to lose it.
	it('frames the map on the point it was given until the geocoder answers', async () => {
		installaOsm({ risultati: [COMO] })
		render(<Ospite centroIniziale={{ lat: 45.4642, lon: 9.19 }} />)

		expect(mappa().getAttribute('src')).toContain('marker=45.46420,9.19000')

		scrivi('Via Roma 4 Como')
		await attendiRicerca()

		expect(mappa().getAttribute('src')).toContain('marker=45.80800,9.08520')
	})
})
