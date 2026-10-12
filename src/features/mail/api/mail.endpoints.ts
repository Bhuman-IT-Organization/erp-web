import type { ApiPath } from '@/lib/api/call-api';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';

/**
 * The wire contract of the Email screens (plan 04.3-07, erp-api `MAIL_ROUTES`): the thirteen routes,
 * method and path. The template handlers are gated on Perfex's `email_templates` pair (D-09); the
 * sent-email log, Resend and the status are administrator-only (D-05, D-02).
 *
 * - The list's filter values are KEYS: `filter[module][in]` modules, the log's
 *   `filter[template][in]` template keys plus `status-test` (never an id).
 * - The save needs `If-Match` (the record's `etag`); the test sends and Resend need an
 *   `Idempotency-Key` and answer 202 `{ id }`; a test's state is read at `tests/:id`.
 * - `templates/active` (Enable All or Disable All of one module) is a static segment the api serves
 *   before `templates/:id`.
 *
 * No axios import here: reads go through `useCommonApi` or `usePostRead` (retried by SWR, ADR-0031
 * §5), writes through `useCommonMutation` (never retried).
 */
export const MAIL_ENDPOINTS = {
  templates: { method: 'GET', path: '/api/v1/mail/templates' },
  templatesActive: { method: 'POST', path: '/api/v1/mail/templates/active' },
  template: { method: 'GET', path: '/api/v1/mail/templates/:id' },
  save: { method: 'PATCH', path: '/api/v1/mail/templates/:id' },
  templateActive: { method: 'PUT', path: '/api/v1/mail/templates/:id/active' },
  preview: { method: 'POST', path: '/api/v1/mail/templates/:id/preview' },
  templateTest: { method: 'POST', path: '/api/v1/mail/templates/:id/test' },
  test: { method: 'GET', path: '/api/v1/mail/tests/:id' },
  sentEmails: { method: 'GET', path: '/api/v1/mail/sent-emails' },
  sentEmail: { method: 'GET', path: '/api/v1/mail/sent-emails/:id' },
  resend: { method: 'POST', path: '/api/v1/mail/sent-emails/:id/resend' },
  status: { method: 'GET', path: '/api/v1/mail/status' },
  statusTest: { method: 'POST', path: '/api/v1/mail/status/test' },
} as const;

export const MAIL_TEMPLATES_PATH = MAIL_ENDPOINTS.templates.path satisfies ApiPath;
export const MAIL_SENT_EMAILS_PATH = MAIL_ENDPOINTS.sentEmails.path satisfies ApiPath;
export const MAIL_STATUS_PATH = MAIL_ENDPOINTS.status.path satisfies ApiPath;

/** A record route with its `:id` encoded. */
const withId = (path: string, id: string): ApiPath =>
  path.replace(':id', encodeURIComponent(id)) as ApiPath;

/** Every path the screens call, the ids encoded. */
export const mailPaths = {
  template: (id: string): ApiPath => withId(MAIL_ENDPOINTS.template.path, id),
  templateActive: (id: string): ApiPath => withId(MAIL_ENDPOINTS.templateActive.path, id),
  templatesActive: MAIL_ENDPOINTS.templatesActive.path satisfies ApiPath,
  preview: (id: string): ApiPath => withId(MAIL_ENDPOINTS.preview.path, id),
  templateTest: (id: string): ApiPath => withId(MAIL_ENDPOINTS.templateTest.path, id),
  test: (id: string): ApiPath => withId(MAIL_ENDPOINTS.test.path, id),
  sentEmail: (id: string): ApiPath => withId(MAIL_ENDPOINTS.sentEmail.path, id),
  resend: (id: string): ApiPath => withId(MAIL_ENDPOINTS.resend.path, id),
  statusTest: MAIL_ENDPOINTS.statusTest.path satisfies ApiPath,
} as const;

export const VALIDATION_CODE = 'ERP-VALIDATION-0001';
/** A template or a log entry that is not there. */
export const NOT_FOUND_CODE = 'ERP-CORE-0004';
/** The save was refused because the template changed since it was read (412, ADR-0040); plan 09 renders it with `errors.ERP-MAIL-0003`. */
export const STALE_CODE = 'ERP-CORE-0013';

/** The feature's own codes, each with a `mail.errors.<code>` message. */
export const MAIL_ERRORS: FeatureErrorCodes = {
  namespace: 'mail',
  codes: [
    NOT_FOUND_CODE,
    'ERP-MAIL-0002',
    'ERP-MAIL-0004',
    'ERP-MAIL-0005',
    'ERP-MAIL-0006',
    'ERP-MAIL-0007',
    'ERP-MAIL-0008',
  ],
};
