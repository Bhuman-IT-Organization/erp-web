import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

/** The widths a page in the shell is proven at, the sidebar open (lead 2026-10-03). */
export type ShellWidth = 1024 | 1280 | 1366;

/** A story's declared viewport at one width; `check:a11y` audits the story at that width only. */
export function shellViewport(width: ShellWidth) {
  const value = `desktop${String(width)}`;
  return {
    parameters: {
      viewport: {
        options: {
          [value]: {
            name: `Desktop ${String(width)}`,
            styles: { width: `${String(width)}px`, height: '800px' },
          },
        },
      },
    },
    globals: { viewport: { value, isRotated: false } },
  } as const;
}

/**
 * How many lines a text takes: the distinct tops of the rectangles Ranges over its text nodes draw
 * (only the text: an icon beside it, as in a badge, sits at another top without adding a line).
 */
function lineCount(element: HTMLElement): number {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const tops = new Set<number>();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const range = doc.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
  }
  return tops.size;
}

const isShown = (element: Element): boolean => element.getClientRects().length > 0;

/** The first match the page draws (a hidden copy, such as a closed menu's, has no rectangles). */
function shown(canvasElement: HTMLElement, text: string): HTMLElement {
  // The page collapses a line break to a space, as Testing Library's matcher does.
  const match = within(canvasElement).getAllByText(text.replace(/\s+/g, ' ')).find(isShown);
  if (match === undefined) throw new Error(`no "${text}" shown on the page`);
  return match;
}

/** The box a text wraps in: the text's own element, or its nearest ancestor that is not inline. */
function wrapBox(element: HTMLElement): HTMLElement {
  const view = element.ownerDocument.defaultView ?? window;
  let box = element;
  while (view.getComputedStyle(box).display === 'inline' && box.parentElement !== null) {
    box = box.parentElement;
  }
  return box;
}

/** Half a pixel of rounding between two rectangles drawn by the same layout. */
const EPSILON = 0.5;

/** `inner` lies inside `outer` along the inline axis (left and right: the same check in RTL). */
async function expectInside(inner: DOMRect, outer: DOMRect): Promise<void> {
  await expect(inner.left).toBeGreaterThanOrEqual(outer.left - EPSILON);
  await expect(inner.right).toBeLessThanOrEqual(outer.right + EPSILON);
}

/** Every Edit and row-menu button of every table row lies inside its table's visible frame. */
async function expectRowActionsInFrame(canvasElement: HTMLElement): Promise<void> {
  for (const table of within(canvasElement).queryAllByRole('table')) {
    const frame = table.parentElement;
    if (frame === null) throw new Error('a table without its frame');
    const controls = [
      ...table.querySelectorAll(
        '[data-testid="row-actions-inline"] :is(a, button), [data-testid="row-actions-menu"] button',
      ),
    ].filter(isShown);
    for (const control of controls) {
      await expectInside(control.getBoundingClientRect(), frame.getBoundingClientRect());
    }
  }
}

/** A page's tab row: its nav's accessible name and every tab it must reach (in the row or in More). */
export interface ShellTabs {
  readonly nav: string;
  readonly labels: readonly string[];
}

/**
 * The tab row never scrolls and never cuts a tab: each link it shows lies inside the row, and every
 * tab is in the row or in the More menu (opened and closed again only when one is not in the row).
 */
async function expectTabsReachable(canvasElement: HTMLElement, tabs: ShellTabs): Promise<void> {
  const nav = within(canvasElement).getByRole('navigation', { name: tabs.nav });
  const row = nav.querySelector('ul');
  if (row === null) throw new Error(`no tab row in "${tabs.nav}"`);
  // The row splits once its observer has measured it: wait for that (a scrolling row never settles).
  await waitFor(() => expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth));
  const inRow = [...row.querySelectorAll('a')].filter(isShown);
  for (const link of inRow) {
    await expectInside(link.getBoundingClientRect(), row.getBoundingClientRect());
  }
  const rowText = inRow.map((link) => link.textContent);
  const missing = tabs.labels.filter((label) => !rowText.some((text) => text.startsWith(label)));
  if (missing.length === 0) return;
  const more = within(nav).getByRole('button', { name: 'More' });
  await userEvent.click(more);
  const menu = await screen.findByRole('menu');
  const menuText = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
  await userEvent.keyboard('{Escape}');
  // Closed, and its trigger blurred once the menu has handed focus back (no ring in a screenshot).
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  await waitFor(() => {
    more.blur();
    return expect(more.ownerDocument.activeElement).not.toBe(more);
  });
  for (const label of missing) {
    await expect(menuText.filter((text) => text.startsWith(label))).toHaveLength(1);
  }
}

/** What a shell page shows besides its frame: texts that keep one line or wrap, headers, tabs. */
export interface ShellTexts {
  /** Each keeps one line. */
  readonly short?: readonly string[];
  /** Each wraps in a box between 160 and 320px wide (EditableTable's long-text rule). */
  readonly long?: readonly string[];
  /** Column headers the table shows (Perfex's default columns, never hidden to fit). */
  readonly headers?: readonly string[];
  /**
   * Column headers that lie whole inside the table's visible frame before any scrolling: the
   * columns the page exists for (a header the frame clips still counts as visible to `headers`).
   */
  readonly inFrame?: readonly string[];
  readonly tabs?: ShellTabs;
  /**
   * `false` for a page outside the shell (4.7 UI-SPEC G3): the page draws
   * no sidebar, and each `long` text wraps in a box at least 160px wide that stays inside the
   * viewport (its column is the page's, not the shell's 320px). Every other proof is the same.
   */
  readonly shell?: boolean;
}

/** `inner` lies inside the viewport along the inline axis. */
async function expectInViewport(inner: DOMRect, view: Window): Promise<void> {
  await expect(inner.left).toBeGreaterThanOrEqual(-EPSILON);
  await expect(inner.right).toBeLessThanOrEqual(view.innerWidth + EPSILON);
}

/**
 * The layout proofs of a real page rendered inside `PageShell` (lead 2026-10-03, after the settings
 * review; quick 261003-ovf): the page never scrolls sideways; every row's Edit and row menu stay in
 * the table's visible frame (the actions column is sticky, so a wide table may scroll inside its
 * frame); no tab is cut and every tab is reachable; one filled primary button at most; each short
 * value keeps one line; each long text wraps in a box between 160 and 320px wide. With
 * `shell: false` the same proofs hold for a page outside the shell (see `ShellTexts.shell`).
 */
export async function expectFitsShell(
  canvasElement: HTMLElement,
  texts: ShellTexts = {},
): Promise<void> {
  const doc = canvasElement.ownerDocument;
  const view = doc.defaultView ?? window;
  const inShell = texts.shell !== false;
  await expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth);
  if (!inShell) await expect(doc.querySelector('[data-slot="sidebar"]')).toBeNull();
  await expectRowActionsInFrame(canvasElement);
  const primaries = [...canvasElement.querySelectorAll('a, button')].filter(
    (control) => control.classList.contains('bg-primary') && isShown(control),
  );
  await expect(primaries.length).toBeLessThanOrEqual(1);
  for (const text of texts.short ?? []) {
    await expect(lineCount(shown(canvasElement, text))).toBe(1);
  }
  for (const text of texts.long ?? []) {
    const rect = wrapBox(shown(canvasElement, text)).getBoundingClientRect();
    await expect(rect.width).toBeGreaterThanOrEqual(160);
    if (inShell) await expect(rect.width).toBeLessThanOrEqual(320);
    else await expectInViewport(rect, view);
  }
  for (const header of texts.headers ?? []) {
    await expect(
      within(canvasElement).getByRole('columnheader', { name: (name) => name.startsWith(header) }),
    ).toBeVisible();
  }
  for (const header of texts.inFrame ?? []) {
    const cell = within(canvasElement).getByRole('columnheader', {
      name: (name) => name.startsWith(header),
    });
    const frame = cell.closest('table')?.parentElement ?? null;
    if (frame === null) throw new Error(`no table frame around "${header}"`);
    await expectInside(cell.getBoundingClientRect(), frame.getBoundingClientRect());
  }
  if (texts.tabs !== undefined) await expectTabsReachable(canvasElement, texts.tabs);
}
