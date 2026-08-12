import type { OperationContext } from '@urql/core'
import { useMutation, useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { KeygripRotateDocument } from '@/api/operations/adminResource/mutations'
import { KeygripStatusDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Infobox, InfoRow } from '@/components/ui/Infobox'
import { Spinner } from '@/components/ui/Spinner'
import { Toast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/format'

/**
 * See the note on `CTX_SAVE_COMPANY`: `keygripRotate` answers a bare `Boolean`, and the document cache
 * invalidates by the `__typename`s a mutation's *response* mentions — a boolean mentions none. Without
 * this the panel would keep showing the record the rotation replaced, which is the one screen on the
 * platform where a stale read is the whole failure: the operator rotated in order to watch the fleet
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

const CELL_HEAD = 'border-b border-palette-bg3/20 p-2'
const CELL = 'p-2'
const ROW = 'border-b border-palette-bg3/10'

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

	const status = result.data?.keygripStatus

	// The error check is not redundant with the `true`: GraphQL allows data and errors in one answer,
	// and a bare `true` would confirm a rotation under a red toast.
	const rotated = rotation.error === undefined && rotation.data?.keygripRotate === true

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
							</tr>
						</thead>
						<tbody>
							{/* Newest first, as the service returns them. Not re-sorted here: the order is which key
							    signs — the first one — and rebuilding it from `createdAt` in the browser would be a
							    second opinion about that. */}
							{status.keys.map((key) => (
								<tr key={key.id} className={ROW}>
									<td className={CELL}>{key.id}</td>
									<td className={CELL}>{formatDateTime(key.createdAt)}</td>
									<td className={CELL}>{key.ageDays}</td>
								</tr>
							))}
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
									 * The word, not only a colour: "behind" is the state an operator is on this screen
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
		</div>
	)
}
