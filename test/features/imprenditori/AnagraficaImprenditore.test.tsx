import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { RICERCA_DEBOUNCE_MS } from '@/components/ui/AddressField'
import { INTESTAZIONE_VALIDAZIONE } from '@/components/ui/ToastValidazione'
import { accountStatusClass } from '@/features/imprenditori/AnagraficaImprenditore'

import type { GraphQLReplies, GraphQLStub } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import type { RispostaOsm } from '../../helpers/nominatim'
import { osmStub, risultatoOsm } from '../../helpers/nominatim'
import { pagina } from '../../helpers/pagina'
import { renderRoute } from '../../helpers/render'

const ID = '65f0000000000000000000f1'
const DETAIL = `/p/imprenditori/id/${ID}`

/**
 * ⚠️ The `__typename` is not decoration. urql's document cache invalidates by the typenames a *response*
 * mentions, and every write on this page answers a bare `Boolean` that mentions none — so the call sites
 * name the type by hand through `additionalTypenames`, and that only matches if the cached query result
 * carries the typename in the first place. Drop it here and the refetch assertion below can never fire.
 */
const imprenditore = {
	__typename: 'GraphQLImprenditoreById',
	_id: ID,
	iscrizione: '2026-02-01T08:05:45.000Z',
	deleted: null,
	disabled: false,
	waitApprov: false,
	login: {
		email: 'mario@rossi.it',
		firstLogin: '2026-02-02T09:00:00.000Z',
		lastLogin: '2026-03-01T18:30:00.000Z',
		// A string, not a number: `login.onboardingStep` is `GraphQLString` on the resolver and
		// `string, maxLength: 4` in the collection validator. A numeric fixture would be a shape the
		// service cannot send, and it would fail the detail form's own `z.string()` on every save.
		onboardingStep: '3',
		onboardingDone: true,
		rememberMe: false
	},
	anagrafica: {
		nome: 'Mario',
		cognome: 'Rossi',
		nascita: { data: '1980-06-15T00:00:00.000Z' },
		contatti: { email: 'contatto@rossi.it', fisso: null, cellulare: '3331234567' },
		// ⚠️ No `position`, which is the *normal* state of an imprenditore: the field was added as optional
		// by `alter-imprenditore-position` and nothing backfilled it, unlike a punto vendita where it is
		// required. The fixture with a point is `conPosizione` below, and it is the exception here.
		indirizzo: { indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano', provincia: 'MI', position: null }
	},
	// The operator's own note about the account. Absent until one is written — `imprenditoreUpdateNote`
	// `$unset`s the key rather than storing an empty string.
	note: null,
	resetPwd: null
}

/** The same imprenditore with the coordinates an address pick would have left behind. */
const conPosizione = {
	anagrafica: {
		...imprenditore.anagrafica,
		indirizzo: { ...imprenditore.anagrafica.indirizzo, position: { type: 'Point', coordinates: [9.19, 45.4642] } }
	}
}

/**
 * An address the form refuses on every field behind the box at once.
 *
 * Not a contrived shape: the address rules arrived with this card, the collection validator is looser
 * than they are, and the coordinates were added by a migration that backfilled nothing — so a record
 * written before any of that can hold no street, a four-digit CAP, no comune, a sigla that is three
 * letters and a point that is nowhere. It is the only way to get all six refusals on screen together,
 * which is what the pick then has to clear.
 */
const rovinato = {
	anagrafica: {
		...imprenditore.anagrafica,
		indirizzo: { indirizzo: '', cap: '2010', comune: '', provincia: 'MIL', position: { type: 'Point', coordinates: [999, 999] } }
	}
}

const detail = (override: Record<string, unknown> = {}) => ({
	ImprenditoreById: { data: { imprenditoreById: { ...imprenditore, ...override } } },
	// No companies and no shops: this file is about the anagrafica card, and either list would put more
	// regions, more pens and — when a query fails — a second alert on the page its assertions look at.
	ImprenditoreAziende: { data: { imprenditoreAziende: [] } },
	ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
})

/** One Infobox, by the heading that names it — every card on this page is a labelled `region`. */
const box = (title: string) => within(screen.getByRole('region', { name: title }))

/**
 * The right-hand half of an `InfoRow`, found through the label on its left.
 *
 * ⚠️ `selector: 'span'`, because two cards are named after their only row — "Indirizzo" and "Note" — so
 * the card's own `h3` carries the same text as the row label and an unrestricted lookup matches both.
 */
const rowValue = (title: string, label: string): string => {
	const row = box(title).getByText(label, { selector: 'span' }).parentElement as HTMLElement
	return row.lastElementChild?.textContent ?? ''
}

/**
 * ⚠️ `deleted` is a **timestamp**, not a flag — `IImprenditoreSchema.deleted?: Date`, exposed as
 * `DateTime`. Its presence is the soft delete, so it is tested with `!= null`. Comparing it against
 * `true`, or rendering it through `handleNullBoolYN`, is false for every value the field can hold: a
 * deleted account then reads "Eliminato: No" and never gets its grey tint. The cases below pin each
 * state to its class so that mistake cannot pass.
 */
describe('accountStatusClass', () => {
	it('is nothing at all for an approved, active account', () => {
		expect(accountStatusClass({ deleted: null, disabled: false, waitApprov: false })).toBe('')
	})

	it('marks a soft-deleted account by the presence of its timestamp', () => {
		expect(accountStatusClass({ deleted: '2026-04-01T00:00:00.000Z', disabled: false, waitApprov: false })).toBe(
			'account-deleted'
		)
	})

	// Deleted wins over disabled: an account that is both is gone, and "disabilitato" understates it.
	it('prefers deleted over disabled', () => {
		expect(accountStatusClass({ deleted: '2026-04-01T00:00:00.000Z', disabled: true, waitApprov: true })).toBe('account-deleted')
	})

	it('marks a disabled account', () => {
		expect(accountStatusClass({ deleted: null, disabled: true, waitApprov: true })).toBe('account-disabled')
	})

	it('marks an account still waiting on manual approval', () => {
		expect(accountStatusClass({ deleted: null, disabled: false, waitApprov: true })).toBe('account-wait-approv')
	})

	// The empty object is the case a bare trailing `else` gets wrong: reaching the yellow that way also
	// catches an account with nothing set, painting a perfectly active imprenditore "in attesa".
	it('treats missing fields as nothing wrong', () => {
		expect(accountStatusClass({})).toBe('')
	})
})

describe('AnagraficaImprenditore', () => {
	it('waits before deciding the imprenditore does not exist', async () => {
		stubGraphQL({
			ImprenditoreById: { pending: true },
			ImprenditoreAziende: { pending: true },
			ImprenditorePuntiVendita: { pending: true }
		})
		await renderRoute(DETAIL)

		expect(screen.getByText('Caricamento imprenditore')).toBeInTheDocument()
		expect(screen.queryByText('Imprenditore non trovato.')).not.toBeInTheDocument()
	})

	it('shows the personal details', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		expect(await screen.findByText('Mario')).toBeInTheDocument()
		expect(box('Imprenditore').getByText('Rossi')).toBeInTheDocument()
		expect(box('Imprenditore').getByText('15/06/1980')).toBeInTheDocument()
		expect(box('Imprenditore').getByText('3331234567')).toBeInTheDocument()
		expect(box('Imprenditore').getByText('contatto@rossi.it')).toBeInTheDocument()
	})

	// A dash says "not given"; an empty cell says "something broke". Every optional field on this page
	// goes through `handleNull` for that reason — a label with nothing beside it reads as a rendering
	// fault, and an operator cannot tell it apart from a field that failed to load.
	it('renders a missing landline as a dash, not as a gap', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Imprenditore', 'Fisso')).toBe('---')
	})

	// One line, not a row per field: the four fields behind it have no box of their own, exactly as on a
	// punto vendita, because only a geocoder pick writes them.
	it('composes the address on one line', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Indirizzo', 'Indirizzo')).toBe('Via Roma 1, 20100 Milano (MI)')
		expect(box('Indirizzo').queryByText('CAP')).not.toBeInTheDocument()
		expect(box('Indirizzo').queryByText('Città')).not.toBeInTheDocument()
	})

	// The marker, not the frame: an embed without one is a picture of Milan, which is true of every
	// imprenditore in the city and says nothing about this one.
	it('draws the position as a map named after the imprenditore', async () => {
		stubGraphQL(detail(conPosizione))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByTitle('Mappa di Mario Rossi')).toHaveAttribute('src', expect.stringContaining('marker=45.46420,9.19000'))
	})

	/*
	 * ⚠️ The difference from the punto vendita's card, and the reason it is a sentence rather than a blank
	 * space: an imprenditore registered before `position` existed has none, so this is the state most rows
	 * are in. A map centred on a fallback would be a claim about where they live; an empty gap would read
	 * as a frame that failed to load.
	 */
	it('says so instead of drawing a map for an address with no point behind it', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.queryByTitle('Mappa di Mario Rossi')).not.toBeInTheDocument()
		expect(
			box('Indirizzo').getByText("Posizione non disponibile: modifica l'indirizzo e selezionalo dall'elenco per aggiungerla.")
		).toBeInTheDocument()
	})

	it('shows the account status and the login history', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Account status', 'Disabilitato')).toBe('No')
		expect(rowValue('Account status', 'Eliminato il')).toBe('---')
		expect(rowValue('Account status', 'Registrato')).toBe('1 febbraio 2026 alle ore 08:05:45')
		expect(rowValue('Account status', 'Primo login')).toBe('2 febbraio 2026 alle ore 09:00:00')
		expect(rowValue('Account status', 'Ultimo login')).toBe('1 marzo 2026 alle ore 18:30:00')
	})

	it('tints the box of a deleted account', async () => {
		stubGraphQL(detail({ deleted: '2026-04-01T12:00:00.000Z' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByRole('region', { name: 'Account status' })).toHaveClass('account-deleted')
		expect(rowValue('Account status', 'Eliminato il')).toBe('1 aprile 2026 alle ore 12:00:00')
	})

	it('shows the onboarding preferences', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Preferenze', 'Ricordami al login')).toBe('No')
		expect(rowValue('Preferenze', 'Onboarding completato')).toBe('Sì')
		expect(rowValue('Preferenze', 'Passo onboarding')).toBe('3')
	})

	// A reset hash is secret-adjacent: enough of it to correlate with a log line, not enough to replay
	// the reset link it belongs to.
	it('truncates the recovery hash', async () => {
		stubGraphQL(
			detail({
				resetPwd: { resetDateReq: '2026-05-01T07:00:00.000Z', resetHash: 'abcdefghijklmnopqrstuvwxyz0123456789' }
			})
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Password', 'Hash di recupero')).toBe('abcdefghijklmnopqrst...')
		expect(rowValue('Password', 'Richiesta di reset')).toBe('1 maggio 2026 alle ore 07:00:00')
	})

	// The note is the operator's own, and every imprenditore starts without one — a dash, so the empty card
	// reads as "nothing written here" rather than as a card that failed to render.
	it('shows the note, and a dash when there is none', async () => {
		stubGraphQL(detail({ note: 'Chiamare prima delle 18.\nRichiamato il 3/4.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Note', 'Note')).toBe('Chiamare prima delle 18.\nRichiamato il 3/4.')
	})

	it('renders a missing note as a dash, not as a gap', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Note', 'Note')).toBe('---')
	})

	it('handles an account that never asked for a reset', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(rowValue('Password', 'Hash di recupero')).toBe('---')
		expect(rowValue('Password', 'Richiesta di reset')).toBe('---')
	})

	it('reports a failure', async () => {
		stubGraphQL({
			ImprenditoreById: { errors: [graphQLError('Errore', 'Scheda non disponibile', 500)], status: 500 },
			ImprenditoreAziende: { data: { imprenditoreAziende: [] } },
			ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByRole('alert')).toHaveTextContent('Scheda non disponibile')
	})

	// `imprenditoreById` is nullable: an `_id` that matches nothing answers `null` without an error, and
	// a blank page would leave the operator to guess whether it loaded.
	it('says so when the id matches nothing', async () => {
		stubGraphQL({
			ImprenditoreById: { data: { imprenditoreById: null } },
			ImprenditoreAziende: { data: { imprenditoreAziende: [] } },
			ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByText('Imprenditore non trovato.')).toBeInTheDocument()
	})

	// A different shape from the one above and a different branch: `null` for the field is the service
	// answering "no such imprenditore", while a `data` that is null altogether is the service answering
	// nothing at all. Both end on the same message, and neither may end on a blank page.
	it('says so when the answer carries no data at all', async () => {
		stubGraphQL({
			ImprenditoreById: {},
			ImprenditoreAziende: { data: { imprenditoreAziende: [] } },
			ImprenditorePuntiVendita: { data: { imprenditorePuntiVendita: [] } }
		})
		await renderRoute(DETAIL)

		expect(await screen.findByText('Imprenditore non trovato.')).toBeInTheDocument()
	})

	it('renders', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})

/** Opens one row's editor. The pen is icon-only, so its `aria-label` is the only thing naming it. */
const apri = async (label: string) => {
	await userEvent.click(screen.getByRole('button', { name: `Modifica ${label}` }))
}

/** `fireEvent.change`, never `userEvent.type`: every box on this form carries a `maxLength` or is a date. */
const scrivi = (label: string, valore: string) => {
	fireEvent.change(screen.getByLabelText(label), { target: { value: valore } })
}

const salva = () => screen.getByRole('button', { name: 'Salva' })

/**
 * A refusal that is `false` with no error at all.
 *
 * No resolver here answers that way, but `Boolean!` says it could, and a save reported as successful
 * would be worse than a generic line. One case per group, because the four checks are four separate
 * branches: a copy-paste that left one of them reading another group's answer would otherwise pass.
 */
const RIFIUTI: readonly (readonly [string, string, string, Record<string, boolean>])[] = [
	['Nome', 'Marco', 'ImprenditoreUpdate', { imprenditoreUpdate: false }],
	['Email di login', 'nuova@rossi.it', 'ImprenditoreUpdateEmail', { imprenditoreUpdateEmail: false }],
	['Passo onboarding', '2', 'ImprenditoreUpdatePreferenze', { imprenditoreUpdatePreferenze: false }]
]

/** Only the writes. The two queries the page fires on mount are not what any of these tests is about. */
const scritture = (stub: GraphQLStub) => stub.calls.filter((chiamata) => chiamata.operationName.startsWith('ImprenditoreUpdate'))

const nomiScritture = (stub: GraphQLStub) => scritture(stub).map((chiamata) => chiamata.operationName)

/**
 * Every row on the detail page is editable in place, and nothing is written until the one Save button at
 * the bottom is pressed.
 *
 * ⚠️ The four mutations are fired **only for the groups the operator touched**, and that is a
 * correctness requirement rather than an optimisation: `imprenditoreUpdate` answers 500 when its `$set`
 * matched the document and modified nothing. Re-sending an untouched anagrafica alongside a changed
 * email would fail the save *after* the email had already been written, with nothing to roll it back.
 * The assertions below are on the exact list of operations sent, for that reason.
 */
describe('AnagraficaImprenditore — modifica', () => {
	it('turns a row into its editor, seeded with the stored value', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nome')

		expect(screen.getByLabelText('Nome')).toHaveValue('Mario')
		expect(box('Imprenditore').queryByText('Mario')).not.toBeInTheDocument()
	})

	// `onboardingStep` is the one nullable field of the form. A null has to seed an empty box, not the
	// word "null" for the operator to delete — and not a dirty box either, or the next save writes it.
	it('seeds an empty box for an imprenditore with no onboarding step', async () => {
		stubGraphQL(detail({ login: { ...imprenditore.login, onboardingStep: null } }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Passo onboarding')

		expect(screen.getByLabelText('Passo onboarding')).toHaveValue('')
		expect(salva()).toBeDisabled()
	})

	// The date box wants `YYYY-MM-DD` and the collection stores midnight UTC. Seeded in local time it
	// would arrive a day early west of Greenwich — and already dirty, so the next save would write it.
	it('seeds the date of birth in the form the date box accepts', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nato il')

		expect(screen.getByLabelText('Nato il')).toHaveValue('1980-06-15')
		expect(salva()).toBeDisabled()
	})

	it('sends the anagrafica alone when only the anagrafica changed', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nome')
		scrivi('Nome', 'Marco')
		await userEvent.click(salva())

		expect(await screen.findByText('Modifiche salvate.')).toBeInTheDocument()
		expect(scritture(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ImprenditoreUpdate',
				variables: {
					_id: ID,
					anagrafica: {
						nome: 'Marco',
						cognome: 'Rossi',
						nascita: { data: '1980-06-15' },
						// ⚠️ `position: null` and not an absent key. The mutation `$set`s the whole anagrafica,
						// so the point travels on every save of it — this imprenditore has none, and `null` is
						// what says so. An omitted key here would be a save that erases a point the record had.
						indirizzo: {
							indirizzo: 'Via Roma 1',
							cap: '20100',
							comune: 'Milano',
							provincia: 'MI',
							position: null
						},
						// The landline is absent on this imprenditore and stays absent: `null`, never `''`,
						// which the collection would accept as a real number of no digits.
						contatti: { cellulare: '3331234567', fisso: null, email: 'contatto@rossi.it' }
					}
				}
			})
		])
	})

	it('sends a cleared landline as null', async () => {
		const stub = stubGraphQL({
			...detail({
				anagrafica: { ...imprenditore.anagrafica, contatti: { ...imprenditore.anagrafica.contatti, fisso: '021234567' } }
			}),
			ImprenditoreUpdate: { data: { imprenditoreUpdate: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Fisso')
		scrivi('Fisso', '')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toMatchObject({
			anagrafica: { contatti: { fisso: null } }
		})
	})

	// The point the record already had, re-sent unchanged on a save that was about the name. The mutation
	// `$set`s the whole anagrafica, so a payload that dropped it would erase the coordinates of every
	// imprenditore whose phone number was ever corrected.
	it('carries the stored position through a save about something else', async () => {
		const stub = stubGraphQL({ ...detail(conPosizione), ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nome')
		scrivi('Nome', 'Marco')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toMatchObject({
			// Longitude first — the pair is GeoJSON on the wire, whatever order the boxes hold it in.
			anagrafica: { indirizzo: { position: { coordinates: [9.19, 45.4642] } } }
		})
	})

	// `login.email` carries the collection's only unique index, which is why it has a mutation of its own
	// and why it must not travel inside the anagrafica write.
	it('sends the login email on its own', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdateEmail: { data: { imprenditoreUpdateEmail: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Email di login')
		scrivi('Email di login', 'nuova@rossi.it')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ImprenditoreUpdateEmail',
				variables: { _id: ID, email: 'nuova@rossi.it' }
			})
		])
	})

	it('sends both account flags when either is toggled', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdateStato: { data: { imprenditoreUpdateStato: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Disabilitato')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabilitato' }))
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ImprenditoreUpdateStato',
				variables: { _id: ID, disabled: true, waitApprov: false }
			})
		])
	})

	// `onboardingStep` is the one argument of the four that is nullable, and `null` genuinely means
	// "unset it" — the resolver `$unset`s the key rather than writing an empty string.
	it('sends a cleared onboarding step as null', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdatePreferenze: { data: { imprenditoreUpdatePreferenze: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Passo onboarding')
		scrivi('Passo onboarding', '')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ImprenditoreUpdatePreferenze',
				variables: { _id: ID, rememberMe: false, onboardingDone: true, onboardingStep: null }
			})
		])
	})

	it('fires every touched group, in order', async () => {
		const stub = stubGraphQL({
			...detail(),
			ImprenditoreUpdate: { data: { imprenditoreUpdate: true } },
			ImprenditoreUpdateEmail: { data: { imprenditoreUpdateEmail: true } },
			ImprenditoreUpdateStato: { data: { imprenditoreUpdateStato: true } },
			ImprenditoreUpdatePreferenze: { data: { imprenditoreUpdatePreferenze: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Cognome')
		scrivi('Cognome', 'Bianchi')
		await apri('Email di login')
		scrivi('Email di login', 'nuova@rossi.it')
		await apri('In attesa di approvazione')
		await userEvent.click(screen.getByRole('checkbox', { name: 'In attesa di approvazione' }))
		await apri('Ricordami al login')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Ricordami al login' }))
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(nomiScritture(stub)).toEqual([
			'ImprenditoreUpdate',
			'ImprenditoreUpdateEmail',
			'ImprenditoreUpdateStato',
			'ImprenditoreUpdatePreferenze'
		])
	})

	// Nothing is written until Save is pressed — a row left open with a typed value is not a write.
	it('writes nothing until Save is pressed', async () => {
		const stub = stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nome')
		scrivi('Nome', 'Marco')

		expect(scritture(stub)).toEqual([])
		expect(salva()).toBeEnabled()
	})

	it('refuses to send an invalid field', async () => {
		const stub = stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nome')
		scrivi('Nome', '   ')
		await userEvent.click(salva())

		expect(await pagina().findByText('Il nome è obbligatorio')).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})

	/*
	 * The three halves of a refusal, in one place: the box doubles its border and turns red, the toast in
	 * the corner names what is wrong, and both go away as the value is corrected — with no second press.
	 *
	 * That last part is what `handleSubmit` buys and `trigger()` did not: `isSubmitted` is what turns on
	 * react-hook-form's `reValidateMode: 'onChange'`, so until this the operator had to press Save again to
	 * find out whether the correction had worked.
	 *
	 * ⚠️ The toast is looked up through `screen` and not `pagina()`: the same sentence is on screen twice —
	 * under the box and in the list — and the stack is portalled to `document.body`, outside `main`.
	 */
	it('turns the refused box red and says why, then clears both as it is corrected', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nome')
		scrivi('Nome', '   ')
		await userEvent.click(salva())

		const avviso = await screen.findByRole('alert')
		expect(avviso).toHaveTextContent(INTESTAZIONE_VALIDAZIONE)
		expect(within(avviso).getByRole('listitem')).toHaveTextContent('Il nome è obbligatorio')
		expect(screen.getByLabelText('Nome')).toHaveClass('border-2', 'bg-app-error/10')

		scrivi('Nome', 'Marco')

		await waitFor(() => {
			expect(screen.getByLabelText('Nome')).toHaveClass('border', 'bg-white')
		})
		expect(screen.getByLabelText('Nome')).not.toHaveClass('bg-app-error/10')
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	// The backend's own description, not a generic line: 409 on a duplicate email is the one refusal an
	// operator can act on, and it is carried in `extensions.description` rather than in `message`.
	it('shows the backend refusal', async () => {
		stubGraphQL({
			...detail(),
			ImprenditoreUpdateEmail: { errors: [graphQLError('Errore', 'Email già presente', 409)], status: 409 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Email di login')
		scrivi('Email di login', 'presa@rossi.it')
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Email già presente')
		expect(screen.queryByText('Modifiche salvate.')).not.toBeInTheDocument()
	})

	it.each(RIFIUTI)('reports a bare refusal of %s', async (label, valore, operazione, data) => {
		stubGraphQL({ ...detail(), [operazione]: { data } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri(label)
		scrivi(label, valore)
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito.')
	})

	it('reports a bare refusal of the account flags', async () => {
		stubGraphQL({ ...detail(), ImprenditoreUpdateStato: { data: { imprenditoreUpdateStato: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Disabilitato')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabilitato' }))
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito.')
	})

	/*
	 * `=== true` per flag, and each of the four on its own line. All four are nullable booleans, and a box
	 * seeded from the wrong side of one of them fails silently: it does not come back dirty, so nothing is
	 * written and nothing is flagged — the operator simply reads the opposite of what the collection holds
	 * and, worse, ticking it back to the truth is what finally sends a write.
	 */
	it('seeds each box from the flag it belongs to', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Disabilitato')
		await apri('In attesa di approvazione')
		await apri('Ricordami al login')
		await apri('Onboarding completato')

		expect(screen.getByRole('checkbox', { name: 'Disabilitato' })).not.toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'In attesa di approvazione' })).not.toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Ricordami al login' })).not.toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Onboarding completato' })).toBeChecked()
		expect(salva()).toBeDisabled()
	})

	/*
	 * The same four boxes on a fixture holding the other value of every flag, and both halves are needed.
	 * A seeding that read no flag at all and ticked the four boxes from constants passes whichever of the
	 * two is run on its own — it is the pair that ties each box to its own field rather than to a literal.
	 */
	it('seeds each box from the flag it belongs to, the other way round', async () => {
		stubGraphQL(
			detail({
				disabled: true,
				waitApprov: true,
				login: { ...imprenditore.login, rememberMe: true, onboardingDone: false }
			})
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Disabilitato')
		await apri('In attesa di approvazione')
		await apri('Ricordami al login')
		await apri('Onboarding completato')

		expect(screen.getByRole('checkbox', { name: 'Disabilitato' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'In attesa di approvazione' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Ricordami al login' })).toBeChecked()
		expect(screen.getByRole('checkbox', { name: 'Onboarding completato' })).not.toBeChecked()
		expect(salva()).toBeDisabled()
	})

	// The name passed to `register` is what ties a box to the form, and getting it wrong is not a type
	// error — the box simply detaches. What the operator typed then never reaches the payload and the
	// stored value is re-sent in its place, which reads as a save that silently undid the edit.
	it('sends what was typed into each of the remaining boxes', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Cellulare')
		scrivi('Cellulare', '3339998877')
		await apri('Email di contatto')
		scrivi('Email di contatto', 'nuovo@rossi.it')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toMatchObject({
			anagrafica: { contatti: { cellulare: '3339998877', email: 'nuovo@rossi.it' } }
		})
	})

	it('sends the onboarding flag the operator unticked', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdatePreferenze: { data: { imprenditoreUpdatePreferenze: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Onboarding completato')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Onboarding completato' }))
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ImprenditoreUpdatePreferenze',
				variables: { _id: ID, rememberMe: false, onboardingDone: false, onboardingStep: '3' }
			})
		])
	})

	/*
	 * The three refusals below arrive as a `CombinedError`, which is the shape every real failure here has
	 * — a 409 on the unique email, a 500 from a `$set` that matched a document and modified none.
	 *
	 * ⚠️ An error reply carries **no `data` at all**, which is why each check reaches through it with `?.`.
	 * Written as `risultato.data.imprenditoreUpdate` it is not a wrong message but a TypeError thrown mid
	 * save: the promise rejects, nothing catches it, and the operator is left on a page that reports
	 * neither success nor failure. One test per mutation, because they are four separate checks.
	 */
	it('reports the backend refusal of the anagrafica write', async () => {
		stubGraphQL({
			...detail(),
			ImprenditoreUpdate: { errors: [graphQLError('Errore', 'Anagrafica non aggiornabile', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Nome')
		scrivi('Nome', 'Marco')
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Anagrafica non aggiornabile')
	})

	it('reports the backend refusal of the account flags', async () => {
		stubGraphQL({
			...detail(),
			ImprenditoreUpdateStato: { errors: [graphQLError('Errore', 'Stato non aggiornabile', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Disabilitato')
		await userEvent.click(screen.getByRole('checkbox', { name: 'Disabilitato' }))
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Stato non aggiornabile')
	})

	it('reports the backend refusal of the preferences write', async () => {
		stubGraphQL({
			...detail(),
			ImprenditoreUpdatePreferenze: { errors: [graphQLError('Errore', 'Preferenze non aggiornabili', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Passo onboarding')
		scrivi('Passo onboarding', '2')
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Preferenze non aggiornabili')
	})

	/*
	 * All four writes answer a bare `Boolean`, which names no type for the document cache to invalidate —
	 * so the query behind this page would go on serving what it fetched on mount, and every row the
	 * operator did not have open would still show the old value after a successful save.
	 * `additionalTypenames` on the mutation context is what re-reads it.
	 */
	it('re-reads the imprenditore after a write that went through', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } })
		await renderRoute(DETAIL)

		const letture = () => stub.calls.filter((chiamata) => chiamata.operationName === 'ImprenditoreById')

		await screen.findByText('Mario')
		expect(letture()).toHaveLength(1)

		await apri('Nome')
		scrivi('Nome', 'Marco')
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		await waitFor(() => {
			expect(letture()).toHaveLength(2)
		})
	})
})

/**
 * Every test that opens the address row stubs the geocoder as well as GraphQL: typing into that row is
 * what the field debounces into a Nominatim request, and a stub that covered only GraphQL would let the
 * request fall through to the operation queue and throw as an unconfigured operation.
 */
const stubRete = (replies: GraphQLReplies, osm: RispostaOsm | readonly RispostaOsm[] = {}) =>
	stubGraphQL(replies, osmStub(osm).rest)

/** The suggestion for a geocoder answer, once the 700 ms debounce has run out. */
const suggerimentoOsm = (nome: string) => screen.findByRole('button', { name: nome }, { timeout: RICERCA_DEBOUNCE_MS + 2000 })

/** What `risultatoOsm()` answers with, as the suggestion list spells it out. */
const SUGGERIMENTO = 'Via Roma, 1, Milano, MI, 20121, Italia'

/** The same answer once picked, as the box spells it out. */
const SCELTO = 'Via Roma 1, 20121 Milano (MI)'

/** The map `AddressField` brings with it, which follows what is being typed rather than what is stored. */
const mappaEditor = () => screen.queryByTitle("Mappa dell'indirizzo")

/**
 * Every refusal the address box can be showing, and the reason they are asserted as a set.
 *
 * The box has one message for seven fields and shows the first of them that is in error, so a stale
 * refusal on any one field is indistinguishable from a stale refusal on any other — the operator sees
 * whichever comes first in that order and nothing about the rest. Checking that all seven are gone is
 * the only assertion that says the pick cleared the field it was really about.
 */
const MESSAGGI_INDIRIZZO = [
	"L'indirizzo è obbligatorio",
	'Il CAP deve essere di 5 cifre',
	'Il comune è obbligatorio',
	'La provincia è la sigla di 2 lettere',
	'La latitudine è fuori da -90..90',
	'La longitudine è fuori da -180..180',
	"Seleziona l'indirizzo dall'elenco"
]

/**
 * The address card, which is the punto vendita's card on a different collection.
 *
 * One box holding the whole address; the four fields behind it and the coordinate pair are written only
 * by picking one of the geocoder's answers. That is what makes the map possible at all — a position
 * cannot be typed, so it cannot be typed wrong.
 *
 * ⚠️ One thing here has no equivalent on a shop: the point is optional on this collection, so the pick is
 * how an imprenditore *gains* coordinates rather than how they move.
 */
describe('AnagraficaImprenditore — indirizzo', () => {
	// ⚠️ Not `screen.getByLabelText`. The card is a `region` labelled by its own "Indirizzo" heading, so
	// an unscoped lookup matches the card as well as the box inside it.
	const casella = () => box('Indirizzo').getByLabelText('Indirizzo')

	it('opens one box holding the whole address, and no box per field', async () => {
		stubRete(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')

		expect(casella()).toHaveValue('Via Roma 1, 20100 Milano (MI)')
		expect(box('Indirizzo').queryByLabelText('CAP')).not.toBeInTheDocument()
		expect(box('Indirizzo').queryByLabelText('Comune')).not.toBeInTheDocument()
		expect(box('Indirizzo').queryByLabelText('Provincia')).not.toBeInTheDocument()
		expect(box('Indirizzo').queryByLabelText('Latitudine')).not.toBeInTheDocument()
	})

	// Two maps of two different places stacked in one card is worse than either: the editor's follows what
	// is being typed, the stored one is where the imprenditore lives now, and nothing on screen would say
	// which is which. The stored one steps aside for as long as the editor is open.
	it('hands the map over to the editor while the row is open', async () => {
		stubRete(detail(conPosizione))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		expect(screen.getByTitle('Mappa di Mario Rossi')).toBeInTheDocument()
		expect(mappaEditor()).not.toBeInTheDocument()

		await apri('Indirizzo')

		expect(screen.queryByTitle('Mappa di Mario Rossi')).not.toBeInTheDocument()
		// Framed on the imprenditore, not on the middle of Italy: the card was drawing this exact point a
		// moment ago, and an editor that opens by throwing it away is an editor that lost the address.
		expect(mappaEditor()).toHaveAttribute('src', expect.stringContaining('marker=45.46420,9.19000'))
	})

	// The sentence goes away with the rest of the read-only half, and the editor opens on the middle of
	// Italy — there is nowhere else to open it for a record whose position nobody ever picked.
	it('opens on Italy for an imprenditore who has no point yet', async () => {
		stubRete(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')

		expect(
			screen.queryByText("Posizione non disponibile: modifica l'indirizzo e selezionalo dall'elenco per aggiungerla.")
		).not.toBeInTheDocument()
		expect(mappaEditor()).toBeInTheDocument()
	})

	/*
	 * The whole point of the card, and on this collection the only way a point arrives at all: the operator
	 * types, OSM answers, and one click fills an address, a CAP, a comune, a provincia **and** a position
	 * where the record had none.
	 */
	it('writes the picked address and its coordinates, longitude first on the wire', async () => {
		const stub = stubRete(
			{ ...detail(), ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } },
			{ risultati: [risultatoOsm()] }
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 1 Milano' } })
		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))

		expect(casella()).toHaveValue(SCELTO)

		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toMatchObject({
			anagrafica: {
				indirizzo: {
					indirizzo: 'Via Roma 1',
					cap: '20121',
					comune: 'Milano',
					provincia: 'MI',
					// Longitude first, and the pair is the geocoder's — reading it back in the order OSM sent
					// it would put an imprenditore from Milan in the sea off Somalia.
					position: { coordinates: [9.1895, 45.4642] }
				}
			}
		})
	})

	/*
	 * ⚠️ The reason this card needs a rule of its own.
	 *
	 * The box is free text and the fields behind it are not written by typing, so an address left half
	 * typed and never picked would send the *stored* street, CAP, comune and position under a line that
	 * reads like a different address entirely — a save that looks like it worked and wrote none of what is
	 * on screen. The message is on the box, because the fields it is really about have no input at all.
	 */
	it('refuses an address that was typed but never picked', async () => {
		const stub = stubRete(
			{ ...detail(), ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } },
			{ risultati: [risultatoOsm()] }
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 1 Milano' } })
		await userEvent.click(salva())

		expect(await pagina().findByText("Seleziona l'indirizzo dall'elenco")).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})

	// And takes the refusal back the moment one is picked. The composite rule is checked on
	// `indirizzoCompleto`, the one field of the seven that has a box, so its name has to be in the list the
	// pick re-validates as much as the five that do not — left out, the operator picks the address they
	// were told to pick and is told again to pick it.
	it('clears the refusal once an address is picked from the list', async () => {
		stubRete(detail(), { risultati: [risultatoOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 1 Milano' } })
		await userEvent.click(salva())

		expect(await pagina().findByText("Seleziona l'indirizzo dall'elenco")).toBeInTheDocument()

		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))

		await waitFor(() => {
			expect(pagina().queryByText("Seleziona l'indirizzo dall'elenco")).not.toBeInTheDocument()
		})
		expect(casella()).toHaveValue(SCELTO)
	})

	/*
	 * The other six names in that list, cleared together.
	 *
	 * A pick writes all six fields behind the box, so all six have to be asked again — and a record stored
	 * before the address rules existed is refused on every one of them at once, which is what makes the
	 * whole set observable in a single save. Any name missing from the list leaves its own refusal
	 * standing, and the box goes on showing an error about a field the operator has just replaced.
	 */
	it('clears every field that was refused before the address was picked', async () => {
		stubRete(detail(rovinato), { risultati: [risultatoOsm()] })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Via Roma 1 Milano' } })
		await userEvent.click(salva())

		// The first of the six, which is all the box can say about them.
		expect(await pagina().findByText("L'indirizzo è obbligatorio")).toBeInTheDocument()

		fireEvent.click(await suggerimentoOsm(SUGGERIMENTO))

		await waitFor(() => {
			for (const messaggio of MESSAGGI_INDIRIZZO) expect(screen.queryByText(messaggio)).not.toBeInTheDocument()
		})
	})

	/*
	 * OSM answers for places that are not postal addresses — a bridge, a square, a hamlet — and those come
	 * back without a `postcode`. The four fields it fills have no box of their own, so their errors have
	 * nowhere to render unless the card gathers them: without that the save would refuse in silence and the
	 * operator would press Save again. The field's own message comes first, because "seleziona l'indirizzo"
	 * under an address that *was* selected sends them back to the list for nothing.
	 */
	it('reports a geocoder answer that carries no CAP', async () => {
		const stub = stubRete(
			{ ...detail(), ImprenditoreUpdate: { data: { imprenditoreUpdate: true } } },
			{
				risultati: [
					risultatoOsm({
						display_name: 'Piazza del Duomo, Milano, Italia',
						address: { road: 'Piazza del Duomo', city: 'Milano', 'ISO3166-2-lvl6': 'IT-MI' }
					})
				]
			}
		)
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')
		fireEvent.change(casella(), { target: { value: 'Piazza del Duomo' } })
		fireEvent.click(await suggerimentoOsm('Piazza del Duomo, Milano, Italia'))
		await userEvent.click(salva())

		expect(await pagina().findByText('Il CAP deve essere di 5 cifre')).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})

	/*
	 * A pick is what the form counts as the edit, not the typing that led to it — which is why all seven
	 * fields are written as modified rather than left alone.
	 *
	 * The case that tells the two apart: pick the address the imprenditore already has. Every field then
	 * holds what it held before anything was touched, so there is nothing to save and the button says so.
	 * Left unmarked, the pick would not undo the typing's own dirty flag and the page would offer to write
	 * the address back over itself.
	 */
	it('goes clean again when the stored address is the one picked', async () => {
		stubRete(detail(conPosizione), {
			risultati: [
				risultatoOsm({
					display_name: 'Via Roma, 1, Milano, MI, 20100, Italia',
					lat: '45.4642',
					lon: '9.19',
					address: {
						road: 'Via Roma',
						house_number: '1',
						postcode: '20100',
						city: 'Milano',
						'ISO3166-2-lvl6': 'IT-MI'
					}
				})
			]
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Indirizzo')
		expect(salva()).toBeDisabled()

		fireEvent.change(casella(), { target: { value: 'Via Roma Milano' } })
		expect(salva()).toBeEnabled()

		fireEvent.click(await suggerimentoOsm('Via Roma, 1, Milano, MI, 20100, Italia'))

		expect(casella()).toHaveValue('Via Roma 1, 20100 Milano (MI)')
		await waitFor(() => {
			expect(salva()).toBeDisabled()
		})
	})
})

/**
 * The operator's note, which is a mutation of its own for the same reason the login email is: it is the
 * one field on this page that is not part of the anagrafica, the flags or the preferences, and
 * `imprenditoreUpdate` answers **500** for a `$set` that changed nothing.
 */
describe('AnagraficaImprenditore — note', () => {
	// ⚠️ Scoped like the address box: the card is a `region` labelled "Note" and the box inside it is
	// labelled "Note" too, so an unscoped lookup matches both.
	const areaNote = () => box('Note').getByLabelText('Note')

	it('opens a textarea seeded with the stored note', async () => {
		stubGraphQL(detail({ note: 'Chiamare prima delle 18.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')

		expect(areaNote().tagName).toBe('TEXTAREA')
		expect(areaNote()).toHaveValue('Chiamare prima delle 18.')
		expect(salva()).toBeDisabled()
	})

	// An imprenditore with no note seeds an empty box, not the word "null" for the operator to delete —
	// and not a dirty box either, or the next save would write it.
	it('seeds an empty box for an imprenditore with no note', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')

		expect(areaNote()).toHaveValue('')
		expect(salva()).toBeDisabled()
	})

	it('sends the note on its own, and nothing else with it', async () => {
		const stub = stubGraphQL({ ...detail(), ImprenditoreUpdateNote: { data: { imprenditoreUpdateNote: true } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')
		fireEvent.change(areaNote(), { target: { value: '  Preferisce il telefono.  ' } })
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)).toEqual([
			expect.objectContaining({
				operationName: 'ImprenditoreUpdateNote',
				// Trimmed, because the payload is the *parsed* value — the schema's transforms are as much
				// part of the write as its messages are part of the page.
				variables: { _id: ID, note: 'Preferisce il telefono.' }
			})
		])
	})

	// ⚠️ The empty string, not `null`. The mutation takes `String!`, and blank is the instruction that
	// removes the note — there is nothing to send `null` as, and a `vuotoInNull` here would be a type
	// error at best and a cleared note that never clears at worst.
	it('sends a cleared note as an empty string', async () => {
		const stub = stubGraphQL({
			...detail({ note: 'Chiamare prima delle 18.' }),
			ImprenditoreUpdateNote: { data: { imprenditoreUpdateNote: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')
		fireEvent.change(areaNote(), { target: { value: '' } })
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(scritture(stub)[0]?.variables).toEqual({ _id: ID, note: '' })
	})

	// Last of the six writes, after the preferences — the order the page fires them in is asserted whole
	// so a group that stopped firing shows up as a missing name rather than as a passing test.
	it('fires after the other groups when both were touched', async () => {
		const stub = stubGraphQL({
			...detail(),
			ImprenditoreUpdatePreferenze: { data: { imprenditoreUpdatePreferenze: true } },
			ImprenditoreUpdateNote: { data: { imprenditoreUpdateNote: true } }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Passo onboarding')
		scrivi('Passo onboarding', '4')
		await apri('Note')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(salva())

		await screen.findByText('Modifiche salvate.')
		expect(nomiScritture(stub)).toEqual(['ImprenditoreUpdatePreferenze', 'ImprenditoreUpdateNote'])
	})

	it('refuses a note past the cap', async () => {
		const stub = stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')
		fireEvent.change(areaNote(), { target: { value: 'n'.repeat(2001) } })
		await userEvent.click(salva())

		expect(await pagina().findByText('La nota non può superare 2000 caratteri')).toBeInTheDocument()
		expect(scritture(stub)).toEqual([])
	})

	/*
	 * The count is seeded from the stored note, not from zero.
	 *
	 * ⚠️ This is the case the caller-side count exists for: `register()` writes the stored value in through
	 * a ref and fires no `onChange`, so a length the box measured itself would open at "2000 rimanenti" on a
	 * note of twenty-four characters and only tell the truth after a keystroke.
	 */
	it('counts the characters left, starting from the stored note', async () => {
		stubGraphQL(detail({ note: 'Chiamare prima delle 18.' }))
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')

		expect(box('Note').getByText('1976 caratteri rimanenti')).toBeInTheDocument()

		fireEvent.change(areaNote(), { target: { value: 'Memo' } })

		expect(box('Note').getByText('1996 caratteri rimanenti')).toBeInTheDocument()
	})

	// Past the cap the count goes negative rather than sticking at zero: `maxLength` stops typing but not a
	// paste, and "-1" is the one number that says how much has to come back out.
	it('counts past the cap into the negative', async () => {
		stubGraphQL(detail())
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')
		fireEvent.change(areaNote(), { target: { value: 'n'.repeat(2001) } })

		expect(box('Note').getByText('-1 caratteri rimanenti')).toBeInTheDocument()
	})

	it('reports the backend refusal of the note write', async () => {
		stubGraphQL({
			...detail(),
			ImprenditoreUpdateNote: { errors: [graphQLError('Errore', 'Nota non aggiornabile', 500)], status: 500 }
		})
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Nota non aggiornabile')
	})

	it('reports a bare refusal of the note write', async () => {
		stubGraphQL({ ...detail(), ImprenditoreUpdateNote: { data: { imprenditoreUpdateNote: false } } })
		await renderRoute(DETAIL)

		await screen.findByText('Mario')
		await apri('Note')
		fireEvent.change(areaNote(), { target: { value: 'Memo' } })
		await userEvent.click(salva())

		expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito.')
	})
})
