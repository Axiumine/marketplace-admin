import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { RICERCA_DEBOUNCE_MS } from '@/components/ui/AddressField'
import { INTESTAZIONE_VALIDAZIONE } from '@/components/ui/ToastValidazione'

import type { GraphQLReplies, GraphQLStub } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import type { RispostaOsm } from '../../helpers/nominatim'
import { osmStub, risultatoOsm } from '../../helpers/nominatim'
import { pagina } from '../../helpers/pagina'
import { renderRoute } from '../../helpers/render'

const ID = '65f0000000000000000000f1'
const DETAIL = `/p/imprenditori/id/${ID}`

const anagrafica = {
	ImprenditoreById: {
		data: {
			imprenditoreById: {
				_id: ID,
				iscrizione: '2026-02-01T08:05:45.000Z',
				deleted: null,
				disabled: false,
				waitApprov: false,
				login: {
					email: 'mario@rossi.it',
					firstLogin: null,
					lastLogin: null,
					onboardingStep: '0',
					onboardingDone: false,
					rememberMe: false
				},
				anagrafica: {
					nome: 'Mario',
					cognome: 'Rossi',
					nascita: { data: '1980-06-15T00:00:00.000Z' },
					contatti: { email: 'contatto@rossi.it', fisso: null, cellulare: '3331234567' },
					indirizzo: { indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano', provincia: 'MI' }
				},
				resetPwd: null
			}
		}
	}
}

const ID_AZIENDA = '65f0000000000000000000a1'

/**
 * ⚠️ The `__typename` is load-bearing. urql's document cache invalidates by the typenames a *response*
 * mentions, and all three writes here answer a bare `Boolean` that mentions none — so the call site names
 * the types itself through `additionalTypenames`, which can only match a cached result carrying them.
 *
 * `cf` and `univoco` arrive `null`, which is the shape of every company stored before 20260803000000:
 * neither field existed on the punto vendita's embedded object that the migration lifted out.
 */
const azienda = {
	__typename: 'GraphQLAzienda',
	_id: ID_AZIENDA,
	ragionesociale: 'Pizzeria da Mario S.r.l.',
	piva: '12345678901',
	cf: null,
	referente: 'Mario Rossi',
	amministratore: 'Mario Rossi',
	univoco: null,
	pec: 'pizzeria@pec.it',
	visura: 'MI-123456',
	indirizzo: {
		indirizzo: 'Via Dante 3',
		cap: '20121',
		comune: 'Milano',
		provincia: 'MI',
		position: { type: 'Point', coordinates: [9.1859, 45.4668] }
	}
}

/** A second company of the same imprenditore, for the tests that need two cards on the page. */
const aziendaDue = {
	...azienda,
	_id: '65f0000000000000000000a2',
	ragionesociale: 'Pizzeria da Anna S.r.l.',
	// Both unique across the whole collection, so two rows seeded from one literal would be a pair no
	// database would ever hold.
	piva: '10987654321',
	pec: 'anna@pec.it'
}

/** The same company, already sitting on exactly the address the geocoder stub answers with. */
const aziendaGeocodata = {
	...azienda,
	indirizzo: {
		indirizzo: 'Via Roma 1',
		cap: '20121',
		comune: 'Milano',
		provincia: 'MI',
		position: { type: 'Point', coordinates: [9.1895, 45.4642] }
	}
}

/**
 * One shop of the same imprenditore, for the tests that need the section below to be holding a cached
 * result with a `GraphQLPuntoVendita` in it. Trimmed to the fields that query asks for.
 */
const puntoVendita = {
	__typename: 'GraphQLPuntoVendita',
	_id: '65f00000000000000000000a',
	inserted: '2026-01-10T09:30:00.000Z',
	nome: 'Pizzeria da Mario',
	azienda: { __typename: 'GraphQLAzienda', _id: ID_AZIENDA, ragionesociale: 'Pizzeria da Mario S.r.l.' },
	indirizzo: {
		indirizzo: 'Via Verdi 8',
		cap: '20100',
		comune: 'Milano',
		provincia: 'MI',
		position: { type: 'Point', coordinates: [9.19, 45.4642] }
	},
	contatti: { cellulare: '3339876543', email: null, web: null, pec: null, fisso: '021234567' },
	orari: []
}

/**
 * The page's three queries, of which the companies are one.
 *
 * `ImprenditorePuntiVendita` is never optional: the section *below* this one issues it on every render of
 * the detail page, and an operation nobody configured throws — so a test that left it out would fail on a
 * request it is not about. It answers with nothing, because a shop on screen only adds cards these
 * assertions would have to filter back out.
 */
const aziende = (items: unknown[]) => ({
	...anagrafica,
	ImprenditoreAziende: { data: { imprenditoreAziende: items } },
	ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
})

/**
 * One company's block, by its ragione sociale — which is the heading, and the only thing that tells two
 * cards apart. The anagrafica above has an "Indirizzo" card of its own, so an unscoped lookup finds the
 * imprenditore's home address instead of the company's legal seat.
 *
 * `closest('section')`, not `parentElement`: the heading shares a flex row with the trash icon, so its
 * immediate parent is that title row and not the card's outer `<section>`.
 */
const card = (nome = 'Pizzeria da Mario S.r.l.') =>
	within(screen.getByRole('heading', { name: nome, level: 3 }).closest('section') as HTMLElement)

const box = (title: string, nome?: string) => within(card(nome).getByRole('region', { name: title }))

/** The right-hand half of an `EditableRow` while it is closed. */
const rowValue = (title: string, label: string, nome?: string): string => {
	const row = box(title, nome).getByText(label, { selector: 'span' }).parentElement as HTMLElement
	return row.lastElementChild?.textContent ?? ''
}

const apri = async (titolo: string, label: string, nome?: string) => {
	await userEvent.click(box(titolo, nome).getByRole('button', { name: `Modifica ${label}` }))
}

/** `fireEvent.change`, never `userEvent.type`: every box on this form carries a `maxLength`. */
const scrivi = (titolo: string, label: string, valore: string, nome?: string) => {
	fireEvent.change(box(titolo, nome).getByLabelText(label), { target: { value: valore } })
}

const salva = () => screen.getByRole('button', { name: 'Salva' })

/**
 * The overlay a queued deletion draws over a company's information, or `null` when there is none.
 *
 * ⚠️ The message is feminine — *eliminat**a*** — where a shop's is masculine. That is what keeps the two
 * helpers apart on a page carrying both kinds of card.
 */
const maschera = () => screen.queryByText('Verrà eliminata al salvataggio.')?.parentElement ?? null

/** A company's own map frame, titled after the company so one card's frame is not another's. */
const mappa = (nome = 'Pizzeria da Mario S.r.l.') => screen.queryByTitle(`Mappa di ${nome}`)

/** The map `AddressField` brings with it, which follows what is being typed rather than what is stored. */
const mappaEditor = () => screen.queryByTitle("Mappa dell'indirizzo")

/**
 * Every test that opens the address row stubs the geocoder as well as GraphQL — typing into that row is
 * what the field debounces into a Nominatim request, and an unstubbed one falls through to the operation
 * queue and throws, in a test about something else entirely.
 */
const stubRete = (replies: GraphQLReplies, osm: RispostaOsm | readonly RispostaOsm[] = {}) =>
	stubGraphQL(replies, osmStub(osm).rest)

const suggerimentoOsm = (nome: string) => screen.findByRole('button', { name: nome }, { timeout: RICERCA_DEBOUNCE_MS + 2000 })

/** What `risultatoOsm()` answers with, as the suggestion list spells it out. */
const SUGGERIMENTO = 'Via Roma, 1, Milano, MI, 20121, Italia'

/** The same answer once picked, as the box spells it out. */
const SCELTO = 'Via Roma 1, 20121 Milano (MI)'

const conIndirizzo = { risultati: [risultatoOsm()] }

const aggiunte = (stub: GraphQLStub) => stub.calls.filter((chiamata) => chiamata.operationName === 'AziendaAdd')
const scritture = (stub: GraphQLStub) => stub.calls.filter((chiamata) => chiamata.operationName === 'AziendaUpdate')
const eliminazioni = (stub: GraphQLStub) => stub.calls.filter((chiamata) => chiamata.operationName === 'AziendaDel')

/** Every request the page sent for one operation — the queries included, which is how a refetch is counted. */
const letture = (stub: GraphQLStub, nome: string) => stub.calls.filter((chiamata) => chiamata.operationName === nome)

/**
 * Every message the one address box can be showing.
 *
 * Only the first of the seven is ever on screen — `erroreIndirizzo` picks one — so a test that has to say
 * "no field behind the box is still refused" has to name all seven and find none of them.
 */
const MESSAGGI_INDIRIZZO = [
	"L'indirizzo è obbligatorio",
	'Il CAP deve essere di 5 cifre',
	'Il comune è obbligatorio',
	'La provincia è la sigla di 2 lettere',
	'La latitudine deve essere un numero',
	'La longitudine deve essere un numero',
	"Seleziona l'indirizzo dall'elenco"
]

const OK = { AziendaUpdate: { data: { aziendaUpdate: true } } }
const OK_ADD = { AziendaAdd: { data: { aziendaAdd: true } } }
const OK_DEL = { AziendaDel: { data: { aziendaDel: true } } }

/**
 * ⚠️ This is the only caller of `imprenditoreAziende`, and it sits between the anagrafica and the shops
 * on one detail page. All three take the same `idImprenditore` and render the same kind of box, so a copy
 * of a neighbouring section left pointed at the wrong query renders a plausible-looking page with one
 * imprenditore's details shown twice and no company anywhere.
 */
describe('Aziende', () => {
	it('waits before claiming there are no companies', async () => {
		stubGraphQL({ ...anagrafica, ImprenditoreAziende: { pending: true }, ImprenditorePuntiVendita: { pending: true } })
		await renderRoute(DETAIL)

		expect(screen.getByText('Caricamento aziende')).toBeInTheDocument()
		expect(screen.queryByText('Nessuna azienda registrata.')).not.toBeInTheDocument()
	})

	it('says so when the imprenditore has none', async () => {
		stubGraphQL(aziende([]))
		await renderRoute(DETAIL)

		expect(await screen.findByText('Nessuna azienda registrata.')).toBeInTheDocument()
	})

	/*
	 * `data: null` with no error beside it: the query resolved and answered with nothing, which is a shape
	 * the wire allows and urql passes straight through. The section reads it as the empty list it is —
	 * anything else would put a card on screen for a company that does not exist.
	 */
	it('says so when the query resolves with no data at all', async () => {
		stubGraphQL({
			...anagrafica,
			ImprenditoreAziende: { data: null },
			ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByText('Nessuna azienda registrata.')).toBeInTheDocument()
	})

	// The section's own failure, and the anagrafica above it still on screen: three independent queries,
	// and one of them failing is not the page failing.
	it('reports a failure without hiding the anagrafica', async () => {
		stubGraphQL({
			...anagrafica,
			ImprenditoreAziende: { errors: [graphQLError('Errore', 'Aziende non disponibili', 500)], status: 500 },
			ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByRole('alert')).toHaveTextContent('Aziende non disponibili')
		expect(screen.getByText('Mario')).toBeInTheDocument()
		expect(screen.queryByText('Nessuna azienda registrata.')).not.toBeInTheDocument()
	})

	it('shows every field the collection holds', async () => {
		stubGraphQL(aziende([azienda]))
		await renderRoute(DETAIL)

		expect(await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })).toBeInTheDocument()
		expect(rowValue('Dati azienda', 'P. IVA')).toBe('12345678901')
		expect(rowValue('Dati azienda', 'Referente')).toBe('Mario Rossi')
		expect(rowValue('Dati azienda', 'Amministratore')).toBe('Mario Rossi')
		expect(rowValue('Dati azienda', 'PEC')).toBe('pizzeria@pec.it')
		expect(rowValue('Dati azienda', 'Visura')).toBe('MI-123456')
		// The two fields the migration added, absent on every company lifted out of a punto vendita: a dash,
		// never the word "null" nor an empty cell that reads as a rendering bug.
		expect(rowValue('Dati azienda', 'Codice fiscale')).toBe('---')
		expect(rowValue('Dati azienda', 'Codice univoco')).toBe('---')
	})

	// The legal seat, composed on one line exactly as the shop card composes a shop's — and a map centred
	// on the stored pair, which is the only place those coordinates are ever displayed.
	it('composes the legal seat and draws it on a map', async () => {
		stubGraphQL(aziende([azienda]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })

		expect(rowValue('Sede legale', 'Indirizzo')).toBe('Via Dante 3, 20121 Milano (MI)')
		expect(mappa()).toHaveAttribute('src', expect.stringContaining('marker=45.46680,9.18590'))
	})

	// A pair of the wrong length is the one broken shape `[Float!]!` can carry: the card has nowhere to put
	// a marker and draws no frame rather than one pointing at the Gulf of Guinea.
	it('draws no map for a missing coordinate pair', async () => {
		stubGraphQL(aziende([{ ...azienda, indirizzo: { ...azienda.indirizzo, position: { type: 'Point', coordinates: [] } } }]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })

		expect(mappa()).not.toBeInTheDocument()
	})

	// Each company is its own card, and the heading is what tells them apart — the only field of the
	// collection that ever appears outside its own box.
	it('renders every company of the imprenditore', async () => {
		stubGraphQL(aziende([azienda, aziendaDue]))
		await renderRoute(DETAIL)

		expect(await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Pizzeria da Anna S.r.l.', level: 3 })).toBeInTheDocument()
	})

	// One frame per company, each named after the company it belongs to: two frames sharing a title would
	// be two maps no reader could tell apart, and no test could either.
	it('names each map after the company it belongs to', async () => {
		stubGraphQL(aziende([azienda, aziendaDue]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })

		expect(mappa()).toBeInTheDocument()
		expect(mappa('Pizzeria da Anna S.r.l.')).toBeInTheDocument()
	})
})

/**
 * A company edited in place: one form, one Save, and one `$set` covering the flat fields and the legal
 * seat together — the same shape the shop card has, deliberately, because the two sit on one page under
 * one button.
 */
describe('Aziende — modifica', () => {
	it('turns a row into its editor, seeded with the stored value', async () => {
		stubGraphQL(aziende([azienda]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', 'Referente')

		expect(box('Dati azienda').getByLabelText('Referente')).toHaveValue('Mario Rossi')
		expect(salva()).toBeDisabled()
	})

	// A `null` seeds an empty box, never the word "null" for the operator to delete first, and seeding is
	// not an edit: Save stays dead until something is typed.
	it('seeds an empty box for a field the company has not got', async () => {
		stubGraphQL(aziende([azienda]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', 'Codice fiscale')

		expect(box('Dati azienda').getByLabelText('Codice fiscale')).toHaveValue('')
		expect(salva()).toBeDisabled()
	})

	// Latitude first in the geocoder, longitude first on the wire. The pair is reassembled on save, and a
	// form that sent them in reading order would put an Italian company in the sea off Somalia.
	it('sends the whole company, with the coordinates back in GeoJSON order', async () => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', 'Referente')
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi')
		await userEvent.click(salva())

		expect(await screen.findByText('Modifiche salvate.')).toBeInTheDocument()
		expect(scritture(stub)).toEqual([
			expect.objectContaining({
				variables: {
					_id: ID_AZIENDA,
					azienda: {
						ragionesociale: 'Pizzeria da Mario S.r.l.',
						piva: '12345678901',
						// Never `''`: the collection is `additionalProperties: false` with `bsonType: 'string'`,
						// so an empty string would be a stored value where the service is meant to drop the field.
						cf: null,
						referente: 'Anna Bianchi',
						amministratore: 'Mario Rossi',
						univoco: null,
						pec: 'pizzeria@pec.it',
						indirizzo: {
							indirizzo: 'Via Dante 3',
							cap: '20121',
							comune: 'Milano',
							provincia: 'MI',
							position: { coordinates: [9.1859, 45.4668] }
						},
						visura: 'MI-123456'
					}
				}
			})
		])
	})

	// The two optional fields, filled: what was `null` on the way in is a real value on the way out, and
	// the codice fiscale is not checked for a format the collection does not have either.
	it('sends the optional fields once they are filled', async () => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', 'Codice fiscale')
		scrivi('Dati azienda', 'Codice fiscale', '12345678901')
		await apri('Dati azienda', 'Codice univoco')
		scrivi('Dati azienda', 'Codice univoco', 'AB12CD3')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toMatchObject({ azienda: { cf: '12345678901', univoco: 'AB12CD3' } })
	})

	/*
	 * A company nobody touched is not merely nothing to send — it must not be *validated* either, or a
	 * stored row the current rules would reject blocks a save the operator made on a different card.
	 *
	 * The blank visura is what such a row looks like: the field was unbounded and unchecked before the
	 * extraction, so companies lifted out of a punto vendita can carry one this form would refuse.
	 */
	it('leaves an untouched company alone while another is saved', async () => {
		const stub = stubGraphQL({ ...aziende([{ ...azienda, visura: '' }, aziendaDue]), ...OK })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Anna S.r.l.', level: 3 })
		await apri('Dati azienda', 'Referente', 'Pizzeria da Anna S.r.l.')
		scrivi('Dati azienda', 'Referente', 'Luigi Verdi', 'Pizzeria da Anna S.r.l.')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)).toHaveLength(1)
		expect(scritture(stub)[0]?.variables).toMatchObject({ _id: aziendaDue._id })
		expect(screen.queryByText('La visura è obbligatoria')).not.toBeInTheDocument()
	})

	/*
	 * A rename reaches the shops below, and the shop fixture is what makes that visible: a company's ragione
	 * sociale is printed on every card that points at it and fills the `<select>` those cards pick from, so
	 * a save that refreshed only the companies would leave the shops showing the old name.
	 *
	 * ⚠️ The save context names `GraphQLAzienda` and nothing else. The shops come along because their own
	 * cached response nests an `azienda`, so the document cache invalidates it on the same typename — which
	 * is why the fixture below has to hold a real shop with a real company inside it. An empty
	 * `imprenditorePuntiVendita` records no typenames at all and would be invalidated by nothing, and this
	 * test would then pass with the cache doing nothing.
	 *
	 * Counted as requests rather than read off the screen. The page remounts its sections after a save and a
	 * remount re-executes both queries — off the cache, silently, unless the mutation invalidated them. The
	 * second request is the whole difference.
	 *
	 * ⚠️ Both counts go inside one `waitFor`. One invalidation issues two independent fetches, and waiting
	 * on the companies alone then reading the shops on the next line assumes the two land in the same tick.
	 * They usually do — which is worse than never: the assertion outside the wait passed on every ordinary
	 * run and turned into a red mutation score on a loaded machine.
	 */
	it('refetches the companies and the shops that print their name', async () => {
		const stub = stubGraphQL({
			...anagrafica,
			ImprenditoreAziende: { data: { imprenditoreAziende: [azienda] } },
			ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [puntoVendita] } },
			...OK
		})
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })

		expect(letture(stub, 'ImprenditoreAziende')).toHaveLength(1)
		expect(letture(stub, 'ImprenditorePuntiVendita')).toHaveLength(1)

		await apri('Dati azienda', 'Ragione sociale')
		scrivi('Dati azienda', 'Ragione sociale', 'Pizzeria Rinominata S.r.l.')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		await waitFor(() => {
			expect(letture(stub, 'ImprenditoreAziende')).toHaveLength(2)
			expect(letture(stub, 'ImprenditorePuntiVendita')).toHaveLength(2)
		})
	})

	// One company refusing must not swallow the other's edit, which is why each is its own section.
	it('stops at the company that was refused', async () => {
		const stub = stubGraphQL({
			...aziende([azienda, aziendaDue]),
			AziendaUpdate: { errors: [graphQLError('Errore', 'PEC già presente', 409)], status: 409 }
		})
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Anna S.r.l.', level: 3 })
		await apri('Dati azienda', 'Referente')
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi')
		await apri('Dati azienda', 'Referente', 'Pizzeria da Anna S.r.l.')
		scrivi('Dati azienda', 'Referente', 'Luigi Verdi', 'Pizzeria da Anna S.r.l.')
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('PEC già presente')
		expect(scritture(stub)).toHaveLength(1)
		expect(salva()).toBeEnabled()
	})

	/*
	 * The card's toast belongs to the card, and a save that fixed it has to take it down.
	 *
	 * ⚠️ Not something the page's remount does for it. The remount only happens when *every* section
	 * succeeded, so the interesting case is exactly this one: the first company is written on the second
	 * press while the second company is refused, nothing remounts, and the first card's old refusal would
	 * otherwise still be on screen next to the new one — two failures reported for one.
	 */
	it('clears its own refusal when the retry goes through', async () => {
		stubGraphQL({
			...aziende([azienda, aziendaDue]),
			AziendaUpdate: [
				{ errors: [graphQLError('Errore', 'PEC già presente', 409)], status: 409 },
				{ data: { aziendaUpdate: true } },
				{ errors: [graphQLError('Errore', 'Partita IVA già presente', 409)], status: 409 }
			]
		})
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Anna S.r.l.', level: 3 })
		await apri('Dati azienda', 'Referente')
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi')
		await apri('Dati azienda', 'Referente', 'Pizzeria da Anna S.r.l.')
		scrivi('Dati azienda', 'Referente', 'Luigi Verdi', 'Pizzeria da Anna S.r.l.')
		await userEvent.click(salva())

		expect(await screen.findByText('PEC già presente')).toBeInTheDocument()

		await userEvent.click(salva())

		expect(await screen.findByText('Partita IVA già presente')).toBeInTheDocument()
		expect(screen.queryByText('PEC già presente')).not.toBeInTheDocument()
	})

	// `false` with no error at all: no resolver answers that way, but `Boolean!` says it could, and a save
	// reported as successful would be worse than a generic line.
	it('reports a bare refusal', async () => {
		stubGraphQL({ ...aziende([azienda]), AziendaUpdate: { data: { aziendaUpdate: false } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', 'Referente')
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi')
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito.')
		expect(screen.queryByText('Modifiche salvate.')).not.toBeInTheDocument()
	})

	/*
	 * The whitespace is the point: the schema trims before it validates, so a required box holding three
	 * spaces is empty — and the parsed value is what reaches the wire, so it cannot be padded either.
	 *
	 * The messages are spelled out one by one because Italian agrees with the noun: a *visura* is
	 * obbligatori**a**, a *referente* obbligatori**o**. One default for both reads as a typo.
	 */
	it.each([
		['Ragione sociale', 'La ragione sociale è obbligatoria'],
		['Referente', 'Il referente è obbligatorio'],
		['Amministratore', "L'amministratore è obbligatorio"],
		['Visura', 'La visura è obbligatoria']
	])('refuses a blank %s', async (campo, messaggio) => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', campo)
		scrivi('Dati azienda', campo, '   ')
		await userEvent.click(salva())

		expect(await pagina().findByText(messaggio)).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})

	it.each([
		['P. IVA', '1234567890', 'La partita IVA è di 11 cifre'],
		['Codice fiscale', '1234567890', 'Il codice fiscale è di 11 caratteri'],
		['Codice univoco', 'ABC12', 'Il codice univoco è di 7 caratteri alfanumerici'],
		// Something the `type="email"` box itself accepts: jsdom runs the HTML validator too, and a value it
		// refuses never reaches the schema this line is about.
		['PEC', 'chiocciola@', 'La PEC non è un indirizzo valido']
	])('refuses a malformed %s', async (campo, valore, messaggio) => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', campo)
		scrivi('Dati azienda', campo, valore)
		await userEvent.click(salva())

		expect(await pagina().findByText(messaggio)).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})

	// ⚠️ The address caps are not reachable from here: the four fields behind the one box have no input of
	// their own, so nothing can be typed past their length. `aziendaSchema`'s own tests hold those bounds,
	// and this table is what is left that a keyboard can still reach.
	it.each([
		['Ragione sociale', 101, 'La ragione sociale non può superare 100 caratteri'],
		['Referente', 51, 'Il referente non può superare 50 caratteri'],
		['Amministratore', 51, "L'amministratore non può superare 50 caratteri"],
		['Visura', 1001, 'La visura non può superare 1000 caratteri']
	])('refuses an over-long %s', async (campo, lunghezza, messaggio) => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', campo)
		scrivi('Dati azienda', campo, 'x'.repeat(lunghezza))
		await userEvent.click(salva())

		expect(await pagina().findByText(messaggio)).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})
})

/**
 * ⚠️ The rule that makes the single address box safe, seen from the page.
 *
 * The box is the only address input the card has; the four fields under it and the coordinate pair are
 * written by picking a geocoder answer and by nothing else. Free text left in the box would save the
 * *stored* seat under a line reading like some other address.
 */
describe('Aziende — sede legale', () => {
	const casella = (nome?: string) => box('Sede legale', nome).getByLabelText('Indirizzo')

	const elenco = () => screen.queryByRole('button', { name: SUGGERIMENTO })

	it('opens on the composed line, with no box for the fields behind it', async () => {
		stubRete(aziende([azienda]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Sede legale', 'Indirizzo')

		expect(casella()).toHaveValue('Via Dante 3, 20121 Milano (MI)')
		expect(box('Sede legale').queryByLabelText('CAP')).not.toBeInTheDocument()
		expect(box('Sede legale').queryByLabelText('Comune')).not.toBeInTheDocument()
		expect(box('Sede legale').queryByLabelText('Provincia')).not.toBeInTheDocument()
		expect(box('Sede legale').queryByLabelText('Latitudine')).not.toBeInTheDocument()
	})

	// Two maps of two different places, stacked, is worse than either: the stored one steps aside for the
	// editor's, which follows what is being typed.
	it("hands the map over to the editor's own", async () => {
		stubRete(aziende([azienda]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })

		expect(mappa()).toBeInTheDocument()
		expect(mappaEditor()).not.toBeInTheDocument()

		await apri('Sede legale', 'Indirizzo')

		expect(mappa()).not.toBeInTheDocument()
		expect(mappaEditor()).toHaveAttribute('src', expect.stringContaining('marker=45.46680,9.18590'))
	})

	// The whole of what a pick writes: the line, the four fields under it and the coordinate pair, all
	// seven at once, and all seven counting as an edit — a `setValue` that did not dirty the form would
	// leave the page with a new address and a dead Save button.
	it('writes the whole address from one pick, and calls it an edit', async () => {
		const stub = stubRete({ ...aziende([azienda]), ...OK }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Sede legale', 'Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 1 Milano' } })
		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))

		expect(elenco()).not.toBeInTheDocument()
		expect(casella()).toHaveValue(SCELTO)
		expect(salva()).toBeEnabled()

		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toMatchObject({
			azienda: {
				indirizzo: {
					indirizzo: 'Via Roma 1',
					cap: '20121',
					comune: 'Milano',
					provincia: 'MI',
					position: { coordinates: [9.1895, 45.4642] }
				}
			}
		})
	})

	/*
	 * The seventh name in the `trigger` list at the end of a pick, and the one the six behind the box cannot
	 * stand in for: it is the only field of the seven with an input, and the only error a *stored* company
	 * can be left holding on its own — the rule it fails is the composite one, and picking is what satisfies
	 * it. Left out of that list, the box would go on refusing an address the operator has just chosen.
	 */
	it('clears the composite refusal once an address is picked', async () => {
		stubRete({ ...aziende([azienda]), ...OK }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Sede legale', 'Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 2, 20121 Milano (MI)' } })
		await userEvent.click(salva())

		expect(await pagina().findByText("Seleziona l'indirizzo dall'elenco")).toBeInTheDocument()

		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))

		await waitFor(() => {
			expect(pagina().queryByText("Seleziona l'indirizzo dall'elenco")).toBeNull()
		})
	})

	/*
	 * ⚠️ A pick has to *dirty* the form, not merely write to it — and this is the one arrangement that can
	 * tell the two apart. Typing in the box dirties the form by itself, so a pick that moved the company
	 * would leave Save enabled whether or not the six writes behind it counted as edits. Here the geocoder
	 * answers with exactly the address the company already has, so all seven fields land back on their
	 * stored values: only a `setValue` that keeps the dirty state honest can notice, and Save goes dead
	 * again.
	 */
	it('takes Save back down when the pick lands on the stored address', async () => {
		stubRete(aziende([aziendaGeocodata]), conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Sede legale', 'Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 1 Milano' } })

		expect(salva()).toBeEnabled()

		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))

		expect(casella()).toHaveValue(SCELTO)
		await waitFor(() => {
			expect(salva()).toBeDisabled()
		})
	})

	// Typed and not picked: the line no longer spells out the fields behind it, and the save is refused on
	// the one control the operator can do something about.
	it('refuses a line the operator typed over', async () => {
		const stub = stubRete({ ...aziende([azienda]), ...OK })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Sede legale', 'Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 2, 20121 Milano (MI)' } })
		await userEvent.click(salva())

		expect(await pagina().findByText("Seleziona l'indirizzo dall'elenco")).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})
})

/**
 * The trash beside a company's name. Queued exactly like the field editors: a click marks the card and
 * nothing reaches the server until Save.
 *
 * ⚠️ Unlike a shop's, the backend delete is a **hard** one and is refused with a 409 while a live punto
 * vendita still points at the company. That message has to reach the operator, which is why the card's
 * toast sits outside the mask that covers everything else.
 */
describe('Aziende — eliminazione', () => {
	const cestino = (nome?: string) => card(nome).getByRole('button', { name: 'Elimina azienda' })

	it('queues the deletion behind the mask instead of writing it', async () => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK_DEL })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })

		expect(maschera()).toBeNull()

		await userEvent.click(cestino())

		expect(maschera()).toHaveClass('backdrop-blur-sm')
		expect(eliminazioni(stub)).toEqual([])
		expect(salva()).toBeEnabled()
	})

	// The one way back out, and the reason the title row stays sharp: the trash the operator has to press
	// again is the only control the mask must not cover.
	it('takes the deletion back', async () => {
		stubGraphQL(aziende([azienda]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await userEvent.click(cestino())
		await userEvent.click(card().getByRole('button', { name: 'Annulla eliminazione azienda' }))

		expect(maschera()).toBeNull()
		expect(salva()).toBeDisabled()
	})

	// The heading is the one part of the card the mask does not cover, so it is the only place the queued
	// state can be read at all — struck through, and in the muted colour.
	it('strikes the name through while the deletion is queued', async () => {
		stubGraphQL(aziende([azienda]))
		await renderRoute(DETAIL)

		const titolo = await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })

		expect(titolo).not.toHaveClass('line-through')

		await userEvent.click(cestino())

		expect(titolo).toHaveClass('text-tip', 'line-through')
	})

	it('deletes on Save', async () => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK_DEL })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await userEvent.click(cestino())
		await userEvent.click(salva())

		await waitFor(() => {
			expect(eliminazioni(stub)).toHaveLength(1)
		})
		expect(eliminazioni(stub)[0]?.variables).toEqual({ _id: ID_AZIENDA })
		// The field edits are not written first: a company about to be removed does not need its card saved.
		expect(scritture(stub)).toEqual([])
		// A delete that went through is a saved page, not a silent one: the section answers the registry the
		// way an edited card does, and nothing is reported against a card that did what it was asked.
		expect(await screen.findByText('Modifiche salvate.')).toBeInTheDocument()
		expect(screen.queryByRole('alert')).toBeNull()
	})

	// Deletion wins over an edit made in the same press — asserted with both queued at once, because
	// "nothing was written" is otherwise indistinguishable from "nothing was edited".
	it('does not write the fields of a card it is about to delete', async () => {
		const stub = stubGraphQL({ ...aziende([azienda]), ...OK, ...OK_DEL })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await apri('Dati azienda', 'Referente')
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi')
		await userEvent.click(cestino())
		await userEvent.click(salva())

		await waitFor(() => {
			expect(eliminazioni(stub)).toHaveLength(1)
		})
		expect(scritture(stub)).toEqual([])
	})

	it('reports a bare refusal', async () => {
		stubGraphQL({ ...aziende([azienda]), AziendaDel: { data: { aziendaDel: false } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await userEvent.click(cestino())
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Eliminazione non riuscita.')
	})

	/*
	 * The 409 the shops make possible, and the whole reason the toast is outside the mask: a company still
	 * pointed at cannot be removed, and the operator has to read why while the card is still masked.
	 */
	it('surfaces the server message and leaves the card queued', async () => {
		stubGraphQL({
			...aziende([azienda]),
			AziendaDel: { errors: [graphQLError('Errore', 'Azienda con punti vendita attivi', 409)], status: 409 }
		})
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await userEvent.click(cestino())
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Azienda con punti vendita attivi')
		// Still queued, and still undoable: the mask covers the company's information and neither the toast
		// nor the trash that takes the deletion back.
		expect(maschera()).not.toBeNull()
		expect(maschera()).not.toContainElement(card().getByRole('button', { name: 'Annulla eliminazione azienda' }))
	})
})

/**
 * A company the operator is adding: the same fields as the card above it, driven by the same schema and
 * the same Save button, and sent to `aziendaAdd` with the owner's id where the update sends the company's
 * own.
 *
 * ⚠️ Every test here stubs the geocoder as well as GraphQL. A new card opens with **every** row on its
 * editor — there is nothing stored to show closed — so the address box is on screen from the first
 * render, and the debounce behind it would otherwise reach the operation queue and throw.
 */
describe('Aziende — nuova azienda', () => {
	const NUOVA = 'Nuova azienda'

	const carta = () => screen.getByRole('heading', { name: NUOVA, level: 3 }).closest('section') as HTMLElement

	/** Both of them, in the order they were opened — two cards share one heading, so `card()` cannot. */
	const carte = () =>
		screen.getAllByRole('heading', { name: NUOVA, level: 3 }).map((titolo) => titolo.closest('section') as HTMLElement)

	const aggiungi = async () => {
		await userEvent.click(screen.getByRole('button', { name: 'Aggiungi azienda' }))
	}

	/**
	 * A card filled the way an operator would: eight boxes typed and the address **picked** out of the
	 * geocoder's list, which is the only way the four address fields and the coordinate pair are written.
	 *
	 * The two optional boxes are left empty on purpose — what they send is the subject of its own test.
	 */
	const compila = async (bersaglio = NUOVA) => {
		scrivi('Dati azienda', 'Ragione sociale', 'Pizzeria Nuova S.r.l.', bersaglio)
		scrivi('Dati azienda', 'P. IVA', '11122233344', bersaglio)
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi', bersaglio)
		scrivi('Dati azienda', 'Amministratore', 'Anna Bianchi', bersaglio)
		scrivi('Dati azienda', 'PEC', 'nuova@pec.it', bersaglio)
		scrivi('Dati azienda', 'Visura', 'MI-999999', bersaglio)
		fireEvent.change(box('Sede legale', bersaglio).getByLabelText('Indirizzo'), { target: { value: 'Via Roma 1 Milano' } })
		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))
	}

	// The plus belongs to the section rather than to the list, so it is there before the query answers and
	// stays there when it fails — an imprenditore with no company is exactly who needs it.
	it('offers the plus while the companies are still loading', async () => {
		stubRete({ ...anagrafica, ImprenditoreAziende: { pending: true }, ImprenditorePuntiVendita: { pending: true } })
		await renderRoute(DETAIL)

		expect(screen.getByRole('button', { name: 'Aggiungi azienda' })).toBeInTheDocument()
	})

	it('offers the plus when the companies could not be loaded', async () => {
		stubRete({
			...anagrafica,
			ImprenditoreAziende: { errors: [graphQLError('Errore', 'Aziende non disponibili', 500)], status: 500 },
			ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
		})
		await renderRoute(DETAIL)

		await screen.findByRole('alert')
		expect(screen.getByRole('button', { name: 'Aggiungi azienda' })).toBeInTheDocument()
	})

	/*
	 * "Nessuna azienda registrata." is about the collection, and an open card is the answer to it — the two
	 * on screen together would be the page contradicting itself.
	 *
	 * The card counts as a pending change from the moment it appears, before a character is typed: it is a
	 * company the operator asked for and the page has not written.
	 */
	it('replaces the empty-list message with a card, already worth saving', async () => {
		stubRete(aziende([]))
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		expect(salva()).toBeDisabled()

		await aggiungi()

		expect(screen.getByRole('heading', { name: NUOVA, level: 3 })).toBeInTheDocument()
		expect(screen.queryByText('Nessuna azienda registrata.')).not.toBeInTheDocument()
		expect(salva()).toBeEnabled()
	})

	// New cards go under the companies that exist: the list is the record, and what is being added to it
	// does not push the record down the page.
	it('adds the card below the companies already stored', async () => {
		stubRete(aziende([azienda]))
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await aggiungi()

		// Filtered, because `Infobox` titles are `h3` too — every card contributes two of them.
		const titoli = screen
			.getAllByRole('heading', { level: 3 })
			.map((titolo) => titolo.textContent)
			.filter((testo) => testo === 'Pizzeria da Mario S.r.l.' || testo === NUOVA)
		expect(titoli).toEqual(['Pizzeria da Mario S.r.l.', NUOVA])
	})

	// Every row opens on its editor, because there is no stored value for a closed row to show — a card of
	// dashes with a pen beside each would read as a rendering bug.
	it('opens every row of the card on its editor', async () => {
		stubRete(aziende([]))
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()

		expect(box('Dati azienda', NUOVA).getByLabelText('Ragione sociale')).toHaveValue('')
		expect(box('Dati azienda', NUOVA).getByLabelText('P. IVA')).toHaveValue('')
		expect(box('Dati azienda', NUOVA).getByLabelText('Referente')).toHaveValue('')
		expect(box('Dati azienda', NUOVA).getByLabelText('Amministratore')).toHaveValue('')
		expect(box('Dati azienda', NUOVA).getByLabelText('PEC')).toHaveValue('')
		expect(box('Sede legale', NUOVA).getByLabelText('Indirizzo')).toHaveValue('')
		// No pen anywhere on the card: a row that is already open has nothing to open.
		expect(within(carta()).queryByRole('button', { name: 'Modifica Ragione sociale' })).toBeNull()
	})

	// What a card with no stored company behind it deliberately does not carry: the map draws a position
	// nobody has picked. The editor's own map is there instead, centred on Italy until an address is chosen.
	it('leaves out the map of a seat that has not been chosen', async () => {
		stubRete(aziende([]))
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()

		expect(within(carta()).queryByTitle(/^Mappa di /)).toBeNull()
		expect(mappaEditor()).toBeInTheDocument()
	})

	// The one icon it carries, and it is not a delete: there is nothing stored to remove. It is also the
	// only way out of the leave guard the card arms the moment it appears.
	it('throws the card away when its trash is pressed', async () => {
		stubRete(aziende([]))
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await userEvent.click(within(carta()).getByRole('button', { name: 'Annulla nuova azienda' }))

		expect(screen.queryByRole('heading', { name: NUOVA, level: 3 })).toBeNull()
		expect(screen.getByText('Nessuna azienda registrata.')).toBeInTheDocument()
		expect(salva()).toBeDisabled()
	})

	/*
	 * ⚠️ Each card is keyed by a uuid of its own, and this is what says so. Keyed by position instead,
	 * discarding the first of two would hand its React state — an empty form — to the second, and the
	 * typing would vanish from a card the operator never touched.
	 */
	it("keeps a second card's contents when the first is discarded", async () => {
		stubRete(aziende([]))
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await aggiungi()

		fireEvent.change(within(carte()[1] as HTMLElement).getByLabelText('Referente'), { target: { value: 'Anna Bianchi' } })
		await userEvent.click(within(carte()[0] as HTMLElement).getByRole('button', { name: 'Annulla nuova azienda' }))

		expect(carte()).toHaveLength(1)
		expect(within(carte()[0] as HTMLElement).getByLabelText('Referente')).toHaveValue('Anna Bianchi')
	})

	/*
	 * ⚠️ The card is seeded with an empty string per field rather than with nothing at all. react-hook-form
	 * hands the schema whatever it was given: `''` fails the rule the form wrote, in Italian, under the box
	 * it belongs to — `undefined` fails zod's type check instead, with "expected string, received
	 * undefined" shown to an operator.
	 */
	it("refuses an untouched card in this form's own words", async () => {
		const stub = stubRete({ ...aziende([]), ...OK_ADD })
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await userEvent.click(salva())

		expect(await pagina().findByText('La ragione sociale è obbligatoria')).toBeInTheDocument()
		expect(pagina().getByText('La partita IVA è di 11 cifre')).toBeInTheDocument()
		expect(pagina().getByText('La visura è obbligatoria')).toBeInTheDocument()
		expect(pagina().getByText("L'indirizzo è obbligatorio")).toBeInTheDocument()
		expect(aggiunte(stub)).toEqual([])
		expect(screen.queryByText('Modifiche salvate.')).not.toBeInTheDocument()
	})

	/*
	 * The same refusal as the operator sees it: the boxes turn red, and the toast in the corner lists the
	 * same sentences they carry — the Save button is below three cards, and the box that refused may well be
	 * scrolled off the top of the page.
	 *
	 * The address is **one** line however many of its seven fields are wrong, which is the reason the toast
	 * goes through `erroreIndirizzo` rather than walking the error tree flat: six of the seven have no box
	 * of their own, so naming them would send the operator looking for fields that are not on screen.
	 *
	 * ⚠️ Read through `within(avviso)` and not `pagina()`: each sentence is now on screen twice, and the
	 * toast stack is portalled to `document.body`, outside `main`.
	 */
	it('lists what has to be corrected, and drops each line as it is corrected', async () => {
		stubRete({ ...aziende([]), ...OK_ADD }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await userEvent.click(salva())

		const avviso = await screen.findByRole('alert')
		const righe = () =>
			within(avviso)
				.getAllByRole('listitem')
				.map((riga) => riga.textContent ?? '')
		const ragioneSociale = () => box('Dati azienda', NUOVA).getByLabelText('Ragione sociale')

		expect(avviso).toHaveTextContent(INTESTAZIONE_VALIDAZIONE)
		expect(righe()).toContain('La ragione sociale è obbligatoria')
		expect(righe().filter((riga) => MESSAGGI_INDIRIZZO.includes(riga))).toEqual(["L'indirizzo è obbligatorio"])
		expect(ragioneSociale()).toHaveClass('border-2', 'bg-app-error/10')

		scrivi('Dati azienda', 'Ragione sociale', 'Pizzeria Nuova S.r.l.', NUOVA)

		await waitFor(() => {
			expect(righe()).not.toContain('La ragione sociale è obbligatoria')
		})
		expect(ragioneSociale()).toHaveClass('border', 'bg-white')
		// The rest of the list stays: one corrected box is not a saved form, and a toast that emptied itself
		// on the first fix would say the save is ready when it is not.
		expect(righe()).toContain("L'indirizzo è obbligatorio")
	})

	/*
	 * ⚠️ What a pick has to revalidate, not just write.
	 *
	 * Six of the seven fields behind the box have no input of their own, so nothing clears their errors by
	 * being typed into — only the `trigger` at the end of the pick does. A name missing from that list
	 * leaves its field refused for good, and the box goes on showing a message about a value the operator
	 * has just chosen and has no way to reach.
	 */
	it('clears every field that was refused before the address was picked', async () => {
		stubRete({ ...aziende([]), ...OK_ADD }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await userEvent.click(salva())

		expect(await pagina().findByText("L'indirizzo è obbligatorio")).toBeInTheDocument()

		fireEvent.change(box('Sede legale', NUOVA).getByLabelText('Indirizzo'), { target: { value: 'Via Roma 1 Milano' } })
		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))

		await waitFor(() => {
			expect(screen.queryByText("L'indirizzo è obbligatorio")).toBeNull()
		})
		for (const messaggio of MESSAGGI_INDIRIZZO) expect(screen.queryByText(messaggio)).toBeNull()
	})

	// The whole point of the card. `idImprenditore` where the update sends `_id`, the same input object
	// otherwise — and the two blank optionals as `null`, which is how the service is told to drop them.
	it('sends the company under its owner and drops the card once it is stored', async () => {
		const stub = stubRete({ ...aziende([]), ...OK_ADD }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await compila()

		expect(box('Sede legale', NUOVA).getByLabelText('Indirizzo')).toHaveValue(SCELTO)

		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(aggiunte(stub)).toHaveLength(1)
		expect(aggiunte(stub)[0]?.variables).toEqual({
			idImprenditore: ID,
			azienda: {
				ragionesociale: 'Pizzeria Nuova S.r.l.',
				piva: '11122233344',
				cf: null,
				referente: 'Anna Bianchi',
				amministratore: 'Anna Bianchi',
				univoco: null,
				pec: 'nuova@pec.it',
				indirizzo: {
					indirizzo: 'Via Roma 1',
					cap: '20121',
					comune: 'Milano',
					provincia: 'MI',
					position: { coordinates: [9.1895, 45.4642] }
				},
				visura: 'MI-999999'
			}
		})
		// The list refetches on `additionalTypenames` and the stored company takes the card's place. A
		// placeholder left behind would show the same company twice, the second time as a form adding it again.
		expect(screen.queryByRole('heading', { name: NUOVA, level: 3 })).toBeNull()
	})

	// `false` with no error at all: no resolver answers that way, but `Boolean!` says it could — and a card
	// that vanished on it would have thrown away a company nobody stored.
	it('reports a bare refusal and keeps the card', async () => {
		stubRete({ ...aziende([]), AziendaAdd: { data: { aziendaAdd: false } } }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await compila()
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito.')
		expect(screen.getByRole('heading', { name: NUOVA, level: 3 })).toBeInTheDocument()
		expect(screen.queryByText('Modifiche salvate.')).not.toBeInTheDocument()
		expect(salva()).toBeEnabled()
	})

	// The duplicate `piva` and the duplicate `pec` are the two refusals this mutation really answers with,
	// and both arrive as a message the operator can act on — so the message is what is shown.
	it('surfaces the server message when the add fails', async () => {
		stubRete(
			{
				...aziende([]),
				AziendaAdd: {
					errors: [graphQLError('Errore', 'partita IVA o PEC già registrate da un altra azienda', 409)],
					status: 409
				}
			},
			conIndirizzo
		)
		await renderRoute(DETAIL)

		await screen.findByText('Nessuna azienda registrata.')
		await aggiungi()
		await compila()
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('partita IVA o PEC già registrate da un altra azienda')
		expect(screen.getByRole('heading', { name: NUOVA, level: 3 })).toBeInTheDocument()
	})

	// The card is one more section of the page's save, registered after the companies that exist: an edit
	// to a stored company and a new card are written in that order, by one press of one button.
	it('saves an edited company and a new card in the same press', async () => {
		const stub = stubRete({ ...aziende([azienda]), ...OK, ...OK_ADD }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await aggiungi()
		await apri('Dati azienda', 'Referente')
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi')
		await compila()
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toMatchObject({ _id: ID_AZIENDA, azienda: { referente: 'Anna Bianchi' } })
		expect(aggiunte(stub)[0]?.variables).toMatchObject({ idImprenditore: ID, azienda: { piva: '11122233344' } })
	})

	/*
	 * New cards are registered after the companies that exist, and the page stops at the first section that
	 * refuses — so a card that fails does so with the company above it already written. That is not a
	 * rollback the page could offer: the two are separate mutations on separate documents. What it must do
	 * instead is say which half failed and keep the card, which is the half still unsaved.
	 */
	it('leaves the company above it written when the card is refused', async () => {
		const stub = stubRete({ ...aziende([azienda]), AziendaAdd: { data: { aziendaAdd: false } }, ...OK }, conIndirizzo)
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Pizzeria da Mario S.r.l.', level: 3 })
		await aggiungi()
		await apri('Dati azienda', 'Referente')
		scrivi('Dati azienda', 'Referente', 'Anna Bianchi')
		await compila()
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito.')
		expect(scritture(stub)).toHaveLength(1)
		expect(aggiunte(stub)).toHaveLength(1)
		expect(screen.getByRole('heading', { name: NUOVA, level: 3 })).toBeInTheDocument()
	})
})
