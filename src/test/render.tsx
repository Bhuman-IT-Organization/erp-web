import { cleanup, render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';
import { direction } from '@/i18n/direction';
import type { Locale } from '@/i18n/locales';
import { SwrProvider } from '@/lib/api/SwrProvider';
import { DirectionProvider } from '@/lib/i18n/DirectionProvider';
import { messagesFor } from '@/messages';

// Testing Library unmounts after each test only when `afterEach` is a global; Vitest here has no
// `globals`, so the harness registers it for every file that imports it.
afterEach(cleanup);

/**
 * The house DOM harness. The CALLING test file opts into the DOM with
 * `// @vitest-environment happy-dom` on its first line (the default environment stays `node`).
 * Renders under the same providers `app/layout.tsx` mounts, for a chosen locale, and mirrors what
 * the layout does to `<html>` (`lang`, `dir`) — so a test must not assert those two; it asserts
 * what the component under test rendered.
 *
 * The URL is nuqs's testing adapter (FE-15): `searchParams` seeds it (`'?q=abc&limit=50'`) and
 * `onUrlUpdate` receives every URL write (`queryString`, `options.history`). By default the
 * adapter forgets a write, so once nuqs flushes it re-reads the unchanged URL: `hasMemory: true`
 * keeps the writes, which a screen test needs to type in a search box (plan 03.2-13's race). The one
 * Radix direction provider takes `dir` from the locale, as the layout does.
 */
export interface RenderOptions {
  readonly locale?: Locale;
  readonly searchParams?: string;
  readonly onUrlUpdate?: OnUrlUpdateFunction;
  readonly hasMemory?: boolean;
}

export function renderWithProviders(
  ui: ReactElement,
  { locale = 'en', searchParams = '', onUrlUpdate, hasMemory = false }: RenderOptions = {},
): RenderResult {
  document.documentElement.lang = locale;
  document.documentElement.dir = direction(locale);
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <DirectionProvider dir={direction(locale)}>
        <NuqsTestingAdapter
          searchParams={searchParams}
          hasMemory={hasMemory}
          {...(onUrlUpdate === undefined ? {} : { onUrlUpdate })}
        >
          <SwrProvider>{ui}</SwrProvider>
        </NuqsTestingAdapter>
      </DirectionProvider>
    </NextIntlClientProvider>,
  );
}

export { screen, within, waitFor } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

/** A physical-direction Tailwind token (the logical `ms-/me-/ps-/pe-/text-start/text-end` family replaces it). */
export const PHYSICAL_CLASS =
  /(^|[ ]|:)(-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r|scroll-ml|scroll-mr|inset-l|inset-r)-|text-left|text-right|float-left|float-right)/;

/**
 * Physical tokens the GENERATED primitives in `src/components/ui/` emit (never edited, ADR-0002).
 * They ride on every element the primitive renders, so the RTL assertion cannot tell them from ours
 * by position; they are listed here by name instead.
 *
 * `components.json` now has `rtl: true` and every primitive was regenerated under it (plan
 * 03.1-04), which removed `ui/button.tsx`'s two icon-slot entries — the list this file used to
 * carry. What survives is a different kind and always will: `sheet` and `sidebar` take a
 * `side="left" | "right"` prop, so their anchoring classes are guarded by `data-[side=left|right]`
 * and are physical BY DEFINITION — the class is the side the caller asked for, not a direction the
 * locale should flip. The shell passes no `side`, so it takes the default and these never apply to
 * it; they are listed so a primitive's own markup cannot fail an `ar` assertion.
 *
 * Nothing else may be added here. A physical class in OUR code is a bug (FE-20), and a new entry
 * means a primitive changed: regenerate first, and only then extend this list with the file, the
 * class and the reason it cannot be logical.
 */
export const UI_PHYSICAL_RESIDUE: readonly string[] = [
  // ui/sheet.tsx: the off-canvas panel's edge, chosen by the `side` prop
  'data-[side=left]:left-0',
  'data-[side=right]:right-0',
  // ui/sidebar.tsx: the same, plus the collapsed off-canvas offset and the drag rail's handle
  'data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]',
  'data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
  'group-data-[side=left]:-right-4',
  'group-data-[side=right]:left-0',
];

/** Every className token under `root` that matches `PHYSICAL_CLASS`, minus `UI_PHYSICAL_RESIDUE` (for the RTL assertions). */
export function physicalClassesIn(root: HTMLElement): string[] {
  const hits: string[] = [];
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const className = el.getAttribute('class') ?? '';
    for (const token of className.split(/\s+/)) {
      if (token !== '' && PHYSICAL_CLASS.test(token) && !UI_PHYSICAL_RESIDUE.includes(token)) {
        hits.push(token);
      }
    }
  }
  return hits;
}
