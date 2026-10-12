'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Breadcrumbs } from '@/components/molecules/Breadcrumbs';
import { AccountMenu, type AccountMenuProps } from '@/components/organisms/AccountMenu';
import { SIDEBAR_ID } from '@/components/organisms/Sidebar';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import type { PageCrumb } from '@/lib/hooks/use-breadcrumb-label';

export interface TopbarProps {
  /** Test and story seam, passed to the account menu; defaults to the real cookie writer. */
  readonly writeLocale?: AccountMenuProps['writeLocale'];
  /** The record's own name for the breadcrumb's dynamic leaf; `PageShell` owns it (WR-10). */
  readonly recordLabel?: string | null;
  /** The page's own crumbs after the route trail; `PageShell` owns them (plan 04.2-28). */
  readonly pageCrumbs?: readonly PageCrumb[] | null;
}

/**
 * Perfex's `header.php`, reduced to what D-09 keeps: the sidebar toggle, the breadcrumbs, and ONE
 * account menu at the inline end (identity, My profile, Language, Sign out). Phase 3.1's three
 * sibling items (language, profile, logout) are gone into that menu (finding 3), and the brand
 * moved to the sidebar header.
 *
 * Everything else Perfex puts here — global search and the voice button, quick-create, running
 * timers, to-do, notifications, the settings shortcut — is dropped, not stubbed, because each
 * needs a cross-module API Node does not have (D-06). The reasons and triggers are in the shell
 * README's `## Dropped on purpose`.
 *
 * `useSidebar()` reads the provider `PageShell` mounts, so the toggle drives the same sidebar the
 * page renders. A story or a test mounting `Topbar` alone wraps it in `SidebarProvider`.
 */
export function Topbar({ writeLocale, recordLabel, pageCrumbs }: TopbarProps): ReactElement {
  const t = useTranslations('shell');
  const { toggleSidebar, state, isMobile, openMobile } = useSidebar();

  return (
    <div className="flex h-12 items-center gap-2 px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-testid="sidebar-toggle"
        aria-label={t('toggle_sidebar')}
        aria-expanded={isMobile ? openMobile : state === 'expanded'}
        aria-controls={SIDEBAR_ID}
        onClick={toggleSidebar}
      >
        <Icon name="panel-left" className="rtl:rotate-180" />
      </Button>

      <Breadcrumbs
        {...(recordLabel === undefined ? {} : { recordLabel })}
        {...(pageCrumbs === undefined ? {} : { pageCrumbs })}
      />

      <div className="grow" />

      <AccountMenu {...(writeLocale === undefined ? {} : { writeLocale })} />
    </div>
  );
}
