# marketplace-admin

Marketplace platform-operator panel (`Admin` tier). Vite + React SPA, TypeScript strict.

**Operator tier only.** It logs in through `loginAdmin` and manages *imprenditori*. The shop-owner
(`Imprenditore`) and customer (`Utente`) frontends are separate apps that do not exist yet — this is
what they should be copied from, not a shell to add their routes into.

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
./qodana.sh         # Qodana Ultimate scan: inspections, SAST, SCA, licenses, coverage
```

`.githooks/pre-push` runs typecheck → coverage → mutation → Qodana, all blocking, and
`.githooks/pre-commit` runs typecheck → coverage → Qodana on top of the secret guard. Qodana is in
both on purpose: `git merge --no-ff` never fires `pre-commit`, so the merge commit is the one revision
a commit-time scan never sees, and Qodana Cloud files each report under the branch it ran on — only
the pre-push scan, standing on `main` after the merge, produces a report the "new problems" baseline
can use. `SKIP_QODANA=1` skips the scan alone. The scan needs a `QODANA_TOKEN` from this repo's own
qodana.cloud project. See `COVERAGE.md`.

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
| `/impostazioni` | change own password |
| `/imprenditori` | counters + section menu |
| `/p/imprenditori/gestione-imprenditori` | paginated table (`?page`, `?pageSize`, `?search`, `?sortBy`, `?sortDir`) |
| `/p/imprenditori/aggiungi-imprenditore` | create form |
| `/p/imprenditori/id/$_id` | detail — anagrafica + punti vendita |

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
  `imprenditoriAttiviTbl` is `(offset, limit, search, sortBy, sortDir) → { items, total }`, backed by
  indexes in `marketplace-db-setup`. Filtering or sorting client-side means fetching the whole
  `imprenditore` collection first — every operator downloading every record to look at twenty rows, on
  a collection with no upper bound. `?pageSize=` is clamped in `router.tsx` for the same reason.
- **`deleted` is a timestamp, not a flag.** Its presence is the soft delete, so it is tested with
  `!= null`. Compared against `true` — or passed through `handleNullBoolYN` — it is false for every
  value the field can hold, and a deleted account reads "Eliminato: No" with no tint.
- **Every optional field goes through `handleNull`.** A dash means "not given"; a blank space beside a
  label means "this broke", and an operator cannot tell that apart from a field that failed to load.
- **Never render a label for a field the collection does not have.** `imprenditore` has no `account`
  sub-document; a row bound to one shows a permanent blank that looks like missing data.
- **`adminUpdatePwd` takes no id.** The account is the one the Redis session names. The platform has no
  role field, so an id supplied by a browser would be a way for any operator to set another operator's
  password.
- **Operator password recovery is a note, not a form.** The platform's recovery pair
  (`resetPasswordAccesso`, `aggiornaLoginPassword`) resolves against the `imprenditore` collection and
  answers "not found" for every `admin`. A recovery form here would be a dead end that reads to the
  operator as a problem with their own credentials.
- **One statistic on the imprenditori page, because one query answers one.** Counters for "email da
  confermare", "confermati", "disabilitati" and "eliminati" all read naturally and none has a resolver.
  Add the backend query first — a placeholder counter is indistinguishable on screen from a broken one.
- **Route paths are singular where the route is singular** (`…/aggiungi-imprenditore`). The plural
  reads better next to its section and serves no page; `to` is typed against the router's own union so
  `tsc` catches it, which is why no destination is ever passed as a bare string.

## Deviations from the technical specification

| Spec | Here | Why |
|---|---|---|
| TanStack Virtual | not used | The table is server-paged at 20–100 rows. Virtualising a page that small adds a scroll container and buys nothing. |
| Radix Dialog / Toast | not used | Nothing on the operator surface is modal, and errors belong next to what failed — `Alert` is inline and `role="alert"` only for the error tone. |
| File-based routing | route tree in code | A generated `routeTree.gen.ts` cannot be tested, so it would have to be excluded from coverage and mutation — and every exclusion is a hole. Eight routes do not need a generator. |
| Schema from the server | `schema/*.graphql`, hand-maintained | The platform has no SDL: all seven services build their schema programmatically with graphql-js. These four files are hand-written slices, and they are a copy — verify against the resolvers, never the other way round. |
