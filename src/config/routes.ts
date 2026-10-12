import { flattenNavigation, type NavItem } from './navigation';
import type { PermissionCode } from './permissions';
import { isAdminGate, routeGateOf } from './route-gates';

/**
 * Breadcrumbs and route guards, both DERIVED from `navigation.ts` — never hand-written per page
 * (FE-16). A screen that needs a different trail changes the menu, not a second list.
 *
 * The trail for this phase reads `Setup > Staff`, `Setup > Staff > New` and
 * `Setup > Staff > <record>`; the record crumb is `dynamic`, so the component renders a fixed-width
 * `skeleton` until the record's own name arrives and never invents a label for it (UI-SPEC).
 */
export interface Crumb {
  /** A key in the `shell` namespace, or — for a dynamic crumb — the key of its placeholder. */
  readonly labelKey: string;
  /** Absent on the leaf: the last crumb is `aria-current="page"` and not a link. */
  readonly href?: string;
  /** The record's own name replaces the label once loaded. */
  readonly dynamic?: true;
}

/** `shell.new` — the only crumb this phase adds that has no menu item behind it. */
const NEW_CRUMB_KEY = 'shell.new';
/** The placeholder a dynamic crumb carries until the record's name is known. */
const RECORD_CRUMB_KEY = 'shell.record';

/** `/setup/staff/12?q=x` -> `['setup', 'staff', '12']`; a trailing slash and a query string are not segments. */
const segmentsOf = (pathname: string): readonly string[] =>
  (pathname.split('?')[0] ?? '').split('/').filter((segment) => segment !== '');

/**
 * The declared item whose href is exactly this path, at any depth of either export. Should two
 * entries open one Node page, the module the path's first segment names owns the trail, else the
 * first declared.
 */
const itemFor = (pathname: string): NavItem | undefined => {
  const matches = flattenNavigation().filter((item) => item.href === pathname);
  const owner = segmentsOf(pathname)[0] ?? '';
  return matches.find((item) => item.module === owner) ?? matches[0];
};

/** The declared parent of `item`, or undefined when it is a root of either export. */
const parentOf = (item: NavItem): NavItem | undefined =>
  flattenNavigation().find((candidate) => (candidate.children ?? []).includes(item));

/** The trail of declared items ending at `item`, outermost first. */
const trailFor = (item: NavItem): readonly NavItem[] => {
  const parent = parentOf(item);
  return parent === undefined ? [item] : [...trailFor(parent), item];
};

/** `/x/<id>/<tab>`: the list's trail plus the record, never for `/x/new/<tab>` or an unknown list. */
const recordTabCrumbs = (segments: readonly string[]): readonly Crumb[] => {
  const [tab, record, ...listPath] = [...segments].reverse();
  const list = listPath.length > 0 ? itemFor(`/${listPath.reverse().join('/')}`) : undefined;
  if (tab === undefined || list === undefined || record === 'new') return [];
  return [...toCrumbs(trailFor(list), true), { labelKey: RECORD_CRUMB_KEY, dynamic: true }];
};

/**
 * The entry whose `covers` holds the longest prefix of the path, on a segment boundary (plan
 * 04.2-28): a page with no entry of its own takes the trail of the entry it is reached from.
 */
const coversItem = (pathname: string): NavItem | undefined => {
  const path = `/${segmentsOf(pathname).join('/')}`;
  let best: { readonly item: NavItem; readonly length: number } | undefined;
  for (const item of flattenNavigation()) {
    const length = coveredLength(item, path);
    if (length > (best?.length ?? 0)) best = { item, length };
  }
  return best?.item;
};

/** The length of the longest of `item`'s `covers` prefixes that holds `path`, 0 when none does. */
function coveredLength(item: NavItem, path: string): number {
  const hits = (item.covers ?? []).filter(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  return Math.max(0, ...hits.map((prefix) => prefix.length));
}

/** A container has no href and is never a link; the leaf is `aria-current="page"` and never a link. */
const toCrumbs = (items: readonly NavItem[], leafIsLink: boolean): readonly Crumb[] =>
  items.map((item, index) => {
    const isLeaf = index === items.length - 1 && !leafIsLink;
    return item.href === undefined || isLeaf
      ? { labelKey: item.labelKey }
      : { labelKey: item.labelKey, href: item.href };
  });

export interface BreadcrumbOptions {
  /**
   * The page adds its own crumbs after the trail (`useBreadcrumbCrumbs`, plan 04.2-28): the trail's
   * last entry is then a link to its href (a container stays text), and the trail ends at the deepest
   * menu entry covering the path: the page's crumbs replace the route's own new, record or tab leaf.
   */
  readonly linkLast?: boolean;
}

/**
 * The breadcrumb trail for a pathname. An exact menu match yields its trail; `/x/new` and `/x/<id>`
 * yield the parent's trail plus one leaf; a record's tab `/x/<id>/<tab>` ends at the record (the tab
 * row names the tab). A path only an entry's `covers` explains ends at that entry, with no leaf of
 * its own (plan 04.2-28). An unknown path yields no crumbs: the caller renders no breadcrumb bar
 * rather than a wrong one.
 */
export function breadcrumbsFor(
  pathname: string,
  { linkLast = false }: BreadcrumbOptions = {},
): readonly Crumb[] {
  if (segmentsOf(pathname).length === 0) return [];
  // The page names what follows its menu entry: no route leaf of our own.
  return linkLast ? toCrumbs(activeTrailOf(pathname), true) : routeCrumbs(pathname);
}

/** The trail with the route's own leaf, for a page that adds no crumbs (`breadcrumbsFor`). */
function routeCrumbs(pathname: string): readonly Crumb[] {
  const segments = segmentsOf(pathname);
  const exact = itemFor(`/${segments.join('/')}`);
  if (exact !== undefined) return toCrumbs(trailFor(exact), false);
  const parent = itemFor(`/${segments.slice(0, -1).join('/')}`);
  if (parent === undefined) {
    const tab = recordTabCrumbs(segments);
    if (tab.length > 0) return tab;
    const covering = coversItem(pathname);
    return covering === undefined ? [] : toCrumbs(trailFor(covering), false);
  }
  const last = segments.at(-1) ?? '';
  const leaf: Crumb =
    last === 'new' ? { labelKey: NEW_CRUMB_KEY } : { labelKey: RECORD_CRUMB_KEY, dynamic: true };
  return [...toCrumbs(trailFor(parent), true), leaf];
}

/**
 * The deepest declared item covering this path: `/setup/staff/12` resolves to `/setup/staff`'s item;
 * with no href match, the entry whose `covers` holds the longest prefix (plan 04.2-28).
 */
const coveringItem = (pathname: string): NavItem | undefined => {
  const segments = segmentsOf(pathname);
  for (let depth = segments.length; depth > 0; depth -= 1) {
    const item = itemFor(`/${segments.slice(0, depth).join('/')}`);
    if (item !== undefined) return item;
  }
  return coversItem(pathname);
};

/** The trail of the deepest menu item covering `pathname`, outermost first; [] when none covers it (D-16). */
export function activeTrailOf(pathname: string): readonly NavItem[] {
  const item = coveringItem(pathname);
  return item === undefined ? [] : trailFor(item);
}

/**
 * The permission a route needs before it renders (FE-16).
 *
 * A **migrated** route answers from `ROUTE_GATES` — the one declaration, mirrored in
 * `./route-gates.ts` and verified against the api's own decorators — so this function and the api
 * can no longer disagree (migration-lead decision 2026-09-24). A route gated on the administrator
 * flag answers `undefined` here, because the flag is not a permission code (ADR-0034 d.2):
 * `routeIsAdminOnly` is its reader. A **Perfex** path falls back to the deepest menu item covering
 * it, which is where Perfex's own gate is recorded.
 *
 * `undefined` means "no permission is declared", which `usePermissions().canAny` reads as visible: a
 * path this function says nothing about is not secured by it, and the api guards the call regardless.
 */
export function routePermission(
  pathname: string,
): PermissionCode | readonly PermissionCode[] | undefined {
  const gate = routeGateOf(pathname);
  if (gate !== undefined) return isAdminGate(gate) ? undefined : gate;
  return coveringItem(pathname)?.permission;
}

/**
 * True when the route is administrator-only (ADR-0034 d.2): `ROUTE_GATES` for a migrated route, the
 * deepest covering menu item's `adminOnly` for a Perfex path. The flag itself is read from the
 * session's `/api/v1/auth/me` payload by the screen — never from a permission code, and never from
 * this map, which is a declaration and not a control.
 */
export function routeIsAdminOnly(pathname: string): boolean {
  const gate = routeGateOf(pathname);
  if (gate !== undefined) return isAdminGate(gate);
  return coveringItem(pathname)?.adminOnly === true;
}
