import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AVVISO_ABBANDONO } from '@/features/imprenditori/salvataggio'

import { stubGraphQL } from '../helpers/graphql'
import { renderRoute } from '../helpers/render'

const ID = '65f0000000000000000000f1'
const DETAIL = `/p/imprenditori/id/${ID}`

const detail = {
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
	},
	// Both lists empty: this file is about the page's save registry and its leave guard, and a card of
	// either kind would only add rows for the assertions here to look past.
	ImprenditoreAziende: { data: { imprenditoreAziende: [] } },
	ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
}

const ID_AZIENDA = '65f0000000000000000000a1'

/**
 * The same page with one company and one shop on it, for the one test that has to watch all three
 * sections come back closed.
 *
 * Kept out of `detail` rather than folded into it: every other test here is about the save registry or
 * the leave guard, and two more cards would put two more pens and two more regions in front of
 * assertions that are not looking for them.
 */
const conListe = {
	...detail,
	ImprenditoreAziende: {
		data: {
			imprenditoreAziende: [
				{
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
			]
		}
	},
	ImprenditorePuntiVendita: {
		data: {
			imprenditorePuntiVendita: [
				{
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
			]
		}
	}
}

/**
 * jsdom has no `window.confirm` worth calling — the real one is `Not implemented` — so every test that
 * reaches the guard has to say what the operator answered. The spy is also what proves the question was
 * asked at all, which is the half a `location.pathname` assertion cannot tell apart from a broken route.
 */
const rispondi = (risposta: boolean) => vi.spyOn(window, 'confirm').mockReturnValue(risposta)

const sporca = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Modifica Nome' }))
	fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Marione' } })
	await waitFor(() => {
		expect(screen.getByRole('button', { name: 'Salva' })).toBeEnabled()
	})
}

afterEach(() => {
	vi.restoreAllMocks()
})

/*
 * Nothing on this page is written until Save is pressed, so every edit lives in the browser and nowhere
 * else. A stray click on the breadcrumb throws away thirteen fields and however many shops, with no
 * undo — the values never reached the server, so there is nothing to re-read them from.
 */
describe('ImprenditoreDetailPage — modifiche non salvate', () => {
	it('asks before leaving a page holding unsaved edits, and stays when the answer is no', async () => {
		stubGraphQL(detail)
		const { router } = await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Info imprenditore' })
		await sporca()

		const confirm = rispondi(false)
		// ⚠️ Not awaited. A blocked `navigate()` never settles — the promise resolves when the navigation
		// completes, and this one never does — so awaiting it here is a five-second test timeout, not a
		// failed assertion. The `waitFor` below is what makes the test wait for the right thing.
		void router.navigate({ to: '/impostazioni' })

		// Spelled out rather than compared against the exported constant: asserting the constant against
		// itself passes whatever it holds, and this string is the whole of what the operator is told before
		// an edit is thrown away.
		await waitFor(() => {
			expect(confirm).toHaveBeenCalledWith('Ci sono modifiche non salvate. Vuoi davvero lasciare la pagina?')
		})
		expect(AVVISO_ABBANDONO).toBe('Ci sono modifiche non salvate. Vuoi davvero lasciare la pagina?')
		expect(router.state.location.pathname).toBe(DETAIL)
		// The edit is still there to go back to — a guard that held the navigation but dropped the form
		// state would be worse than no guard at all.
		expect(screen.getByLabelText('Nome')).toHaveValue('Marione')
	})

	it('leaves when the answer is yes', async () => {
		stubGraphQL(detail)
		const { router } = await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Info imprenditore' })
		await sporca()

		const confirm = rispondi(true)
		await router.navigate({ to: '/impostazioni' })

		expect(confirm).toHaveBeenCalledWith(AVVISO_ABBANDONO)
		expect(router.state.location.pathname).toBe('/impostazioni')
	})

	// The question is the cost of the guard, and a page nobody touched must not pay it: an operator who
	// only came to read has done nothing that leaving would lose.
	it('says nothing when the page is untouched', async () => {
		stubGraphQL(detail)
		const { router } = await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Info imprenditore' })

		const confirm = rispondi(false)
		await router.navigate({ to: '/impostazioni' })

		expect(confirm).not.toHaveBeenCalled()
		expect(router.state.location.pathname).toBe('/impostazioni')
	})
})

/*
 * A save leaves the page looking the way it loaded: every row the operator opened is a value and a pen
 * again. Done by remounting both halves on a counter the successful save bumps, because `EditableRow`
 * has no close of its own — a row that closed while react-hook-form still held its edited value would
 * show the server's value and save a different one.
 */
describe('ImprenditoreDetailPage — dopo il salvataggio', () => {
	it('puts every row it opened back to read-only', async () => {
		stubGraphQL({ ...detail, ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Info imprenditore' })
		await sporca()

		expect(screen.queryByRole('button', { name: 'Modifica Nome' })).not.toBeInTheDocument()

		await userEvent.click(screen.getByRole('button', { name: 'Salva' }))

		// The pen is back, the editor is gone, and the field shows what the server has — not the value that
		// was typed into a form which no longer exists.
		expect(await screen.findByRole('button', { name: 'Modifica Nome' })).toBeInTheDocument()
		expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
		expect(screen.getByText('Mario')).toBeInTheDocument()
	})

	/*
	 * All three sections, and not the anagrafica alone.
	 *
	 * Each one is remounted by a key of its own, and a key that stopped following the counter would leave
	 * exactly that section open while the two beside it closed — a page half back to read-only, with one
	 * card still holding a form seeded from data the save has just invalidated. The prefixes are what keep
	 * the three keys apart; the counter alone would be three siblings sharing one key space.
	 *
	 * Only the anagrafica is dirtied: a clean section is asked to save and answers yes without a round
	 * trip, which is enough to bump the counter and is what the other two are here to be measured by.
	 */
	it('puts the rows of the companies and the shops back too', async () => {
		stubGraphQL({ ...conListe, ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Info imprenditore' })
		await sporca()

		await userEvent.click(screen.getByRole('button', { name: 'Modifica Ragione sociale' }))
		await userEvent.click(screen.getByRole('button', { name: 'Modifica nome' }))
		expect(screen.getByLabelText('Ragione sociale')).toBeInTheDocument()

		await userEvent.click(screen.getByRole('button', { name: 'Salva' }))

		expect(await screen.findByRole('button', { name: 'Modifica Ragione sociale' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Modifica nome' })).toBeInTheDocument()
		expect(screen.queryByLabelText('Ragione sociale')).not.toBeInTheDocument()
	})

	// Only a save that went all the way through. A page left half-written still holds edits, and closing
	// those rows would hide values the operator would have to type again.
	it('leaves the open rows alone when the save was refused', async () => {
		stubGraphQL({ ...detail, ImprenditoreUpdate: { data: { imprenditoreUpdate: false } } })
		await renderRoute(DETAIL)

		await screen.findByRole('heading', { name: 'Info imprenditore' })
		await sporca()

		await userEvent.click(screen.getByRole('button', { name: 'Salva' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito')
		expect(screen.getByLabelText('Nome')).toHaveValue('Marione')
	})
})
