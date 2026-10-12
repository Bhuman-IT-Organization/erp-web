import { MAIL_STATUS_PATH } from '@/features/mail/api/mail.endpoints';
import { statusResponseSchema, type StatusResponse } from '@/features/mail/schemas/mail.schema';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';

/**
 * `GET /api/v1/mail/status`, the deployment's mail setup read only (D-02; administrators only):
 * configured or not, the sender, host, port and encryption, whether the mail server answers, the
 * last finished send and the member's own test address. It never carries an SMTP user name or
 * password (T-4.3-06). The page re-reads it (`mutate`) when a test it sent finishes.
 */
export function useEmailStatus(): CommonApiResult<StatusResponse> {
  return useCommonApi(MAIL_STATUS_PATH, statusResponseSchema);
}
