# marketplace-admin

Platform-operator SPA (`Admin` tier) for Marketplace. Vite + React + TypeScript. Read the parent
workspace's `/media/nvme/websites/fullstack-marketplace-blueprint/CLAUDE.md` first — this is one of fourteen sub-repos and
almost nothing here is changeable on its own.

⚠️ **Language: everything is English — identifiers, UI text, form labels, comments, routes.** There is
no second language anywhere in this app, and adding one is a regression rather than a style nit. The
names here are the names the database and the resolvers use, so a rename is never local to this repo.

The **`en-GB` locale** `formatDateTime` renders with is a market choice and not a name; changing it
changes what dates look like on screen and every snapshot that shows one.

## Do not trust `schema/*.graphql`

The platform has **no SDL**. All nine backend services build their schema programmatically with
graphql-js. The four files under `schema/` are hand-written slices, kept only because
graphql-codegen needs a schema to type documents against.

**They are a copy, and a copy drifts.** Before adding or changing any operation, read the resolver in
the service repo — `BEs/dev/marketplace-dev-*/src/graphQLApi/` — and make the slice match. The
resolvers are the contract. This is not paranoia: a slice can happily declare an operation no service
implements (`updateUtentePwd` is one such name — nothing on the platform answers it), or give an
argument a different name from the resolver's. Both compile, both pass codegen, and both fail only at
run time against the real server.

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

`pages/` read nothing from the URL; `router.tsx` is the only place params and search become props.
That is what lets a page be rendered in a test without a router assertion in the way.

## Rules that are not obvious

- **`context.url` objects must be module-level constants.** urql re-executes an operation when its
  context changes and compares by key, so a `{ url }` literal in a component body is a new object per
  render — an infinite refetch loop. Use `CTX_*` from `src/api/endpoints.ts`; never inline.
- **`preferGetMethod: false` is load-bearing.** Every service sets `csrfPrevention: true`, which
  rejects a GET without the preflight-forcing headers urql does not send. Flip it and every query
  short enough to fit in a URL fails with a CSRF message while mutations keep working.
- **Create and delete mutations need `additionalTypenames`.** The document cache invalidates by the
  `__typename`s a mutation's *response* mentions, and these mutations answer a bare `Boolean` — so
  nothing is invalidated unless the call site names the affected types.
- **⚠️ Snapshots are stale and must be regenerated.** `test/**/__snapshots__/*.snap` were translated
  mechanically during the rename and still hold markup for features deleted before it (shop opening
  hours, the shop card, the company list's old routes). They will not byte-match a real render. Run
  `yarn test -u` and review the diff before trusting any snapshot assertion.
- **Never send an id to `adminUpdatePwd`.** It takes none. The account is the one the Redis session
  names; the platform has no role field, so a client-supplied id would be a way to set another
  operator's password.
- **Adding an operation on a new endpoint** means a new `schema/` slice, a new `codegen.ts` project, a
  new `CTX_*`, and a proxy entry in `vite.config.ts` — not just a file in `src/api/operations/`.
- **Indentation is tabs** (eslint `indent: ['error','tab']`). Prettier here: no semicolons, single
  quotes, `trailingComma: "none"`, `printWidth: 129`, `useTabs: true`. The backend services and
  `marketplace-common` now carry that file byte for byte, `useTabs` included — it used to be missing
  there, so prettier reindented with spaces what eslint then demanded back as tabs and whichever ran
  last won. `lint` runs `eslint --fix . && prettier --write .` in all thirteen repos that have a lint
  config — every sub-repo but `marketplace-db-setup` — and `lint:check` runs
  both read-only; the scope is the **whole tree**, not `src/`, which is how test files and configs
  drifted unnoticed for as long as they did. What is out of scope lives in `.prettierignore`, and
  markdown is in there on purpose: `proseWrap: "never"` would flatten every hand-wrapped paragraph in
  these docs onto one line.
- **Every block in `eslint.config.js` carries a `files` glob.** A flat-config entry without one
  applies to *every* file eslint walks into, so `js.configs.recommended` with no glob linted any
  stray `.js` under the root — the minified Qodana HTML report turned `yarn lint` into 1601
  `no-undef` errors in code nobody here wrote. The globs live in `SOURCES` and `CONFIG_ROOT` at the
  top of the file; add a new block by reusing them, not by omitting `files`. Ignoring a directory
  fixes one path, scoping makes the next one impossible. The backend nine never had the bug because
  `@axiumine/eslint-config-be` scopes everything to `src/**`.
- **Node `^24.18.0`**, yarn classic. `engines` is a hard gate: `nvm use 24.18.0` before any yarn
  command or the install exits 1.
- **Never read, echo or commit a secret file.** `.env` is git-ignored and the pre-commit hook refuses
  it; `env` (no dot) is the committed template and is safe. To inspect `.env`, print key names only:
  `grep -oE '^[A-Za-z_0-9]+' .env`.
- **Remote is `git@github.com:Marketplace-Org/marketplace-admin.git`** (private), `main` tracking
  `origin/main`. It was local-only until that decision was reversed; the whole history was scanned for
  secrets before the first push and nothing needed purging. ⚠️ **`Marketplace-Org/marketplace.admin`, with a
  dot, is a different and dead repo** — the old Nuxt operator SPA, deleted locally but never removed
  from the org. One character apart. Do not push to it.
- **The pre-push hook selects node itself**, ahead of its five gates. It reads `engines.node` from
  `package.json` — never a hard-coded version — and sources nvm to switch if the current node does not
  satisfy it. Necessary because every gate shells out to yarn and yarn's `engines` check is a hard
  failure: on the wrong node the push used to die at step 1 with `The engine "node" is incompatible
  with this module`, printed under the banner about type errors, which is not what had gone wrong. If
  nvm is absent or the version is not installed it blocks with the `nvm install` line instead of
  letting yarn report nonsense. All fourteen sub-repos carry the same block now; it started in
  `marketplace-common`'s *pre-commit*, which is where it was copied from.
- **Never commit on `main`.** Branch first: `git switch -c <type>/<slug>`. Merging is the user's call.
- **Delete the branch once it is merged.** `git branch -d <slug>`, right after the merge. `-d`, never
  `-D`: it refuses a branch whose commits are not already reachable, so the safe case is quiet and the
  unsafe one stops you. Merges land locally and are pushed as `main`, so no forge-side "delete branch
  on merge" ever fires and `git branch` stays the only view of what is still in flight.

## Tests

`yarn test:cov` at 100 on all four metrics, `yarn test:mutation` at 100. Both blocking in
`.githooks/pre-push`, after `yarn lint:check` and `tsc --noEmit` and ahead of `./qodana.sh`. **Read
`COVERAGE.md` before touching either threshold** — the answer is always a test or a deleted branch,
never a lower number.

Lint is gated too, first in both hooks: eslint and `prettier --check` over the whole tree, blocking.
It is the cheapest of the five and the only one that can fail on a file the other four are happy
with — the next `yarn lint` would rewrite it anyway. `.prettierrc` and `.prettierignore` joined
`eslint.config.js` in the hooks' `RELEVANT_PATHS` at the same time, since the gate reads all three.

`.githooks/pre-commit` repeats lint, typecheck, coverage and Qodana on top of the secret guard, both
hooks passing `SKIP_TESTS=1` so the scan reuses the `coverage/lcov.info` the step before it just
wrote. The scan is in both on purpose: **`git merge --no-ff` never fires `pre-commit`**, so the merge
commit — the only revision that reaches `origin` — is the one thing a commit-time scan never
inspects, and Qodana Cloud files every report under the branch it ran on, so a repo gated only at
commit time never produces a `main`-tagged report for the baseline to compare against. Bypass the
scan alone with `SKIP_QODANA=1`; the other gates stay. Both hooks *block* on a missing prerequisite (`qodana` CLI,
docker daemon, the `jetbrains/qodana-js` tag `qodana.yaml` names, `QODANA_TOKEN`) and print the
fixing command. The token is per project — this repo has its own on qodana.cloud, separate from the
nine others; a backend service's token would file these reports under that service's project.

- **GraphQL is stubbed at `fetch`**, not with a mock urql client (`test/helpers/graphql.ts`).
  Everything above `fetch` is then real: the cache, the 498 retry, the status extraction, the session
  teardown. Replies are queued per operation name. An operation nobody configured **throws** — that is
  deliberate, an unexpected request is the interesting half of a regression.
- **`renderRoute(path)`** (`test/helpers/render.tsx`) mounts the real router at a real URL.
- **jsdom enforces interactive form validation.** A value that fails an `<input type="email">`'s own
  check never fires submit, so a zod email rule can only be reached with something the HTML validator
  accepts — `operator@marketplace` (no TLD), not `operator`.
- **`fireEvent.change`, not `userEvent.type`,** for any field with a `maxLength` or a date input.
- `Alert` is `role="alert"` only for the error tone; success and info are `role="status"`.
- Snapshots normalise React's `useId` values (see `vitest.setup.ts`) — do not "fix" a snapshot by
  writing the raw `_r_N_` ids back in.
- `TZ=UTC` is exported by the test scripts *and* set in `vitest.config.ts`. Both are needed: Stryker's
  worker pool ignores the config one.

## Cross-repo

A change here often is not local:

- an operation's shape → the resolver in `marketplace-dev-admin-authenticated-resource` (and its own
  100% coverage + mutation gates), then the `schema/` slice, then `yarn codegen`
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
