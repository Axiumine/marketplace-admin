import type { ChangeEventHandler, InputHTMLAttributes, Ref } from 'react'
import { useEffect, useState } from 'react'

import { Alert } from '@/components/ui/Alert'
import { MappaIndirizzo } from '@/components/ui/MappaIndirizzo'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import type { IndirizzoTrovato } from '@/lib/nominatim'
import { cercaIndirizzi } from '@/lib/nominatim'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

/**
 * Longer than the table's 300 ms search, on purpose: that one hits our own Mongo, this one hits
 * Nominatim, whose usage policy allows one request per second per client. A street name is typed in
 * bursts, and 700 ms is the pause between words rather than between keystrokes.
 */
export const RICERCA_DEBOUNCE_MS = 700

/** Below this nothing is geocodable — `Via` matches every street in the country. */
export const LUNGHEZZA_MINIMA = 4

/** Rome. What the map frames when there is nothing else to frame, so the frame is never blank. */
const CENTRO_ITALIA = { lat: 41.9028, lon: 12.4964 }

/** A point the map can be framed on. Same two names the geocoder answers with. */
interface Punto {
	readonly lat: number
	readonly lon: number
}

/**
 * What sits between the box and the map. `null` is "nothing to say" — too short to geocode, or picked.
 *
 * The matches live *inside* the state rather than beside it, because a list and a flag saying whether
 * to show it are two ways to be wrong: an error arriving after a hit would clear the flag and leave the
 * old matches behind it, ready to reappear under the next address the moment anything set the flag back.
 */
type Esito =
	| { readonly tipo: 'ricerca' }
	| { readonly tipo: 'trovati'; readonly risultati: readonly IndirizzoTrovato[] }
	| { readonly tipo: 'vuoto' }
	| { readonly tipo: 'errore' }

/**
 * What the geocoder said, and which query it said it about.
 *
 * Tagged, because an answer outlives its question: the operator deletes half the address and the matches
 * for what used to be there are still in state, correct about a query nobody is asking any more.
 */
interface Risposta {
	readonly query: string
	readonly esito: Esito
}

/** Below `LUNGHEZZA_MINIMA` nothing is worth a request. `trim`, because four spaces are not an address. */
const geocodabile = (testo: string): boolean => testo.trim().length >= LUNGHEZZA_MINIMA

/**
 * What sits under the box: the answer to what is being asked, the wait for it, or nothing at all.
 *
 * All three are read off what is already known, and none of them is a state of its own. That matters
 * beyond tidiness — the alternative is writing "sto cercando" from inside the effect that starts the
 * request, and a synchronous write there is a second render for every keystroke that survives the
 * debounce, which is what `react-hooks/set-state-in-effect` is about.
 *
 * The three questions, in order:
 *
 * 1. Is there anything in the box worth geocoding? A pick empties `digitato` — the box then holds
 *    whatever the *form* wrote, which is not something anybody typed — so a pick closes the list here,
 *    and it stays closed until a key is pressed.
 * 2. Has the geocoder answered the query being asked? Then that answer, whatever it was. While the
 *    typing runs ahead of the debounce this is still the *previous* query, and its matches stay on
 *    screen rather than blinking out between two keystrokes.
 * 3. Otherwise a request is either in flight or about to be: the wait — but only once the debounce has
 *    caught up, so the spinner marks a request and not a pause in typing.
 */
const esitoDi = (digitato: string, query: string, risposta: Risposta | null): Esito | null => {
	if (!geocodabile(digitato)) return null
	if (risposta?.query === query) return risposta.esito

	return geocodabile(query) ? { tipo: 'ricerca' } : null
}

/*
 * `onSelect` is omitted from the input's own props, not just shadowed: the DOM has an `onSelect` of its
 * own — text being highlighted inside the box — and a prop of the same name with a different signature
 * is a type error rather than an override. The DOM one has no use here, and losing it is what lets the
 * meaningful name stay on the meaningful event.
 */
interface AddressFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onSelect' | 'onChange'> {
	label: string
	/** The address text. Controlled by the form: picking a suggestion rewrites it from the outside. */
	value: string
	error?: string | undefined
	/**
	 * Required, unlike the DOM's own.
	 *
	 * It is not just passed through — the field listens to it, because what the *keyboard* put in the box
	 * is the only thing worth geocoding and it is the one thing `value` cannot tell apart from what the
	 * form wrote back after a pick.
	 */
	onChange: ChangeEventHandler<HTMLInputElement>
	/** Called with the whole geocoded address, so the form can fill CAP, comune and provincia from it. */
	onSelect: (indirizzo: IndirizzoTrovato) => void
	/**
	 * Where to frame the map before anything is typed. Rome when nothing is given.
	 *
	 * For a form editing an address that already exists: the shop is somewhere, the map knows where, and
	 * opening the editor on the middle of Italy loses that for no reason. A form creating one passes
	 * nothing, because there is nothing to pass.
	 */
	centroIniziale?: Punto | null | undefined
	ref?: Ref<HTMLInputElement>
}

const SUGGERIMENTO_CLASS =
	'w-full rounded-box px-3 py-2 text-left text-sm hover:bg-palette-bg1 focus-visible:bg-palette-bg1 focus-visible:outline-none'

/**
 * An address box that geocodes what is typed into it: suggestions from OpenStreetMap underneath, and a
 * map of the current best match under those.
 *
 * The suggestions are a list of buttons, not an ARIA combobox. A combobox is a contract — arrow keys
 * move a virtual focus, `aria-activedescendant` follows it, Escape collapses the popup — and half of
 * it implemented is worse than none: the role promises a keyboard model that is not there. Buttons in
 * a labelled list are reachable by Tab, announce themselves, and lie about nothing.
 *
 * The component never writes the four address fields itself. It reports a pick through `onSelect` and
 * the form decides what to do with it — which is what keeps this reusable for the puntoVendita address
 * later, where the same OSM answer lands in different fields.
 */
export const AddressField = ({
	label,
	value,
	error,
	onChange,
	onSelect,
	centroIniziale = null,
	className = '',
	ref,
	...rest
}: AddressFieldProps) => {
	const [risposta, setRisposta] = useState<Risposta | null>(null)
	const [punto, setPunto] = useState<IndirizzoTrovato | null>(null)

	/**
	 * What the keyboard has put in the box since the last pick, and the only thing ever geocoded.
	 *
	 * ⚠️ Not `value`. The box is controlled by the form, and the form writes to it twice: once as the
	 * operator types, and again when a pick is accepted — and that second write came *from* the geocoder.
	 * Searching for it reopens the list under an address that was already chosen, asking OSM to confirm
	 * what it just said. Which of the two a given `value` is cannot be read off the value itself: it
	 * depends on what the form chose to write, and the two forms using this field write different things
	 * — a street here, the whole composed line there.
	 *
	 * Reset to empty by a pick rather than left holding the text that led to it. That is what closes the
	 * list for good: nothing is typed, so there is nothing to search for, and a debounce still in flight
	 * from before the pick settles onto the empty string instead of reopening the list behind it.
	 */
	const [digitato, setDigitato] = useState('')
	const query = useDebouncedValue(digitato, RICERCA_DEBOUNCE_MS)

	const esito = esitoDi(digitato, query, risposta)

	useEffect(() => {
		if (!geocodabile(query)) return

		const controller = new AbortController()

		cercaIndirizzi(query, controller.signal)
			.then((trovati) => {
				const primo = trovati[0]
				if (primo === undefined) {
					setRisposta({ query, esito: { tipo: 'vuoto' } })
					return
				}

				// The map follows the best match as the address is typed, before anything is picked.
				setPunto(primo)
				setRisposta({ query, esito: { tipo: 'trovati', risultati: trovati } })
			})
			.catch(() => {
				// An aborted request is this effect's own cleanup, not a failure: the operator typed another
				// character. Reporting it would flash "ricerca non disponibile" between two keystrokes.
				if (controller.signal.aborted) return

				setRisposta({ query, esito: { tipo: 'errore' } })
			})

		// Aborting is what keeps the answers in order. Without it a slow request for `Via Rom` can land
		// after a fast one for `Via Roma 1` and replace the newer suggestions with older ones.
		return () => {
			controller.abort()
		}
	}, [query])

	const scegli = (indirizzo: IndirizzoTrovato) => {
		setDigitato('')
		setPunto(indirizzo)
		setRisposta(null)
		onSelect(indirizzo)
	}

	const centro = punto ?? centroIniziale ?? CENTRO_ITALIA

	return (
		<div className={`flex flex-col gap-2 ${className}`}>
			<TextField
				label={label}
				error={error}
				value={value}
				autoComplete="off"
				ref={ref}
				onChange={(evento) => {
					setDigitato(evento.target.value)
					onChange(evento)
				}}
				{...rest}
			/>

			{esito?.tipo === 'ricerca' ? <Spinner label="Ricerca indirizzi in corso" /> : null}
			{esito?.tipo === 'errore' ? <Alert tone="error">Ricerca degli indirizzi non disponibile</Alert> : null}
			{esito?.tipo === 'vuoto' ? (
				<p role="status" className="text-sm text-tip">
					Nessun indirizzo trovato
				</p>
			) : null}
			{esito?.tipo === 'trovati' ? (
				<ul aria-label="Indirizzi trovati" className="rounded-box border border-tip bg-white">
					{esito.risultati.map((risultato) => (
						<li key={risultato.id} className="border-b border-palette-bg1 last:border-b-0">
							<button
								type="button"
								className={SUGGERIMENTO_CLASS}
								onClick={() => {
									scegli(risultato)
								}}
							>
								{risultato.etichetta}
							</button>
						</li>
					))}
				</ul>
			) : null}

			<MappaIndirizzo lat={centro.lat} lon={centro.lon} titolo="Mappa dell'indirizzo" />
		</div>
	)
}
