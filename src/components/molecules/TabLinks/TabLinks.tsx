'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/components/atoms/Icon';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface TabLink {
  readonly id: string;
  readonly label: string;
  /** A path with exactly one leading `/` (an app route, or `/admin/...` when legacy); anything else is not rendered. */
  readonly href: string;
  /** A Perfex page: a plain `<a>` with the 12px external-link glyph and the hidden "opens in Perfex". */
  readonly legacy?: boolean;
}

export interface TabLinksProps {
  /** The `<nav>`'s accessible name, e.g. `t('record_sections', { name })`. */
  readonly label: string;
  readonly links: readonly TabLink[];
  /**
   * Entries behind a "More" menu button at the row's inline end (the settings' Perfex pages), after
   * the tabs that do not fit the row.
   */
  readonly more?: readonly TabLink[];
  /** More entries that come before the tabs in the page's order (Perfex's General): first in the menu. */
  readonly moreLeading?: readonly TabLink[];
  /** Default `usePathname()`; matched exactly. */
  readonly currentHref?: string;
}

/** One leading slash, never `//` or `/\` (both read as another host): T-4.2-44. */
const SAME_ORIGIN_PATH = /^\/(?![/\\])/;
const sameOrigin = (links: readonly TabLink[]): readonly TabLink[] =>
  links.filter((link) => SAME_ORIGIN_PATH.test(link.href));

const LINK =
  'flex h-9 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 text-sm hover:bg-muted/50';
const CURRENT = 'border-foreground font-semibold';
const MORE = 'h-9 shrink-0 rounded-none px-4';
/** The measuring copy draws its labels from `data-label`, so no text is duplicated in the page. */
const COPY_LABEL = 'before:content-[attr(data-label)]';

/** The inline sizes the row is split by (logical: the same in a right-to-left page). */
interface RowSizes {
  /** Each tab's, in order. */
  readonly tabs: readonly number[];
  readonly row: number;
  readonly more: number;
  /** Between two tabs. */
  readonly gap: number;
}

/**
 * The tabs the row shows, as indexes in order: all of them when they fit (beside More when it holds
 * entries anyway); otherwise as many as fit before More, in order, and the current one always: when
 * it would not fit, it takes the place of the last shown tab (or more of them, until it fits).
 */
function fitTabs(sizes: RowSizes, current: number, moreHasEntries: boolean): readonly number[] {
  const width = (tabs: readonly number[]): number =>
    tabs.reduce((sum, index) => sum + (sizes.tabs[index] ?? 0), 0) +
    sizes.gap * Math.max(tabs.length - 1, 0);
  const all = sizes.tabs.map((_, index) => index);
  if (width(all) <= sizes.row - (moreHasEntries ? sizes.more : 0)) return all;
  const room = sizes.row - sizes.more;
  const shown: number[] = [];
  for (const index of all) {
    if (width([...shown, index]) > room) break;
    shown.push(index);
  }
  if (current < 0 || shown.includes(current)) return shown;
  while (shown.length > 0 && width([...shown, current]) > room) shown.pop();
  return [...shown, current];
}

const inlineSize = (entry: ResizeObserverEntry): number => entry.borderBoxSize[0]?.inlineSize ?? 0;

/**
 * The ids of the tabs the row shows (`null` until measured: all of them, the row clipping the
 * rest). One ResizeObserver watches the row and the invisible copy of every tab and of More, so a
 * resize, a locale change and the web font arriving all split it again; never the window's width.
 * A ref callback, not an effect (FE-04).
 */
function useTabSplit(
  ids: readonly string[],
  current: number,
  moreHasEntries: boolean,
): {
  readonly shown: readonly string[] | null;
  readonly measure: (nav: HTMLElement | null) => (() => void) | undefined;
} {
  const [shown, setShown] = useState<readonly string[] | null>(null);
  // One string, so the ref callback (and its observer) changes only when the tabs do.
  const idKey = ids.join('\n');
  const measure = useCallback(
    (nav: HTMLElement | null): (() => void) | undefined => {
      if (nav === null || typeof ResizeObserver === 'undefined') return undefined;
      const tabIds = idKey.split('\n');
      const copies = [...nav.querySelectorAll('[data-tab-measure]')];
      const more = nav.querySelector('[data-more-measure]');
      const sizes = new Map<Element, number>();
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) sizes.set(entry.target, inlineSize(entry));
        const row = sizes.get(nav);
        const tabs = copies.map((copy) => sizes.get(copy) ?? Number.NaN);
        const moreSize = more === null ? undefined : sizes.get(more);
        if (row === undefined || moreSize === undefined || tabs.some(Number.isNaN)) return;
        const gap = Number.parseFloat(getComputedStyle(copies[0]?.parentElement ?? nav).columnGap);
        const next = fitTabs(
          { tabs, row, more: moreSize, gap: Number.isNaN(gap) ? 0 : gap },
          current,
          moreHasEntries,
        ).map((index) => tabIds[index] ?? '');
        // Before the frame paints (the observer runs after layout), so a cut row is never drawn.
        flushSync(() => {
          setShown((previous) =>
            previous !== null && previous.join('\n') === next.join('\n') ? previous : next,
          );
        });
      });
      for (const target of [nav, ...copies, ...(more === null ? [] : [more])]) {
        observer.observe(target);
      }
      return () => {
        observer.disconnect();
      };
    },
    [idKey, current, moreHasEntries],
  );
  return { shown, measure };
}

/** A Perfex entry's text: the label, the 12px glyph and the hidden "opens in Perfex". */
function LegacyLabel({ label }: { readonly label: string }): ReactNode {
  const t = useTranslations('shell');
  return (
    <>
      {label}
      <Icon name="external-link" className="size-3" />
      <span className="sr-only">{t('opens_in_perfex')}</span>
    </>
  );
}

/**
 * The row at its natural width, invisible and out of the layout (inside a zero-size clipping box),
 * for the observer to measure: each tab as it is drawn (the current one at weight 600), and More.
 */
function MeasuringCopy({
  tabs,
  current,
}: {
  readonly tabs: readonly TabLink[];
  readonly current: string;
}): ReactElement {
  const t = useTranslations('common');
  return (
    <div aria-hidden="true" className="invisible absolute size-0 overflow-hidden">
      <div className="flex w-max gap-2">
        {tabs.map((link) => (
          <span
            key={link.id}
            data-tab-measure=""
            data-label={link.label}
            className={cn(LINK, COPY_LABEL, link.href === current && CURRENT)}
          >
            {link.legacy === true ? <Icon name="external-link" className="size-3" /> : null}
          </span>
        ))}
        <span
          data-more-measure=""
          data-label={t('more')}
          className={cn(buttonVariants({ variant: 'ghost' }), MORE, COPY_LABEL)}
        >
          <Icon name="chevron-down" />
        </span>
      </div>
    </div>
  );
}

/** "More": a menu of links at the row's inline end. */
function MoreMenu({ links }: { readonly links: readonly TabLink[] }): ReactElement {
  const t = useTranslations('common');
  return (
    // Non-modal: a modal menu aria-hides the page while its trigger stays focusable (axe aria-hidden-focus).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" className={MORE}>
          {t('more')}
          <Icon name="chevron-down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {links.map((link) => (
          <DropdownMenuItem key={link.id} asChild>
            {link.legacy === true ? (
              <a href={link.href}>
                <LegacyLabel label={link.label} />
              </a>
            ) : (
              <Link href={link.href}>{link.label}</Link>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * K5: a `<nav>` of real links in one horizontal row, the record tabs of a record page
 * and the settings tabs (lead 2026-10-03: horizontal at every width, never a second sidebar). Every
 * tab is a permalink (D-21), so these are links and never the `ui/tabs.tsx` widget. The current link
 * has `aria-current="page"`, weight 600 and a 2px foreground underline, never the brand colour.
 *
 * - **Priority overflow (quick 261003-ovf):** the row never scrolls and never cuts a tab. It shows
 *   as many tabs as fit, in order; the rest move into the More menu, after `moreLeading` and before
 *   `more`, so the menu keeps the page's order. The current tab always stays in the row (when it
 *   would not fit, it takes the last shown tab's place). Sizes come from a ResizeObserver on the row
 *   and on an invisible copy of its tabs (logical inline sizes), never from the window's width. A
 *   moved tab is still a link, inside the menu; with nothing moved and no entries, there is no More.
 * - **Perfex entries** are plain `<a>` with the 12px external-link glyph and the visually hidden
 *   `shell.opens_in_perfex`, as `NavItemLink` draws them (no prefetch of a Perfex page).
 * - **A dirty form** guards these links for free: `useUnsavedChanges` intercepts every in-app `<a>`
 *   click in the capture phase, and these are ordinary anchors.
 * - **Hrefs (T-4.2-44)**: only a path with exactly one leading slash is rendered; hrefs come from
 *   feature constants, and anything else (`//host`, `/\host`, a scheme) is dropped.
 */
export function TabLinks({
  label,
  links,
  more = [],
  moreLeading = [],
  currentHref,
}: TabLinksProps): ReactElement {
  const pathname = usePathname();
  const current = currentHref ?? pathname;
  const tabs = sameOrigin(links);
  const leading = sameOrigin(moreLeading);
  const trailing = sameOrigin(more);
  const { shown, measure } = useTabSplit(
    tabs.map((link) => link.id),
    tabs.findIndex((link) => link.href === current),
    leading.length + trailing.length > 0,
  );
  const inRow = shown === null ? tabs : tabs.filter((link) => shown.includes(link.id));
  const menu = [...leading, ...tabs.filter((link) => !inRow.includes(link)), ...trailing];
  return (
    <nav ref={measure} aria-label={label} className="relative flex border-b">
      <MeasuringCopy tabs={tabs} current={current} />
      {/* relative: the sr-only text of a legacy link stays inside the clipping row (no page overflow at 375). */}
      <ul className="relative flex min-w-0 flex-1 gap-2 overflow-hidden">
        {inRow.map((link) => {
          const isCurrent = link.href === current;
          const shared = {
            href: link.href,
            'aria-current': isCurrent ? ('page' as const) : undefined,
            className: cn(LINK, isCurrent && CURRENT),
          };
          return (
            <li key={link.id} className="shrink-0">
              {link.legacy === true ? (
                <a {...shared}>
                  <LegacyLabel label={link.label} />
                </a>
              ) : (
                <Link {...shared}>{link.label}</Link>
              )}
            </li>
          );
        })}
      </ul>
      {menu.length > 0 ? <MoreMenu links={menu} /> : null}
    </nav>
  );
}
