'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';

/** The Perfex dashboard: a plain `<a>`, because it is a legacy page, not a route of this app (D-22). */
const DASHBOARD_HREF = '/admin';

/**
 * What `withPermission` renders once the permissions HAVE ARRIVED and the page's gate is absent
 * (D-14, D-39): a heading, one line telling the member what to do, and a way out to the dashboard.
 * It is a message, never a redirect (FE-16), and it never renders while `/me` is loading or has
 * failed — an outage is an `InlineError`, not "no access" (RESEARCH Pitfall 7). Start-aligned with
 * 64 px block padding, like `EmptyState` (UI-SPEC § Access gating states).
 */
export function NoAccessState(): ReactElement {
  const t = useTranslations('common');
  return (
    <section data-testid="permission-refused" className="flex flex-col items-start gap-2 py-16">
      <h1 className="text-lg font-semibold">{t('forbidden')}</h1>
      <p className="text-muted-foreground text-sm">{t('forbidden_body')}</p>
      <Button asChild variant="outline" className="mt-2">
        <a href={DASHBOARD_HREF}>{t('go_to_dashboard')}</a>
      </Button>
    </section>
  );
}
