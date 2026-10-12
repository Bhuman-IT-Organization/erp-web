import { describe, expect, it } from 'vitest';
import {
  MAIL_MESSAGE_MAX,
  MAIL_SUBJECT_MAX,
  emailTemplateFormSchema,
  fieldErrorOfIssue,
  readFieldError,
  toEmailTemplateForm,
  toTemplateSaveBody,
  type EmailTemplateFormValues,
  type TemplateResponse,
  MAIL_AUDIENCES,
  MAIL_FAILURE_REASONS,
  SENT_EMAIL_STATUSES,
  STATUS_TEST_FILTER,
  acceptedResponseSchema,
  moduleActiveResponseSchema,
  previewResponseSchema,
  sentEmailResponseSchema,
  sentEmailRowSchema,
  statusResponseSchema,
  templateListItemSchema,
  templateResponseSchema,
  templatesListResponseSchema,
  testStateResponseSchema,
  validationIssuesSchema,
} from '../mail.schema';

const ITEM = {
  id: '4',
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: true,
  locales: ['en'],
};
const SENT = {
  id: '9',
  templateKey: 'attendance_notice',
  isTest: false,
  recipient: 'user@example.test',
  locale: 'en',
  status: 'retrying',
  attempts: 2,
  maxAttempts: 8,
  nextTryAt: '2026-10-03T10:00:00.000Z',
  queuedAt: '2026-10-03T09:58:00.000Z',
  sentAt: null,
  failureReason: null,
  templateActive: true,
  waitingForServer: false,
};

describe('mail schemas (client mirrors of erp-api mail.dto.ts)', () => {
  it('mirrors the enums and the status-test filter value', () => {
    expect(MAIL_AUDIENCES).toEqual(['staff', 'contact', 'staff_or_contact']);
    expect(SENT_EMAIL_STATUSES).toEqual(['queued', 'retrying', 'sent', 'failed']);
    expect(MAIL_FAILURE_REASONS).toContain('record_gone');
    expect(MAIL_FAILURE_REASONS).toContain('template_off');
    expect(MAIL_FAILURE_REASONS).toHaveLength(9);
    expect(STATUS_TEST_FILTER).toBe('status-test');
  });

  it('parses a list item and refuses an unknown audience', () => {
    expect(templateListItemSchema.parse(ITEM)).toEqual(ITEM);
    expect(templateListItemSchema.parse({ ...ITEM, audience: null }).audience).toBeNull();
    expect(templateListItemSchema.safeParse({ ...ITEM, audience: 'robot' }).success).toBe(false);
  });

  it('keeps the list meta extras: every module and the supported locales', () => {
    const page = templatesListResponseSchema.parse({
      data: [ITEM],
      meta: {
        nextCursor: null,
        prevCursor: null,
        total: 1,
        rangeStart: 1,
        modules: ['timesheets'],
        locales: ['en', 'ar'],
      },
    });
    expect(page.meta.modules).toEqual(['timesheets']);
    expect(page.meta.locales).toEqual(['en', 'ar']);
    expect(page.data[0]?.key).toBe('attendance_notice');
  });

  it('parses the detail with its merge fields, versions and etag', () => {
    const detail = templateResponseSchema.parse({
      ...ITEM,
      formattingDropped: false,
      locales: ['en', 'ar'],
      mergeFields: [{ token: '{staff_name}', kind: 'text' }],
      versions: { en: { subject: 'Subject 1', message: 'Message 1' } },
      sendTest: { configured: true, recipient: 'user@example.test' },
      etag: '"e1"',
    });
    expect(detail.versions.en?.subject).toBe('Subject 1');
    expect(templateResponseSchema.safeParse({ ...detail, etag: '' }).success).toBe(false);
  });

  it('parses a log row, its detail and a test state', () => {
    expect(sentEmailRowSchema.parse(SENT).status).toBe('retrying');
    expect(
      sentEmailResponseSchema.parse({
        ...SENT,
        serverReply: null,
        resentFromId: null,
        resentFromExists: false,
      }).resentFromExists,
    ).toBe(false);
    expect(
      testStateResponseSchema.parse({
        id: '9',
        status: 'sent',
        attempts: 1,
        maxAttempts: 8,
        nextTryAt: null,
        sentAt: '2026-10-03T10:00:00.000Z',
        failureReason: null,
        recipient: 'user@example.test',
        waitingForServer: false,
      }).status,
    ).toBe('sent');
    expect(sentEmailRowSchema.safeParse({ ...SENT, status: 'lost' }).success).toBe(false);
  });

  it('parses the status (no credential field), the preview, a 202 and Enable or Disable All', () => {
    const status = statusResponseSchema.parse({
      configured: true,
      sender: { name: 'Company 1', address: 'mail@example.test' },
      host: 'smtp.example.test',
      port: 587,
      encryption: 'tls',
      server: { answering: true, since: null },
      lastSend: null,
      sendTest: { configured: true, recipient: 'user@example.test' },
    });
    expect(Object.keys(status)).not.toContain('password');
    expect(previewResponseSchema.parse({ subject: 'S', html: '<p>x</p>' }).subject).toBe('S');
    expect(acceptedResponseSchema.parse({ id: '12' }).id).toBe('12');
    expect(moduleActiveResponseSchema.parse({ changed: 3 }).changed).toBe(3);
    expect(moduleActiveResponseSchema.safeParse({ changed: -1 }).success).toBe(false);
  });

  it('reads a validation issue with its rule and params (plan 05 validator)', () => {
    const issues = validationIssuesSchema.parse([
      {
        path: ['versions', 'en', 'subject'],
        message: 'x',
        rule: 'too_long',
        params: { max: 255 },
      },
      { path: ['message'], message: 'y' },
    ]);
    expect(issues[0]?.rule).toBe('too_long');
    expect(issues[0]?.params).toEqual({ max: 255 });
    expect(issues[1]?.rule).toBeUndefined();
  });
});

// --- the editor's form (plan 09): the client refuses what the api refuses, with the same keys -----

const LONG_DASH = String.fromCharCode(0x2014);
const LOCALES = ['en', 'ar'];
const TOKENS = ['staff_name', 'link'];
const schema = emailTemplateFormSchema(LOCALES, TOKENS);
const form = (
  versions: EmailTemplateFormValues['versions'],
  active = true,
): EmailTemplateFormValues => ({ active, versions });
const EN = { subject: 'Template 1 for {staff_name}', message: 'Hello {staff_name}\n\n{link}' };
const EMPTY = { subject: '', message: '' };

/** The errors zod reports, as `path: message key`. */
function errorsOf(values: EmailTemplateFormValues): string[] {
  const parsed = schema.safeParse(values);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('emailTemplateFormSchema', () => {
  it('a complete English version and an empty Arabic one pass', () => {
    expect(errorsOf(form({ en: EN, ar: EMPTY }))).toEqual([]);
    expect(errorsOf(form({ en: EN, ar: { subject: 'S', message: 'M {link}' } }))).toEqual([]);
  });

  it('English is required: a blank subject and message (spaces count as blank)', () => {
    expect(errorsOf(form({ en: { subject: '  ', message: '' }, ar: EMPTY }))).toEqual([
      'versions.en.subject: enter_subject',
      'versions.en.message: enter_message',
    ]);
  });

  it('another version is both or neither: version_pair on the empty field', () => {
    expect(errorsOf(form({ en: EN, ar: { subject: 'S', message: ' ' } }))).toEqual([
      'versions.ar.message: version_pair',
    ]);
    expect(errorsOf(form({ en: EN, ar: { subject: '', message: 'M' } }))).toEqual([
      'versions.ar.subject: version_pair',
    ]);
  });

  it('the 255 and 20,000 limits', () => {
    const subject = 'a'.repeat(MAIL_SUBJECT_MAX);
    const message = 'b'.repeat(MAIL_MESSAGE_MAX);
    expect(errorsOf(form({ en: { subject, message }, ar: EMPTY }))).toEqual([]);
    expect(
      errorsOf(form({ en: { subject: `${subject}a`, message: `${message}b` }, ar: EMPTY })),
    ).toEqual(['versions.en.subject: subject_too_long', 'versions.en.message: message_too_long']);
  });

  it('an unknown merge field names its token; a known one and a non-token brace pass', () => {
    expect(
      errorsOf(
        form({ en: { subject: 'Hi {staff_name} {Bad} {x}', message: 'M {zz} {yy}' }, ar: EMPTY }),
      ),
    ).toEqual([
      'versions.en.subject: unknown_merge_field|x',
      'versions.en.message: unknown_merge_field|zz',
    ]);
  });

  it('U+2014 is refused, never replaced', () => {
    expect(errorsOf(form({ en: EN, ar: { subject: `S ${LONG_DASH} T`, message: 'M' } }))).toEqual([
      'versions.ar.subject: long_dash',
    ]);
  });

  it('a missing locale reads as an empty version', () => {
    expect(errorsOf(form({ en: EN }))).toEqual([]);
  });
});

const RECORD: TemplateResponse = {
  id: '7',
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: true,
  formattingDropped: false,
  locales: ['en', 'ar'],
  mergeFields: [{ token: 'staff_name', kind: 'text' }],
  versions: { en: EN },
  sendTest: { configured: true, recipient: 'user@example.test' },
  etag: '"abc"',
};

describe('the form values and the save body', () => {
  it('the form holds every supported locale, empty where the record has no version', () => {
    expect(toEmailTemplateForm(RECORD)).toEqual({ active: true, versions: { en: EN, ar: EMPTY } });
  });

  it('the save sends Active and every locale; a both-empty non-English version is null', () => {
    expect(
      toTemplateSaveBody(form({ en: EN, ar: { subject: ' ', message: '' } }, false), LOCALES),
    ).toEqual({
      active: false,
      versions: { en: EN, ar: null },
    });
    expect(
      toTemplateSaveBody(form({ en: EN, ar: { subject: 'S', message: 'M' } }), LOCALES).versions.ar,
    ).toEqual({ subject: 'S', message: 'M' });
  });
});

describe('fieldErrorOfIssue (an api 400 issue onto its field, by rule)', () => {
  it('maps each rule to the same key the client uses', () => {
    const issue = (field: string, rule: string, params?: Record<string, string | number>) => ({
      path: ['versions', 'ar', field],
      message: 'never shown',
      rule,
      ...(params === undefined ? {} : { params }),
    });
    expect(fieldErrorOfIssue(issue('subject', 'required'))).toEqual({
      field: 'versions.ar.subject',
      message: 'enter_subject',
    });
    expect(fieldErrorOfIssue(issue('message', 'required'))?.message).toBe('enter_message');
    expect(fieldErrorOfIssue(issue('subject', 'too_long', { max: 255 }))?.message).toBe(
      'subject_too_long',
    );
    expect(fieldErrorOfIssue(issue('message', 'too_long', { max: 20000 }))?.message).toBe(
      'message_too_long',
    );
    expect(fieldErrorOfIssue(issue('message', 'unknown_merge_field', { token: 'x' }))).toEqual({
      field: 'versions.ar.message',
      message: 'unknown_merge_field|x',
    });
    expect(fieldErrorOfIssue(issue('subject', 'version_pair'))?.message).toBe('version_pair');
    expect(fieldErrorOfIssue(issue('subject', 'long_dash'))?.message).toBe('long_dash');
  });

  it('an unknown locale, a rule-less issue or a foreign path maps to no field', () => {
    expect(
      fieldErrorOfIssue({ path: ['versions', 'fr'], message: 'x', rule: 'unknown_locale' }),
    ).toBeNull();
    expect(fieldErrorOfIssue({ path: ['versions', 'en', 'subject'], message: 'x' })).toBeNull();
    expect(fieldErrorOfIssue({ path: ['active'], message: 'x', rule: 'required' })).toBeNull();
  });

  it('readFieldError splits a key from its token', () => {
    expect(readFieldError('unknown_merge_field|x')).toEqual({
      key: 'unknown_merge_field',
      token: 'x',
    });
    expect(readFieldError('enter_subject')).toEqual({ key: 'enter_subject', token: '' });
  });
});
