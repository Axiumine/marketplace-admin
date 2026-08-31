import type { OperationContext } from '@urql/core'
import { useMutation, useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { KeygripResweepDocument, KeygripRetireDocument, KeygripRotateDocument } from '@/api/operations/adminResource/mutations'
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
 * A resweep changes no key and every session, so it invalidates the console above rather than the panel
 * around it — the opposite of `CTX_ROTATE_KEYGRIP`, and the reason the two are separate constants instead
 * of one list naming both.
 *
 * `GraphQLSession`, the typename `SessionConsole` invalidates on its own revocations. Both live on this
 * page, and after a resweep the table it renders describes sessions that no longer exist.
 */
const CTX_RESWEEP: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLSession']
})

/**
 * How long the fleet takes to agree, stated on the screen that starts the disagreement.
 *
 * ⚠️ **These are measured numbers, not a target.** Adoption rides a Redis publish and was clocked at 37 ms
 * to all five signing services; `KEYGRIP_POLL_MS` = 5 minutes is the fallback poll, so it is the ceiling for
 * a *lost* message rather than the normal path. Both belong next to the buttons, because what the window
 * governs is which key the fleet *signs* with — the Holders table below is where an admin watches the fleet
 * agree. It is no longer a window in which a retired key can still get somebody in: a retirement ends every
 * session as it writes, so a service that missed the nudge has a signature it accepts and no session behind
 * it (R47).
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
 * Shown before a key is dropped from the set.
 *
 * ⚠️ **This is the one button in the app that logs the whole platform out on purpose, and it ends *every*
 * session rather than only the ones the retired key signed.** The service sweeps all three tiers once the
 * new key set is written, because nothing records which key signed which cookie and the alternative is a
 * window in which a service that has not adopted the new record yet still accepts what the retirement was
 * meant to kill (R47). The warning has to say that plainly: "the platform's users" is the blast radius and
 * no smaller word is honest about it.
 *
 * ⚠️ **The admin pressing it is signed out with everyone else**, so the warning says so before the click
 * rather than leaving the login screen to explain it afterwards. That is not a rough edge: an exemption
 * would be granted to whichever session sent the mutation, and someone holding a stolen admin cookie can
 * send it.
 *
 * It names the key, because the panel offers one button per row and a mis-click is otherwise invisible
 * until the wrong key is gone.
 */
export const retireWarning = (id: string) =>
	`Retire the signing key ${id} from the whole platform?\n\n` +
	'Every session on the platform ends — every customer, every shop owner, and you: this page will send ' +
	'you back to the login screen. This is the answer to a key you believe has leaked, not routine ' +
	'maintenance: rotation is what retires keys safely, on age, without ending a single session.'

/**
 * Shown before the sweep is run again.
 *
 * ⚠️ **It is the same blast radius as a retirement and it must not read as a repair.** Nothing here is
 * undone or restored: every session on the platform ends, including this admin's, exactly as when the key
 * was retired. The warning says that in the same words as `retireWarning`, because an admin who thinks
 * this button only finishes something is an admin who presses it to see what happens.
 *
 * ⚠️ **And it names the one thing this button does *not* do**: no key is minted, retired or changed. An
 * admin reaching it is holding a platform whose retirement reported that it could not reach every account,
 * and their first fear is that pressing it again will drop a second key.
 */
export const RESWEEP_WARNING =
	'Sign every account out again?\n\n' +
	'This finishes a retirement whose sweep could not reach every account. No key is minted, retired or ' +
	'changed. Every session on the platform ends — every customer, every shop owner, and you: this page ' +
	'will send you back to the login screen.'

/**
 * The cookie-signing key set, and who is holding it.
 *
 * The panel exists because "the mutation returned true" and "the fleet agrees" are two different
 * claims. A rotation writes one Redis record; each signing service then reads it on its own
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
	const [resweep, executeResweep] = useMutation(KeygripResweepDocument)

	const status = result.data?.keygripStatus

	// The error check is not redundant with the `true`: GraphQL allows data and errors in one answer,
	// and a bare `true` would confirm a rotation under a red toast.
	const rotated = rotation.error === undefined && rotation.data?.keygripRotate === true

	/*
	 * ⚠️ The same check, and here it is the screen's own criterion rather than a nicety: the service refuses an
	 * id nothing matches with a **404**, precisely so a retire cannot be closed on a success that never
	 * happened. A confirmation shown under that error would tell an admin a compromised key is gone while every
	 * process still verifies with it.
	 */
	const retired = retirement.error === undefined && retirement.data?.keygripRetire === true

	/*
	 * ⚠️ The same check again, and here the *value* is the whole signal: a resweep that left accounts
	 * standing answers 500 rather than `false`, so this reads `true` and not "no error" — a confirmation on
	 * the absence of an error would tell an admin the platform is signed out while part of it is not.
	 */
	const reswept = resweep.error === undefined && resweep.data?.keygripResweep === true

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

			{/*
			 * ⚠️ **Its own card, below the keys and never a button on one of their rows.** This mutation takes
			 * no key id and drops no key: it repeats the session sweep, which is the half of a retirement that
			 * is safe to repeat and the half that can fail on its own (R55). A "Retire" row that also meant
			 * "sweep again" would put the two behind one click, and the one that cannot be undone is the
			 * other one.
			 *
			 * ⚠️ **Always offered, not only after a failed retire.** The sweep that fell short is the sweep
			 * that signed this admin out, so the screen that reported it is gone by the time they read the
			 * error: they log back in and come here. A button that appeared only beside a live error message
			 * would never be on screen at the moment it is needed.
			 */}
			<Infobox
				title="Unfinished retirement"
				actions={
					<Button
						variant="danger"
						loading={resweep.fetching}
						onClick={() => {
							if (!window.confirm(RESWEEP_WARNING)) return
							void executeResweep({}, CTX_RESWEEP)
						}}
					>
						Sign everyone out
					</Button>
				}
			>
				<p className="text-tip">
					A retirement writes the new key set and then ends every session on the platform. If it reported that it could not reach
					every account, the key is already gone — retiring it again answers "no such key" — and this is what finishes it. It
					ends every session again, including yours, and is safe to run as often as it takes.
				</p>
			</Infobox>

			{rotation.error === undefined ? null : <Toast tone="error">{messageOf(rotation.error)}</Toast>}
			{rotated ? <Toast tone="success">The key set was rotated</Toast> : null}
			{/* ⚠️ A refused retire is a *visible* failure, never a quiet no-op — the 404 above is the whole
			    reason the service throws instead of answering the array unchanged. */}
			{retirement.error === undefined ? null : <Toast tone="error">{messageOf(retirement.error)}</Toast>}
			{retired ? <Toast tone="success">The key was retired</Toast> : null}
			{/* ⚠️ The 500 a partial resweep answers carries the count of what is still standing, and that count
			    is the admin's next decision — so the error is rendered as it arrived rather than replaced by a
			    sentence of ours. */}
			{resweep.error === undefined ? null : <Toast tone="error">{messageOf(resweep.error)}</Toast>}
			{reswept ? <Toast tone="success">Every account was signed out</Toast> : null}
		</div>
	)
}
