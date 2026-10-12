'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { FieldBlocksSkeleton } from '@/components/molecules/FieldBlocksSkeleton';

export interface FormSectionProps {
  readonly id: string;
  /** Already translated (FE-01). */
  readonly title: string;
  /** This section's data has not arrived: its heading renders for real, its fields as `count` blocks. */
  readonly loading?: { readonly count: number };
  readonly children?: ReactNode;
}

/**
 * One named section of a form card (D-01): a `<section>` labelled by its 18/600 `h2`, 24 px padding.
 * While its own data loads, the heading is real and the fields are labelled field blocks, so the
 * rest of the form stays live (D-35, D-39; UI-SPEC § Skeletons "A section whose data is still
 * loading"). The blocks come from the `FieldBlocksSkeleton` molecule, never the `PageSkeleton`
 * organism that re-exports it (plan 09's move, lead decision 2026-09-26).
 */
export function FormSection({ id, title, loading, children }: FormSectionProps): ReactElement {
  const t = useTranslations('common');
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="flex flex-col gap-4 p-6">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {loading === undefined ? (
        children
      ) : (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          <FieldBlocksSkeleton count={loading.count} />
        </div>
      )}
    </section>
  );
}
