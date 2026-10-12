import { MAIL_ENDPOINTS, mailPaths } from '@/features/mail/api/mail.endpoints';
import {
  templateResponseSchema,
  type TemplateResponse,
  type TemplateSaveBody,
} from '@/features/mail/schemas/mail.schema';
import { useCommonMutation, type CommonMutation } from '@/lib/api/use-common-mutation';

/**
 * The editor's save (FE-03): `PATCH /api/v1/mail/templates/:id` with Active and every version,
 * triggered with `{ ifMatch: record.etag }` (ADR-0040, T-4.3-15: 428 without it, 412 when someone
 * saved first, nothing written). Never retried by itself (a write, ADR-0031 §5); a 400 carries the
 * `issues` the form maps by `rule`. It invalidates nothing: the editor swaps the saved row into the
 * cached list pages (D-36).
 */
export function useSaveEmailTemplate(
  id: string,
): CommonMutation<TemplateSaveBody, TemplateResponse> {
  return useCommonMutation<TemplateSaveBody, TemplateResponse>(mailPaths.template(id), {
    method: MAIL_ENDPOINTS.save.method,
    schema: templateResponseSchema,
    invalidate: [],
  });
}
