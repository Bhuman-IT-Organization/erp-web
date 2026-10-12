import { MAIL_TEMPLATES_PATH, mailPaths } from '@/features/mail/api/mail.endpoints';
import {
  templateResponseSchema,
  templatesListResponseSchema,
  type TemplateResponse,
  type TemplatesListResponse,
} from '@/features/mail/schemas/mail.schema';
import type { Params } from '@/lib/api/keys';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';

/**
 * `GET /api/v1/mail/templates` with its meta extras (every module with a template, the supported
 * locales), under the global read policy. The list screen's rows come through `ListPageTemplate`;
 * this read serves what the rows do not carry: the Module filter's options, the Languages column's
 * supported locales and Disable All's count. `null` asks nothing.
 */
export function useEmailTemplates(params: Params | null): CommonApiResult<TemplatesListResponse> {
  return useCommonApi(
    params === null ? null : MAIL_TEMPLATES_PATH,
    templatesListResponseSchema,
    params ?? undefined,
  );
}

/** `GET /api/v1/mail/templates/:id`, the editor's read (plan 09); a `null` id asks nothing. */
export function useEmailTemplate(id: string | null): CommonApiResult<TemplateResponse> {
  return useCommonApi(id === null ? null : mailPaths.template(id), templateResponseSchema);
}
