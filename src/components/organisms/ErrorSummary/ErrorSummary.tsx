'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement, Ref } from 'react';
import { Alert, AlertTitle } from '@/components/ui/alert';

export interface ErrorSummaryItem {
  /** The failing control's id (`${formId}-${name}`); the link's `href` is `#fieldId`. */
  readonly fieldId: string;
  /** The field's label, already translated. */
  readonly label: string;
  /** The field's error, already translated. */
  readonly message: string;
}

export interface ErrorSummaryProps {
  readonly items: readonly ErrorSummaryItem[];
  /** Focus the field (and open whatever holds it); the link itself never navigates. */
  readonly onSelect: (fieldId: string) => void;
  /** React 19 passes `ref` as a prop: the form focuses the summary after a failed submit. */
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * The summary at the top of a form after a failed submit (D-29): a destructive alert headed
 * "Check these fields" with one link per failing field, NAMED BY ITS LABEL ("Email: Enter a valid
 * e-mail address."), so the problem is text and never only a red outline (WCAG 1.4.1). It takes
 * focus (`tabIndex={-1}`) when a submit fails; a link hands its field id to `onSelect`, which focuses
 * the control. Client (zod) and server (`setError`) errors arrive here the same way.
 */
export function ErrorSummary({ items, onSelect, ref }: ErrorSummaryProps): ReactElement {
  const t = useTranslations('common');
  return (
    <Alert
      ref={ref}
      variant="destructive"
      tabIndex={-1}
      data-testid="error-summary"
      className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <AlertTitle className="font-semibold">{t('check_these_fields')}</AlertTitle>
      <ul className="flex flex-col gap-1 ps-4 list-disc">
        {items.map((item) => (
          <li key={item.fieldId}>
            <a
              href={`#${item.fieldId}`}
              className="underline underline-offset-3"
              onClick={(event) => {
                event.preventDefault();
                onSelect(item.fieldId);
              }}
            >
              {item.label}: {item.message}
            </a>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
