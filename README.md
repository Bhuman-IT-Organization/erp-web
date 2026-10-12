# erp-web

Next.js 16 App Router, shadcn/ui, Yarn 4. The web client of the ERP modernisation
(ADR-0002 frontend stack, ADR-0011 fixed workspace layout, ADR-0018 Yarn 4 and rule sync).

`app/` holds routes only; all logic lives under `src/` (see `src/README.md` for the tree).
Pages today: `/status` (a Server Component that calls `GET /api/v1/health` on the API through
the Nginx origin at request time), `/login` (shadcn form, react-hook-form + zod, posts to
`/api/v1/auth/login` through `callApi`, keeps the access token in memory, hands off to the
legacy session) and `/logout` (revokes the Node session, then the legacy one).

## Prerequisites

- Node 22.16.0 (`.node-version`; fnm or volta picks it up) with corepack. Yarn 4.9.2 is pinned
  by `packageManager`; never install Yarn globally and never use npm or pnpm.
- If `corepack enable` fails with EPERM on Windows (no admin rights), skip it and prefix every
  command with `corepack yarn`, or run
  `corepack enable --install-directory "$env:LOCALAPPDATA\corepack-shims"` once and put that
  folder first on your PATH (a global Yarn 1.22 would otherwise shadow it; `shadcn` shells out
  to `yarn add` and must find Yarn 4).
- Docker Desktop for the local stack in `../erp-infra` (Nginx, api, mysql, redis).

```bash
corepack yarn install
corepack yarn check   # typecheck, lint, check:arch, check:brand, format, test, build, storybook:build
corepack yarn lint    # the full typed ESLint can need up to 6 GB of heap, so the script runs it as node --max-old-space-size=6144 on every OS; no NODE_OPTIONS to set
```

## Run locally

No `.env*` here (ADR-0014). `../erp-infra/scripts/render-local-env.mjs` writes
`../erp-infra/env/local/web.env`; the Compose stack passes it to the `web` container, where
`API_BASE_URL=http://nginx`.

For `next dev` on the host against the Compose stack:

```bash
API_BASE_URL=http://localhost:8088 corepack yarn dev
```

8088 is the local Nginx from erp-infra. The page `/status` calls `/api/v1/health` through
that origin and renders `Requested: <url>`, the HTTP status, each health check and the circuit
breaker states, so the strangler routing is exercised on every render. `src/lib/config/env.ts`
is the only file that reads `process.env`; it is `server-only` and fails fast on a missing or
non-URL value.

`/login` and `/logout` run in the browser against RELATIVE paths (`/api/v1/auth/*` through the
axios instance, `/erp_sso/handoff`, `/admin/authentication/logout`), so they need the whole stack
behind one origin: logging in needs the api and the legacy SSO module from the same stack
(`node ../erp-infra/scripts/local-up.mjs`), then open `http://localhost:8088/login`. No
`NEXT_PUBLIC_*` variable exists: the browser never needs the API origin because it is the page's
own origin. An unreachable API (503, timeout, network) shows one banner at the top of every page
(`data-testid="api-unreachable"`) and the login form offers "Try again"; the login request is
never retried automatically (ADR-0031 §5).

`corepack yarn build` needs no environment: `/status` is `force-dynamic`, so env is read at
request time, never at build time. The build emits `.next/standalone` (`output: 'standalone'`)
for the web image in erp-infra.

In Docker: `node ../erp-infra/scripts/local-up.mjs` builds `Dockerfile` (two stages on
`node:22-alpine`); the image is Next standalone output (`.next/standalone`, `.next/static`,
`public`) and `API_BASE_URL=http://nginx` inside Compose, injected from
`../erp-infra/env/local/web.env` at runtime, never baked in.

Scripts: `dev`, `build` (`node scripts/build.mjs`: `next build` with NODE_OPTIONS set to a 4 GB heap, so its type-check worker gets it too), `start`, `typecheck` (`next typegen`, then `tsc --noEmit` with a 4 GB heap, as `lint` has 6 GB), `lint`,
`format`, `format:write`, `test` (Vitest), `storybook` (the component workbench on :6006),
`storybook:build` (`storybook build --test` into the ignored `storybook-static/`; a story that does
not compile fails `check:phase`), `check:arch` (`scripts/check-architecture-lint.mjs`: writes one probe
file per ESLint architecture scope, asserts every banned construct fires with its FE tag and every
permitted one stays silent, proves the scopes are disjoint, removes the probes), `check:brand`
(`scripts/check-brand.mjs`: no image asset under `app/`/`src/`, `public/` = fonts only, no
`uploads/company` path or literal image source outside `src/features/branding/`, no unjustified hex
colour, no customer name from `--names a,b` / `ERP_CUSTOMER_NAMES` — the list lives in erp-infra),
`ui:add <name>` (`scripts/ui-add.mjs`: the only way a shadcn primitive enters or changes
`src/components/ui/`; runs `corepack yarn dlx shadcn@4.21.0 add` and rewrites `.manifest.json`,
which `src/__tests__/feature-shape.test.ts` checks), `check` (all gates in order).

## Folder tree

```text
app/                       # Next.js routes only: layout.tsx, page.tsx, status/, login/, logout/, globals.css
public/                    # static assets (copied by the web Dockerfile)
src/
  components/ui/           # shadcn primitives, never edited (card, button, input, label, field, separator) + .manifest.json (sha256 per file, written by ui:add)
  components/organisms/ApiUnreachableBanner/   # the one global "API unreachable" banner (ADR-0031 §5); the first organism
  features/status/         # api/health.fetch.ts (+ test), pages/StatusPage.tsx
  features/auth/           # the reference feature slice: api/ (endpoints through callApi, legacy handoff), schemas/, components/ (LoginForm, LogoutButton), pages/, messages/ (en, ar), README.md
  i18n/                    # locales, direction (dir from the locale), locale-cookie (browser write), request (next-intl request config: cookie → locale → merged messages)
  messages/                # the static message registry (index.ts) and common/<locale>.json
  lib/i18n/                # pick.ts (the namespaces a nested NextIntlClientProvider carries); format.ts + format.server.ts (the only Intl doors: useFormat / getFormat with FORMAT_DEFAULTS — Latin digits, Gregorian, the deployment time zone)
  lib/log.ts               # the one console sink (no-console is an error everywhere else); debug/info silent outside development
  test/                    # shared test doubles (axios-fakes.ts) and the DOM harness (render.tsx)
.storybook/                # Storybook 10.6 (main.ts: nextjs-vite framework + addon-a11y; preview.tsx: globals.css, providers, the locale toolbar that sets lang/dir)
  lib/auth/                # session.ts (access + CSRF token in memory only, ADR-0005), safe-next.ts (open-redirect guard)
  lib/api/                 # client policy: CLIENT_TIMINGS, http.ts (the axios instance + interceptors), callApi, SWR global config + provider
  lib/config/env.ts        # zod-parsed server env (API_BASE_URL)
  lib/utils.ts             # cn() re-export written by shadcn init
  README.md                # the full approved tree and the rules that already apply
components.json            # shadcn/ui configuration (style radix-nova, aliases under src/)
configs/                   # the shared configs (tsconfig, ESLint, Prettier), identical in erp-api and erp-web
.dependency-cruiser-known-violations.json   # check:cycles baseline: the one cycle that existed at switch-on; listed in REFACTOR-BACKLOG.md
eslint-suppressions.json   # ESLint bulk suppressions: the violations that existed when the Phase 4 rules were switched on; total pinned by check:ratchet
REFACTOR-BACKLOG.md        # generated by corepack yarn check:ratchet --write; never edited by hand
eslint.config.mjs          # thin consumer: the global ignores, then base({ files, tests, timerDoors, docSurface, allowGenericFilenames }) and frontend({ root }) from @erp/configs (eslint-config-next, typescript-eslint strict/stylistic type-checked and the architecture block live in configs/eslint/frontend.mjs)
scripts/                   # check-a11y.mjs (check:a11y), check-architecture-lint.mjs (check:arch), check-brand.mjs (check:brand), ui-add.mjs (ui:add)
vitest.config.mts          # Vitest: spreads @erp/configs/vitest/base, @ alias to src/, coverage over an explicit include with per-layer thresholds (test:coverage, in check:phase)
stryker.config.mjs         # test:mutation over schemas, auth, config and the format door; thresholds.break raised only
lefthook.yml               # the git hooks, identical to configs/lefthook.yml and to erp-api's (see Git hooks)
commitlint.config.mjs      # re-exports @erp/configs/commitlint (commit-msg)
lint-staged.config.mjs     # re-exports @erp/configs/lint-staged (pre-commit)
.github/workflows/check.yml     # dormant CI: workflow_dispatch only, runs corepack yarn check
.github/workflows/mutation.yml  # dormant: workflow_dispatch only, runs corepack yarn test:mutation
```

Shared components live in `src/components/{atoms,molecules,organisms,templates}/<Name>/` with
`<Name>.tsx`, `index.ts`, `<Name>.stories.tsx` and `__tests__/<Name>.test.tsx` (an optional
`<Name>.variants.ts` for `cva`); the banner is the first organism. Every component has a story
(FE-02): `.storybook/preview.tsx` renders it under the app's providers, the toolbar's locale global
sets `lang`/`dir` on the document (an `ar` story is the RTL mirror), and the a11y addon runs axe on
every story with `parameters.a11y.test = 'error'`, so a violation fails the story wherever stories
are executed (the Storybook UI, and `corepack yarn check:a11y` in `check:phase`, which runs every story and axe
in headless Chrome). Stories stub the
same seams the tests use (`adapter`, `writeLocale`, `handoff`, `navigate`) — nothing in Storybook
reaches the network or navigates.

Every user-facing string is a message key (`src/features/<m>/messages/<locale>.json`, keyed by
the legacy `_lang.php` key where the screen has one; `src/messages/index.ts` registers the
feature; `src/messages/common/` holds app-wide words). The locale comes from the `erp_locale`
cookie (`src/i18n/request.ts`, the only reader; written by the login form from `user.locale`),
`dir` is set once from it in `app/layout.tsx`, and layouts use logical utilities
(`ms-`/`me-`/`ps-`/`pe-`/`text-start`) so RTL is a locale switch. `src/features/auth/README.md`
is the worked example (legacy view, parity table, drops, messages).

TypeScript is locked strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUnusedLocals`,
`noUnusedParameters`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`, `isolatedModules`,
`skipLibCheck: false`) with `@total-typescript/ts-reset` loaded through `reset.d.ts`.

## Refactor backlog

`REFACTOR-BACKLOG.md` lists, per file and rule, the violations of the Phase 4 code-shape rules (complexity, nesting, nested ternaries and loops, timers, TSDoc on `src/lib`, exhaustive switches) that existed when those rules were switched on as errors (D-07, D-08), plus the one import cycle `check:cycles` found then (`src/lib/i18n/format.ts` and `FormatSettingsProvider.tsx`, kept in `.dependency-cruiser-known-violations.json`). The lint violations are ESLint bulk suppressions in `eslint-suppressions.json`: `corepack yarn lint` tolerates exactly those counts per file and rule, and any new violation, in a new file or an old one, fails; `check:cycles` runs with `--ignore-known`, so any new cycle fails. The backlog is generated by `corepack yarn check:ratchet --write`, never edited by hand, and `corepack yarn check:ratchet` (in `check`) fails when it is stale or when the total differs from the `--expect` pinned in `package.json`.

A fix lowers the pin in the same commit: fix the code, run `corepack yarn lint:prune` (ESLint fails on a suppression left without a violation; for the cycle, regenerate the baseline with `corepack yarn depcruise src app --config configs/dependency-cruiser.cjs --output-type baseline --output-to .dependency-cruiser-known-violations.json`), then `corepack yarn check:ratchet --write`, and set `--expect` to the total it prints. The pin only goes down; adding a suppression to hide a new violation fails `check:ratchet`.

## Test gates

- `corepack yarn test`: the whole Vitest suite, fast; what pre-push runs.
- `corepack yarn test:coverage`: the same suite with V8 coverage over an explicit `include` (an untested file counts as 0), failing when the global value or any per-layer threshold in `vitest.config.mts` is not met (feature schemas and hooks, `src/lib/{hooks,api,auth,i18n}`, `src/hocs`, `src/config`). It runs in `check:phase` at each phase close; `check` runs plain `test`. The thresholds are the measured values, floored: raise one when coverage rises, never lower it.
- `corepack yarn test:mutation`: Stryker over the critical layers in `stryker.config.mjs`, weekly and on demand by a named person, never in a hook or `check` (it takes minutes to an hour). It fails when the mutation score is under `thresholds.break`, the tracked score: raise `break` in a commit when a run scores higher, never lower it. Its output (`reports/`, `.stryker-tmp/`) is per machine and ignored; `reports/stryker-incremental.json` makes the next run fast.
- `corepack yarn check:a11y`: runs after `storybook:build` in `check:phase` (never in a hook) and audits every story of `storybook-static` with axe-core in headless Chrome, at the width the story declares (`desktop1280` or `mobile375` in its `globals.viewport`, else both 1280 and 375). An audit fails on any axe violation, a play error, a `console.error` or uncaught exception, a render that never finishes, an empty `#storybook-root` or horizontal overflow; a story that renders nothing by design declares `parameters: { a11yRunner: { rendersNothing: true } }` and its root is asserted empty. There is no allowlist. It audits 4 stories at a time (`--concurrency <n>`), each in its own headless Chrome: about 2.5 minutes for 258 stories and 502 audits on the lead's machine (about 8 minutes one at a time). Chrome comes from `CHROME_PATH` when set, else the platform default install. `corepack yarn check:a11y --prove` plants an image without alt text and exits 0 only when that audit fails with `image-alt`.
- **`test:mutation` is parked:** `@stryker-mutator/vitest-runner` 10.0.0 runs no tests per mutant under Vitest 5.0.1, so its score is not valid and `thresholds.break` is `null`. Set `break` only after a runner release kills mutants in erp-api's `src/shared/http/guards/permission.guard.ts` (erp-docs `02-coding-rules/02-testing.md`, TEST-05).

## Git hooks

`corepack yarn install` installs them: the `postinstall` runs `node configs/scripts/git-hooks.mjs install`, which calls `lefthook install` (pre-commit, commit-msg, post-merge, post-rewrite) and then writes `.git/hooks/pre-push` itself, only inside a git checkout and never in CI or a Docker build. pre-push is not lefthook's because lefthook skips its pre-push commands when the branch has no new file changes, which would let an unchanged branch reach `main`. Yarn runs the `postinstall` on a fresh clone or a dependency change; to reinstall the hooks by hand, run `node configs/scripts/git-hooks.mjs install`. `lefthook.yml` and `configs/` are identical in erp-api and erp-web; change both repositories together.

| Hook                         | What it runs                                                                                                                                                       | Cost (measured on the lead's machine)                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `pre-commit`                 | `lint-staged` on the staged files only: `eslint --fix` then `prettier --write` on TypeScript, `prettier --write` on the rest; skipped during a merge or rebase     | about 15 s with a TypeScript file staged (one typed ESLint start), a few seconds without |
| `commit-msg`                 | `commitlint`: `type(scope): subject` with a scope, no em dash in the header, no `Co-Authored-By` or `Generated with` line; no length limit                         | about 2.4 s                                                                              |
| `pre-push`                   | refuses a push to `main` and a push holding a merge commit (history is rebase-only), then `corepack yarn check:push` (`typecheck` and `test`), one after the other | about 55 s warm, 85 s on a first run (the guard under 1 s)                               |
| `post-merge`, `post-rewrite` | `corepack yarn install` when the pull changed `yarn.lock` (a `git pull --rebase` fires `post-rewrite`)                                                             | 0 s unless the lockfile changed                                                          |

Before merge, run the full `corepack yarn check` and paste its output in the PR: the hooks are its fast part, and `check` ends with `check:audit` (`yarn npm audit --all --recursive --severity high`), which needs the network and so runs in no hook. An advisory with no fix in the same major is listed in `.yarnrc.yml` `npmAuditIgnoreAdvisories` with its package and reason, and reviewed at the next dependency bump.

- `git commit --no-verify` and `git push --no-verify` skip the hooks, and `LEFTHOOK=0` skips the lefthook ones (not pre-push); nothing on GitHub notices while CI is parked. The pasted `check` output in the PR is the control.
- A push to `main` the lead intends: `ERP_ALLOW_MAIN_PUSH=1 git push ...` (PowerShell: `$env:ERP_ALLOW_MAIN_PUSH='1'; git push ...; Remove-Item Env:ERP_ALLOW_MAIN_PUSH`), for that one command only.
- A GUI git client started outside a terminal (from the macOS Dock, for example) may not see `node` and `corepack` installed through a version manager, so a hook fails with "command not found". Start the client from a terminal, or point lefthook's `rc:` option at the file that sets your `PATH`.

`.github/workflows/check.yml` (`corepack yarn check`) and `mutation.yml` (`corepack yarn test:mutation`) are dormant: `workflow_dispatch` only, until CI is switched on (one commit).

## Dependencies

Every direct dependency, its licence and why it is here (ADR-0017). Exact versions are pinned
in `package.json`; `yarn.lock` is the single lockfile.

Runtime:

- `next` (MIT) — the framework: App Router, Server Components, standalone output
- `react` (MIT) — UI runtime required by Next.js
- `react-dom` (MIT) — DOM renderer required by Next.js
- `zod` (MIT) — schema validation for env and API payloads; the one validation library (ADR-0010)
- `server-only` (MIT) — makes `src/lib/config/env.ts` a build error if a client component imports it
- `shadcn` (MIT) — shadcn/ui 4 ships `shadcn/tailwind.css` (variants and utilities that `app/globals.css` imports) as well as the CLI that generates `src/components/ui`
- `radix-ui` (MIT) — accessible headless primitives that shadcn components are built on
- `class-variance-authority` (Apache-2.0) — `cva` variants for shadcn components and our atoms
- `cn` (MIT) — class-name merging for Tailwind (clsx + tailwind-merge replacement) that shadcn 4 primitives import
- `lucide-react` (ISC) — the icon set shadcn primitives use; app code imports icons only through the `Icon` atom (Phase 3)
- `tw-animate-css` (MIT) — Tailwind 4 animation utilities used by shadcn components
- `sonner` (MIT) — the toast surface behind `ui/sonner.tsx`; added by `corepack yarn ui:add sonner`, which writes it into `package.json` itself (pinned exact here afterwards, like every other version)
- `next-themes` (MIT) — NOT chosen: `ui/sonner.tsx` imports `useTheme` from it, so it arrives with the primitive. See ## Known deviations
- `cmdk` (MIT) — the filterable list inside `ui/command.tsx` (the searchable select's combobox); added by `corepack yarn ui:add command` with a caret, pinned exact here afterwards
- `nuqs` (MIT) — list state in the URL (`q`, `sort`, `cursor`, `limit`; FE-15), imported only by `src/lib/url/` (`useListQueryState`, `UrlStateProvider`) and the test/story harness (`P_NUQS`)
- `axios` (MIT; deps `follow-redirects`, `form-data`, `proxy-from-env`, `https-proxy-agent`, all MIT) — the one HTTP client instance in `src/lib/api/http.ts` (ADR-0002): timeout from `CLIENT_TIMINGS`, bearer and problem-details interceptors, no retry layer (ADR-0031 §5)
- `swr` (MIT) — stale-while-revalidate data hooks (ADR-0002); the global retry/dedupe/focus policy lives in `src/lib/api/swr-config.ts` (ADR-0031 §5)
- `react-hook-form` (MIT) — form state and validation wiring for the shadcn `Field` primitives (ADR-0002)
- `@hookform/resolvers` (MIT) — the zod resolver bridging `loginSchema` to react-hook-form
- `next-intl` (MIT) — messages and locale for the App Router without i18n routing (FE-08): `src/i18n/request.ts` resolves the `erp_locale` cookie, `getTranslations` on the server, `useTranslations` under `NextIntlClientProvider` in the browser

Development only:

- `typescript` (Apache-2.0, dev): the compiler; `tsc --noEmit` is the typecheck gate; the locked strictness flags live in `configs/tsconfig/base.json`, which `tsconfig.json` extends through `configs/tsconfig/next.json`
- `@types/node` (MIT, dev) — Node type definitions for config and server code
- `@types/react` (MIT, dev) — React type definitions
- `@types/react-dom` (MIT, dev) — React DOM type definitions
- `@total-typescript/ts-reset` (MIT, dev) — safer built-in types (`JSON.parse` returns `unknown`, etc.)
- `tailwindcss` (MIT, dev) — utility CSS, the one styling system (ADR-0002)
- `@tailwindcss/postcss` (MIT, dev) — PostCSS plugin that Next.js uses to compile Tailwind 4
- `eslint` (MIT, dev) — linter; 9.x because `eslint-plugin-react` inside `eslint-config-next` does not run on ESLint 10 yet
- `eslint-config-next` (MIT, dev) — Next.js core-web-vitals and TypeScript rule sets
- `typescript-eslint` (MIT, dev) — strict and stylistic type-checked rule sets on `app/` and `src/`
- `@erp/configs` (`link:./configs`, dev): the shared configs in `configs/`, identical in erp-api and erp-web (the base of `tsconfig.json`, `eslint.config.mjs` and `prettier.config.mjs`); no licence of its own to vet.
- `@eslint-community/eslint-plugin-eslint-comments` (MIT, dev) — `require-description`: every `eslint-disable` carries a `-- reason` (an unused directive is an error through `linterOptions.reportUnusedDisableDirectives`, no plugin needed)
- `@vitest/eslint-plugin` (MIT, dev) — `no-focused-tests` (no `.only` reaches main), `expect-expect`, `no-identical-title`, `no-disabled-tests` on tests, harnesses and stories
- `eslint-plugin-jsx-a11y` (MIT) is NOT installed separately: it arrives inside `eslint-config-next`, which registers it as `jsx-a11y`; `configs/eslint/frontend.mjs` imports it only to spread `flatConfigs.recommended.rules` (all 34, with `no-autofocus` off: the login form keeps the legacy `autofocus` for 1:1 parity, lead decision 2026-09-20)
- `eslint-plugin-jsdoc` (BSD-3-Clause, dev): `jsdoc/require-jsdoc` on `src/lib`, so every exported door carries a TSDoc block (QA-06). Pinned at 63.3.3: 64.x needs Node 22.22 (D-14).
- `dependency-cruiser` (MIT, dev): the import graph behind `check:cycles`; its `no-circular` rule (`configs/dependency-cruiser.cjs`) fails on any new circular import, type-only imports included (TS-15).
- `prettier` (MIT, dev) — formatter; `format` is a gate in `check`
- `vitest` (MIT, dev) — test runner in both repos (ADR-0016)
- `@vitest/coverage-v8` (MIT, dev): V8 coverage for `test:coverage`, the per-layer coverage gate in `check:phase` (thresholds in `vitest.config.mts`, TEST-04).
- `@stryker-mutator/core` (Apache-2.0, dev): the mutation tester behind `test:mutation` (`stryker.config.mjs`, TEST-05).
- `@stryker-mutator/vitest-runner` (Apache-2.0, dev): runs this repository's Vitest suite for each mutant.
- `lefthook` (MIT, dev): the git hook runner; `lefthook.yml` holds the chain (see Git hooks).
- `lint-staged` (MIT, dev): runs ESLint and Prettier on the staged files only (pre-commit). Pinned at 16.4.0: 17.x needs Node 22.22 (D-14).
- `@commitlint/cli` (MIT, dev): checks each commit message (commit-msg) against `commitlint.config.mjs`.
- `@commitlint/config-conventional` (MIT, dev): the conventional-commit rule set that `@erp/configs/commitlint` extends.
- `vite` (MIT, dev) — Vitest's peer, pinned so it resolves from this repo and not a parent folder
- `happy-dom` (MIT, dev) — the DOM for component tests; a test file opts in with `// @vitest-environment happy-dom` on line 1 (the default environment stays `node`)
- `@testing-library/react` (MIT, dev) — renders components in that DOM; `src/test/render.tsx` wraps it with the app's providers
- `@testing-library/dom` (MIT, dev) — the queries behind it (its `^10` peer, pinned)
- `@testing-library/user-event` (MIT, dev) — typing and clicking in tests as a user would
- `storybook` (MIT, dev) — Storybook 10.6, the component workbench (ADR-0002, FE-02); installed by hand, never through its init wizard
- `@storybook/nextjs-vite` (MIT, dev) — the framework: Next.js App Router conventions (`@/` alias, `next/image`, fonts) on Vite; reads `next.config.ts`
- `@storybook/addon-a11y` (MIT, dev) — runs axe on every story; `preview.tsx` sets `a11y.test = 'error'`. Its `axe-core` dependency is MPL-2.0 (weak copyleft, file-level); it is development-only, was already in the tree through `eslint-plugin-jsx-a11y` (inside `eslint-config-next`) and never ships in the build — ADR-0017's runtime policy is untouched
- `axe-core` (MPL-2.0, dev): the accessibility engine `scripts/check-a11y.mjs` injects into each story (`check:a11y`); pinned at 4.13.0, the version `@storybook/addon-a11y` already brought into the lockfile. Weak copyleft, file-level, development-only, never in the build, so ADR-0017's runtime whitelist does not apply
- `@storybook/addon-vitest` is NOT installed: its peer is Vitest `^3 || ^4` and this repo is on 5; add it when it publishes Vitest 5 support, until then `storybook:build` compiles, `check:a11y` executes every story and Testing Library holds behaviour

No copyleft or paid dependency (ADR-0017).

## Known deviations

- `@storybook/react@10.6.0` (pulled in by `@storybook/nextjs-vite`) ships two inline
  `/** @ts-expect-error */` comments in `dist/chunk-*.d.ts` that only suppress the NEXT line; under
  `exactOptionalPropertyTypes` the constraint error lands on the same line, so `tsc` reports both an
  unused directive and the error. A type-only patch moves each directive onto its own line above.
  Drop it when upstream publishes a fix.
- `next-intl@4.14.5` and `happy-dom@20.14.5` each ship a `.d.ts` that fails under
  `skipLibCheck: false`: next-intl's plugin types import `LoaderContext` from `webpack` (a package
  this repo does not have — Next bundles its own copy), and happy-dom's `BrowserWindow.d.ts`
  references `node:stream/web`'s `UnderlyingDefaultSource`, which `@types/node` 22 does not export.
  Both carry a type-only patch in `.yarn/patches/` through `resolutions`, like the radix one below.
  Drop each when upstream publishes a fix.

- `@radix-ui/react-select@2.3.7` (pulled in by the `radix-ui` umbrella that the shadcn
  primitives import) ships a `.d.ts` that fails under `exactOptionalPropertyTypes` with
  `skipLibCheck: false` (`SelectPopperPrivateProps.onPlaced` is `PopperContentProps['onPlaced']`,
  which is `(() => void) | undefined`, not identical to Popper's own `onPlaced?: () => void`).
  Neither flag is negotiable, so `.yarn/patches/` carries a two-line type-only patch applied
  through `resolutions` (Yarn `patch:` protocol). Drop it when upstream publishes a fix.
- `@radix-ui/react-menu@2.1.24` (behind `dropdown-menu`) and `sonner@2.0.8` fail the same way and
  carry the same kind of type-only patch: `MenuCheckboxItemProps.checked?: CheckedState` and
  `ToasterProps.theme?: 'light' | 'dark' | 'system'` are re-passed by the generated primitives as
  `T | undefined`, which `exactOptionalPropertyTypes` refuses; each patch adds `| undefined` to the
  optional property. Six type-only patches now, all for the same two flags.
- `next@16.3.5` and `16.3.6` ship `dist/experimental/testing/server/middleware-testing-utils.d.ts` importing
  `MiddlewareConfigMatcherInput`, a name its source module never exported. That one is NOT a Yarn
  patch (the package is too large to patch for one word): `types/next-testing.d.ts` merges the alias
  back in by module augmentation. `__tests__/proxy.test.ts` needs the module —
  `unstable_doesMiddlewareMatch` is the only honest way to assert `proxy.ts`'s matcher.
- `next-themes@0.4.6` is a dependency of nothing we wrote: `corepack yarn ui:add sonner` generates
  `ui/sonner.tsx`, which reads `useTheme()`. This phase ships no theme switcher, so the hook finds
  no provider and the toaster falls back to `system`. It stays because `ui/` is never hand-edited
  (FE-02); drop it the day the generated wrapper stops importing it.
- shadcn 4's `radix-nova` registry ships `form` as an empty, deprecated item; the login form uses
  the documented replacement, `field` (`Field`, `FieldLabel`, `FieldError`) with
  react-hook-form's `Controller`.
