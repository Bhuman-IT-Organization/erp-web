import { MAIL_SENT_EMAILS_PATH, mailPaths } from '@/features/mail/api/mail.endpoints';
import {
  sentEmailResponseSchema,
  sentEmailsListResponseSchema,
  type SentEmailResponse,
  type SentEmailsListResponse,
} from '@/features/mail/schemas/mail.schema';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import type { Params } from '@/lib/api/keys';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';

/**
 * `GET /api/v1/mail/sent-emails` with its meta extra (every stored template key), under the global
 * read policy; administrators only (D-05). The log's rows come through `ListPageTemplate`; this read
 * serves what the rows do not carry: the Template filter's options. `null` asks nothing.
 */
export function useSentEmails(params: Params | null): CommonApiResult<SentEmailsListResponse> {
  return useCommonApi(
    params === null ? null : MAIL_SENT_EMAILS_PATH,
    sentEmailsListResponseSchema,
    params ?? undefined,
  );
}

/** Still on its way: the entry is read again every `CLIENT_TIMINGS.mail.pollMs`. */
const isUnderway = (entry: SentEmailResponse): boolean =>
  entry.status === 'queued' || entry.status === 'retrying';

/**
 * `GET /api/v1/mail/sent-emails/:id`, one entry (administrators only, D-05): re-read every
 * `CLIENT_TIMINGS.mail.pollMs` through SWR `refreshInterval` while it is queued or retrying, and no
 * longer once it is sent or failed (04.3 UI-SPEC § Sent email detail); no effect (FE-04).
 */
export function useSentEmail(id: string): CommonApiResult<SentEmailResponse> {
  return useCommonApi(mailPaths.sentEmail(id), sentEmailResponseSchema, undefined, {
    refreshInterval: (data) =>
      data !== undefined && isUnderway(data) ? CLIENT_TIMINGS.mail.pollMs : 0,
  });
}
