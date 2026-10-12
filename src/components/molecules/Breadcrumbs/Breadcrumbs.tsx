'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactElement } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { breadcrumbsFor } from '@/config/routes';
import type { PageCrumb } from '@/lib/hooks/use-breadcrumb-label';

export interface BreadcrumbsProps {
  /**
   * The record's own name, once the page has loaded it; the dynamic crumb shows a skeleton until.
   * `null` = the page could not load the record: the leaf reads the crumb's placeholder (D-39).
   */
  readonly recordLabel?: string | null;
  /**
   * The page's own crumbs after the route trail (`useBreadcrumbCrumbs`, plan 04.2-28): while any is
   * given, the trail's last entry links to its href and these follow it, the last one the leaf.
   */
  readonly pageCrumbs?: readonly PageCrumb[] | null;
}

/** A page crumb links only to a same-origin path: the TabLinks rule (T-4.2-44, T-4.2-148). */
const SAME_ORIGIN_PATH = /^\/(?![/\\])/;

/** One rendered crumb: its text, its link when it has one, or `pending` while its label loads. */
interface Shown {
  readonly key: string;
  readonly text: string;
  readonly href?: string;
  readonly pending: boolean;
  /** A page's own crumb (a record's code or name): it may shrink like the leaf (04.6-14). */
  readonly page?: boolean;
}

/**
 * A crumb before the leaf: a link, or text for a menu container (Setup > Email), which has no page.
 * Each ends in an ellipsis once its item shrinks (only when the trail does not fit, below).
 */
function parentOf(crumb: Shown): ReactElement {
  const fit = 'block truncate';
  if (crumb.href === undefined) return <span className={fit}>{crumb.text}</span>;
  return (
    <BreadcrumbLink href={crumb.href} className={fit}>
      {crumb.text}
    </BreadcrumbLink>
  );
}

/**
 * The breadcrumb trail, derived from `pathname` through `breadcrumbsFor` — never hand-written per
 * page, so a new screen gets its trail by editing the menu (FE-16). A page under a path the menu
 * only `covers` may add its own crumbs after it (`pageCrumbs`); each is React text, and its href
 * renders as a link only when it is a same-origin path, else as text.
 *
 * This renders the `Breadcrumb` primitive, which is itself a `<nav>` carrying the label. The
 * PageShell therefore does NOT wrap it in a second `<nav>`: nested landmarks are an accessibility
 * fault, and the interfaces block's sketch is satisfied by the label living here instead.
 */
export function Breadcrumbs({ recordLabel, pageCrumbs }: BreadcrumbsProps): ReactElement | null {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const extra = pageCrumbs ?? [];
  const crumbs = breadcrumbsFor(pathname, { linkLast: extra.length > 0 });
  if (crumbs.length === 0) return null;

  const shown: readonly Shown[] = [
    ...crumbs.map((crumb, index): Shown => {
      const label = t(crumb.labelKey.replace('shell.', ''));
      // A dynamic crumb has no text until the page loads the record: a fixed-width skeleton
      // holds the space so the trail does not jump when the name arrives.
      const dynamic = crumb.dynamic === true;
      return {
        key: crumb.labelKey + String(index),
        text: dynamic ? (recordLabel ?? label) : label,
        pending: dynamic && recordLabel === undefined,
        ...(crumb.href === undefined ? {} : { href: crumb.href }),
      };
    }),
    ...extra.map((crumb, index): Shown => {
      const { href } = crumb;
      const safe = href !== undefined && SAME_ORIGIN_PATH.test(href);
      return {
        key: `page-${String(index)}`,
        text: crumb.label ?? t('record'),
        pending: crumb.label === undefined,
        page: true,
        ...(safe ? { href } : {}),
      };
    }),
  ];

  return (
    // One line in the 48px top bar at every width: the trail never wraps; the leaf (often a long
    // record name) and a page's linked crumb before it (the record's code on its edit page, 04.6-14
    // review at 375) shrink and end in an ellipsis. The menu crumbs keep their words while the trail
    // fits; when it does not, every crumb shrinks by its own width (a long one most), so a long menu
    // label at 375 ends in an ellipsis instead of running under the account menu (04.8-09 review).
    <Breadcrumb aria-label={t('breadcrumb_nav')} data-testid="breadcrumbs" className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {shown.map((crumb, index) => {
          const isLeaf = index === shown.length - 1;
          // The separator is the item's SIBLING in the <ol>, never inside its <li>: the browser's
          // parser closes an open <li> at the next <li>, so a nested one made the server HTML differ
          // from React's tree and every page with a parent crumb hit React #418 (UAT 4.2 gap 1).
          return (
            <Fragment key={crumb.key}>
              <BreadcrumbItem className="min-w-0">
                {crumb.pending ? (
                  <Skeleton className="h-4 w-24" data-testid="breadcrumb-skeleton" />
                ) : isLeaf ? (
                  // `BreadcrumbPage` renders the leaf as a span carrying `aria-current="page"` and
                  // no href: the leaf is never a link, which is the whole point of the trail.
                  <BreadcrumbPage className="truncate">{crumb.text}</BreadcrumbPage>
                ) : (
                  parentOf(crumb)
                )}
              </BreadcrumbItem>
              {isLeaf ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
