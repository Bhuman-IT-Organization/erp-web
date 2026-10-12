'use client';

import { createContext, useContext, useEffect } from 'react';

/**
 * The setter of `PageShell`'s record label. The value is React's stable state setter, so a page
 * never re-renders when the label changes; `null` outside a shell.
 */
export const BreadcrumbLabelContext = createContext<
  ((label: string | null | undefined) => void) | null
>(null);

/**
 * A page names its record for the breadcrumb's dynamic leaf (WR-10). The layout owns `PageShell`
 * and the page is only its `children`, so the page publishes the name through this context rather
 * than a prop. Plans 07/08 call it from the record page with the loaded record's display name —
 * `useBreadcrumbLabel(member ? fullName : undefined)` — and `undefined` keeps the skeleton.
 *
 * Three states: `undefined` = still loading (the skeleton); `null` = there is no name to wait for
 * (the read failed), so the leaf reads the crumb's placeholder (`shell.record`); a string = the
 * record's name. A detail page publishes `null` once its page-level failure shows (D-39: never a
 * skeleton that never ends). A generated feature's detail page whose route gets a menu item must
 * follow the same rule.
 *
 * The value is rendered as React text inside `BreadcrumbPage`, never as HTML. Outside a shell it
 * is a no-op and does not throw. `Breadcrumbs`' own `recordLabel` prop stays the pure input: the
 * shell passes this label to it, and a story or test may pass one directly.
 */
export function useBreadcrumbLabel(label: string | null | undefined): void {
  const set = useContext(BreadcrumbLabelContext);
  // Cleared on unmount, so the next page's leaf starts from the skeleton, never a stale name.
  // effect: subscribe: publish this page's record label to the shell's breadcrumb for as long as the page is mounted (WR-10)
  useEffect(() => {
    if (set === null) return undefined;
    set(label);
    return () => {
      set(undefined);
    };
  }, [set, label]);
}

/**
 * One crumb a page adds after the route trail: already translated; the last one is never a link. The
 * label follows `useBreadcrumbLabel`: `undefined` renders the fixed-width skeleton (still loading),
 * `null` reads `shell.record` ("Record", the read failed), a string is shown as text.
 */
export interface PageCrumb {
  readonly label: string | null | undefined;
  readonly href?: string;
}

/**
 * The setter of `PageShell`'s page crumbs, beside `BreadcrumbLabelContext` (whose setter type stays
 * as every record page and test provides it); `null` outside a shell.
 */
export const BreadcrumbCrumbsContext = createContext<
  ((crumbs: readonly PageCrumb[] | null) => void) | null
>(null);

/**
 * Optional (plan 04.2-28): the page's own crumbs after the route trail, for a path the menu only
 * `covers` (for example `/setup/sample/new` passes
 * [{ label: 'Sample', href: '/setup/sample' }, { label: 'New' }]). While any is set, the
 * trail's last entry becomes a link (its href; a container stays unlinked) and the page's crumbs
 * follow it, the last unlinked. Cleared on unmount. Never used together with a dynamic record leaf.
 * Pass a constant or memoised array: a new array each render publishes again.
 */
export function useBreadcrumbCrumbs(crumbs: readonly PageCrumb[] | null): void {
  const set = useContext(BreadcrumbCrumbsContext);
  // effect: subscribe: publish this page's crumbs to the shell's breadcrumb for as long as the page is mounted (plan 04.2-28)
  useEffect(() => {
    if (set === null) return undefined;
    set(crumbs);
    return () => {
      set(null);
    };
  }, [set, crumbs]);
}
