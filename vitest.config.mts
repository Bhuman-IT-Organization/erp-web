import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { coverage, test } from '@erp/configs/vitest/base';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // `__tests__/` at the root holds the tests of the root files Next owns (`proxy.ts`); everything
  // else lives in a `__tests__/` folder beside its code under `src/` (FE-05).
  test: {
    ...test,
    include: ['src/**/*.test.{ts,tsx}', '__tests__/*.test.ts'],
    // One suite-wide timeout (quick 260927-scq): the Sidebar Esc flow, the StaffMemberForm "More
    // details" flow and the em-dash guard over every source file pass alone in about 1 s but timed
    // out at the default 5 s under full-suite parallel load. A real hang still fails, after 15 s.
    // The two per-test 20 s exceptions stay.
    testTimeout: 30_000,
    coverage: {
      ...coverage,
      // Explicit: the default counts only files a test imported, so an untested file would be invisible (Pitfall 10).
      include: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
      exclude: [
        'src/components/ui/**',
        '**/*.stories.tsx',
        '**/__tests__/**',
        'src/test/**',
        '**/*.d.ts',
      ],
      // Today's measured values, floored (D-10, erp-docs 02-testing TEST-04). Raise only; never lower.
      thresholds: {
        lines: 92,
        branches: 91,
        'src/features/**/schemas/**': { lines: 97, branches: 90 },
        'src/features/**/hooks/**': { lines: 100, branches: 100 },
        'src/lib/hooks/**': { lines: 98, branches: 91 },
        'src/lib/api/**': { lines: 100, branches: 93 },
        'src/lib/auth/**': { lines: 100, branches: 100 },
        'src/hocs/**': { lines: 100, branches: 95 },
        'src/config/**': { lines: 100, branches: 94 },
        'src/lib/i18n/**': { lines: 97, branches: 94 },
      },
    },
  },
});
