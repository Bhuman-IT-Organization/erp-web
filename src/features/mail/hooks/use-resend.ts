import { useState } from 'react';
import { MAIL_SENT_EMAILS_PATH, mailPaths } from '@/features/mail/api/mail.endpoints';
import { newIdempotencyKey } from '@/features/mail/hooks/use-test-send';
import { acceptedResponseSchema } from '@/features/mail/schemas/mail.schema';
import type { ApiResult } from '@/lib/api/call-api';
import { useCommonMutation } from '@/lib/api/use-common-mutation';

export interface Resend {
  /** One POST with this opening's key; a second call in the same opening (a retry) reuses it. */
  resend(): Promise<ApiResult<{ readonly id: string }>>;
  readonly pending: boolean;
}

/**
 * Resend (04.3 UI-SPEC § Resend, D-05, O-6): `POST sent-emails/:id/resend`, no body, answering 202
 * with the new entry's id; never retried by itself (a write, ADR-0031 §5). One `idempotencyKey` is
 * minted each time the dialog opens (`open` turning true), so a double click or a Retry after a lost
 * answer inside that opening sends one email, and the api's replay answers the same 202 (BE-15,
 * T-4.3-08); a new opening is a new request. The log's pages and this entry are stale after it.
 */
export function useResend(id: string, open: boolean): Resend {
  const mutation = useCommonMutation<undefined, { readonly id: string }>(mailPaths.resend(id), {
    method: 'POST',
    schema: acceptedResponseSchema,
    invalidate: [MAIL_SENT_EMAILS_PATH],
  });
  // The key belongs to one opening: adjusted while rendering when `open` turns (React's "state from
  // a prop change" pattern, as ConfirmDialog does), never in an effect.
  const [opening, setOpening] = useState(() => ({ open, idempotencyKey: newIdempotencyKey() }));
  if (opening.open !== open) {
    setOpening({ open, idempotencyKey: open ? newIdempotencyKey() : opening.idempotencyKey });
  }
  const { trigger } = mutation;
  return {
    resend: () => trigger(undefined, { idempotencyKey: opening.idempotencyKey }),
    pending: mutation.isMutating,
  };
}
