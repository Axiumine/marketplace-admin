import type { OperationContext } from '@urql/core'
import { useMutation, useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { KeygripRetireDocument, KeygripRotateDocument } from '@/api/operations/adminResource/mutations'
import { KeygripStatusDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Infobox, InfoRow } from '@/components/ui/Infobox'
import { Spinner } from '@/components/ui/Spinner'
import { CELL, CELL_HEAD, ROW } from '@/components/ui/tableClass'
import { Toast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/format'

/**
 * See the note on `CTX_SAVE_COMPANY`: `keygripRotate` answers a bare `Boolean`, and the document cache
 * invalidates by the `__typename`s a mutation's *response* mentions — a boolean mentions none. Without
 * this the panel would keep showing the record the rotation replaced, which is the one screen on the
 * platform where a stale read is the whole failure: the admin rotated in order to watch the fleet
 * converge, and would be watching the old fingerprint converge on itself.
 *
 * One typename. `keygripStatus` is the only query on the page, and the three types are nested inside its
 * single response — invalidating the root is invalidating all of it.
 */
const CTX_ROTATE_KEYGRIP: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLKeygripStatus']
})

/**
 * How long the fleet takes to agree, stated on the screen that starts the disagreement (E16-S02, E16-S09).
 *
 * ⚠️ **These are measured numbers, not a target.** Adoption rides a Redis publish and was clocked at 37 ms
 * to all five signing services; `KEYGRIP_POLL_MS` = 5 minutes is the fallback poll, so it is the ceiling for
 * a *lost* message rather than the normal path. Both belong next to the buttons: an admin who thought a
 * retire took effect the instant the toast appeared would tell an incident channel that a compromised key
 * was out of use while a service that missed the nudge was still verifying with it. The Holders table below
 * is where they can watch it actually happen.
 */
export const PROPAGATION_WINDOW =
	'Neither takes effect everywhere at once. Each service picks the change up on its own — 37 ms measured ' +
	'across the five signing services, and up to 5 minutes if the notification is lost and the fallback poll ' +
	'is what finds it. Watch the Holders table below to see the fleet agree.'

/**
 * Shown before the rotation is sent, in the browser's own dialog rather than a modal of our own — the
 * reason `useDiscardWarning` gives, plus one of its own: this is the only button in the app whose
 * effect is fleet-wide and cannot be undone. A new key cannot be un-minted, and every service on the
 * platform picks it up within the poll interval.
 *
 * It is not a warning about lost sessions, because none are lost: the retired keys stay in the set
 * until nothing can still be signed with them, so a cookie signed under the old key keeps verifying.
 */
export const ROTATE_WARNING =
	'Rotate the cookie-signing key for the whole platform?\n\n' +
	'Every service picks the new key up on its own, with no restart. Sessions stay signed in — the ' +
	'previous keys are kept until nothing can still be verified with them.'

/**
 * Shown before a key is dropped from the set (E16-S04).
 *
 * ⚠️ **This is the one button in the app that logs customers out on purpose.** Every cookie the retired key
 * signed stops verifying as each process picks the new record up, which is exactly what an admin
 * responding to a leaked key is asking for — and why it is a separate button from rotation rather than
 * something rotation does quietly. The warning says whose sessions end, because "the platform's users" is
 * the blast radius and no smaller word is honest about it.
 *
 * It names the key, because the panel offers one button per row and a mis-click is otherwise invisible
 * until the wrong key is gone.
 */
export const retireWarning = (id: string) =>
	`Retire the signing key ${id} from the whole platform?\n\n` +
	'Every cookie this key signed stops verifying, so everyone still holding one is signed out — customers ' +
	'included. This is the answer to a key you believe has leaked, not routine maintenance: rotation is ' +
	'what retires keys safely, on age, without ending a single session.'

/**
 * The cookie-signing key set, and who is holding it.
 *
 * The panel exists because "the mutation returned true" and "the fleet agrees" are two different
 * claims (E01-S14). A rotation writes one Redis record; each signing service then reads it on its own
 * schedule, and until it has, that service is still signing with the key before. The holders table is
 * the only place on the platform where the difference is visible.
 *
 * ⚠️ Every number on screen is the server's, not this component's. `ageDays` and `current` arrive
 * computed — see the note on the two types in the schema slice — because the browser's clock and the
 * browser's copy of the fingerprint can both be a rotation behind the record the answer describes,
 * and a screen that recomputed either could disagree with the rotation that is about to refuse.
 */
export const KeygripPanel = () => {
	const [result] = useQuery({ query: KeygripStatusDocument, context: CTX_ADMIN_RESOURCE })
	const [rotation, executeRotate] = useMutation(KeygripRotateDocument)
	const [retirement, executeRetire] = useMutation(KeygripRetireDocument)

	const status = result.data?.keygripStatus

	// The error check is not redundant with the `true`: GraphQL allows data and errors in one answer,
	// and a bare `true` would confirm a rotation under a red toast.
	const rotated = rotation.error === undefined && rotation.data?.keygripRotate === true

	/*
	 * ⚠️ The same check, and here it is the story's own criterion rather than a nicety: E16-S04 refuses an id
	 * nothing matches with a **404**, precisely so a retire cannot be closed on a success that never happened.
	 * A confirmation shown under that error would tell an admin a compromised key is gone while every
	 * process still verifies with it.
	 */
	const retired = retirement.error === undefined && retirement.data?.keygripRetire === true

	// The error first: a failed read has no record to render, and `status` is undefined in both that
	// case and the first one. Ordered the other way round, a refused read would spin forever.
	if (result.error !== undefined) return <Alert tone="error">{messageOf(result.error)}</Alert>
	if (status === undefined) return <Spinner label="Loading the key set" />

	return (
		<div className="flex flex-col gap-4">
			<Infobox
				title="Current key set"
				actions={
					<Button
						loading={rotation.fetching}
						onClick={() => {
							if (!window.confirm(ROTATE_WARNING)) return
							void executeRotate({}, CTX_ROTATE_KEYGRIP)
						}}
					>
						Rotate the key
					</Button>
				}
			>
				<InfoRow label="Version" value={String(status.version)} />
				<InfoRow label="Fingerprint" value={<code>{status.fingerprint}</code>} />
				{/* Next to the actions, not in a footnote: it is what stops "the toast appeared" being read as
				    "the fleet has adopted it". See the note on the constant. */}
				<p className="pt-2 text-tip">{PROPAGATION_WINDOW}</p>
			</Infobox>

			<Infobox title="Keys">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr>
								<th scope="col" className={CELL_HEAD}>
									Key
								</th>
								<th scope="col" className={CELL_HEAD}>
									Created
								</th>
								<th scope="col" className={CELL_HEAD}>
									Age in days
								</th>
								<th scope="col" className={CELL_HEAD}>
									State
								</th>
							</tr>
						</thead>
						<tbody>
							{/* Newest first, as the service returns them. Not re-sorted here: the order is which key
							    signs — the first one — and rebuilding it from `createdAt` in the browser would be a
							    second opinion about that. */}
							{status.keys.map((key, index) => {
								/*
								 * ⚠️ The first key is the one `Keygrip` signs with, and it carries **no retire
								 * button at all** — not a disabled one. `retireKeygripKey` refuses it server-side
								 * with a 409 because removing it would leave the platform signing with a key an
								 * admin has just declared untrustworthy; rotation is what moves a suspect key
								 * down the array, from where it can be taken. Offering the button and explaining
								 * the refusal afterwards would be teaching that rule through a failed request.
								 */
								const signing = index === 0

								return (
									<tr key={key.id} className={ROW}>
										<td className={CELL}>{key.id}</td>
										<td className={CELL}>{formatDateTime(key.createdAt)}</td>
										<td className={CELL}>{key.ageDays}</td>
										<td className={CELL}>
											{signing ? (
												// The word carries the state on this row, as in the Holders table: a
												// row whose only difference is a missing button reads as a rendering
												// glitch rather than as a rule.
												<span className="font-bold">Signing</span>
											) : (
												<Button
													variant="danger"
													loading={retirement.fetching}
													onClick={() => {
														if (!window.confirm(retireWarning(key.id))) return
														void executeRetire({ id: key.id }, CTX_ROTATE_KEYGRIP)
													}}
												>
													Retire
												</Button>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			</Infobox>

			<Infobox title="Holders">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr>
								<th scope="col" className={CELL_HEAD}>
									Service
								</th>
								<th scope="col" className={CELL_HEAD}>
									Fingerprint
								</th>
								<th scope="col" className={CELL_HEAD}>
									Last seen
								</th>
								<th scope="col" className={CELL_HEAD}>
									State
								</th>
							</tr>
						</thead>
						<tbody>
							{status.holders.map((holder) => (
								<tr key={holder.service} className={ROW}>
									<td className={CELL}>{holder.service}</td>
									<td className={CELL}>
										<code>{holder.fingerprint}</code>
									</td>
									<td className={CELL}>{formatDateTime(holder.lastSeen)}</td>
									{/*
									 * The word, not only a colour: "behind" is the state an admin is on this screen
									 * to find, and a red cell that says the same thing as the green one beside it is
									 * invisible to a colour-blind reader and to a screenshot in a black-and-white
									 * ticket.
									 */}
									<td className={`${CELL} font-bold ${holder.current ? 'text-app-ok' : 'text-app-error'}`}>
										{holder.current ? 'Current' : 'Behind'}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/*
				 * ⚠️ An empty table is not "nothing to report" here. A holders row ages out an hour after its
				 * service last reported, so an empty one means no service is holding this record at all —
				 * either it was seeded moments ago, or the fleet is down. Left as an empty table it reads as
				 * a screen that failed to load.
				 */}
				{status.holders.length === 0 ? <p className="text-tip">No service has reported holding this key set.</p> : null}
			</Infobox>

			{rotation.error === undefined ? null : <Toast tone="error">{messageOf(rotation.error)}</Toast>}
			{rotated ? <Toast tone="success">The key set was rotated</Toast> : null}
			{/* ⚠️ A refused retire is a *visible* failure, never a quiet no-op — the 404 above is the whole
			    reason E16-S04 throws instead of answering the array unchanged. */}
			{retirement.error === undefined ? null : <Toast tone="error">{messageOf(retirement.error)}</Toast>}
			{retired ? <Toast tone="success">The key was retired</Toast> : null}
		</div>
	)
}
