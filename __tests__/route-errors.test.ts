// @vitest-environment happy-dom
import { readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '../src/messages/common/en.json';
import { renderWithProviders, screen, userEvent } from '../src/test/render';
import GlobalError from '../app/global-error';

/**
 * Every route-segment error boundary Next owns under `app/` (FE-05), found on disk so a new one is
 * held to the same contract: an alert with "Something went wrong." and "Try again", which calls
 * `reset`; the error's message and digest are NEVER rendered (T-3-12).
 */
interface BoundaryProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

const APP = join(process.cwd(), 'app');
const BOUNDARIES = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .filter((file) => basename(file) === 'error.tsx')
  .map((file) => relative(process.cwd(), join(APP, file)).split('\\').join('/'))
  .sort();
const COMMON = commonEn.common;
const SECRET = 'SQLSTATE[42S22] column tblstaff.password';
const DIGEST = 'digest-4021';
const failure = (): BoundaryProps['error'] => Object.assign(new Error(SECRET), { digest: DIGEST });

describe('the route error boundaries (FE-05, T-3-12)', () => {
  it('finds the root boundary and one per route folder', () => {
    expect(BOUNDARIES).toContain('app/error.tsx');
    expect(BOUNDARIES).toContain('app/(shell)/setup/staff/error.tsx');
    expect(BOUNDARIES.length).toBeGreaterThan(5);
  });

  it.each(BOUNDARIES)('%s: plain words and Try again, never the error itself', async (file) => {
    const boundary = (await import(/* @vite-ignore */ join(process.cwd(), file))) as {
      readonly default: ComponentType<BoundaryProps>;
    };
    const reset = vi.fn();
    const { container } = renderWithProviders(
      createElement(boundary.default, { error: failure(), reset }),
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(COMMON.something_went_wrong);
    expect(container.textContent).not.toContain(SECRET);
    expect(container.textContent).not.toContain(DIGEST);
    await userEvent.click(screen.getByRole('button', { name: COMMON.try_again }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('app/global-error.tsx: its own document in the default locale, the plain words only', () => {
    const html = renderToStaticMarkup(
      createElement(GlobalError, { error: failure(), reset: vi.fn() }),
    );
    expect(html).toContain('<html lang="en"');
    expect(html).toContain(COMMON.something_went_wrong);
    expect(html).toContain(COMMON.try_again);
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain(DIGEST);
  });
});
