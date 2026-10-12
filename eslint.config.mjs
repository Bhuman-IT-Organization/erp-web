import { defineConfig } from 'eslint/config';
import { base } from '@erp/configs/eslint/base';
import { frontend } from '@erp/configs/eslint/frontend';

export default defineConfig(
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      'storybook-static/**',
      // Stryker output (test:mutation), per machine; a crashed run leaves its sandbox behind.
      '.stryker-tmp/**',
      'reports/**',
      'next-env.d.ts',
      // shadcn primitives are never edited (ADR-0002), so they are never linted.
      'src/components/ui/**',
      // The shared configs/ (identical in erp-api and erp-web); linted nowhere.
      'configs/**',
    ],
  },
  ...base({
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}', 'proxy.ts'],
    tests: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.stories.tsx', 'src/test/**'],
    // swr-config.ts owns SWR's retry timer (onErrorRetry, delay from CLIENT_TIMINGS, injectable for tests): a door, not a hook.
    timerDoors: ['src/lib/hooks/**', 'src/lib/api/swr-config.ts'],
    docSurface: ['src/lib/**/*.{ts,tsx}'],
    allowGenericFilenames: ['src/lib/utils.ts'],
  }),
  ...frontend({ root: import.meta.dirname }),
);
