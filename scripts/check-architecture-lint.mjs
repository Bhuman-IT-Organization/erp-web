// Proves the architecture block in eslint.config.mjs fires (erp-docs 02-coding-rules/06-frontend.md FE-01/03/04/06/07/08/09/14/17/20/26)
// and the single-purpose objects after it (S13 magic numbers, S14 hooks, S15 jsx literals, S16 no-console,
// S17 hygiene, S18 test hygiene, S19 a11y). Runs from `check:arch`. It writes one throwaway probe file
// per ESLint scope INTO app/ or src/ (typescript-eslint's projectService only sees files under tsconfig's
// `include`), lints them through ESLint's Node API, asserts every expected rule id and FE message tag
// fires and every permitted construct (the negative lines) stays silent, lints the real single-file
// scopes (S3/S4/S7/S24/S25 — the last two are the catalogue mirror and the root proxy, which are one
// file each) plus `lintText` variants for the door files (S16/S20–S25), and always removes
// the probes — in `finally` and on SIGINT. It also proves the scopes are disjoint: flat config REPLACES
// a rule's options per file, so a file matched by two scopes would silently lose one scope's entries.
import { ESLint } from 'eslint';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBE = 'zz-lint-probe';
const ARCH_RULE_IDS = new Set([
  'no-restricted-imports',
  'no-restricted-syntax',
  '@typescript-eslint/no-magic-numbers',
  'react/jsx-no-literals',
  'react/no-danger',
  'react-hooks/exhaustive-deps',
  'no-console',
  'no-debugger',
  'no-alert',
  'no-eval',
  'no-implied-eval',
  'no-new-func',
  'eqeqeq',
  'no-var',
  'prefer-const',
  'no-param-reassign',
  '@eslint-community/eslint-comments/require-description',
  // From the typed base rather than the architecture block: SF-5's defect was three files sitting
  // outside `strictTypeChecked`, so the checker needs one rule from it to prove the base reaches them.
  '@typescript-eslint/no-floating-promises',
]);
const ARCH_RULE_PREFIXES = ['vitest/', 'jsx-a11y/'];
const isArchRule = (ruleId) =>
  ruleId !== null &&
  (ARCH_RULE_IDS.has(ruleId) || ARCH_RULE_PREFIXES.some((p) => ruleId.startsWith(p)));
/**
 * The code-shape rules of `base()` (01-typescript-and-lint TS-08 to TS-18, 04-shared-utilities UTIL-01, QA-06) and D-23. A probe's
 * `expect` may name them; the negative lines, `absentRuleIds` and `checkRealFiles` keep the architecture
 * rules only: a real file is linted through the Node API, which applies no `eslint-suppressions.json`, so
 * a shape rule there would report a tracked backlog entry, not a broken scope.
 */
const SHAPE_RULE_IDS = new Set([
  'complexity',
  'max-depth',
  'no-nested-ternary',
  'no-else-return',
  'no-lonely-if',
  'no-await-in-loop',
  '@typescript-eslint/switch-exhaustiveness-check',
  '@typescript-eslint/naming-convention',
  'erp/no-nested-loops',
  'erp/no-query-in-loop',
  'erp/flag-naming',
  'erp/no-generic-filename',
  'erp/require-complexity-note',
  'no-restricted-globals',
  'no-restricted-properties',
  'jsdoc/require-jsdoc',
  'vitest/no-disabled-tests',
]);
/** ESLint reports an unused `eslint-disable` with `ruleId: null` (`linterOptions.reportUnusedDisableDirectives`). */
const UNUSED_DIRECTIVE = 'Unused eslint-disable directive';
const FE26 = 'FE-26';

/**
 * One probe per scope. `lines` is the file; `expect.tags` / `expect.ruleIds` must appear somewhere in
 * the file's messages; `negative` lists 1-based line numbers on which no architecture rule may report
 * (the constructs that scope permits). Every construct that must fire sits on its own line.
 */
const probes = [
  {
    scope: 'S1 app/ (+ S13–S17, S20)',
    path: `app/${PROBE}/page.tsx`,
    lines: [
      "import axios from 'axios';", // 1 P_AXIOS FE-08
      "import '@/lib/api/call-api';", // 2 G_CALL_API FE-08
      "import '@/features/auth/components/LoginForm';", // 3 G_FEATURE_COMPONENTS FE-01
      "import { LoginPage } from '@/features/auth/pages/LoginPage';", // 4 negative: a page
      "import { getBranding } from '@/features/branding/api/branding.server';", // 5 negative: a feature api
      "import { useEffect } from 'react';",
      'export default function Page() {',
      "  void fetch('x');", // 8 S_FETCH FE-09
      '  void process.env.X;', // 9 S_PROCESS_ENV FE-03
      '  useEffect(() => undefined);', // 10 S_USE_EFFECT FE-04
      "  const c = '#fff ';", // 11 S_HEX FE-17
      '  void [axios, LoginPage, getBranding, c];',
      "  console.log('x');", // 13 no-console (S16)
      '  debugger;', // 14 no-debugger (S17)
      "  alert('x');", // 15 no-alert (S17)
      "  if (c == 'a') return null;", // 16 eqeqeq (S17)
      '  var v = 1;', // 17 no-var (S17)
      '  void v;',
      '  // eslint-disable-next-line no-console', // 19 require-description (S17) — no `-- reason`
      "  console.log('y');",
      '  // eslint-disable-next-line no-var -- unused directive (linterOptions)', // 21 reportUnusedDisableDirectives
      '  void 0;',
      '  void new Date().toLocaleDateString();', // 23 S_INTL FE-26 (S20)
      '  void new Intl.NumberFormat();', // 24 S_INTL FE-26 (S20)
      '  return (',
      '    <>',
      '      <div className="ml-2" />', // 27 S_PHYSICAL FE-20
      '      <div className="ms-2 ps-3 text-start" />', // 28 negative: logical utilities
      '      <p>literal text</p>', // 29 react/jsx-no-literals (S15)
      '      <p data-testid="x">{c}</p>', // 30 negative: an attribute string and an expression
      '    </>',
      '  );',
      '}',
    ],
    expect: {
      tags: ['FE-01', 'FE-03', 'FE-04', 'FE-08', 'FE-09', 'FE-17', 'FE-20', FE26],
      ruleIds: [
        'no-restricted-imports',
        'no-restricted-syntax',
        'react/jsx-no-literals',
        'no-console',
        'no-debugger',
        'no-alert',
        'eqeqeq',
        'no-var',
        '@eslint-community/eslint-comments/require-description',
      ],
      unusedDirective: true,
    },
    negative: [4, 5, 28, 30],
  },
  {
    scope: 'S2 feature (+ S14, S15, S17 no-danger, S19)',
    path: `src/features/${PROBE}/components/Probe.tsx`,
    lines: [
      "import axios from 'axios';", // 1 P_AXIOS FE-08
      "import useSWR from 'swr';", // 2 P_SWR FE-08
      "import { http } from '@/lib/api/http';", // 3 G_HTTP FE-08
      "import '@/features/auth/api/auth.endpoints';", // 4 G_FEATURE_INTERNALS FE-07
      "import { Button } from '@/components/ui/button';", // 5 negative: a primitive
      "import { BrandLogo } from '@/features/branding';", // 6 negative: another feature's index
      "import { useCommonApi } from '@/lib/api/use-common-api';", // 7 negative: the data layer
      "import { useCallback, useEffect } from 'react';",
      'export function Probe({ x, f }: { x: string; f: () => void }) {',
      "  void fetch('x');", // 10 S_FETCH FE-09
      '  useEffect(() => undefined);', // 11 S_USE_EFFECT FE-04
      '  void process.env.X;', // 12 S_PROCESS_ENV FE-03
      "  const blue = '#0078d4';", // 13 S_HEX FE-17
      "  const notAColour = '#abcdefg';", // 14 negative: seven hex chars followed by a letter
      '  const cb = useCallback(() => x, []);', // 15 react-hooks/exhaustive-deps (S14)
      '  void [axios, useSWR, http, Button, BrandLogo, useCommonApi, blue, notAColour, cb];',
      '  return (',
      '    <div>',
      '      <svg />', // 19 S_SVG FE-14
      '      <div className="sm:ml-2" />', // 20 S_PHYSICAL FE-20 — prefixed, proves the `:` alternative
      '      <div className={`hover:pl-4 ${x}`} />', // 21 S_PHYSICAL FE-20 — template element
      '      <div className="px-3 ms-2" />', // 22 negative: logical utility
      '      <div dangerouslySetInnerHTML={{ __html: x }} />', // 23 react/no-danger (S17)
      '      <img src="x" />', // 24 jsx-a11y/alt-text (S19)
      '      <div onClick={f} />', // 25 jsx-a11y/click-events-have-key-events (S19)
      '      <label>text</label>', // 26 jsx-a11y/label-has-associated-control (S19)
      '      <input autoFocus />', // 27 negative: no-autofocus is off (lead decision, 1:1 legacy parity)
      '      <p>text</p>', // 28 react/jsx-no-literals (S15)
      '    </div>',
      '  );',
      '}',
    ],
    expect: {
      tags: ['FE-03', 'FE-04', 'FE-07', 'FE-08', 'FE-09', 'FE-14', 'FE-17', 'FE-20'],
      ruleIds: [
        'no-restricted-imports',
        'no-restricted-syntax',
        'react/jsx-no-literals',
        'react/no-danger',
        'react-hooks/exhaustive-deps',
        'jsx-a11y/alt-text',
        'jsx-a11y/click-events-have-key-events',
        'jsx-a11y/label-has-associated-control',
      ],
      absentRuleIds: ['jsx-a11y/no-autofocus'],
    },
    negative: [5, 6, 7, 14, 22, 27],
  },
  {
    scope: 'S5 src/lib (+ S13)',
    path: `src/lib/${PROBE}.ts`,
    lines: [
      "import axios from 'axios';", // 1 P_AXIOS_TYPES: a VALUE import still fires (FE-08)
      "import type { AxiosAdapter } from 'axios';", // 2 negative: allowTypeImports (call-api.ts's seam)
      "import useSWR from 'swr';", // 3 negative: swr lives here
      "import '@/features/auth';", // 4 G_ANY_FEATURE FE-01
      "import '@/components/ui/button';", // 5 G_COMPONENTS_FROM_LIB FE-01
      "import { useEffect } from 'react';",
      "void fetch('x');", // 7 S_FETCH FE-09
      'void process.env.X;', // 8 S_PROCESS_ENV FE-03
      'useEffect(() => undefined);', // 9 S_USE_EFFECT FE-04
      'const t = setTimeout(() => undefined, 5000);', // 10 @typescript-eslint/no-magic-numbers (S13)
      'const N = 5000;', // 11 negative: a const declaration (enforceConst)
      'void [axios, useSWR, t, N];',
      'export type Adapter = AxiosAdapter;',
    ],
    expect: {
      tags: ['FE-01', 'FE-03', 'FE-04', 'FE-08', 'FE-09'],
      ruleIds: [
        'no-restricted-imports',
        'no-restricted-syntax',
        '@typescript-eslint/no-magic-numbers',
      ],
    },
    negative: [2, 3, 11],
  },
  {
    scope: 'S8 atoms (a layer)',
    path: `src/components/atoms/${PROBE}/Probe.tsx`,
    lines: [
      "import '@/components/organisms/ApiUnreachableBanner';", // 1 G_UPWARD FE-06
      "import { Search } from 'lucide-react';", // 2 P_LUCIDE FE-14
      "import '@/features/auth';", // 3 G_ANY_FEATURE FE-01
      "import '@/lib/api/call-api';", // 4 G_CALL_API FE-08
      "import { cn } from '@/lib/utils';", // 5 negative
      "import { getApiStatus } from '@/lib/api/api-status';", // 6 negative: a store
      "import { useTheme } from 'next-themes';", // 7 P_NEXT_THEMES FE-17
      'export function Probe() {',
      '  void [Search, cn, getApiStatus, useTheme];',
      '  return <svg />;', // 10 S_SVG FE-14
      '}',
    ],
    expect: {
      tags: ['FE-01', 'FE-06', 'FE-08', 'FE-14', 'FE-17'],
      ruleIds: ['no-restricted-imports', 'no-restricted-syntax'],
    },
    negative: [5, 6],
  },
  {
    scope: 'S9 the Icon atom',
    path: `src/components/atoms/Icon/${PROBE}.tsx`,
    lines: [
      "import '@/features/auth';", // 1 G_ANY_FEATURE FE-01
      "import { Search } from 'lucide-react';", // 2 negative: lucide lives here
      'export function Probe() {',
      "  void fetch('x');", // 4 S_FETCH FE-09
      '  void Search;',
      '  return <svg />;', // 6 negative: inline svg lives here
      '}',
    ],
    expect: {
      tags: ['FE-01', 'FE-09'],
      ruleIds: ['no-restricted-imports', 'no-restricted-syntax'],
    },
    negative: [2, 6],
  },
  {
    scope: 'S10 src/lib/hooks',
    path: `src/lib/hooks/${PROBE}.ts`,
    lines: [
      "import { useEffect } from 'react';",
      "void fetch('x');", // 2 S_FETCH FE-09
      'void process.env.X;', // 3 S_PROCESS_ENV FE-03
      'useEffect(() => undefined);', // 4 negative: the one home of useEffect
    ],
    expect: { tags: ['FE-03', 'FE-09'], ruleIds: ['no-restricted-syntax'] },
    negative: [4],
  },
  {
    scope: 'S11 src/i18n',
    path: `src/i18n/${PROBE}.ts`,
    lines: [
      "import axios from 'axios';", // 1 P_AXIOS FE-08
      "import en from '@/features/auth/messages/en.json';", // 2 negative: feature messages by path
      "void fetch('x');", // 3 S_FETCH FE-09
      'void [axios, en];',
    ],
    expect: {
      tags: ['FE-08', 'FE-09'],
      ruleIds: ['no-restricted-imports', 'no-restricted-syntax'],
    },
    negative: [2],
  },
  {
    scope: 'S23 src/config (+ D-16)',
    path: `src/config/${PROBE}.ts`,
    lines: [
      "import '@/features/auth';", // 1 G_ANY_FEATURE FE-01
      "import '@/components/ui/button';", // 2 G_COMPONENTS_FROM_LIB FE-01
      "import { PERMISSIONS } from './permissions';", // 3 negative: the mirror is the config layer's own
      "export const GATE = 'staff.members.view';", // 4 S_PERMISSION_LITERAL ADR-0033/D-16
      'export const OK = PERMISSIONS.staff.members.view;', // 5 negative: the constant
      "export const HREF = '/admin/staff';", // 6 negative: two segments, not a permission name
      "export const KEY = 'shell.als_staff';", // 7 negative: two segments
      "void fetch('x');", // 8 S_FETCH FE-09
    ],
    expect: {
      tags: ['FE-01', 'FE-09', 'ADR-0033'],
      ruleIds: ['no-restricted-imports', 'no-restricted-syntax'],
    },
    negative: [3, 5, 6, 7],
  },
  {
    scope: 'S12 tests (+ S18)',
    path: `src/test/${PROBE}.test.tsx`,
    lines: [
      "import axios from 'axios';", // 1 negative: fakes may import axios
      "import { expect, it } from 'vitest';",
      'void process.env.X;', // 3 S_PROCESS_ENV FE-03
      "void fetch('x');", // 4 negative: a fake may fetch
      "it.only('focused', () => {", // 5 vitest/no-focused-tests (S18)
      '  expect(axios).toBeDefined();',
      '});',
      '// eslint-disable-next-line no-console -- probe: a described directive is permitted', // 8 negative
      "console.log('described');", // 9 negative (tests are outside S16 anyway)
      "it.skip('disabled', () => {", // 10 vitest/no-disabled-tests (D-23)
      '  expect(axios).toBeDefined();',
      '});',
    ],
    expect: {
      tags: ['FE-03'],
      ruleIds: ['no-restricted-syntax', 'vitest/no-focused-tests', 'vitest/no-disabled-tests'],
    },
    negative: [1, 4, 8, 9],
  },
  {
    // The code-shape rules (base()) in a feature hook; the UTIL-03 bans ride inside the scope's own
    // no-restricted-imports (never a second object, RESEARCH Pattern 2). erp/no-query-in-loop is
    // proven in erp-api only: web has no repository.
    scope: 'S2 feature: shape rules',
    path: `src/features/auth/hooks/use-${PROBE}.ts`,
    lines: [
      "import 'lodash';", // 1 no-restricted-imports (UTIL-03)
      'export const ENABLE_X = true;', // 2 erp/flag-naming
      'export async function zzAwaitEach(jobs: readonly Promise<number>[]): Promise<number> {',
      '  let n = 0;',
      '  for (const job of jobs) n += await job;', // 5 no-await-in-loop
      '  return n;',
      '}',
      'export function zzNested(rows: readonly (readonly number[])[], x: number): number {',
      '  let s = 0;',
      '  for (const row of rows) {',
      '    for (const cell of row) s += cell;', // 11 erp/no-nested-loops
      '  }',
      '  if (x > 0) {',
      '    if (x > 1) {',
      '      if (x > 2) s += 1;', // 15 max-depth (a third level)
      '    }',
      '  }',
      '  return s;',
      '}',
      'const t = setTimeout(() => undefined, 0);', // 20 no-restricted-globals (TS-13)
      'const u = globalThis.setInterval(() => undefined, 0);', // 21 no-restricted-properties (TS-13)
      'void [t, u];',
      'export function zzComplex(x: number): number {', // 23 complexity (eleven sequential returns)
      '  if (x === 1) return 1;',
      '  if (x === 2) return 2;',
      '  if (x === 3) return 3;',
      '  if (x === 4) return 4;',
      '  if (x === 5) return 5;',
      '  if (x === 6) return 6;',
      '  if (x === 7) return 7;',
      '  if (x === 8) return 8;',
      '  if (x === 9) return 9;',
      '  if (x === 10) return 10;',
      '  if (x === 11) return 11;',
      '  return 0;',
      '}',
      'export const zzTernary = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);', // 37 no-nested-ternary
      'export function zzElse(x: number): number {',
      '  if (x > 0) {',
      '    return 1;',
      '  } else {', // 41 no-else-return
      '    return 2;',
      '  }',
      '}',
      'export function zzLonely(x: number): number {',
      '  if (x > 0) {',
      '    return 1;',
      '  } else {',
      '    if (x < 0) return -1;', // 49 no-lonely-if
      '  }',
      '  return 0;',
      '}',
      'export type zz_bad_type = number;', // 53 @typescript-eslint/naming-convention (typeLike)
      "export function zzSwitch(k: 'a' | 'b'): number {",
      '  switch (k) {', // 55 @typescript-eslint/switch-exhaustiveness-check
      "    case 'a':",
      '      return 1;',
      '  }',
      '  return 0;',
      '}',
    ],
    expect: {
      tags: ['UTIL-03', 'TS-12', 'TS-13', 'TS-14'],
      ruleIds: [
        'no-restricted-imports',
        'erp/flag-naming',
        'no-await-in-loop',
        'erp/no-nested-loops',
        'max-depth',
        'no-restricted-globals',
        'no-restricted-properties',
        'complexity',
        'no-nested-ternary',
        'no-else-return',
        'no-lonely-if',
        '@typescript-eslint/naming-convention',
        '@typescript-eslint/switch-exhaustiveness-check',
      ],
    },
    negative: [],
  },
  {
    // A door file of src/lib (docSurface) with an undocumented export: TSDoc (QA-06).
    scope: 'S5 src/lib: door surface',
    path: `src/lib/${PROBE}/door.ts`,
    lines: [
      'export function zzUndocumented(): number {', // 1 jsdoc/require-jsdoc
      '  return 1;',
      '}',
    ],
    expect: { tags: [], ruleIds: ['jsdoc/require-jsdoc'] },
    negative: [],
  },
  {
    // A junk-drawer name outside the one allowed shadcn src/lib/utils.ts (UTIL-01).
    scope: 'S5 src/lib: generic file name',
    path: `src/lib/${PROBE}/utils.ts`,
    lines: ['/** Documented, so only the name fires. */', 'export const zzOne = 1;'],
    expect: { tags: ['UTIL-01'], ruleIds: ['erp/no-generic-filename'] },
    negative: [],
  },
  {
    // A helper under utils/ with a loop and no @complexity line (TS-17); documented, so jsdoc is silent.
    scope: 'S5 src/lib: utils/ helper',
    path: `src/lib/${PROBE}/utils/sum.ts`,
    lines: [
      '/** Sums. */',
      'export function zzSum(values: readonly number[]): number {', // 2 erp/require-complexity-note
      '  let s = 0;',
      '  for (const v of values) s += v;',
      '  return s;',
      '}',
    ],
    expect: { tags: ['TS-17'], ruleIds: ['erp/require-complexity-note'] },
    negative: [],
  },
];

/**
 * Real single-file scopes: the file itself must produce zero architecture messages, and the same
 * source with one appended line must fire the named rule (ESLint resolves the scope from `filePath`).
 */
const realFiles = [
  { scope: 'S3 legacy-handoff.ts', path: 'src/features/auth/api/legacy-handoff.ts' },
  { scope: 'S4 http.ts', path: 'src/lib/api/http.ts' },
  { scope: 'S7 server-fetch.ts', path: 'src/lib/api/server-fetch.ts' },
  { scope: 'S24 config/permissions.ts', path: 'src/config/permissions.ts' },
  { scope: 'S25 proxy.ts', path: 'proxy.ts' },
  // S27 the tus door (ADR-0041, M9): the real file imports tus-js-client and stays silent.
  { scope: 'S27 upload-file.ts', path: 'src/lib/api/upload-file.ts' },
];
const INTL_LINE = 'void new Intl.NumberFormat();';

/** The real root proxy, for the two S25 probes below (it is one file, so it has no synthetic probe). */
const PROXY_SOURCE = readFileSync(join(root, 'proxy.ts'), 'utf8');

/**
 * `lintText` probes for the door files (S16, S20–S25): `silent` = no architecture message at all,
 * `tag` = some message must carry that FE/ADR tag, `ruleId` = some message must come from that rule
 * (used where the rule's own message carries no tag, as `no-console` does).
 */
const textProbes = [
  {
    scope: 'S16/S21 log.ts',
    path: 'src/lib/log.ts',
    text: 'export const log = { error: (...a: unknown[]) => console.error(...a) };\n',
    silent: true,
    describe: 'console.error permitted',
  },
  {
    scope: 'S21 log.ts',
    path: 'src/lib/log.ts',
    text: 'export const dev = process.env.NODE_ENV === "development";\n',
    silent: true,
    describe: 'process.env.NODE_ENV permitted',
  },
  {
    scope: 'S22 format.ts',
    path: 'src/lib/i18n/format.ts',
    text: "export const x = new Intl.NumberFormat('en');\n",
    silent: true,
    describe: 'new Intl.NumberFormat permitted',
  },
  {
    scope: 'S22 format.server.ts',
    path: 'src/lib/i18n/format.server.ts',
    text: 'export const x = (d: Date) => d.toLocaleDateString();\n',
    silent: true,
    describe: 'toLocaleDateString permitted',
  },
  {
    scope: 'S22 format.ts',
    path: 'src/lib/i18n/format.ts',
    text: 'export const dev = process.env.NODE_ENV;\n',
    silent: false,
    tag: 'FE-03',
    describe: 'process.env still fires',
  },
  // D-16: the mirror is the ONE home of a clean permission name, and `S_PERMISSION_LITERAL` was
  // FOLDED INTO `S_ALL` rather than added as its own config object — the S1 `fetch` probe below is
  // the proof nothing was replaced (flat config replaces `no-restricted-syntax` options per file).
  {
    scope: 'S24 config/permissions.ts',
    path: 'src/config/permissions.ts',
    text: "export const CODE = 'staff.members.view';\n",
    silent: true,
    describe: 'a clean permission name is permitted in the mirror',
  },
  {
    scope: 'S23 src/config',
    path: 'src/config/navigation.ts',
    text: "export const CODE = 'staff.members.view';\n",
    silent: false,
    tag: 'ADR-0033',
    describe: 'the same name one file away fires',
  },
  {
    scope: 'S1 app/ (S_ALL folded, not replaced)',
    path: 'app/page.tsx',
    text: "export default function P() {\n  void fetch('x');\n  return null;\n}\n",
    silent: false,
    tag: 'FE-09',
    describe: 'the S1 fetch rule still fires after S_PERMISSION_LITERAL joined S_ALL',
  },
  {
    scope: 'S25 proxy.ts',
    path: 'proxy.ts',
    text: `${PROXY_SOURCE}\nconsole.log('gate');\n`,
    silent: false,
    ruleId: 'no-console',
    describe: 'console.log fires on the root proxy (it matched no scope before plan 03.1-04)',
  },
  {
    scope: 'S25 proxy.ts',
    path: 'proxy.ts',
    text: `${PROXY_SOURCE}\nexport const passthrough = (): NextResponse => NextResponse.next();\n`,
    silent: true,
    describe: 'NextResponse.next() is permitted',
  },
  // SF-5's three standing proofs. Each of these paths was outside the typed base (and `types/**`
  // was in no configuration object at all), so an `it.only` or a floating promise there shipped.
  {
    scope: 'S25 next.config.ts',
    path: 'next.config.ts',
    text: "import 'axios';\nexport default {};\n",
    silent: false,
    tag: 'FE-08',
    describe: 'the root build config is in S25 (it matched no scope before SF-5)',
  },
  {
    scope: 'typed base — types/',
    path: 'types/next-testing.d.ts',
    text: 'export const floats = (): void => {\n  Promise.resolve(1);\n};\n',
    silent: false,
    ruleId: '@typescript-eslint/no-floating-promises',
    describe: 'types/ gets the typed base (it was in no scope and no typed base before SF-5)',
  },
  {
    scope: 'typed base — root __tests__/',
    path: '__tests__/proxy.test.ts',
    text: 'export const floats = (): void => {\n  Promise.resolve(1);\n};\n',
    silent: false,
    ruleId: '@typescript-eslint/no-floating-promises',
    describe: 'the root __tests__/ gets the typed base (TESTS matched it, the typed base did not)',
  },
  {
    scope: 'S26 src/hocs',
    path: 'src/hocs/withAuth.tsx',
    text: "import { fetchBranding } from '@/features/branding';\nexport const p = fetchBranding;\n",
    silent: false,
    tag: 'FE-01',
    describe: 'a feature import fires on a HOC (the second layer composes lib and components only)',
  },
  {
    scope: 'S26 src/hocs',
    path: 'src/hocs/withAuth.tsx',
    text: "export function P() {\n  void fetch('x');\n  return null;\n}\n",
    silent: false,
    tag: 'FE-09',
    describe: 'fetch fires on a HOC',
  },
  {
    scope: 'S26 src/hocs',
    path: 'src/hocs/withAuth.tsx',
    text: "import { usePermissions } from '@/lib/auth/use-permissions';\nexport const p = usePermissions;\n",
    silent: true,
    describe: 'a lib hook is permitted — it is what the guards are built on',
  },
  // FE-15 (P_NUQS): URL state has one door. Every path below EXISTS (a probe
  // on a missing path matches no config and a negative probe then passes silently).
  {
    scope: 'S2 feature',
    path: 'src/features/staff/components/StaffList.tsx',
    text: "import { useQueryState } from 'nuqs';\nexport const u = useQueryState;\n",
    silent: false,
    tag: 'FE-15',
    describe: 'nuqs fires in a feature (URL state only through src/lib/url)',
  },
  {
    scope: 'S8 organisms',
    path: 'src/components/organisms/Topbar/Topbar.tsx',
    text: "import { NuqsAdapter } from 'nuqs/adapters/next/app';\nexport const a = NuqsAdapter;\n",
    silent: false,
    tag: 'FE-15',
    describe: 'the nuqs adapter fires in a component',
  },
  {
    scope: 'S1 app/',
    path: 'app/layout.tsx',
    text: "import { NuqsAdapter } from 'nuqs/adapters/next/app';\nexport const a = NuqsAdapter;\n",
    silent: false,
    tag: 'FE-15',
    describe: 'the nuqs adapter fires in app/ (UrlStateProvider mounts it)',
  },
  {
    scope: 'S5 src/lib/url',
    path: 'src/lib/url/use-query-state.ts',
    text: "import { debounce, useQueryStates } from 'nuqs';\nexport const u = [debounce, useQueryStates];\n",
    silent: true,
    describe: 'nuqs is permitted in the door',
  },
  {
    scope: 'S12 src/test',
    path: 'src/test/render.tsx',
    text: "import { NuqsTestingAdapter } from 'nuqs/adapters/testing';\nexport const a = NuqsTestingAdapter;\n",
    silent: true,
    describe: 'the harness may import the nuqs testing adapter',
  },
  {
    scope: 'S12 src/test',
    path: 'src/test/render.tsx',
    text: "import { useQueryStates } from 'nuqs';\nexport const u = useQueryStates;\n",
    silent: false,
    tag: 'FE-15',
    describe: 'the harness may not import the nuqs hooks',
  },
  // P_TUS (ADR-0041, M9): tus-js-client has one door, src/lib/api/upload-file.ts (S27, a real file above).
  {
    scope: 'S2 feature',
    path: 'src/features/staff/components/RoleForm.tsx',
    text: "import { Upload } from 'tus-js-client';\nexport const u = Upload;\n",
    silent: false,
    tag: 'ADR-0041',
    describe: 'tus-js-client fires in a feature (uploads only through src/lib/api/upload-file.ts)',
  },
  {
    scope: 'S5 src/lib',
    path: 'src/lib/api/download-file.ts',
    text: "import { Upload } from 'tus-js-client';\nexport const u = Upload;\n",
    silent: false,
    tag: 'ADR-0041',
    describe: 'tus-js-client fires in another src/lib file',
  },
];

let failures = 0;
const report = (ok, text) => {
  console.log(`${ok ? 'ok     ' : 'FAILED '} ${text}`);
  if (!ok) failures += 1;
};
const posix = (p) => p.split(sep).join('/');

/** Directories the probes create (removed whole in cleanup); existing ones are left alone. */
const createdDirs = [];
const ensureDir = (abs) => {
  const missing = [];
  let dir = abs;
  while (!existsSync(dir)) {
    missing.unshift(dir);
    dir = dirname(dir);
  }
  if (missing.length > 0) {
    createdDirs.push(missing[0]);
    mkdirSync(abs, { recursive: true });
  }
};
const cleanup = () => {
  for (const probe of probes) rmSync(join(root, probe.path), { force: true });
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
};
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

const SOURCE_EXT = /\.(ts|tsx)$/;

/**
 * The folders walked below `root`. `types/` and `__tests__/` join the original three as part of
 * SF-5: both held files that no scope claimed (`types/next-testing.d.ts` was in no configuration
 * object at all, and root `__tests__/**` sat outside the typed base, so it got no
 * `no-floating-promises`).
 */
const WALKED_DIRS = ['app', 'src', '.storybook', 'types', '__tests__'];

/**
 * Root `.ts`/`.tsx` sources, **discovered rather than listed**. This used to read
 * `const ROOT_SOURCES = ['proxy.ts']` — a literal added when `proxy.ts` turned out to be invisible
 * to the walk, which left `next.config.ts` and `reset.d.ts` invisible in
 * exactly the same way. A new root source is now covered without editing this file, which is the
 * whole point of the fix: the defect was the literal, not the missing entry.
 */
const listRootSources = () =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_EXT.test(entry.name))
    .map((entry) => entry.name);

const listSourceFiles = () =>
  [
    ...WALKED_DIRS.filter((top) => existsSync(join(root, top))).flatMap((top) =>
      readdirSync(join(root, top), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && SOURCE_EXT.test(entry.name))
        .map((entry) => posix(relative(root, join(entry.parentPath, entry.name)))),
    ),
    ...listRootSources(),
  ].filter((file) => !file.startsWith('src/components/ui/'));

/**
 * Disjointness: rebuild every scope as a config object carrying only a marker setting. Settings
 * MERGE across matching objects (unlike rule options), so the merged config for a file lists every
 * scope that claims it — the count must be exactly 1 for every source file and every probe.
 */
const checkDisjoint = async (config) => {
  const scopes = config.filter((o) => Array.isArray(o.files) && o.rules?.['no-restricted-imports']);
  const features = readdirSync(join(root, 'src/features'), { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  ).length;
  const expected = 21 + features; // S1, S3–S7, S9–S12, S21–S27 (17) + four layers + one per feature
  report(
    scopes.length === expected,
    `${expected} import/syntax scopes in eslint.config.mjs (found ${scopes.length}; ${features} features)`,
  );
  const markers = scopes.map((s, i) => ({
    files: s.files,
    ignores: s.ignores,
    settings: { [`scope-${i + 1}`]: true },
  }));
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: [
          'app/**/*.{ts,tsx}',
          'src/**/*.{ts,tsx}',
          '.storybook/**/*.{ts,tsx}',
          'types/**/*.{ts,tsx}',
          '__tests__/**/*.{ts,tsx}',
          '*.{ts,tsx}',
        ],
      },
      ...markers,
    ],
  });
  // A file the real config ignores globally (`next-env.d.ts`, which Next regenerates) is not a
  // source this clause can speak for, so it is dropped with the real config's own ignore logic
  // rather than with a second copy of the list.
  const realForIgnores = new ESLint({ cwd: root });
  const walked = [];
  for (const file of listSourceFiles()) {
    if (!(await realForIgnores.isPathIgnored(join(root, file)))) walked.push(file);
  }
  let overlaps = 0;
  const unscoped = [];
  for (const file of walked) {
    const computed = await eslint.calculateConfigForFile(join(root, file));
    const owners = Object.keys(computed?.settings ?? {});
    if (owners.length > 1) {
      overlaps += 1;
      console.log(`  overlap: ${file} is in ${owners.join(', ')}`);
    }
    if (owners.length === 0) unscoped.push(file);
    if (probes.some((p) => p.path === file))
      report(
        owners.length === 1,
        `${file} sits in exactly one scope (${owners.join(', ') || 'none'})`,
      );
  }
  report(overlaps === 0, `no source file is matched by two scopes (${overlaps} overlaps)`);
  report(
    unscoped.length === 0,
    `every walked source file sits in a scope (${WALKED_DIRS.join(', ')} and the root sources)${unscoped.length > 0 ? ` — unscoped: ${unscoped.join(', ')}` : ''}`,
  );
  // One option set per file: the real config's computed `no-restricted-imports` for each probe.
  const real = new ESLint({ cwd: root });
  for (const probe of probes) {
    const computed = await real.calculateConfigForFile(join(root, probe.path));
    const entry = computed?.rules?.['no-restricted-imports'];
    report(
      Array.isArray(entry) && entry.length === 2 && typeof entry[1] === 'object',
      `[${probe.scope}] one no-restricted-imports option set (${Array.isArray(entry) ? `${(entry[1]?.paths ?? []).length} paths, ${(entry[1]?.patterns ?? []).length} patterns` : 'none'})`,
    );
  }
};

const archMessages = (result) => (result?.messages ?? []).filter((m) => isArchRule(m.ruleId));
/** What a probe's `expect` may match: the architecture rules and the shape rules. */
const expectedMessages = (result) =>
  (result?.messages ?? []).filter((m) => isArchRule(m.ruleId) || SHAPE_RULE_IDS.has(m.ruleId));

const checkProbes = async () => {
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintFiles(probes.map((p) => join(root, p.path)));
  for (const probe of probes) {
    const result = results.find((r) => posix(relative(root, r.filePath)) === probe.path);
    const messages = archMessages(result);
    const expected = expectedMessages(result);
    const fatal = (result?.messages ?? []).filter((m) => m.fatal);
    report(
      fatal.length === 0,
      `[${probe.scope}] probe parses (${fatal.map((m) => m.message).join('; ') || 'no fatal'})`,
    );
    if (probe.expect.unusedDirective === true) {
      report(
        (result?.messages ?? []).some((m) => m.message.includes(UNUSED_DIRECTIVE)),
        `[${probe.scope}] reports an unused eslint-disable directive (linterOptions)`,
      );
    }
    for (const tag of probe.expect.tags) {
      report(
        expected.some((m) => m.message.includes(tag)),
        `[${probe.scope}] fires ${tag}`,
      );
    }
    for (const ruleId of probe.expect.ruleIds) {
      report(
        expected.some((m) => m.ruleId === ruleId),
        `[${probe.scope}] fires ${ruleId}`,
      );
    }
    for (const ruleId of probe.expect.absentRuleIds ?? []) {
      report(!messages.some((m) => m.ruleId === ruleId), `[${probe.scope}] never fires ${ruleId}`);
    }
    for (const line of probe.negative) {
      const onLine = messages.filter((m) => m.line === line);
      report(
        onLine.length === 0,
        `[${probe.scope}] silent on permitted line ${line} \`${probe.lines[line - 1].trim()}\`${onLine.length > 0 ? ` — got ${onLine.map((m) => m.ruleId).join(', ')}` : ''}`,
      );
    }
  }
};

const checkRealFiles = async () => {
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintFiles(realFiles.map((f) => join(root, f.path)));
  for (const file of realFiles) {
    const result = results.find((r) => posix(relative(root, r.filePath)) === file.path);
    const messages = archMessages(result);
    report(
      messages.length === 0,
      `[${file.scope}] the real file produces no architecture message${messages.length > 0 ? ` — got ${messages.map((m) => `${m.ruleId}@${m.line}`).join(', ')}` : ''}`,
    );
    const source = readFileSync(join(root, file.path), 'utf8');
    const [appended] = await eslint.lintText(`${source}\n${INTL_LINE}\n`, {
      filePath: join(root, file.path),
    });
    report(
      archMessages(appended).some((m) => m.message.includes(FE26)),
      `[${file.scope}] an appended \`${INTL_LINE}\` fires ${FE26}`,
    );
  }
  for (const probe of textProbes) {
    const [result] = await eslint.lintText(probe.text, { filePath: join(root, probe.path) });
    const messages = archMessages(result);
    if (probe.silent) {
      report(
        messages.length === 0,
        `[${probe.scope}] ${probe.describe}${messages.length > 0 ? ` — got ${messages.map((m) => m.ruleId).join(', ')}` : ''}`,
      );
    } else if (probe.ruleId !== undefined) {
      report(
        messages.some((m) => m.ruleId === probe.ruleId),
        `[${probe.scope}] ${probe.describe} (${probe.ruleId})`,
      );
    } else {
      report(
        messages.some((m) => m.message.includes(probe.tag)),
        `[${probe.scope}] ${probe.describe} (${probe.tag})`,
      );
    }
  }
};

try {
  // The probes go on disk BEFORE the config loads: eslint.config.mjs lists src/features at load time.
  for (const probe of probes) {
    const abs = join(root, probe.path);
    ensureDir(dirname(abs));
    writeFileSync(abs, `${probe.lines.join('\n')}\n`);
  }
  const { default: config } = await import('../eslint.config.mjs');
  await checkDisjoint(config);
  await checkProbes();
  await checkRealFiles();
} finally {
  cleanup();
}

const leftovers = [
  ...createdDirs.map((d) => posix(relative(root, d))),
  ...probes.map((p) => p.path),
].filter((p) => existsSync(join(root, p)));
report(
  leftovers.length === 0,
  `no probe left in the tree${leftovers.length > 0 ? ` — ${leftovers.join(', ')}` : ''}`,
);

if (failures > 0) {
  console.error(`architecture lint: ${failures} expectation(s) failed`);
  process.exit(1);
}
console.log('architecture lint: every scope fires and every permitted construct is silent');
