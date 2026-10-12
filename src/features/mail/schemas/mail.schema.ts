import { z } from 'zod';

/**
 * Client mirrors of erp-api `src/v1/mail/dto/mail.dto.ts` (plan 04.3-07), every field written
 * inline (the 04.1 form); they move to `@erp/contracts` with ADR-0010. Ids are strings on the wire
 * and opaque here; times are ISO strings. No answer carries a sent email's subject, body or merge
 * value (D-05), nor an SMTP credential (D-02).
 */
export const MAIL_AUDIENCES = ['staff', 'contact', 'staff_or_contact'] as const;
export type MailAudience = (typeof MAIL_AUDIENCES)[number];

export const SENT_EMAIL_STATUSES = ['queued', 'retrying', 'sent', 'failed'] as const;
export type SentEmailStatus = (typeof SENT_EMAIL_STATUSES)[number];

export const MAIL_FAILURE_REASONS = [
  'recipient_refused',
  'auth_failed',
  'server_unreachable',
  'timeout',
  'message_refused',
  'not_configured',
  'record_gone',
  'template_off',
  'unknown',
] as const;
export type MailFailureReason = (typeof MAIL_FAILURE_REASONS)[number];

/** The log's Template filter value for a status-page test (a template key never contains '-'). */
export const STATUS_TEST_FILTER = 'status-test';

/** One row of the template list. `audience` is null when no definition is registered for the key. */
export const templateListItemSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    module: z.string(),
    audience: z.enum(MAIL_AUDIENCES).nullable(),
    active: z.boolean(),
    /** The locales that have a version. */
    locales: z.array(z.string()),
  })
  .readonly();
export type TemplateListItem = z.infer<typeof templateListItemSchema>;

/** The list envelope (BE-19) with its extras: every module with a template, the supported locales (en first). */
export const templatesListResponseSchema = z
  .object({
    data: z.array(templateListItemSchema),
    meta: z.object({
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable().default(null),
      total: z.number().int().nonnegative().optional(),
      rangeStart: z.number().int().nonnegative().optional(),
      modules: z.array(z.string()),
      locales: z.array(z.string()),
    }),
  })
  .readonly();
export type TemplatesListResponse = z.infer<typeof templatesListResponseSchema>;

export const mergeFieldSchema = z
  .object({ token: z.string(), kind: z.enum(['text', 'url']) })
  .readonly();

export const versionSchema = z.object({ subject: z.string(), message: z.string() }).readonly();

/** The caller's own test address, and whether mail can be sent at all. */
export const sendTestSchema = z.object({
  configured: z.boolean(),
  recipient: z.string().nullable(),
});

/** One template for the editor: `mergeFields` is `[]` when no definition is registered (read-only editor). */
export const templateResponseSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    module: z.string(),
    audience: z.enum(MAIL_AUDIENCES).nullable(),
    active: z.boolean(),
    formattingDropped: z.boolean(),
    locales: z.array(z.string()),
    mergeFields: z.array(mergeFieldSchema),
    versions: z.record(z.string(), versionSchema),
    sendTest: sendTestSchema,
    etag: z.string().min(1),
  })
  .readonly();
export type TemplateResponse = z.infer<typeof templateResponseSchema>;

export const previewResponseSchema = z.object({ subject: z.string(), html: z.string() }).readonly();

/** 202: the log row's id. */
export const acceptedResponseSchema = z.object({ id: z.string() }).readonly();

/** Enable All or Disable All: how many templates changed. */
export const moduleActiveResponseSchema = z
  .object({ changed: z.number().int().nonnegative() })
  .readonly();

const sentEmailRowObject = z.object({
  id: z.string(),
  templateKey: z.string().nullable(),
  isTest: z.boolean(),
  recipient: z.string(),
  locale: z.string(),
  status: z.enum(SENT_EMAIL_STATUSES),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  nextTryAt: z.string().nullable(),
  queuedAt: z.string(),
  sentAt: z.string().nullable(),
  failureReason: z.enum(MAIL_FAILURE_REASONS).nullable(),
  templateActive: z.boolean().nullable(),
  waitingForServer: z.boolean(),
});

export const sentEmailRowSchema = sentEmailRowObject.readonly();
export type SentEmailRow = z.infer<typeof sentEmailRowSchema>;

/** The log's envelope (BE-19) with its extra: every stored template key, for the Template filter. */
export const sentEmailsListResponseSchema = z
  .object({
    data: z.array(sentEmailRowSchema),
    meta: z.object({
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable().default(null),
      total: z.number().int().nonnegative().optional(),
      rangeStart: z.number().int().nonnegative().optional(),
      templates: z.array(z.string()),
    }),
  })
  .readonly();
export type SentEmailsListResponse = z.infer<typeof sentEmailsListResponseSchema>;

export const sentEmailResponseSchema = sentEmailRowObject
  .extend({
    serverReply: z.string().nullable(),
    resentFromId: z.string().nullable(),
    resentFromExists: z.boolean(),
  })
  .readonly();
export type SentEmailResponse = z.infer<typeof sentEmailResponseSchema>;

export const testStateResponseSchema = z
  .object({
    id: z.string(),
    status: z.enum(SENT_EMAIL_STATUSES),
    attempts: z.number().int(),
    maxAttempts: z.number().int(),
    nextTryAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    failureReason: z.enum(MAIL_FAILURE_REASONS).nullable(),
    recipient: z.string(),
    waitingForServer: z.boolean(),
  })
  .readonly();
export type TestStateResponse = z.infer<typeof testStateResponseSchema>;

/** D-02: the deployment's mail setup, read only. */
export const statusResponseSchema = z
  .object({
    configured: z.boolean(),
    sender: z.object({ name: z.string(), address: z.string() }).nullable(),
    host: z.string().nullable(),
    port: z.number().int().nullable(),
    encryption: z.enum(['ssl', 'tls', 'none']).nullable(),
    server: z.object({ answering: z.boolean(), since: z.string().nullable() }),
    lastSend: z
      .object({
        id: z.string(),
        status: z.enum(['sent', 'failed']),
        at: z.string(),
        failureReason: z.enum(MAIL_FAILURE_REASONS).nullable(),
      })
      .nullable(),
    sendTest: sendTestSchema,
  })
  .readonly();
export type StatusResponse = z.infer<typeof statusResponseSchema>;

/**
 * The `issues` a 400 `ERP-VALIDATION-0001` carries, parsed BEFORE any field error is set (T-3-26).
 * The mail validator adds `rule` (`required`, `too_long`, `unknown_merge_field`, `long_dash`, ...)
 * and its `params` (`{ max }`, `{ token }`), which the editor's messages take. `message` is never
 * rendered.
 */
export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
    rule: z.string().optional(),
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  }),
);
export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];

// --- the editor's form (plan 04.3-09): the client refuses what the api refuses, with the same keys --

/** erp-api `MAIL_SUBJECT_MAX` and `MAIL_MESSAGE_MAX` (`model/mail.model.ts`). */
export const MAIL_SUBJECT_MAX = 255;
export const MAIL_MESSAGE_MAX = 20_000;
/** The required version, and the one a locale without a version receives (D-04). */
export const ENGLISH_LOCALE = 'en';

/** The two wording fields of a version. */
export const VERSION_FIELDS = ['subject', 'message'] as const;
export type VersionField = (typeof VERSION_FIELDS)[number];
export type VersionPath = `versions.${string}.${VersionField}`;

/** D-06: U+2014 is built from its code, never typed, so no source line holds it. */
const LONG_DASH_CODE = 0x2014;
const LONG_DASH = String.fromCharCode(LONG_DASH_CODE);
/** erp-api's `TOKEN_PATTERN` (`mail.renderer.ts`): a `{token}` is lower case, digits and `_`. */
const TOKEN_PATTERN = /\{([a-z][a-z0-9_]*)\}/gu;
/** A field error carries its token after this mark: `unknown_merge_field|staff_nme`. */
const TOKEN_MARK = '|';

/** One version's wording. */
export interface VersionValues {
  readonly subject: string;
  readonly message: string;
}

/** The editor's values: Active and one subject and message per supported locale. */
export interface EmailTemplateFormValues {
  readonly active: boolean;
  readonly versions: Readonly<Record<string, VersionValues>>;
}

/** `PATCH templates/:id`: Active and every supported locale, `null` removing that version. */
export interface TemplateSaveBody {
  readonly active: boolean;
  readonly versions: Readonly<Record<string, VersionValues | null>>;
}

const EMPTY_VERSION: VersionValues = { subject: '', message: '' };
const isBlank = (value: string): boolean => value.trim() === '';
const MAX: Readonly<Record<VersionField, number>> = {
  subject: MAIL_SUBJECT_MAX,
  message: MAIL_MESSAGE_MAX,
};
const TOO_LONG: Readonly<Record<VersionField, string>> = {
  subject: 'subject_too_long',
  message: 'message_too_long',
};
const REQUIRED: Readonly<Record<VersionField, string>> = {
  subject: 'enter_subject',
  message: 'enter_message',
};

/** The first `{token}` of `text` that is not one of `allowed`, or undefined. */
function firstUnknownToken(text: string, allowed: ReadonlySet<string>): string | undefined {
  return [...text.matchAll(TOKEN_PATTERN)]
    .map((match) => match[1] ?? '')
    .find((token) => !allowed.has(token));
}

/** The message key of a field error with its token, as `SchemaForm` carries it (one string). */
const withToken = (key: string, token: string): string => `${key}${TOKEN_MARK}${token}`;

/** A field error's key and its token (empty when it has none), for the editor's `translateError`. */
export function readFieldError(message: string): { readonly key: string; readonly token: string } {
  const at = message.indexOf(TOKEN_MARK);
  return at < 0
    ? { key: message, token: '' }
    : { key: message.slice(0, at), token: message.slice(at + TOKEN_MARK.length) };
}

/** The errors of one filled field, in the api's rule order: too long, unknown merge field, long dash. */
function contentErrors(field: VersionField, value: string, allowed: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  if (value.length > MAX[field]) errors.push(TOO_LONG[field]);
  const unknown = firstUnknownToken(value, allowed);
  if (unknown !== undefined) errors.push(withToken('unknown_merge_field', unknown));
  if (value.includes(LONG_DASH)) errors.push('long_dash');
  return errors;
}

/** The errors of one version, field by field (erp-api `versionIssues`). */
function versionErrors(
  locale: string,
  version: VersionValues,
  allowed: ReadonlySet<string>,
): { readonly field: VersionField; readonly message: string }[] {
  const filled = VERSION_FIELDS.filter((field) => !isBlank(version[field])).length;
  return VERSION_FIELDS.flatMap((field) =>
    onField(field, fieldErrors({ locale, field, value: version[field], filled, allowed })),
  );
}

/** Each message of one field, with the field it belongs to. */
const onField = (
  field: VersionField,
  messages: readonly string[],
): { readonly field: VersionField; readonly message: string }[] =>
  messages.map((message) => ({ field, message }));

/** The errors of one field: required or `version_pair` when blank, else its content's. */
function fieldErrors(args: {
  readonly locale: string;
  readonly field: VersionField;
  readonly value: string;
  /** How many of the version's two fields are filled. */
  readonly filled: number;
  readonly allowed: ReadonlySet<string>;
}): string[] {
  const { locale, field, value, filled, allowed } = args;
  if (!isBlank(value)) return contentErrors(field, value, allowed);
  if (locale === ENGLISH_LOCALE) return [REQUIRED[field]];
  return filled === 1 ? ['version_pair'] : [];
}

/** Every error of every supported locale, as zod issues at `versions.<locale>.<field>`. */
function versionIssues(
  values: EmailTemplateFormValues,
  locales: readonly string[],
  allowed: ReadonlySet<string>,
): { readonly path: string[]; readonly message: string }[] {
  return locales.flatMap((locale) =>
    localeIssues(locale, versionErrors(locale, values.versions[locale] ?? EMPTY_VERSION, allowed)),
  );
}

/** One locale's errors as issues at `versions.<locale>.<field>`. */
const localeIssues = (
  locale: string,
  errors: readonly { readonly field: VersionField; readonly message: string }[],
): { readonly path: string[]; readonly message: string }[] =>
  errors.map((error) => ({ path: ['versions', locale, error.field], message: error.message }));

/**
 * The editor's client rules (UI-SPEC § Sections 2 to n), the api's `MailValidator.versions` with
 * the same keys: English subject and message required; any other version both or neither
 * (`version_pair` on the empty one); at most 255 and 20,000 characters; every `{token}` one of this
 * template's merge fields (the first unknown one named); no U+2014 (D-06). Nothing is changed
 * silently: each is a field error.
 */
export function emailTemplateFormSchema(
  locales: readonly string[],
  tokens: readonly string[],
): z.ZodType<EmailTemplateFormValues, EmailTemplateFormValues> {
  const allowed = new Set(tokens);
  return z
    .object({
      active: z.boolean(),
      versions: z.record(z.string(), z.object({ subject: z.string(), message: z.string() })),
    })
    .superRefine((values, ctx) => {
      for (const issue of versionIssues(values, locales, allowed)) {
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
    });
}

/** The form's values from the record: every supported locale, empty where there is no version. */
export function toEmailTemplateForm(record: TemplateResponse): EmailTemplateFormValues {
  return {
    active: record.active,
    versions: Object.fromEntries(
      record.locales.map((locale) => [locale, record.versions[locale] ?? { ...EMPTY_VERSION }]),
    ),
  };
}

/** True when a version holds no wording: a non-English one is then removed (`null`). */
export const isEmptyVersion = (version: VersionValues): boolean =>
  isBlank(version.subject) && isBlank(version.message);

/** The save body: Active and every supported locale, a both-empty non-English version as `null`. */
export function toTemplateSaveBody(
  values: EmailTemplateFormValues,
  locales: readonly string[],
): TemplateSaveBody {
  return {
    active: values.active,
    versions: Object.fromEntries(
      locales.map((locale) => {
        const version = values.versions[locale] ?? EMPTY_VERSION;
        const removed = locale !== ENGLISH_LOCALE && isEmptyVersion(version);
        return [locale, removed ? null : { subject: version.subject, message: version.message }];
      }),
    ),
  };
}

/** An api issue's `rule` to the client's key for that field (`unknown_merge_field` carries its token). */
const RULE_KEYS: Readonly<Record<string, (field: VersionField) => string>> = {
  required: (field) => REQUIRED[field],
  too_long: (field) => TOO_LONG[field],
  version_pair: () => 'version_pair',
  long_dash: () => 'long_dash',
};

const isVersionField = (value: unknown): value is VersionField =>
  value === 'subject' || value === 'message';

/**
 * An api 400 issue onto its field (T-3-26: parsed first, the api's `message` never shown): the
 * `rule` names the key the client uses (`required` and `too_long` by field), the token from
 * `params`. `null` for anything that is not one version field (`unknown_locale`, a rule-less issue):
 * the form shows its general alert instead.
 */
export function fieldErrorOfIssue(
  issue: ValidationIssue,
): { readonly field: VersionPath; readonly message: string } | null {
  const [root, locale, field] = issue.path;
  if (root !== 'versions' || typeof locale !== 'string' || !isVersionField(field)) return null;
  const path: VersionPath = `versions.${locale}.${field}`;
  const rule = issue.rule ?? '';
  if (rule === 'unknown_merge_field') {
    const token = issue.params?.token;
    return { field: path, message: withToken(rule, token === undefined ? '' : String(token)) };
  }
  const keyOf = Object.hasOwn(RULE_KEYS, rule) ? RULE_KEYS[rule] : undefined;
  return keyOf === undefined ? null : { field: path, message: keyOf(field) };
}
