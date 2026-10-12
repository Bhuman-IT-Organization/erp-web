'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { ICON_NAMES, Icon, type IconName } from '@/components/atoms/Icon';
import type { NavItem } from '@/config/navigation';
import { cn } from '@/lib/utils';

export interface NavItemLinkProps {
  readonly item: NavItem;
  readonly active: boolean;
  /**
   * Opt-in: when true, the row scrolls itself into its nearest scroll container once mounted
   * (`scrollIntoView({ block: 'nearest', inline: 'nearest' })` from a ref callback; a no-op where
   * `scrollIntoView` is missing, as in happy-dom). The Sidebar passes `keepInView={active}`.
   */
  readonly keepInView?: boolean;
}

/** `item.icon` is a registry key by contract, but the type is a plain string: narrow before use. */
const iconName = (name: string | undefined): IconName | null =>
  name !== undefined && (ICON_NAMES as readonly string[]).includes(name)
    ? (name as IconName)
    : null;

/**
 * The `keepInView` ref: ONE module-level function, so React calls it when the row mounts or when
 * another row takes it (the mark moved), never on a mere re-render. `nearest` moves the sidebar's
 * own scroll area only as far as needed, and leaves a row already in view alone (UAT 4.2 gap 3).
 */
function scrollIntoNearest(row: HTMLElement | null): void {
  // `in`, not `?.`: the DOM types say it always exists, but a test DOM may lack it.
  if (row !== null && 'scrollIntoView' in row)
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Row metrics (D-37, dashboard-01 spacing): 36 px, 16 px inline padding, 8 px icon gap. A row
 * inside the primitive's sub-menu rail is 32 px — sized by where it sits, so the contract stays
 * two props wide.
 */
const ROW =
  'flex h-9 w-full items-center gap-2 rounded-md border-s-4 border-s-transparent px-4 text-sm in-data-[sidebar=menu-sub]:h-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

/**
 * One row of the sidebar: a link, or a disclosure for a Perfex container that has no href.
 *
 * Presentations this component owns, each of them a parity decision rather than styling:
 *
 * - **active** — the `sidebar-accent` fill AND weight 600 AND a 4px inline-start marker AND
 *   `aria-current="page"`. The weight and the marker are the channels that do not rely on colour;
 *   the text stays `sidebar-accent-foreground`, never brand-coloured (UI-SPEC choice 8). A legacy
 *   row is marked the same way, and keeps itself in view, when a Node page it `covers` is open
 *   (plan 04.2-28).
 * - **legacy** — an item whose page is still Perfex's is a plain `<a href>`, never `next/link`
 *   (D-22): no prefetch of ~197 Perfex pages and no double request per click. It is otherwise
 *   presentationally IDENTICAL to a Node item apart from a trailing external-link glyph and a
 *   visually-hidden `shell.opens_in_perfex`. No colour and no opacity change: a member must never
 *   read "legacy" as "broken" or "disabled" (shell README, `## Dropped on purpose`).
 *
 * There is no collapsed mode: the icon rail is gone (D-10), so a label is always visible.
 */
export function NavItemLink({ item, active, keepInView = false }: NavItemLinkProps): ReactElement {
  const t = useTranslations('shell');
  const glyph = iconName(item.icon);
  const label = t(item.labelKey.replace('shell.', ''));
  const ref = keepInView ? scrollIntoNearest : undefined;

  const body = (
    <>
      {glyph === null ? null : <Icon name={glyph} />}
      {/*
        <bdi> (direction from its own text, FE-20 keeps dir= in the layout): an English label on an
        Arabic page ends in its ellipsis after its last word, never before its first (UAT 4.6).
      */}
      <bdi className="truncate">{label}</bdi>
      {item.legacy === true ? (
        <>
          <Icon name="external-link" className="ms-auto size-3" />
          <span className="sr-only">{t('opens_in_perfex')}</span>
        </>
      ) : null}
    </>
  );

  // A container Perfex registers with no href discloses its children instead of navigating.
  // `<summary>` must sit inside a `<details>`: the Sidebar wraps it (and owns the open state), and
  // so do the story and the test. The chevron points inline-end (`rtl:` flips it, a direction
  // variant, not a physical class — FE-20) and turns down while its `<details>` is open.
  if (item.href === undefined) {
    return (
      <summary data-testid={`nav-${item.id}`} className={cn(ROW, 'cursor-pointer list-none')}>
        {body}
        <Icon
          name="chevron-right"
          className="ms-auto size-3 rtl:rotate-180 in-open:rotate-90 rtl:in-open:rotate-90"
        />
      </summary>
    );
  }

  // Every row carries the 4px transparent marker, so a link's label lines up with a container's.
  const className = cn(
    ROW,
    active &&
      'border-s-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground',
  );

  if (item.legacy === true) {
    return (
      <a
        ref={ref}
        href={item.href}
        data-testid={`nav-${item.id}`}
        aria-current={active ? 'page' : undefined}
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <Link
      ref={ref}
      href={item.href}
      data-testid={`nav-${item.id}`}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      {body}
    </Link>
  );
}
