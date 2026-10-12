'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';

/** The Perfex dashboard: a plain `<a>`, because it is a legacy page, not a route of this app (D-22). */
const DASHBOARD_HREF = '/admin';

export interface ModuleDisabledStateProps {
  /** Translated: the page's `<h1>` ("The sample module is disabled"). */
  readonly heading: string;
  /** Translated: what is off and whom to ask. */
  readonly body: string;
  /** Administrators only: who switched the module off and when, already translated and formatted. */
  readonly details?: readonly { readonly term: string; readonly description: string }[];
}

/**
 * What a switched-off module's page shows (K12, P-01, ADR-0042; 4.2 UI-SPEC § Module-disabled
 * state): the `NoAccessState` anatomy, start-aligned with 64px block padding, a 24px `lock` icon,
 * the heading as the page's `<h1>`, the body, an optional definition list and "Go to the
 * dashboard". It renders only after `/me` has answered with the module state (D-39): a skeleton
 * before, never this message. The caller passes `details` for administrators only, and only when
 * the switch recorded them (T-4.2-41); without them the body stands alone.
 */
export function ModuleDisabledState({
  heading,
  body,
  details,
}: ModuleDisabledStateProps): ReactElement {
  const t = useTranslations('common');
  return (
    <section data-testid="module-disabled" className="flex flex-col items-start gap-2 py-16">
      <Icon name="lock" className="text-muted-foreground size-6" />
      <h1 className="text-lg font-semibold">{heading}</h1>
      <p className="text-muted-foreground text-sm">{body}</p>
      {details === undefined || details.length === 0 ? null : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {details.map(({ term, description }) => (
            <div key={term} className="contents">
              <dt className="font-semibold">{term}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button asChild variant="outline" className="mt-2">
        <a href={DASHBOARD_HREF}>{t('go_to_dashboard')}</a>
      </Button>
    </section>
  );
}
