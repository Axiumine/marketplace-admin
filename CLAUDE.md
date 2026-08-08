# marketplace-admin

Platform-operator SPA, `Admin` tier. Vite + React + TypeScript.

**Read parent first** — `/media/nvme/websites/fullstack-marketplace-blueprint/CLAUDE.md`. One of fourteen
sub-repos; almost nothing here is changeable on its own.

| Need | File |
|---|---|
| what the app is, for a human | `README.md` |
| hooks, gate order, node selection, lint scope | `REPO.md` |
| gate policy, thresholds | `COVERAGE.md` |
| anything cross-repo | parent `CLAUDE.md` |

⚠️ **English only** — identifiers, UI text, form labels, comments, routes. No exception; these are the
names the database and the resolvers use, so a rename is never local to this repo. The **`en-GB` locale**
`formatDateTime` renders with is a market choice, not a name: changing it changes every date on screen and
every snapshot that shows one.

## Do not trust `schema/*.graphql`

The platform has **no SDL**. All nine backend services build their schema programmatically with graphql-js.
The four files under `schema/` are hand-written slices, kept only because graphql-codegen needs a schema to
type documents against.

**They are a copy, and a copy drifts.** Before adding or changing any operation, read the resolver in the
service repo — `BEs/dev/marketplace-dev-*/src/graphQLApi/` — and make the slice match. The resolvers are
the contract. A slice can happily declare an operation no service implements (`updateUtentePwd` is one such
name — nothing on the platform answers it), or give an argument a different name from the resolver's. Both
compile, both pass codegen, and both fail only at run time against the real server.

`src/gql/` is generated. Never edit it; run `yarn codegen`.

## Layout

```
schema/                     hand-maintained SDL slices, one per endpoint
src/
├── api/
│   ├── client.ts           the single urql Client + exchange chain
│   ├── endpoints.ts        ENDPOINT + the frozen CTX_* context objects
│   ├── errors.ts           status extraction from the platform's error shape
│   ├── operations/<tier>/  the documents, one directory per access level
│   └── tokenStore.ts       in-memory access token
├── auth/                   session store + useLogout
├── components/layout|ui/   AppShell, SideMenu, and the primitives
├── features/<area>/        the screens' actual content
├── pages/                  one component per route, props in, no URL access
├── gql/                    GENERATED
└── router.tsx              route tree, search-param schemas, URL → props
test/                       mirrors src/, plus helpers/ and __snapshots__/
```

`pages/` read nothing from the URL; `router.tsx` is the only place params and search become props. That is
what lets a page be rendered in a test without a router assertion in the way.

## Things that bite

- **`context.url` objects must be module-level constants.** urql re-executes an operation when its context
  changes and compares by key → a `{ url }` literal in a component body is a new object per render, an
  infinite refetch loop. Use `CTX_*` from `src/api/endpoints.ts`; never inline.
- **`preferGetMethod: false` is load-bearing.** Every service sets `csrfPrevention: true`, which rejects a
  GET without the preflight-forcing headers urql does not send. Flip it and every query short enough to fit
  in a URL fails with a CSRF message while mutations keep working.
- **Create and delete mutations need `additionalTypenames`.** The document cache invalidates by the
  `__typename`s a mutation's *response* mentions, and these answer a bare `Boolean` → nothing is
  invalidated unless the call site names the affected types.
- ⚠️ **Snapshots are stale and must be regenerated.** `test/**/__snapshots__/*.snap` were translated
  mechanically during the rename and still hold markup for features deleted before it (shop opening hours,
  the shop card, the company list's old routes). They will not byte-match a real render. Run `yarn test -u`
  and review the diff before trusting any snapshot assertion.
- **Never send an id to `adminUpdatePwd`.** It takes none. The account is the one the Redis session names;
  the platform has no role field, so a client-supplied id would be a way to set another operator's password.
- **Adding an operation on a new endpoint** = a new `schema/` slice + a new `codegen.ts` project + a new
  `CTX_*` + a proxy entry in `vite.config.ts`. Not just a file in `src/api/operations/`.
- **Every block in `eslint.config.js` carries a `files` glob.** A flat-config entry without one applies to
  *every* file eslint walks into — `js.configs.recommended` with no glob once linted a minified Qodana HTML
  report and turned `yarn lint` into 1601 `no-undef` errors in code nobody here wrote. The globs live in
  `SOURCES` and `CONFIG_ROOT` at the top of the file; add a block by reusing them, never by omitting
  `files`. Ignoring a directory fixes one path; scoping makes the next one impossible.
- **Tabs, not spaces** (eslint `indent: ['error','tab']`). Prettier here: no semicolons, single quotes,
  `trailingComma: "none"`, `printWidth: 129`, `useTabs: true`. The backend services and `marketplace-common`
  carry that file byte for byte.
- **Node `^24.18.0`**, yarn classic. `engines` is a hard gate: `nvm use 24.18.0` before any yarn command or
  the install exits 1.
- **Never read, echo or commit a secret file.** `.env` is git-ignored and the pre-commit hook refuses it;
  `env` (no dot) is the committed template and is safe. To inspect `.env`, print key names only:
  `grep -oE '^[A-Za-z_0-9]+' .env`.

## Version control

- **This repo has no remote.** `git remote` is empty and there is no `remote.*` key in its config, so
  nothing here has ever been published and `main` tracks nothing. Where it gets published, and under which
  org, is the user's call and has not been made. It is **push-on-request**: never run `git push` unless the
  user asked for it in that message.
- **Never commit on `main`.** Branch first: `git switch -c <type>/<slug>`. Merging is the user's call.
- **Delete the branch once it is merged.** `git branch -d <slug>`, right after the merge. `-d`, never `-D`:
  it refuses a branch whose commits are not already reachable, so the safe case is quiet and the unsafe one
  stops you. Merges land locally, so no forge-side "delete branch on merge" ever fires and `git branch`
  stays the only view of what is still in flight.

## Tests

`yarn test:cov` 100 on all four metrics, `yarn test:mutation` 100. Both blocking. **Read `COVERAGE.md`
before touching either threshold** — the answer is always a test or a deleted branch, never a lower number.

- **GraphQL is stubbed at `fetch`**, not with a mock urql client (`test/helpers/graphql.ts`). Everything
  above `fetch` is then real: the cache, the 498 retry, the status extraction, the session teardown. Replies
  are queued per operation name. An operation nobody configured **throws** — deliberate, an unexpected
  request is the interesting half of a regression.
- **`renderRoute(path)`** (`test/helpers/render.tsx`) mounts the real router at a real URL.
- **jsdom enforces interactive form validation.** A value that fails an `<input type="email">`'s own check
  never fires submit, so a zod email rule is only reachable with something the HTML validator accepts —
  `operator@marketplace` (no TLD), not `operator`.
- **`fireEvent.change`, not `userEvent.type`,** for any field with a `maxLength` or a date input.
- `Alert` is `role="alert"` only for the error tone; success and info are `role="status"`.
- Snapshots normalise React's `useId` values (see `vitest.setup.ts`) — do not "fix" a snapshot by writing
  the raw `_r_N_` ids back in.
- `TZ=UTC` is exported by the test scripts *and* set in `vitest.config.ts`. Both are needed: Stryker's
  worker pool ignores the config one.

## Gates

commit → secret guard, lint, typecheck, coverage, Qodana. push → same + mutation. All blocking. Why, and
what to do when one is missing a prerequisite: `REPO.md`.

## Cross-repo

A change here often is not local:

- operation shape → the resolver in `marketplace-dev-admin-authenticated-resource` (and its own 100%
  coverage + mutation gates), then the `schema/` slice, then `yarn codegen`
- a sort or filter → an index in `marketplace-db-setup` (a sort + skip/limit with no index is a blocking
  in-memory sort, capped at 32 MB, which fails outright)
- a model field → `marketplace-common`, published, then every consumer bumped

One logical change = N commits, one per repo. There is no atomic cross-repo commit.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **marketplace-admin**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/marketplace-admin/context` | Codebase overview, check index freshness |
| `gitnexus://repo/marketplace-admin/clusters` | All functional areas |
| `gitnexus://repo/marketplace-admin/processes` | All execution flows |
| `gitnexus://repo/marketplace-admin/process/{name}` | Step-by-step execution trace |

## Cross-Repo Groups

This repository is listed under GitNexus **group(s): marketplace-platform** (see `~/.gitnexus/groups/`). For cross-repo analysis, use MCP tools `impact`, `query`, and `context` with `repo` set to `@<groupName>` or `@<groupName>/<memberPath>` (paths match keys in that group’s `group.yaml`). Use `group_list` / `group_sync` for membership and sync. From the project root: `node .gitnexus/run.cjs group list`, `node .gitnexus/run.cjs group sync <name>`, `node .gitnexus/run.cjs group impact <name> --target <symbol> --repo <group-path>` (the `.gitnexus/run.cjs` path is repo-root-relative).

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
