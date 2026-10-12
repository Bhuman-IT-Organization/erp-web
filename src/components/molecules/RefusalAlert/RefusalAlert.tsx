'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode, Ref } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';

export interface RefusalLine {
  /** Stable key (the server's lineId, or the issue path joined). */
  readonly id: string;
  /** One translated sentence; the feature wraps codes and numbers in `<bdi>`. Never an HTML string. */
  readonly content: ReactNode;
}

export interface RefusalAlertProps {
  /** Translated: the refusal's message (the feature maps the problem code to its copy). */
  readonly message: string;
  /** One entry per refused line; absent or empty renders no list. */
  readonly lines?: readonly RefusalLine[];
  /** Translated: a 14px sentence after the list. */
  readonly hint?: string;
  /** A `LegacyLink`, a Node link or ONE outline button, on its own row after the hint. */
  readonly action?: ReactNode;
  /** React 19 passes `ref` as a prop: the form or dialog focuses the alert after a refused submit. */
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * K25 (04.8 UI-SPEC § Kit additions, § Refusals): a server refusal as one destructive alert, the
 * shape every W4 refusal takes inside a dialog, above a form's error summary or in a delete
 * preflight. The 16px `triangle-exclamation`, the message, then optionally the refused lines, a hint
 * and one action. The FEATURE maps the problem code to its copy and builds each line from translated
 * text with codes and numbers in `<bdi>`; this piece adds no text of its own except the list's name.
 *
 * - No HTML from strings (T-4.8-24): every value renders as React text, so a stored item name
 *   cannot become markup.
 * - The list scrolls inside the alert at 240px at most and is focusable and named (axe
 *   `scrollable-region-focusable`, T-4.8-25), so a long refusal never pushes the dialog's actions
 *   out of reach and stays readable by keyboard.
 * - The primitive pins `AlertAction` at the top end over a reserved padding, which a sentence-long
 *   link overlaps; here the slot sits on its own row in the flow, in the foreground colour, so a
 *   navigation never reads as a destructive control; the message wraps like the rest of the
 *   alert (`text-pretty`, not the primitive's `text-balance`), both from the screenshot review.
 */
export function RefusalAlert({
  message,
  lines,
  hint,
  action,
  ref,
}: RefusalAlertProps): ReactElement {
  const t = useTranslations('common');
  return (
    <Alert
      ref={ref}
      variant="destructive"
      tabIndex={-1}
      data-testid="refusal-alert"
      className="gap-y-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 has-data-[slot=alert-action]:pe-2.5"
    >
      <Icon name="triangle-exclamation" className="size-4" />
      <AlertDescription className="col-start-2 text-sm text-pretty">{message}</AlertDescription>
      {lines !== undefined && lines.length > 0 ? (
        <ul
          aria-label={t('refused_lines')}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be keyboard reachable (axe scrollable-region-focusable, T-4.8-25), the case the rule's own docs exempt per instance
          tabIndex={0}
          className="col-start-2 flex max-h-60 list-disc flex-col gap-1 overflow-y-auto rounded-sm ps-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {lines.map((refused) => (
            <li key={refused.id}>{refused.content}</li>
          ))}
        </ul>
      ) : null}
      {hint === undefined || hint === '' ? null : <p className="col-start-2 text-sm">{hint}</p>}
      {action === undefined || action === null ? null : (
        <AlertAction className="static col-start-2 text-foreground">{action}</AlertAction>
      )}
    </Alert>
  );
}
