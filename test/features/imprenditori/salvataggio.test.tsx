import { zodResolver } from '@hookform/resolvers/zod'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { TextField } from '@/components/ui/TextField'
import type { RegistraSezione } from '@/features/imprenditori/salvataggio'
import { SalvaModifiche, salvaValidato, useSalvataggio, useSezioneSalvabile } from '@/features/imprenditori/salvataggio'

/**
 * A stand-in for one editable block of the detail page.
 *
 * It owns its own dirtiness and clears it on a successful save, which is exactly what the real forms do
 * through react-hook-form's `reset` — and it is what makes "Modifiche salvate" reachable at all, since
 * the message is shown only for a save nothing has superseded.
 *
 * `salva` is deliberately re-created on every render, closing over the current state. That is the shape
 * the real sections have — their `salva` reads the form, so it changes on every keystroke — and it is
 * what the hook's `salvaRef` indirection exists to survive.
 */
const Sezione = ({
	id,
	registra,
	esito = true,
	ordine,
	attendi
}: {
	id: string
	registra: RegistraSezione
	esito?: boolean
	ordine: string[]
	attendi?: Promise<void> | undefined
}) => {
	const [modificata, setModificata] = useState(false)

	useSezioneSalvabile(id, registra, modificata, async () => {
		ordine.push(id)
		await attendi
		if (esito) setModificata(false)
		return esito
	})

	return (
		<button
			type="button"
			onClick={() => {
				setModificata((precedente) => !precedente)
			}}
		>
			{`tocca ${id}`}
		</button>
	)
}

const Pagina = ({
	ids,
	esiti = {},
	ordine,
	attendi
}: {
	ids: readonly string[]
	esiti?: Record<string, boolean>
	ordine: string[]
	attendi?: Promise<void> | undefined
}) => {
	const { registra, salvaTutto, modificato } = useSalvataggio()
	const [visibili, setVisibili] = useState(ids)

	return (
		<>
			{visibili.map((id) => (
				<Sezione key={id} id={id} registra={registra} esito={esiti[id] ?? true} ordine={ordine} attendi={attendi} />
			))}
			<button
				type="button"
				onClick={() => {
					setVisibili((precedenti) => precedenti.slice(0, -1))
				}}
			>
				smonta ultima
			</button>
			<SalvaModifiche modificato={modificato} salvaTutto={salvaTutto} />
		</>
	)
}

/**
 * A section whose id can be swapped under it, and which is dirty from the moment it mounts.
 *
 * The point of it is the unregistration: `useSezioneSalvabile` has to forget the id it is *currently*
 * registered under, not the one it happened to mount with.
 */
const SezioneId = ({ id, registra }: { id: string; registra: RegistraSezione }) => {
	useSezioneSalvabile(id, registra, true, async () => true)

	return null
}

const PaginaId = ({ id, montata }: { id: string; montata: boolean }) => {
	const { registra, salvaTutto, modificato } = useSalvataggio()

	return (
		<>
			{montata ? <SezioneId id={id} registra={registra} /> : null}
			<SalvaModifiche modificato={modificato} salvaTutto={salvaTutto} />
		</>
	)
}

const salva = () => screen.getByRole('button', { name: 'Salva' })

describe('useSalvataggio', () => {
	// A save that changes nothing is not merely wasteful: `imprenditoreUpdate` answers 500 when its `$set`
	// matched a document and modified none, so an always-enabled button turns a second press into a
	// server error.
	it('keeps the button disabled while nothing has been touched', () => {
		render(<Pagina ids={['a', 'b']} ordine={[]} />)

		expect(salva()).toBeDisabled()
	})

	it('enables the button as soon as one section is dirty, and disables it again when it is not', async () => {
		render(<Pagina ids={['a', 'b']} ordine={[]} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca b' }))
		expect(salva()).toBeEnabled()

		await userEvent.click(screen.getByRole('button', { name: 'tocca b' }))
		expect(salva()).toBeDisabled()
	})

	// The page is dirty while *any* section is: cleaning one of two must not disarm the button for the
	// other, which is what a single boolean instead of a set of ids would do.
	it('stays enabled while another section is still dirty', async () => {
		render(<Pagina ids={['a', 'b']} ordine={[]} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))
		await userEvent.click(screen.getByRole('button', { name: 'tocca b' }))
		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))

		expect(salva()).toBeEnabled()
	})

	/*
	 * Clean sections are asked too. Each one decides which of its own writes to send — the anagrafica has
	 * four mutations behind one form — and a registry that skipped them would have to know which mutation
	 * covers which field.
	 */
	it('asks every registered section, in registration order', async () => {
		const ordine: string[] = []
		render(<Pagina ids={['a', 'b', 'c']} ordine={ordine} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca b' }))
		await userEvent.click(salva())

		expect(ordine).toEqual(['a', 'b', 'c'])
	})

	// Stopping at the first refusal is the whole reason `salva` answers a boolean: carrying on would
	// leave the operator with several half-applied blocks and one error message.
	it('stops at the first section that refuses', async () => {
		const ordine: string[] = []
		render(<Pagina ids={['a', 'b', 'c']} esiti={{ b: false }} ordine={ordine} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))
		await userEvent.click(salva())

		expect(ordine).toEqual(['a', 'b'])
	})

	// A section that unmounts has to be forgotten, or the page stays dirty forever over a form nobody can
	// reach and the Save button asks a dead closure to write.
	it('forgets a dirty section when it unmounts', async () => {
		const ordine: string[] = []
		render(<Pagina ids={['a', 'b']} ordine={ordine} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca b' }))
		expect(salva()).toBeEnabled()

		await userEvent.click(screen.getByRole('button', { name: 'smonta ultima' }))
		expect(salva()).toBeDisabled()

		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))
		await userEvent.click(salva())
		expect(ordine).toEqual(['a'])
	})

	/*
	 * A section unregisters the id it is registered under *now*.
	 *
	 * The cleanup deliberately sits in an effect of its own, keyed on the id, so that a section whose id
	 * moves lets go of the old one. Keyed on nothing instead, the closure would keep the id from the first
	 * render for good: the page would then hold two entries for one section and stay dirty over a form that
	 * has already gone.
	 */
	it('forgets the id it is registered under, not the one it mounted with', () => {
		const { rerender } = render(<PaginaId id="a" montata />)
		expect(salva()).toBeEnabled()

		rerender(<PaginaId id="b" montata />)
		expect(salva()).toBeEnabled()

		rerender(<PaginaId id="b" montata={false} />)
		expect(salva()).toBeDisabled()
	})

	/*
	 * `salvaTutto` reports the refusal itself, rather than leaving it to be inferred from the page still
	 * being dirty. A refused section is normally dirty too, which hides the difference — but not always:
	 * the shop panel refuses a queued deletion whose mutation failed while its form holds nothing.
	 */
	it('answers false when a section refuses, whatever the page thinks is dirty', async () => {
		const { result } = renderHook(() => useSalvataggio())

		act(() => {
			result.current.registra('a', { modificata: false, salva: async () => false })
		})

		await expect(result.current.salvaTutto()).resolves.toBe(false)
	})

	it('answers true when every section accepts', async () => {
		const { result } = renderHook(() => useSalvataggio())

		act(() => {
			result.current.registra('a', { modificata: true, salva: async () => true })
		})

		await expect(result.current.salvaTutto()).resolves.toBe(true)
	})

	/*
	 * The counter the page remounts its sections on, which is what puts every opened row back to a value
	 * and a pen after Save. It moves only for a save that went all the way through: a page left
	 * half-written still holds edits, and remounting would throw away the values the operator would then
	 * have to type again.
	 */
	it('counts a save that went through, and ignores one that did not', async () => {
		const { result } = renderHook(() => useSalvataggio())
		const iniziale = result.current.versione

		act(() => {
			result.current.registra('a', { modificata: true, salva: async () => false })
		})
		await act(async () => {
			await result.current.salvaTutto()
		})

		expect(result.current.versione).toBe(iniziale)

		act(() => {
			result.current.registra('a', { modificata: true, salva: async () => true })
		})
		await act(async () => {
			await result.current.salvaTutto()
		})

		expect(result.current.versione).toBe(iniziale + 1)
	})

	/*
	 * The dirty set is returned unchanged when nothing moved, and that is load-bearing rather than tidy: a
	 * section re-registers itself on every render of the page, so a `setModificate` that always handed back
	 * a new Set would re-render the page for each of them — and the page re-rendering is what makes the
	 * sections re-register.
	 */
	it('does not re-render the page when a section re-registers unchanged', () => {
		let render = 0
		const { result } = renderHook(() => {
			render += 1
			return useSalvataggio()
		})
		const sezione = { modificata: false, salva: async () => true }

		act(() => {
			result.current.registra('a', sezione)
		})
		const dopo = render

		act(() => {
			result.current.registra('a', sezione)
		})
		act(() => {
			result.current.registra('a', sezione)
		})

		expect(render).toBe(dopo)
	})
})

describe('SalvaModifiche', () => {
	// A page nobody has saved yet says nothing. Worth stating on its own: the condition the confirmation
	// hangs on is "saved *and* clean", and a page that has just loaded is already clean — so the flag
	// starting anywhere but false would put "Modifiche salvate." over a page whose Save has never been
	// pressed, which is the one moment it is guaranteed to be a lie.
	it('says nothing before anything has been saved', () => {
		render(<Pagina ids={['a']} ordine={[]} />)

		expect(screen.queryByText('Modifiche salvate.')).not.toBeInTheDocument()
	})

	it('confirms a save that went through', async () => {
		render(<Pagina ids={['a']} ordine={[]} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))
		await userEvent.click(salva())

		expect(screen.getByRole('status')).toHaveTextContent('Modifiche salvate.')
		expect(salva()).toBeDisabled()
	})

	// The confirmation must never sit above a form holding unsaved changes, so it is tied to "saved *and*
	// nothing has changed since" rather than to "a save succeeded once".
	it('withdraws the confirmation as soon as anything is edited again', async () => {
		render(<Pagina ids={['a']} ordine={[]} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))
		await userEvent.click(salva())
		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))

		expect(screen.queryByText('Modifiche salvate.')).not.toBeInTheDocument()
	})

	it('says nothing when the save was refused', async () => {
		render(<Pagina ids={['a']} esiti={{ a: false }} ordine={[]} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))
		await userEvent.click(salva())

		expect(screen.queryByText('Modifiche salvate.')).not.toBeInTheDocument()
	})

	// A second press while the first save is still in flight would fire every mutation twice.
	it('disables itself and shows a spinner while the save is in flight', async () => {
		let sblocca = () => {
			/* replaced below */
		}
		const attendi = new Promise<void>((resolve) => {
			sblocca = resolve
		})

		render(<Pagina ids={['a']} ordine={[]} attendi={attendi} />)

		await userEvent.click(screen.getByRole('button', { name: 'tocca a' }))
		await userEvent.click(salva())

		// Not `salva()`: the spinner's visually-hidden label is inside the button, so while the save is in
		// flight the button's accessible name is "Caricamento in corso Salva".
		expect(screen.getByRole('button', { name: /Salva/ })).toBeDisabled()
		expect(screen.getByRole('status')).toHaveTextContent('Caricamento in corso')

		sblocca()
		expect(await screen.findByText('Modifiche salvate.')).toBeInTheDocument()
	})
})

/**
 * The smallest form that can be valid or not: one required name, which the schema also trims — the trim
 * is what makes "the writer is handed the resolver's output" something a test can see rather than
 * assert about itself.
 */
const schemaNome = z.object({ nome: z.string().trim().min(1, 'Il nome è obbligatorio') })

type NomeValues = z.infer<typeof schemaNome>

/*
 * ⚠️ `formState` is read here, in the render, and not only in the assertions. It is a proxy that
 * subscribes to whatever a render touches, so a hook that merely returned the form would leave
 * `result.current` frozen at its first value: `errors` and `isSubmitted` would still read empty and false
 * after a refusal, and both tests below would be measuring the subscription rather than the save.
 */
const formNome = (nome = '') =>
	renderHook(() => {
		const form = useForm<NomeValues>({ resolver: zodResolver(schemaNome), defaultValues: { nome } })

		void form.formState.errors
		void form.formState.isSubmitted

		return form
	}).result

/**
 * ⚠️ Inside `act`, and the result carried out through a variable rather than returned from the callback:
 * `handleSubmit` writes `errors` and `isSubmitted` into the form's state, so a call left outside would
 * update a mounted hook after the test had moved on.
 */
const esitoDi = async (chiamata: () => Promise<boolean>): Promise<boolean> => {
	let esito = false

	await act(async () => {
		esito = await chiamata()
	})

	return esito
}

/** The one field, plus the button the real sections' Save reaches it through. */
const FormNome = ({ scrivi }: { scrivi: (valori: NomeValues) => Promise<boolean> }) => {
	const {
		register,
		handleSubmit,
		formState: { errors }
	} = useForm<NomeValues>({ resolver: zodResolver(schemaNome), defaultValues: { nome: '' } })

	return (
		<>
			<TextField label="Nome" error={errors.nome?.message} {...register('nome')} />
			<button
				type="button"
				onClick={() => {
					void salvaValidato(handleSubmit, scrivi)
				}}
			>
				Salva
			</button>
		</>
	)
}

describe('salvaValidato', () => {
	it('does not write, and answers false, when the form does not validate', async () => {
		const form = formNome('   ')
		const scrivi = vi.fn(async () => true)

		expect(await esitoDi(async () => await salvaValidato(form.current.handleSubmit, scrivi))).toBe(false)
		expect(scrivi).not.toHaveBeenCalled()
		expect(form.current.formState.errors.nome?.message).toBe('Il nome è obbligatorio')
	})

	it('writes, and answers true, when the form validates', async () => {
		const form = formNome('Mario')
		const scrivi = vi.fn(async () => true)

		expect(await esitoDi(async () => await salvaValidato(form.current.handleSubmit, scrivi))).toBe(true)
		expect(scrivi).toHaveBeenCalledTimes(1)
	})

	// A valid form whose mutation came back with an error is still a refusal — the page has to stop at it
	// exactly as it stops at an invalid one, or the sections after it write on top of a failed save.
	it('answers false when the write itself fails', async () => {
		const form = formNome('Mario')

		expect(await esitoDi(async () => await salvaValidato(form.current.handleSubmit, async () => false))).toBe(false)
	})

	/*
	 * ⚠️ The writer receives the **resolver's output**, not the raw form state: zod's transforms have already
	 * run. That is what let the `schema.parse(getValues())` line disappear from every section rather than
	 * move — a `handleSubmit` handed the untransformed values would silently start sending untrimmed strings
	 * and a lower-case provincia to the server.
	 */
	it('hands the writer the parsed values, transforms and all', async () => {
		const form = formNome('  Mario  ')
		const scrivi = vi.fn(async () => true)

		await esitoDi(async () => await salvaValidato(form.current.handleSubmit, scrivi))

		// The second argument is the submit event, and there is none: the save is a button press routed
		// through the page's registry, not a `<form onSubmit>`. Asserted rather than left off, since a
		// handler reading `event.preventDefault()` would be reading `undefined`.
		expect(scrivi).toHaveBeenCalledWith({ nome: 'Mario' }, undefined)
	})

	/*
	 * The reason this exists at all, rather than the `trigger()` every section used to call.
	 *
	 * `trigger()` fills `errors` but leaves `isSubmitted` false, and `isSubmitted` is what turns on
	 * react-hook-form's default `reValidateMode: 'onChange'`. Without it the red box stays red while it is
	 * being corrected, until Save is pressed a second time to find out whether the correction worked.
	 */
	it('marks the form submitted, so a corrected field clears itself', async () => {
		const form = formNome()

		await esitoDi(async () => await salvaValidato(form.current.handleSubmit, async () => true))

		expect(form.current.formState.isSubmitted).toBe(true)
	})

	// The same thing seen from the page: the refused box turns red, and goes back to white as it is typed
	// into — no second press.
	it('paints the refused field red and clears it as it is corrected', async () => {
		render(<FormNome scrivi={async () => true} />)

		await userEvent.click(salva())

		expect(screen.getByLabelText('Nome')).toHaveClass('border-2', 'bg-app-error/10')
		expect(screen.getByText('Il nome è obbligatorio')).toBeInTheDocument()

		await userEvent.type(screen.getByLabelText('Nome'), 'Mario')

		expect(screen.getByLabelText('Nome')).toHaveClass('border', 'bg-white')
		expect(screen.getByLabelText('Nome')).not.toHaveClass('bg-app-error/10')
		expect(screen.queryByText('Il nome è obbligatorio')).not.toBeInTheDocument()
	})
})
