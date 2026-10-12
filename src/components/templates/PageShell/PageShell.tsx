'use client';

import { useTranslations } from 'next-intl';
import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { ApiUnreachableBanner } from '@/components/organisms/ApiUnreachableBanner';
import { SIDEBAR_ID, Sidebar } from '@/components/organisms/Sidebar';
import { Topbar } from '@/components/organisms/Topbar';
import { SidebarProvider } from '@/components/ui/sidebar';
import {
  BreadcrumbCrumbsContext,
  BreadcrumbLabelContext,
  type PageCrumb,
} from '@/lib/hooks/use-breadcrumb-label';
import { useSession } from '@/lib/hooks/use-session';

export interface PageShellProps {
  readonly children: ReactNode;
  /**
   * The customer's logo, rendered by the route group layout — `src/components/**` may not import
   * a feature (FE-01) and only `src/features/branding/**` may render an `<img>` (FE-17). A
   * divergence from the plan's `<interfaces>`.
   */
  readonly brand?: ReactNode;
  /**
   * Whether the desktop sidebar starts open. `app/(shell)/layout.tsx` reads the primitive's
   * `sidebar_state` cookie on the server, so a member who hid it keeps it hidden across reloads
   * with no hydration flash. Absent = open (D-10). Below `md` the drawer always starts closed.
   */
  readonly defaultOpen?: boolean;
}

/** 288 px, dashboard-01's width (D-37, UI-SPEC choice 2); the primitive's default is 256 px. */
const SIDEBAR_WIDTH_STYLE = { '--sidebar-width': 'calc(var(--spacing) * 72)' } as CSSProperties;

/**
 * The page grid every migrated screen sits in. It renders no business content.
 *
 * Every shell page bootstraps the session here (`useSession()`, WR-08), so a page not wrapped in
 * `withAuth` still gets its in-memory token and a real menu; `withAuth` joins the same bootstrap.
 *
 * A page names its record for the dynamic breadcrumb with `useBreadcrumbLabel` (WR-10): the shell
 * provides `BreadcrumbLabelContext` with its state setter (stable, so pages do not re-render) and
 * passes the label to `Breadcrumbs`. A page under a path the menu only `covers` adds its own crumbs
 * the same way, with `useBreadcrumbCrumbs` through `BreadcrumbCrumbsContext` (plan 04.2-28).
 *
 * Landmark order is the contract: the skip link is the FIRST focusable element on the page, then
 * the sidebar, then `<header>` (the toggle, the breadcrumb trail, the account menu), then exactly one `<main id="main">` for
 * the skip link to land on.
 *
 * `SidebarInset` is deliberately not used: it renders a `<main>` of its own, which would put the
 * header and the breadcrumbs inside the main landmark. One `<main>`, and the header outside it.
 * The header is sticky (top-0, z-20 above the content and the bottom-pinned pager and save bar,
 * below dialogs, the drawer, menus and the skip link at z-50, on a solid background); its height is
 * `--page-header-height` in `app/globals.css`, which shell pages also use as `scroll-padding-top`.
 *
 * `SidebarProvider` is mounted here, once, so the Topbar's toggle and the Sidebar share one state.
 * The brand renders in the sidebar header (UI-SPEC § Sidebar density), not the topbar (D-09).
 * `dir` is NOT set here — direction is the locale's, set once in `app/layout.tsx` (FE-20).
 */
export function PageShell({ children, brand, defaultOpen }: PageShellProps): ReactElement {
  const t = useTranslations('common');
  useSession();
  const [recordLabel, setRecordLabel] = useState<string | null | undefined>();
  const [pageCrumbs, setPageCrumbs] = useState<readonly PageCrumb[] | null>(null);
  return (
    <BreadcrumbLabelContext.Provider value={setRecordLabel}>
      <BreadcrumbCrumbsContext.Provider value={setPageCrumbs}>
        <SidebarProvider defaultOpen={defaultOpen ?? true} style={SIDEBAR_WIDTH_STYLE}>
          <a
            href="#main"
            data-testid="skip-link"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
          >
            {t('skip_to_content')}
          </a>
          {/*
          The toggle's `aria-controls` must resolve at every width. Below `md` the sidebar primitive
          renders a CLOSED sheet whose content is not in the DOM, so the id lives on this wrapper,
          which is always present and always contains the sidebar. Found by the headless axe run.
        */}
          <div id={SIDEBAR_ID}>
            <Sidebar brand={brand} />
          </div>
          {/*
          min-w-0: this column is a flex item beside the sidebar, and min-width auto would size it to
          its widest content (a table of long values), pushing the page past the viewport. With it
          the column takes the room left, and a wide table scrolls inside its own frame.
        */}
          <div className="flex min-h-svh w-full min-w-0 flex-col">
            {/* The api-unreachable banner in the content column, never under the sidebar (lead 2026-10-07). */}
            <ApiUnreachableBanner inShell />
            <header
              data-page-header
              className="bg-background sticky top-0 z-20 h-(--page-header-height) border-b"
            >
              <Topbar
                {...(recordLabel === undefined ? {} : { recordLabel })}
                pageCrumbs={pageCrumbs}
              />
            </header>
            <main id="main" className="min-w-0 grow p-4 md:p-6">
              {children}
            </main>
          </div>
        </SidebarProvider>
      </BreadcrumbCrumbsContext.Provider>
    </BreadcrumbLabelContext.Provider>
  );
}
