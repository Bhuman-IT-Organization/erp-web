'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface InlineErrorProps {
  /** The human message (D-32) — `useErrorText()`'s answer, never the code or the api's `message`. */
  readonly message: string;
  /** Retry appears only when given: the caller passes it for a retryable failure, never a 4xx. */
  readonly onRetry?: () => void;
  /** A retry is in flight: Retry reads "Retrying…" and is disabled (the FE-27 pending state). */
  readonly busy?: boolean;
  /**
   * A way back out of an area that cannot recover (lead 2026-09-27): a detail page whose record
   * cannot be loaded passes `{ href: readListReturn(LIST_BASE), label: tc('back_to_list') }`. An
   * outline button-styled `next/link` AFTER Retry, `scroll={false}` so the list's own restore (D-28)
   * decides the position. A link is never disabled: leaving stays possible while a retry is in flight.
   */
  readonly back?: { readonly href: string; readonly label: string };
  readonly testId?: string;
}

/**
 * A failed request, shown IN THE AREA THAT FAILED (D-31): a destructive alert with the
 * `circle-exclamation` icon, the plain-language message and an outline Retry. Anything already loaded
 * stays where it is; a whole-app outage is `ApiUnreachableBanner`, not this. The caller renders it
 * only after the request has failed (D-39) — `withPermission` renders it for a failed `/me`, so an
 * outage never reads as "no access". Given `back`, an outline "Back to list" link follows Retry, so
 * a record that cannot be loaded is never a dead end.
 */
export function InlineError({
  message,
  onRetry,
  busy = false,
  back,
  testId = 'inline-error',
}: InlineErrorProps): ReactElement {
  const t = useTranslations('common');
  return (
    <Alert variant="destructive" data-testid={testId}>
      <AlertDescription className="text-destructive flex flex-wrap items-center gap-2 [&_a]:no-underline">
        <span className="flex items-center gap-2">
          <Icon name="circle-exclamation" />
          <span>{message}</span>
        </span>
        {onRetry === undefined ? null : (
          <Button
            type="button"
            variant="outline"
            size="default"
            className="text-foreground"
            disabled={busy}
            aria-busy={busy}
            onClick={onRetry}
          >
            {busy ? t('retrying') : t('retry')}
          </Button>
        )}
        {back === undefined ? null : (
          <Button asChild variant="outline" className="text-foreground">
            <Link href={back.href} scroll={false}>
              {back.label}
            </Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
