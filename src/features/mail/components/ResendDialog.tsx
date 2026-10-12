'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { MAIL_ERRORS } from '@/features/mail/api/mail.endpoints';
import { useResend } from '@/features/mail/hooks/use-resend';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';

/** The template is switched off: the row already says so, so the dialog refuses before any request. */
const TEMPLATE_OFF_CODE = 'ERP-MAIL-0004';

/**
 * An address inside the dialog's title, which is plain text: Unicode's first-strong isolate and its
 * pop (what `<bdi>` does for markup), so it reads left to right in an Arabic sentence (3.2 D-34).
 */
const isolate = (text: string): string => `⁨${text}⁩`;

export interface ResendDialogProps {
  readonly entry: {
    readonly id: string;
    readonly recipient: string;
    /** The row's `templateActive`: `false` refuses up front with `errors.ERP-MAIL-0004`. */
    readonly templateActive: boolean | null;
  };
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** After the 202: the list revalidates; the detail goes to `/setup/sent-emails/<newId>`. */
  readonly onResent: (newId: string) => void;
}

/**
 * Resend (04.3 UI-SPEC § Resend, D-05, O-6, choice 9): a kind access `ConfirmDialog`, because an
 * email cannot be unsent. The title names the recipient; the body says the email is rendered again
 * from the template's current wording and the record's current values and that this entry stays as
 * it is. Refused up front when the row says the template is off (`refusedCode`, no request); a live
 * refusal (the record gone, still waiting, not configured: a 409) stays inside the dialog with
 * Confirm disabled (the kit's refusal). One `Idempotency-Key` per opening (`useResend`). Success
 * toasts "Email queued to resend" and hands the new entry's id to the screen.
 */
export function ResendDialog({
  entry,
  open,
  onOpenChange,
  onResent,
}: ResendDialogProps): ReactElement {
  const t = useTranslations('mail');
  const resender = useResend(entry.id, open);

  async function confirm(): Promise<ConfirmOutcome> {
    const outcome = await resender.resend();
    if (outcome.ok) {
      toast.success(t('resent_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
      onResent(outcome.data.id);
    }
    return outcome;
  }

  return (
    <ConfirmDialog
      kind="access"
      open={open}
      onOpenChange={onOpenChange}
      title={t('resend_title', { recipient: isolate(entry.recipient) })}
      body={t('resend_body')}
      dismissLabel={t('back_to_log')}
      confirmLabel={t('resend_email')}
      pendingLabel={t('resending_email')}
      featureErrors={MAIL_ERRORS}
      refusedCode={entry.templateActive === false ? TEMPLATE_OFF_CODE : undefined}
      onConfirm={confirm}
    />
  );
}
