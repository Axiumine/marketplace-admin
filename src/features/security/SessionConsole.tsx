import type { GraphQlReuseEventAction, GraphQlTier } from '@gql/adminResource/graphql'
import type { OperationContext } from '@urql/core'
// `SubmitEvent`, not `FormEvent`: React 19's types deprecate the latter ("FormEvent doesn't actually
// exist") and type `onSubmit` as `SubmitEventHandler`. The name is also a DOM global — the import is what
// makes it React's synthetic event here rather than the native one.
import type { SubmitEvent } from 'react'
import { useState } from 'react'
import { useMutation, useQuery } from 'urql'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { RevokeAllSessionsDocument, RevokeSessionDocument } from '@/api/operations/adminResource/mutations'
import { ReuseEventsDocument, SessionsDocument } from '@/api/operations/adminResource/queries'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Infobox } from '@/components/ui/Infobox'
import { SelectField } from '@/components/ui/SelectField'
import { Spinner } from '@/components/ui/Spinner'
import { CELL, CELL_HEAD, ROW } from '@/components/ui/tableClass'
import { TextField } from '@/components/ui/TextField'
import { Toast } from '@/components/ui/Toast'
import { formatEpochMillis } from '@/lib/format'

/**
 * Which account the console is looking at. Carried in the URL, so a row can be linked to from a ticket.
 *
 * A `type` and not an `interface`, which is a router requirement rather than a style choice: TanStack's
 * `navigate({ search })` takes a reducer returning something assignable to an index signature, and an
 * interface — unlike a type alias — gets no implicit one. Declared as an interface it fails to compile at
 * the one call site that sets the URL.
 */
export type SessionQuery = {
	tier: GraphQlTier
	accountId: string
}

/**
 * The three tiers, spelled here because the URL schema has to validate against them before any query runs.
 *
 * ⚠️ A fifth tier is a fifth collection and a fifth service pair (ADR-002), and it has to be added here as
 * well as to `GraphQLTier` on the service — the enum the service builds from `TIER` is what refuses an
 * unknown one, and this list is only what the dropdown offers. Missing a tier here hides an account rather
 * than breaking a query, which is why the option labels are the tier names themselves and not prose.
 */
export const TIERS: readonly GraphQlTier[] = ['admin', 'shopOwner', 'user']

/**
 * ⚠️ Both mutations answer a bare `Boolean` / `Int`, and the document cache invalidates by the
 * `__typename`s a mutation's *response* mentions — neither mentions one. Without this the table would go on
 * listing the session that was just ended, which on this screen is not a stale read but a wrong answer to
 * "did it work": the admin is here because they believe a session is in the wrong hands.
 *
 * `GraphQLSession` only. The reuse trail is not written by a revocation an admin asked for — the platform
 * owner ruled it "not attributable" — so invalidating it would re-read a list that cannot have changed.
 */
const CTX_REVOKE: Partial<OperationContext> = Object.freeze({
	...CTX_ADMIN_RESOURCE,
	additionalTypenames: ['GraphQLSession']
})

/** Plain English for the store's two reason codes. Exhaustive by type: a third case fails to compile. */
const REASON: Record<GraphQlReuseEventAction, string> = {
	refreshTokenReplayed: 'A refresh token that had already been used was presented again',
	sessionCapReached: 'The session reached the maximum age a login is allowed'
}

const sessionWord = (count: number) => (count === 1 ? 'session' : 'sessions')

/**
 * The confirmation for ending one session, in the browser's own dialog for the reason `ROTATE_WARNING`
 * gives.
 *
 * ⚠️ It names the blast radius — one session, and whose — because the id beside the button is a 64-character
 * digest that no admin reads across. The account is what they can check against the ticket.
 *
 * ⚠️ It states what the click actually reaches, and since R54 that is both halves: the refresh lineage and
 * the access token the session minted, which the session itself names. The text used to warn that the
 * device kept working for up to 91 minutes; saying so now would send an admin looking for a window that
 * has been closed, which is the same mistake in the other direction.
 */
export const revokeOneWarning = (query: SessionQuery) =>
	`End 1 session of ${query.tier} ${query.accountId}?\n\n` +
	'That one session only. The account is not disabled and can sign in again straight away.\n\n' +
	'Its access token ends with it, so the device it is on stops working now rather than when the token ' +
	'would have expired.'

/**
 * The confirmation for ending every session one account holds.
 *
 * ⚠️ The count is the one this screen is showing, so the admin agrees to a number they can see. It is
 * also the number the service may disagree with — a session minted between the read and the click is ended
 * too, and the answer says how many actually went.
 *
 * ⚠️ There is deliberately no "every account" form of this anywhere: a button that logged out a whole tier
 * would be a platform-wide outage one click away, and no incident this console is for needs one.
 */
export const revokeAllWarning = (query: SessionQuery, count: number) =>
	`End all ${count} ${sessionWord(count)} of ${query.tier} ${query.accountId}?\n\n` +
	'Every device and browser this one account is signed in on, and no other account.\n\n' +
	'Their access tokens end with them, as above.'

/**
 * The session and revocation half of the security page.
 *
 * Two lists of one account: what it is signed in on now, and which of its lineages have been revoked and
 * why. They are on one screen because they are read together — the trail is what turns "I was logged out of
 * everything" into an explanation, and `familyId` is the column that joins them.
 *
 * ⚠️ **Nothing here renders a credential, and nothing here can.** Every field on screen comes from
 * `GraphQLSession` or `GraphQLReuseEvent`, whose field sets the service asserts against an exact list, and
 * neither type has a field capable of holding token or key material. The `id` column is the session index
 * field — a SHA-256 digest — which is safe to show *and* safe to hand back to `revokeSession`, for the
 * reason written out on the document.
 *
 * ⚠️ **Nothing network- or device-derived either.** There is no address column because there is no address
 * field, by the standing decision. An admin cannot answer "where was this used from" here; the answer to
 * a compromise report is to end the sessions.
 */
export const SessionConsole = ({
	query,
	onQueryChange
}: {
	query: SessionQuery
	onQueryChange: (next: SessionQuery) => void
}) => {
	/*
	 * The form's own copy, seeded from the URL. Typing an account id must not fire a query per keystroke
	 * against a keyspace where a partial id is a perfectly valid lookup that answers "no sessions" — which
	 * reads exactly like a clean account. The submit is what promotes it to the URL.
	 */
	const [tier, setTier] = useState<GraphQlTier>(query.tier)
	const [accountId, setAccountId] = useState(query.accountId)

	// Nothing is asked for until an account is named. `sessions('')` is a legal query over an empty
	// keyspace, so an unpaused boot would open the screen on a confident "no sessions" for nobody.
	const pause = query.accountId === ''

	const [sessionsResult] = useQuery({ query: SessionsDocument, variables: query, context: CTX_ADMIN_RESOURCE, pause })
	const [eventsResult] = useQuery({ query: ReuseEventsDocument, variables: query, context: CTX_ADMIN_RESOURCE, pause })

	const [revocation, executeRevoke] = useMutation(RevokeSessionDocument)
	const [massRevocation, executeRevokeAll] = useMutation(RevokeAllSessionsDocument)

	const sessions = sessionsResult.data?.sessions
	const events = eventsResult.data?.reuseEvents

	/*
	 * ⚠️ `false` is an answer, not a failure: the session had already ended. Reporting it as an error would
	 * train an admin to retry a call that has already done everything it can, and reporting it as a
	 * success would tell them they ended something they did not.
	 */
	const ended = revocation.error === undefined ? revocation.data?.revokeSession : undefined
	const endedCount = massRevocation.error === undefined ? massRevocation.data?.revokeAllSessions : undefined

	const submit = (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault()
		onQueryChange({ tier, accountId: accountId.trim() })
	}

	return (
		<div className="flex flex-col gap-4">
			<Infobox title="Account">
				<form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
					<div className="sm:w-48">
						<SelectField label="Tier" value={tier} onChange={(e) => setTier(e.target.value as GraphQlTier)}>
							{TIERS.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</SelectField>
					</div>
					<div className="grow">
						<TextField
							label="Account id"
							value={accountId}
							onChange={(e) => setAccountId(e.target.value)}
							placeholder="The account's _id"
						/>
					</div>
					<Button type="submit">Look up</Button>
				</form>
			</Infobox>

			{pause ? <Alert tone="info">Name an account to list the sessions it holds.</Alert> : null}

			{sessionsResult.error === undefined ? null : <Alert tone="error">{messageOf(sessionsResult.error)}</Alert>}
			{eventsResult.error === undefined ? null : <Alert tone="error">{messageOf(eventsResult.error)}</Alert>}

			{/* The spinner covers the first read only. A refetch after a revocation keeps the table on screen:
			    it is the list the admin is comparing against, and replacing it with a spinner loses the
			    row they were looking at. */}
			{pause || sessions !== undefined || sessionsResult.error !== undefined ? null : <Spinner label="Loading the sessions" />}

			{sessions === undefined ? null : (
				<Infobox
					title="Sessions"
					actions={
						sessions.length === 0 ? null : (
							<Button
								variant="danger"
								loading={massRevocation.fetching}
								onClick={() => {
									if (!window.confirm(revokeAllWarning(query, sessions.length))) return
									void executeRevokeAll(query, CTX_REVOKE)
								}}
							>
								End every session
							</Button>
						)
					}
				>
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr>
									<th scope="col" className={CELL_HEAD}>
										Session
									</th>
									<th scope="col" className={CELL_HEAD}>
										Signed in since
									</th>
									<th scope="col" className={CELL_HEAD}>
										Lineage
									</th>
									<th scope="col" className={CELL_HEAD}>
										Action
									</th>
								</tr>
							</thead>
							<tbody>
								{sessions.map((session) => (
									<tr key={session.id} className={ROW}>
										{/* `break-all`: a 64-character digest in a fixed table would push the action
										    column off the right edge on any laptop screen. */}
										<td className={`${CELL} break-all`}>
											<code>{session.id}</code>
										</td>
										{/* The login this session descends from, not its last rotation — a session
										    refreshing every fifteen minutes must not read as freshly created. */}
										<td className={CELL}>{formatEpochMillis(session.mintedAt)}</td>
										<td className={CELL}>
											<code>{session.familyId}</code>
										</td>
										<td className={CELL}>
											<Button
												variant="danger"
												onClick={() => {
													if (!window.confirm(revokeOneWarning(query))) return
													void executeRevoke({ ...query, id: session.id }, CTX_REVOKE)
												}}
											>
												End
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/*
					 * ⚠️ An empty table is an answer here, and a load-bearing one: it is what an admin reads
					 * after ending everything, and what tells them a suspected account is not signed in
					 * anywhere. Left as bare headers it reads as a screen that failed to load.
					 */}
					{sessions.length === 0 ? <p className="text-tip">This account holds no live session.</p> : null}
				</Infobox>
			)}

			{events === undefined ? null : (
				<Infobox title="Revoked lineages">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr>
									<th scope="col" className={CELL_HEAD}>
										When
									</th>
									<th scope="col" className={CELL_HEAD}>
										Lineage
									</th>
									<th scope="col" className={CELL_HEAD}>
										Why
									</th>
								</tr>
							</thead>
							<tbody>
								{/* Newest first, as the service returns them. Not re-sorted here: the order is the
								    store's, and the list is capped, so a browser-side sort would be ordering a
								    window rather than the trail. */}
								{events.map((event) => (
									<tr key={`${event.familyId}-${event.at}`} className={ROW}>
										<td className={CELL}>{formatEpochMillis(event.at)}</td>
										<td className={CELL}>
											<code>{event.familyId}</code>
										</td>
										<td className={CELL}>{REASON[event.action]}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/*
					 * ⚠️ Empty is the normal, healthy state, and has to say so. An admin who read a blank
					 * trail as "the trail is broken" would go looking for a logging fault instead of reading
					 * it as the good news it is.
					 */}
					{events.length === 0 ? (
						<p className="text-tip">Nothing has been revoked for this account. That is the expected state.</p>
					) : null}
				</Infobox>
			)}

			{revocation.error === undefined ? null : <Toast tone="error">{messageOf(revocation.error)}</Toast>}
			{massRevocation.error === undefined ? null : <Toast tone="error">{messageOf(massRevocation.error)}</Toast>}
			{ended === true ? <Toast tone="success">The session was ended</Toast> : null}
			{ended === false ? <Toast tone="info">That session had already ended</Toast> : null}
			{endedCount === undefined ? null : <Toast tone="success">{`${endedCount} ${sessionWord(endedCount)} ended`}</Toast>}
		</div>
	)
}
