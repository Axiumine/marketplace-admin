# marketplace-admin

Platform-admin SPA, `Admin` tier. Vite + React + TypeScript.

**Read parent first** — [`../CLAUDE.md`](https://github.com/Axiumine/fullstack-marketplace-blueprint/blob/main/CLAUDE.md)
One of fifteen sub-repos; almost nothing here is changeable on its own.

| Need | File |
|---|---|
| what the app is, setup, Node/engine requirement | [`README.md`](./README.md) |
| hooks, gate order, node selection, lint scope, layout, testing quirks, schema-drift & mutation-gate rationale | [`REPO.md`](./REPO.md) |
| gate policy, thresholds | [`COVERAGE.md`](./COVERAGE.md) |
| GitNexus rules, CLI skills, registry name | [`AGENTS.md`](./AGENTS.md) |
| anything cross-repo | parent `CLAUDE.md` |

⚠️ **English only** — identifiers, UI text, form labels, comments, routes. No exception; these are the
names the database and the resolvers use, so a rename is never local to this repo. The **`en-GB` locale**
`formatDateTime` renders with is a market choice, not a name: changing it changes every date on screen and
every snapshot that shows one.

⚠️ **NEVER run the mutation gate by hand.** `yarn test:mutation` is **hook-only** — it runs when `pre-push`
calls it and at no other time: not to check a change, not on one file, not to confirm a survivor is fixed.
Do not invoke `stryker` directly either; the threshold stays 100 regardless. To reproduce a survivor,
apply the mutant by hand in the source and run `yarn test` instead — seconds, and it names the tests that
should have failed. Why a hand-started full run is also usually wrong: [`REPO.md`](./REPO.md).

⚠️ **Don't trust `schema/*.graphql`.** The platform has no SDL; these four files are hand-written slices
that a service's real resolver can silently disagree with — both still compile and pass codegen. Before
adding or changing an operation, read the resolver in the service repo
(`BEs/dev/marketplace-dev-*/src/graphQLApi/` — `graphQLPublic/` for public-authorization) and make the
slice match it. `src/gql/` is generated — never edit it, run `yarn codegen`. Full explanation:
[`REPO.md`](./REPO.md).

## Things that bite

- **`context.url` objects must be module-level constants** (`CTX_*` in `src/api/endpoints.ts`) — urql
  compares context by key, so an inline `{ url }` literal is a new object per render → infinite refetch loop.
- **`preferGetMethod: false` is load-bearing.** Every service sets `csrfPrevention: true`, which rejects a
  bare GET; flipping this fails every short-enough query with a CSRF error.
- **Create/delete mutations need `additionalTypenames`.** The cache invalidates by the `__typename`s a
  mutation's response mentions, and these answer a bare `Boolean`.
- **Never send an id to `adminUpdatePwd`.** It takes none — the account is whichever the Redis session
  names; the platform has no role field, so a client-supplied id would let one admin set another's password.
- **Tabs, not spaces** (eslint `indent: ['error','tab']`; prettier `printWidth: 129`, no semicolons, single
  quotes). Full config and the flat-config `files`-glob trap: [`REPO.md`](./REPO.md).
- **Never read, echo or commit a secret file.** `.env` is git-ignored and pre-commit refuses it; `env` (no
  dot) is the committed template. To inspect `.env`, print key names only: `grep -oE '^[A-Za-z_0-9]+' .env`.

## Version control

- **Push-on-request.** `origin` (`github.com/Axiumine/marketplace-admin`) has never had a branch pushed to
  it, so the first push publishes the whole history — never run `git push` unless asked in that message.
- **Never commit on `main`.** Branch first: `git switch -c <type>/<slug>`. Merging is the user's call.
- **Delete the branch once merged** — `git branch -d <slug>`, right after. Why `-d` and not `-D`:
  [`REPO.md`](./REPO.md).

## Tests

`yarn test:cov` 100 on all four metrics, `yarn test:mutation` 100. Both blocking. **Read
[`COVERAGE.md`](./COVERAGE.md) before touching either threshold** — the answer is always a test or a
deleted branch, never a lower number. Test helpers and quirks (GraphQL stubbing, snapshots, jsdom, `TZ`):
[`REPO.md`](./REPO.md).

## Gates

commit → secret guard, lint, typecheck, coverage, Qodana. push → same + semgrep (SAST) + trivy
(dependency advisories) + mutation. All blocking. Why, and what to do when one is missing a prerequisite:
[`REPO.md`](./REPO.md).

## Cross-repo

A change here often is not local:

- operation shape → the resolver in `marketplace-dev-admin-authenticated-resource` (and its own 100%
  coverage + mutation gates), then the `schema/` slice, then `yarn codegen`
- a sort or filter → an index in `marketplace-db-setup` (a sort + skip/limit with no index is a blocking
  in-memory sort, capped at 32 MB, which fails outright)
- a model field → `marketplace-common`, published, then every consumer bumped

One logical change = N commits, one per repo. There is no atomic cross-repo commit.

## GitNexus

Indexed as **marketplace-admin**, group `marketplace-platform`. Tool/resource reference, Never-Do list and
CLI skills live in [`AGENTS.md`](./AGENTS.md) — not duplicated here.

- **Run `impact({target, repo: "marketplace-admin"})` before editing a symbol.**
- **Run `detect_changes({repo: "marketplace-admin"})` before committing.** `repo:` is mandatory and must
  be a `marketplace*` registry name.
