'use client';

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { NavItemLink } from '@/components/molecules/NavItemLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuSub,
} from '@/components/ui/sidebar';
import { NAVIGATION, SETUP_NAVIGATION, type NavItem } from '@/config/navigation';
import { activeTrailOf } from '@/config/routes';
import { direction } from '@/i18n/direction';
import { toSupportedLocale } from '@/i18n/locales';
import { usePermissions } from '@/lib/auth/use-permissions';
import { useClearOnEscape } from '@/lib/hooks/use-clear-on-escape';
import { matchesSearch } from '@/lib/i18n/search-text';
import { cn } from '@/lib/utils';

/**
 * The toggle in the Topbar points `aria-controls` at this id, and `PageShell` puts it on the
 * wrapper it renders around this component. It cannot go on the primitive: that hardcodes its
 * outer element, and below `md` it renders a CLOSED sheet whose content is not in the DOM at all,
 * so the id — and the region — would vanish at exactly the width where the toggle matters most.
 * A dangling `aria-controls` is a critical `aria-valid-attr-value`, which the headless axe caught.
 */
export const SIDEBAR_ID = 'app-sidebar';

type Panel = 'main' | 'setup';

/** The menu skeleton's text bars cycle through these widths, so it reads as a menu (UI-SPEC § Skeletons). */
const SKELETON_ROW_WIDTHS = [
  'w-[60%]',
  'w-[75%]',
  'w-[50%]',
  'w-[70%]',
  'w-[60%]',
  'w-[75%]',
  'w-[50%]',
  'w-[70%]',
  'w-[60%]',
  'w-[75%]',
] as const;

/** The tree a member may see: a hidden row goes, and so does a container left with no visible child. */
function gateTree(items: readonly NavItem[], allowed: (item: NavItem) => boolean): NavItem[] {
  return items.flatMap((item) => {
    if (!allowed(item)) return [];
    if (item.children === undefined) return [item];
    const children = gateTree(item.children, allowed);
    return children.length === 0 ? [] : [{ ...item, children }];
  });
}

/** A matching row stays whole (all its visible children); a container stays for a matching descendant. */
function searchTree(
  items: readonly NavItem[],
  query: string,
  label: (item: NavItem) => string,
): NavItem[] {
  return items.flatMap((item) => {
    if (matchesSearch(label(item), query)) return [item];
    const children = item.children === undefined ? [] : searchTree(item.children, query, label);
    return children.length === 0 ? [] : [{ ...item, children }];
  });
}

const countRows = (items: readonly NavItem[]): number =>
  items.reduce(
    (total, item) => total + (item.children === undefined ? 1 : countRows(item.children)),
    0,
  );

/**
 * Perfex's `aside.php`, rebuilt: the brand block, a search box, the main menu in declared order,
 * and the Setup entry at the bottom.
 *
 * - **Offcanvas, never an icon rail (D-10).** On desktop it is open by default and the hamburger
 *   slides it out and back; below `md` the primitive renders it as the `Sheet` drawer. The rail was
 *   finding 2: its `<details>` containers opened inside 48 px as unlabelled icons.
 * - **Inline-start side.** `side` follows the locale's direction, so in Arabic it docks on the
 *   right. `dir` itself is NOT passed: `app/layout.tsx` sets it on `<html>`, the drawer portals
 *   under it, and the Radix `DirectionProvider` mirrors the menus (FE-20, UI-SPEC choice 31).
 * - **Setup is a second panel**, not a flattened submenu, because Perfex's own `setup_menu.php` is
 *   a separate view: flattening it would put 34 configuration items in the middle of the working
 *   menu and break the one mental model a Perfex user already has.
 * - **Search (D-38)** runs over the GATED tree only, so it can never reveal a row the member cannot
 *   see (T-3.2-28), matches translated labels through `matchesSearch` (no `RegExp` from input),
 *   and covers both panels. While searching every shown container is forced open; the containers'
 *   own open state is untouched, so clearing restores it.
 * - **Loading (D-39).** Until `/me` answers, the menu is its own skeleton — never a message and
 *   never the ungated rows alone.
 * - **The route leads (D-16).** The panel, the open ancestors and the active item follow the route's
 *   covering item (`/setup/expense-categories/new` marks Expenses Categories inside an open Finance
 *   on the Setup panel), derived in render; the user's switch and toggles win until the route changes.
 *   The marked row scrolls itself into the menu's own scroll area, above the Setup footer, when it
 *   mounts or the mark moves (`NavItemLink keepInView`, a ref, no effect); never while searching.
 *
 * Every item is filtered by `usePermissions().canAny`, which short-circuits to visible for an
 * administrator exactly as the api does (ADR-0033 d.4). This is PRESENTATION ONLY: the api guards
 * every call regardless, so hiding a row is a courtesy, never a control.
 */
export function Sidebar({ brand }: { readonly brand?: ReactNode }): ReactElement {
  const t = useTranslations('shell');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const dir = direction(toSupportedLocale(useLocale()));
  const { isAdmin, canAny, isLoading } = usePermissions();
  const [chosen, setChosen] = useState<{ readonly panel: Panel; readonly at: string } | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Readonly<Record<string, boolean>>>({});
  const searching = query !== '';

  /** An admin-only row needs the flag; every other row needs any of its codes (or has none). */
  const allowed = (item: NavItem): boolean =>
    (item.adminOnly === true ? isAdmin : true) && canAny(item.permission);
  const label = (item: NavItem): string => t(item.labelKey.replace('shell.', ''));

  // D-16, derived in render (no effect): the covering item's trail picks the panel, opens its
  // ancestors and marks its leaf. A trail the member cannot see opens and marks nothing. A panel
  // the user chose holds on the route it was chosen on; a saved container toggle always wins.
  const routeTrail = activeTrailOf(pathname);
  const trail = routeTrail.every(allowed) ? routeTrail : [];
  const trailIds = new Set(trail.map((item) => item.id));
  const activeId = trail.at(-1)?.id;
  const routePanel: Panel =
    trail[0] !== undefined && SETUP_NAVIGATION.includes(trail[0]) ? 'setup' : 'main';
  const panel = chosen !== null && chosen.at === pathname ? chosen.panel : routePanel;

  const clear = (): void => {
    setQuery('');
  };

  // Esc in a non-empty box clears it and nothing else; in the mobile drawer the NEXT Esc closes it.
  const searchRef = useRef<HTMLInputElement>(null);
  useClearOnEscape(searchRef, clear);

  // The `<details>` open state is React's, so a search can force it and clearing can restore it.
  // A toggle the browser reports while searching is the forced open itself (or a click inside the
  // search results) and is not saved: the saved state is what clearing restores. Nor is a toggle
  // that only echoes the state React rendered (the browser reports a route's opened ancestor, or a
  // restore, after the commit): only the user's own click moves `open` away from `shown`.
  const onContainerToggle = (
    event: SyntheticEvent<HTMLDetailsElement>,
    id: string,
    shown: boolean,
  ): void => {
    if (searching) return;
    const isOpen = event.currentTarget.open;
    if (isOpen === shown) return;
    setOpen((saved) => ({ ...saved, [id]: isOpen }));
  };

  const renderItem = (item: NavItem): ReactElement => {
    if (item.children === undefined) {
      return (
        <li key={item.id}>
          {/* The marked row keeps itself in view (UAT 4.2 gap 3), except during a search, which shows matches. */}
          <NavItemLink
            item={item}
            active={item.id === activeId}
            keepInView={item.id === activeId && !searching}
          />
        </li>
      );
    }
    const shown = open[item.id] ?? trailIds.has(item.id);
    return (
      <li key={item.id}>
        <details
          open={searching || shown}
          onToggle={(event) => {
            onContainerToggle(event, item.id, shown);
          }}
        >
          <NavItemLink item={item} active={false} />
          <SidebarMenuSub className="mt-1">{item.children.map(renderItem)}</SidebarMenuSub>
        </details>
      </li>
    );
  };

  const group = (id: 'main-menu' | 'setup-menu', items: readonly NavItem[]): ReactElement => {
    const name = id === 'main-menu' ? t('main_menu') : t('setup_menu');
    return (
      <nav key={id} id={id} aria-label={name} data-testid={id}>
        <SidebarGroup>
          <SidebarGroupLabel>{name}</SidebarGroupLabel>
          <SidebarMenu className="gap-1">{items.map(renderItem)}</SidebarMenu>
        </SidebarGroup>
      </nav>
    );
  };

  // The header is a flex column, which stretches its child to the full width: a logo would be
  // distorted to 272 × 32 whatever its shape. The slot sizes the brand by its height instead and
  // keeps its natural aspect ratio, for any customer's logo, wide, square or tall (W0-05).
  const header = (
    <SidebarHeader className="h-12 justify-center px-2 py-0 [&>*]:h-8 [&>*]:w-auto [&>*]:max-w-full [&>*]:self-start [&>*]:object-contain">
      {brand}
    </SidebarHeader>
  );

  if (isLoading) {
    return (
      <SidebarPrimitive collapsible="offcanvas" side={dir === 'rtl' ? 'right' : 'left'}>
        {header}
        <SidebarContent role="status" aria-busy="true" data-testid="sidebar-loading">
          <span className="sr-only">{tc('loading')}</span>
          <div className="p-2">
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="flex flex-col gap-1 p-2">
            <div className="flex h-8 items-center px-2">
              <Skeleton className="h-3 w-24" />
            </div>
            {SKELETON_ROW_WIDTHS.map((width, index) => (
              <div
                // A fixed list of placeholders that never reorders: the index is its identity.
                key={index}
                data-testid="sidebar-skeleton-row"
                className="flex h-9 items-center gap-2 px-4"
              >
                <Skeleton className="size-4" />
                <Skeleton className={cn('h-3.5', width)} />
              </div>
            ))}
          </div>
        </SidebarContent>
      </SidebarPrimitive>
    );
  }

  const main = gateTree(NAVIGATION, allowed);
  const setup = gateTree(SETUP_NAVIGATION, allowed);
  const mainHits = searching ? searchTree(main, query, label) : main;
  const setupHits = searching ? searchTree(setup, query, label) : setup;
  const count = countRows(mainHits) + countRows(setupHits);

  return (
    <SidebarPrimitive collapsible="offcanvas" side={dir === 'rtl' ? 'right' : 'left'}>
      {header}
      <SidebarGroup className="py-0">
        <div className="relative">
          <Icon
            name="magnifying-glass"
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            ref={searchRef}
            placeholder={t('search_menu')}
            aria-label={t('search_menu')}
            data-testid="menu-search"
            className="h-8 bg-background ps-8 pe-8"
          />
          {searching ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tc('clear_search')}
              onClick={clear}
              className="absolute end-0 top-0"
            >
              <Icon name="xmark" />
            </Button>
          ) : null}
        </div>
      </SidebarGroup>

      <SidebarContent>
        {!searching
          ? group(panel === 'main' ? 'main-menu' : 'setup-menu', panel === 'main' ? main : setup)
          : null}
        {searching && mainHits.length > 0 ? group('main-menu', mainHits) : null}
        {searching && setupHits.length > 0 ? group('setup-menu', setupHits) : null}
        {searching && count === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-2">
            <p data-testid="menu-no-match" className="text-sm text-muted-foreground">
              {t('no_menu_match', { query })}
            </p>
            <Button type="button" variant="ghost" data-testid="menu-no-match-clear" onClick={clear}>
              {tc('clear_search')}
            </Button>
          </div>
        ) : null}
        <p data-testid="menu-result-count" aria-live="polite" className="sr-only">
          {searching ? t('menu_result_count', { count }) : ''}
        </p>
      </SidebarContent>

      {searching ? null : (
        <SidebarFooter>
          <button
            type="button"
            data-testid="setup-panel-toggle"
            aria-expanded={panel === 'setup'}
            aria-controls={panel === 'setup' ? 'setup-menu' : 'main-menu'}
            onClick={() => {
              setChosen({ panel: panel === 'main' ? 'setup' : 'main', at: pathname });
            }}
            className="flex h-9 w-full items-center gap-2 rounded-md px-4 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Icon name="cog" />
            <span>{panel === 'main' ? t('setup_menu') : t('main_menu')}</span>
          </button>
        </SidebarFooter>
      )}
    </SidebarPrimitive>
  );
}
