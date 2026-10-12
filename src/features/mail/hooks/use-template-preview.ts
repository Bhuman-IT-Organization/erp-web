import type { z } from 'zod';
import { mailPaths } from '@/features/mail/api/mail.endpoints';
import { previewResponseSchema } from '@/features/mail/schemas/mail.schema';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { usePostRead } from '@/lib/api/use-post-read';

/** The api's rendering: the subject and the whole email as html (shown only in a sandboxed frame). */
export type PreviewResponse = z.infer<typeof previewResponseSchema>;

/** An unsaved draft of one locale: what the preview renders and the test sends (`mailDraftBodySchema`). */
export interface MailDraft {
  readonly locale: string;
  readonly subject: string;
  readonly message: string;
}

/**
 * `POST /api/v1/mail/templates/:id/preview` through the POST read door (04.3 PATTERNS M7): the api
 * renders the draft with each merge field's sample values and the brand, with the one renderer the
 * real send uses (choice 3), so what the editor shows is what is sent. Keyed on the draft (callers
 * pass it with a fixed key order: locale, subject, message); `null` asks nothing; the previous
 * rendering stays while a new one loads.
 */
export function useTemplatePreview(
  templateId: string,
  draft: MailDraft | null,
): CommonApiResult<PreviewResponse> {
  return usePostRead(mailPaths.preview(templateId), previewResponseSchema, draft);
}
