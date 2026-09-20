# Repository mechanics

How this repo's git plumbing and lint scope behave, and why. Nothing here changes what you write — it
explains what happens when you commit, push, or watch a gate fail. [`CLAUDE.md`](./CLAUDE.md) carries the rules
themselves, [`COVERAGE.md`](./COVERAGE.md) the thresholds.

## The hooks

`.githooks/pre-push` is a blocking eight-step gate: `yarn semgrep:ci` (Semgrep SAST, rules vendored under
`semgrep/`, pinned image, `--network none`), then trivy (dependency advisories over `yarn.lock`, HIGH and
CRITICAL, production tree only), then the OpenSSF Scorecard floor (`.scorecard-floor`, supply-chain
posture read from the GitHub API, ADR-054), then `yarn lint:check`, then `tsc --noEmit`, then
`yarn test:cov` (100 on all four metrics), then `yarn test:mutation` (100), then `./qodana.sh`.

⚠️ **Trivy is what checks dependencies; Qodana's own inspection does not.** `VulnerableLibrariesLocal` is
an offline heuristic that queries no advisory feed and reports zero everywhere, and the class that does
query one is bundled with the image but is in no profile. Trivy reads `yarn.lock` natively, suppresses
devDependencies, and blocks on HIGH or CRITICAL with the CVE id and the fixed version. Bypass for a Docker
or network outage, never for a finding: `SKIP_TRIVY=1 git push`.

`.githooks/pre-commit` repeats lint, typecheck, coverage and Qodana on top of the secret guard. Semgrep,
trivy and mutation are push-only — all three need Docker, and push is the layer that sees the merge commit. Both hooks pass `SKIP_TESTS=1` to the scan so it reuses the `coverage/lcov.info` the step
before it just wrote.

Semgrep and trivy are first because they are the two cheap ones — about three seconds and, with the
vulnerability database already pulled, under one — against the minutes the rest take together. Lint leads
the five that follow because it is the cheapest of
them and the only one that can fail on a file the other four are perfectly happy with — the next `yarn lint` would rewrite it anyway. `.prettierrc` and
`.prettierignore` joined `eslint.config.js` in the hooks' `RELEVANT_PATHS` at the same time, since the gate
reads all three; before that, a commit touching only them skipped every gate there is.

## Why Qodana runs in both hooks

**`git merge --no-ff` never fires `pre-commit`** — git runs that hook for `git commit` only — so the merge
commit, the only revision that reaches `origin`, is the one thing a commit-time scan never inspects. Two
individually clean branches can merge into a tree that is not.

The second reason is Qodana Cloud: it files every report under the branch it ran on, and pre-commit always
runs on the feature branch, so a repo gated only at commit time never produces a `main`-tagged report for
the baseline to compare against.

Both hooks *block* on a missing prerequisite — the `qodana` CLI, the docker daemon, the
`jetbrains/qodana-js` tag `qodana.yaml` names, `QODANA_TOKEN` — and print the fixing command rather than
skipping. **The token is per project**: this repo has its own on qodana.cloud, separate from the nine
backend ones. A backend service's token would file these reports under that service's project.

## Node selection

Ahead of its eight gates the pre-push hook selects node itself. It reads `engines.node` from `package.json`
— never a hard-coded version — and sources nvm to switch if the current node does not satisfy it.

This is necessary because every gate shells out to yarn and yarn's `engines` check is a hard failure: on
the wrong node the push used to die at step 1 with `The engine "node" is incompatible with this module`,
printed under the banner about type errors, which is not what had gone wrong. If nvm is absent or the
version is not installed, the hook blocks with the `nvm install` line instead of letting yarn report
nonsense. All fourteen sub-repos that carry hooks have the same block now; it started in `marketplace-common`'s
*pre-commit*, which is where it was copied from.

## Lint scope

`yarn lint` runs `eslint --fix . && prettier --write .`, and `lint:check` runs both read-only. The scope is
the **whole tree**, not `src/` — which is how test files and configs drifted unnoticed for as long as they
did. All thirteen sub-repos that have a lint config (every one but `marketplace-db-setup`) work this way.

What is out of scope lives in `.prettierignore`, and markdown is in there on purpose: `proseWrap: "never"`
would flatten every hand-wrapped paragraph in these docs onto one line.

**Every block in `eslint.config.js` carries a `files` glob.** A flat-config entry without one applies to
*every* file eslint walks into, including minified Qodana HTML reports — thousands of `no-undef` errors
in code nobody here wrote. The globs live in `SOURCES` and `CONFIG_ROOT` at the top of the file; add a
block by reusing them, never by omitting `files`. Ignoring a directory fixes one path; scoping makes the
next one impossible.

The backend nine never had this bug, because `@axiumine/eslint-config-be` scopes everything to `src/**`.

**Tabs, not spaces** (eslint `indent: ['error','tab']`). Prettier here: no semicolons, single quotes,
`trailingComma: "none"`, `printWidth: 129`, `useTabs: true`. The backend services and `marketplace-common`
carry that file byte for byte.

## Bypasses

`SKIP_QODANA=1` (scan only — the other gates stay) · `git commit --no-verify` / `git push --no-verify` (the
whole hook). Both are gate removals. See [`CLAUDE.md`](./CLAUDE.md) for when they may be used, which is: when the user
says so, and not otherwise.

## Why the mutation gate is hook-only

Running `yarn test:mutation` only from `pre-push` does not weaken anything: the threshold stays 100,
`pre-push` still blocks, and no survivor is ever answered by lowering a number. What changes is **who
starts the run**. A full pass costs tens of minutes and holds the whole machine at 28 workers while it
lasts, so an on-demand run is time taken from the person waiting for the work.

A hand-started run is usually **wrong** as well as slow: `npx stryker run` skips what the `test:mutation`
script exports (`TZ=UTC`), so the suite fails in Stryker's dry run on a timezone-dependent assertion and
the whole run aborts before a single mutant is tested.

## `schema/*.graphql` is a copy, and copies drift

The platform has **no SDL**. All nine backend services build their schema programmatically with graphql-js.
The four files under `schema/` are hand-written slices, kept only because graphql-codegen needs a schema to
type documents against.

They are a copy, and a copy drifts. Before adding or changing any operation, read the resolver in the
service repo — `BEs/dev/marketplace-dev-*/src/graphQLApi/` (public-authorization uses `graphQLPublic/`
instead) — and make the slice match. The resolvers are the contract. A slice can happily declare an
operation no service implements (`updateUtentePwd` is one such name — nothing on the platform answers
it), or give an argument a different name from the resolver's. Both compile, both pass codegen, and both
fail only at run time against the real server.

`src/gql/` is generated. Never edit it; run `yarn codegen`.

Adding an operation on a new endpoint is more than a file in `src/api/operations/`: it is a new `schema/`
slice + a new `codegen.ts` project + a new `CTX_*` + a proxy entry in `vite.config.ts`.

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

## Version control — the detail

- **The remote exists and is empty.** `origin` is `https://github.com/Axiumine/marketplace-admin.git`, the
  GitHub repo is there and **public**, and `git ls-remote --heads origin` returns nothing: not one branch
  has ever been pushed, so `main` tracks nothing. The first push is therefore a *publication* of the whole
  history to a public repository, not a routine sync. It is **push-on-request**: never run `git push`
  unless the user asked for it in that message.
- **Delete the branch once it is merged.** `git branch -d <slug>`, right after the merge. `-d`, never `-D`:
  it refuses a branch whose commits are not already reachable, so the safe case is quiet and the unsafe one
  stops you. Merges land locally, so no forge-side "delete branch on merge" ever fires and `git branch`
  stays the only view of what is still in flight.

## Testing notes

- **Every component under `src/components/`, `src/pages/` and `src/features/` carries a snapshot**, and
  `test/**/__snapshots__/*.snap` byte-matches a real render. `vitest run` never updates a snapshot, so a
  drifted one is a failing test rather than a silent rewrite. Regenerate with `yarn test -u` only after
  an intended markup change, and read the diff — `-u` accepts a regression just as readily as a fix.
- **GraphQL is stubbed at `fetch`**, not with a mock urql client (`test/helpers/graphql.ts`). Everything
  above `fetch` is then real: the cache, the 498 retry, the status extraction, the session teardown. Replies
  are queued per operation name. An operation nobody configured **throws** — deliberate, an unexpected
  request is the interesting half of a regression.
- **`renderRoute(path)`** (`test/helpers/render.tsx`) mounts the real router at a real URL.
- **jsdom enforces interactive form validation.** A value that fails an `<input type="email">`'s own check
  never fires submit, so a zod email rule is only reachable with something the HTML validator accepts —
  `admin@marketplace` (no TLD), not `admin`.
- **`fireEvent.change`, not `userEvent.type`,** for any field with a `maxLength` or a date input.
- `Alert` is `role="alert"` only for the error tone; success and info are `role="status"`.
- Snapshots normalise React's `useId` values (see `vitest.setup.ts`) — do not "fix" a snapshot by writing
  the raw `_r_N_` ids back in.
- `TZ=UTC` is exported by the test scripts *and* set in `vitest.config.ts`. Both are needed: Stryker's
  worker pool ignores the config one.
