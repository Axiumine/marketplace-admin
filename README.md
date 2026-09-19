# marketplace-admin

> [!WARNING]
> **Work in progress — this software is not tested yet.** It has never run outside a developer
> workstation: no real deployment, no load test, no security review, no upgrade path. Parts of the
> platform are deliberately unbuilt, and anything here — schemas, endpoints, configuration, file
> layout — can still change without notice. Whatever automated gates this repo runs, treat the result
> as unproven: do not point it at real users or real data.
> Read [`docs/PRODUCTION_HARDENING.md`](https://github.com/Axiumine/fullstack-marketplace-blueprint/blob/main/docs/PRODUCTION_HARDENING.md) before taking any of it further.

Marketplace platform-admin panel (`Admin` tier). Vite + React SPA, TypeScript strict.

**Admin tier only.** It logs in through `loginAdmin` and manages *shopOwners* and *customers* — the
accounts of both, never their own screens. The shop-owner (`ShopOwner`) and customer (`User`) frontends
are separate apps — this is what they were copied from, not a shell to add their routes into.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite 8, React 19, TypeScript 6 (`strict` + `exactOptionalPropertyTypes`) |
| Routing | TanStack Router — route tree in code, URL is the state (`validateSearch` + zod) |
| GraphQL | urql + `cacheExchange` + `@urql/exchange-auth`, one `Client`, endpoint per operation via `context.url` |
| Types | graphql-codegen `client-preset`, one project per access level → `TypedDocumentNode` |
| Tables | TanStack Table (headless), server-side paging |
| Forms | react-hook-form + zod |
| Styling | Tailwind 4, Radix `Label` |
| Errors | Sentry (`@sentry/react`), disabled without a DSN |
| Tests | vitest + Testing Library + jsdom, Stryker for mutation |

## Getting started

Node **24.18.0** via nvm — `engines` is a hard gate under yarn classic, a mismatch exits 1.

```bash
nvm use 24.18.0
yarn install          # `prepare` points core.hooksPath at .githooks
cp env .env           # then edit: .env is git-ignored, `env` is the committed template
yarn codegen          # writes src/gql/ from schema/*.graphql
yarn dev              # http://127.0.0.1:3043
./dev.sh              # same, with node_modules on a tmpfs ramdisk (wipes node_modules first)
```

`yarn dev` proxies the four GraphQL paths to the backend services on 4028 / 4025 / 4024 / 4030. A
service that is not running fails its own endpoint and leaves the rest of the app working.

## Commands

```bash
yarn dev            # vite dev server
yarn build          # codegen && tsc --noEmit && vite build
yarn preview        # serve dist/
yarn codegen        # regenerate src/gql/ (also codegen:watch)
yarn typecheck      # tsc --noEmit
yarn lint           # eslint --fix + prettier --write   (lint:check for CI)
yarn test           # vitest run          (test:watch)
yarn test:cov       # coverage, gated at 100 on all four metrics
yarn test:mutation  # Stryker, gated at 100
./qodana.sh         # Qodana Ultimate scan: inspections, SAST, licenses, coverage
```

`.githooks/pre-push` runs typecheck → coverage → mutation → Qodana, all blocking, and
`.githooks/pre-commit` runs typecheck → coverage → Qodana on top of the secret guard. Qodana is in
both on purpose: `git merge --no-ff` never fires `pre-commit`, so the merge commit is the one revision
a commit-time scan never sees, and Qodana Cloud files each report under the branch it ran on — only
the pre-push scan, standing on `main` after the merge, produces a report the "new problems" baseline
can use. `SKIP_QODANA=1` skips the scan alone. The scan needs a `QODANA_TOKEN` from this repo's own
qodana.cloud project. See [`COVERAGE.md`](./COVERAGE.md).

## Endpoints

Four GraphQL servers, one origin. The paths are the `ENDPOINT` constants each service exports from its
`src/index.mts`; changing one here without changing it there gives a 404, not a GraphQL error.

| Path | Service | Port (dev) | Operations |
|---|---|---|---|
| `/public-authorization` | `marketplace-dev-public-authorization` | 4028 | `loginAdmin` |
| `/admin-authenticated-authorization` | `marketplace-dev-admin-authenticated-authorization` | 4025 | `refresh` |
| `/admin-authenticated-resource` | `marketplace-dev-admin-authenticated-resource` | 4024 | everything else |
| `/logout` | `marketplace-dev-authenticated-logout` | 4030 | `logout` |

Single origin is not a convenience: the refresh token is a signed httpOnly cookie, and cross-origin
would need `SameSite=None` on it plus a CORS allow-list on every service. Same origin makes
`credentials: 'include'` sufficient. nginx does in production what the vite proxy table does in
development.

## Auth

Opaque tokens and Redis sessions — **not JWT**. A stale `JWT` type still appears in the platform's
schema slices; it describes nothing that exists.

- The access token lives in memory only (`src/api/tokenStore.ts`). A reload wipes it on purpose.
- The refresh token is an httpOnly cookie the browser never exposes to JS.
- `authExchange` refreshes *before* sending when there is no token and the endpoint needs one — that
  is the whole page-reload story — and retries once on **498**.
- 401, 412 and 499 are terminal and end the session (`mapExchange`, below `authExchange` in the chain
  so results reach it on the way back up).
- Requests are **POST, always** (`preferGetMethod: false`). Every service builds its `ApolloServer`
  with `csrfPrevention: true`, which blocks a GET carrying none of the preflight-forcing headers, and
  urql sends none of them.

## Routes

| Path | Screen |
|---|---|
| `/` | login |
| `/loading` | session restore, then `?redirect=` |
| `/home` | dashboard |
| `/settings` | change own password |
| `/security` | cookie-signing keys — version, fingerprint, key ages, holders table, rotate, retire, and the session console. **Retiring a key signs the whole platform out, this tab included**; if its sweep does not reach every account the *Unfinished retirement* box runs it again (`keygripResweep`) |
| `/categories` | the whole `itemCategory` taxonomy — add, edit, retire; no search params, the list is unpaged |
| `/shopOwners` | counter + registrations chart + section menu |
| `/p/shopOwners/manage-shopOwners` | paginated table (`?page`, `?pageSize`, `?search`, `?status=active\|suspended\|closed\|closedSuspended`, `?sortBy`, `?sortDir`) |
| `/p/shopOwners/add-shopOwner` | create form |
| `/p/shopOwners/id/$_id` | detail — personalData + companies |
| `/customers` | counter + registrations chart + paginated customers table (`?page`, `?pageSize`, `?status=active\|suspended\|closed\|closedSuspended`, `?sortDir`) — email, registered date, status, and the enable/disable switch. No `?search`, no `?sortBy`: see below |

Everything except `/` and `/loading` is behind a pathless guarded route. An empty session redirects to
`/loading`, not to `/`: only a round-trip can tell "never signed in" from "signed in and reloaded".

## Deployment

`yarn build` → `dist/`, static. nginx serves it and proxies the four paths above to the services, from
the same origin, with `try_files $uri /index.html` for the client-side routes. No nginx config lives in
this workspace — the vhosts are on the host that fronts the stack.

## Decisions that look wrong until you know why

Each entry is a plausible change someone will propose, and the reason it is not made. The mistakes
they guard against all render as a working screen.

- **The table is paged, searched and sorted by the server, never by the browser.**
  `shopOwnersActiveTbl` is `(offset, limit, search, sortBy, sortDir) → { items, total }`, backed by
  indexes in `marketplace-db-setup`. Filtering or sorting client-side means fetching the whole
  `shopOwner` collection first — every admin downloading every record to look at twenty rows, on
  a collection with no upper bound. `?pageSize=` is clamped in `router.tsx` for the same reason.
- **`deleted` is a timestamp, not a flag.** Its presence is the soft delete, so it is tested with
  `!= null`. Compared against `true` — or passed through `handleNullBoolYN` — it is false for every
  value the field can hold, and a deleted account reads "Deleted: No" with no tint.
- **Every optional field goes through `handleNull`.** A dash means "not given"; a blank space beside a
  label means "this broke", and an admin cannot tell that apart from a field that failed to load.
- **Never render a label for a field the collection does not have.** `shopOwner` has no `account`
  sub-document; a row bound to one shows a permanent blank that looks like missing data.
- **`adminUpdatePwd` takes no id.** The account is the one the Redis session names. The platform has no
  role field, so an id supplied by a browser would be a way for any admin to set another admin's
  password.
- **Admin password recovery is a note, not a form.** No service exposes a recovery mutation for the
  `admin` collection at all, so a recovery form here would be a dead end that reads to the admin as
  a problem with their own credentials.
- **The customers table has no search box, and one sortable column.** Not an omission — `user` is the
  collection encrypted whole (ADR-029). Names, city and the address block are *randomly* encrypted, so a
  `/^term/i` prefix match compares against base64 and returns zero rows for every term, on every account,
  without erroring; a sort on one of them orders ciphertext, which is stable, arbitrary and looks like a
  working sort. `login.email` is deterministic, so it decrypts on the way out and an equality lookup on it
  works — it still cannot be ordered or prefix-matched. `registeredAt` and the three status flags were
  never encrypted, which is why they are the whole of what the screen sorts and filters on. Adding a search
  input, a name column or a second `UsersTblSortField` member is the change to refuse.
- **The status filter exists because neither table's query has an "either" state.** `disabled` and
  `deleted` are `Boolean!` with server-side defaults on `usersActiveTbl` and on `shopOwnersActiveTbl`
  alike, deliberately: they are the leading keys of `tbl_active_registeredAt` on `user` and of all four
  `tbl_active_*` indexes on `shopOwner`, and a nullable "both" would unbind them and turn the sort into a
  blocking in-memory one. So each screen names one state per page, and a suspended customer is visible
  under the Suspended filter the success message points at — never mixed into the active list.
- **Four states rather than three, on both tables, and the fourth is the reason** (ADR-049). `userDel` and
  `shopOwnerDel` stamp `deleted` and leave the suspension trio exactly as they found it, so an account
  suspended and *then* closed carries both flags — under an Active/Suspended/Closed enum it would answer
  to none of the three and be listed by no screen at all. The four live in `src/lib/accountStatus.ts`,
  which is what keeps the two tiers identical: an admin acts on a shop owner and on a customer in the same
  way (platform owner, 2026-08-29), so a state reachable on one screen and not on the other is a bug.
- **A closed row carries no action button on either table.** Suspending an account nobody can sign into
  writes a flag for nothing, and lifting a suspension on one promises a return `deleted` refuses — the
  personal data is thirty days from being overwritten in place (ADR-046). The cell is an em dash, and the
  branch reads the row's own `deleted` rather than the filter in the URL, so a closed account arriving on
  a cached page loses the button too.
- **`userUpdateStatus` sends the toggle's state, not a transition.** Re-disabling an already-disabled
  customer revokes their sessions again, which costs one `hKeys` over an empty index. Reading the previous
  state first to skip that would add a round trip on every save and open a window between the read and the
  write for a login to slip through.
- **The customers query names two `__typename`s in `additionalTypenames`, not one.**
  `GraphQLUserActiveTbl` *and* `GraphQLUsersActiveTblPage`: a page with no rows carries only the second, so
  a table listing one row and losing it to a suspension would never re-read itself.
- **One statistic per section, because one query answers one.** `shopOwnersStats` and `usersStats` are
  the only two counters the admin-resource service exposes. The companions — "email to confirm",
  "confirmed", "disabled", "deleted" — all read naturally on either page and none has a resolver.
  Add the backend query first — a placeholder counter is indistinguishable on screen from a broken one.
- **The customers page carries a counter and a chart even though its table has no search box.** Not an
  inconsistency: ADR-029 blocks *matching and ordering* encrypted fields, and neither of these does
  either. `usersStats` reads no field at all, and `usersPerPeriod` buckets `registeredAt`, which was
  never encrypted — the same field the table already sorts on. So the page can say how many customers
  there are and when they arrived, and still cannot look one up by name.
- **The counter and the table's own `total` are different numbers, on both sections.** The counter is
  unfiltered — every account ever registered, the suspended and the closed included — while `total` is
  the size of whatever the filter currently selects. Feeding the counter from the page it sits above
  would make it agree with the table and stop answering the question it was put there for.
- **The two charts are separate components over separate GraphQL types, not one generic chart.**
  `ShopOwnersPerPeriod` and `UsersPerPeriod` are structurally identical and deliberately distinct on the
  service (see the schema slice): one shared `PerPeriod` type would make the two series interchangeable
  in a query document, so a rename could point the customers chart at shopOwner data and still compile.
  The arithmetic is shared where it cannot drift — server-side, in one library.
- **The taxonomy's refusals are rewritten one by one, not funnelled into "Save failed."** The depth cap
  and the duplicate slug are different mistakes about different boxes, and the service words both as a
  GraphQL input path (`itemCategory.idParent: …`) that names nothing on screen. `features/categories/refusals.ts`
  maps each to a sentence naming the box and the next step; anything unmapped still reaches the admin
  in the service's own words.
- **The category picker offers top-level categories only.** That is the depth cap read forwards: the one
  save the service cannot accept is not one the admin can ask for. The card's own category is out too —
  nothing else on the platform could stop a category being made its own parent.
- **The position is capped at 999999999 here and nowhere else.** The resolver checks whole and
  non-negative, and a wider number is refused by the collection's `$jsonSchema` as a 500 naming no field.
- **The company card saves company data and publishes nothing.** Publishing has been a separate
  operation on both tiers since 2026-08-14: `published` is not in `GraphQLInputCompany` on either
  service, `companyAdd` stamps `false`, and `companyUpdatePublished` is the only writer. The admin app
  calls neither that mutation nor `itemUpdatePublished`, so a company added here stays unpublished and no
  screen states it. That is a missing screen, not a missing resolver — 4024 has carried both mutations
  since the split, and the shop's three public fields (`publicName`, `slug`, `description`) have no box
  on the card either, which the collection's `$expr` makes the first half of the same gap: it refuses
  `published: true` unless a slug and a public name are stored.
- **Route paths are singular where the route is singular** (`…/add-shopOwner`). The plural
  reads better next to its section and serves no page; `to` is typed against the router's own union so
  `tsc` catches it, which is why no destination is ever passed as a bare string.

## Deviations from the technical specification

| Spec | Here | Why |
|---|---|---|
| TanStack Virtual | not used | The table is server-paged at 20–100 rows. Virtualising a page that small adds a scroll container and buys nothing. |
| Radix Dialog / Toast | not used | Nothing on the admin surface is modal, and errors belong next to what failed — `Alert` is inline and `role="alert"` only for the error tone. |
| File-based routing | route tree in code | A generated `routeTree.gen.ts` cannot be tested, so it would have to be excluded from coverage and mutation — and every exclusion is a hole. Ten routes do not need a generator. |
| Schema from the server | `schema/*.graphql`, hand-maintained | The platform has no SDL: all nine services build their schema programmatically with graphql-js. These four files are hand-written slices, and they are a copy — verify against the resolvers, never the other way round. |

## License

GPL-3.0-or-later — see [LICENSE](./LICENSE).
