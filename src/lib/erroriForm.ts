import type { FieldErrors } from 'react-hook-form'

import type { ErroriIndirizzo } from '@/lib/indirizzo'
import { erroreIndirizzo } from '@/lib/indirizzo'
import { CAMPI_INDIRIZZO } from '@/lib/indirizzoForm'

/** The seven address keys as a set, so the walk below can ask about one key without scanning a list. */
const CAMPI_DELL_INDIRIZZO: ReadonlySet<string> = new Set(CAMPI_INDIRIZZO)

/**
 * Every message under one branch of the error tree, in the order react-hook-form stores them.
 *
 * Recursive because an error is not always one level down: a field array puts its rows under numeric
 * keys — `errors.orari[2].giorno` — and a form that listed only its own top-level fields would refuse to
 * save over a row it never named.
 *
 * **A node that has a message stops the walk.** A field array with a rule of its own carries both the
 * array-level message and the rows' — and the array-level one is the one that describes the problem, so
 * repeating "il campo è obbligatorio" under it adds nothing. It is also what keeps the walk off a leaf's
 * internals: a `FieldError` carries a `ref` pointing at the real DOM node, and descending into that is
 * a walk of the document.
 */
const raccogli = (nodo: unknown, messaggi: string[]): void => {
	if (typeof nodo !== 'object' || nodo === null) return

	const { message } = nodo as { message?: unknown }

	if (typeof message === 'string') {
		messaggi.push(message)
		return
	}

	for (const figlio of Object.values(nodo)) raccogli(figlio, messaggi)
}

/**
 * What the operator has to fix, one line per box they can see.
 *
 * Driven by `formState.errors` rather than by a snapshot taken when Save was pressed: the list has to
 * shrink as the fields are corrected, and a copy made at submit time would still be naming a box that is
 * already green.
 *
 * The address is collapsed to a single line by `erroreIndirizzo`, for the reason written there — six of
 * its seven fields have no input of their own, so a list naming them would send the operator looking for
 * boxes that are not on screen. Which is also why the seven are skipped by the walk: the composite rule
 * fires together with whichever field broke it, and both messages describe the same one box.
 *
 * Deduped, because two rows of the same field array refused for the same reason produce the same
 * sentence twice, and a toast that says "il campo è obbligatorio" three times says nothing three times.
 */
export const messaggiDaCorreggere = (errori: FieldErrors): string[] => {
	const messaggi: string[] = []
	// Asserted, because `FieldErrors` is the shape of a form nobody named a values type for: its mapped
	// type resolves to nothing concrete, so it is not assignable to the seven optional keys below even
	// though every error it can hold is exactly one of them.
	const indirizzo = erroreIndirizzo(errori as ErroriIndirizzo)

	if (indirizzo !== undefined) messaggi.push(indirizzo)

	for (const [campo, errore] of Object.entries(errori)) {
		if (!CAMPI_DELL_INDIRIZZO.has(campo)) raccogli(errore, messaggi)
	}

	return [...new Set(messaggi)]
}
