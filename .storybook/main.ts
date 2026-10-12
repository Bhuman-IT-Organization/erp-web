import type { StorybookConfig } from '@storybook/nextjs-vite';

/**
 * Storybook 10.6 on the Next.js + Vite framework (ADR-0002; FE-02: a story per component).
 * Installed by hand, never through the init wizard (it may shell out to npm and adds example
 * stories this repo does not want). `@storybook/addon-vitest` is NOT here: its peer is Vitest
 * ^3 || ^4 and this repo is on 5; until it supports Vitest 5, `storybook build --test` is the
 * smoke and Testing Library holds behaviour. The a11y addon runs axe on every story and
 * `preview.tsx` makes a violation a failure.
 */
const config: StorybookConfig = {
  framework: {
    name: '@storybook/nextjs-vite',
    options: { nextConfigPath: '../next.config.ts' },
  },
  addons: ['@storybook/addon-a11y'],
  stories: ['../src/**/*.stories.tsx'],
  staticDirs: ['../public'],
};

export default config;
