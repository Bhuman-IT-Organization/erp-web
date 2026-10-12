'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch, type Path, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { InlineError } from '@/components/molecules/InlineError';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmOutcome,
  type SummaryChange,
} from '@/components/organisms/ConfirmDialog';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import {
  SchemaForm,
  type FieldSpec,
  type FormSectionSpec,
} from '@/components/organisms/SchemaForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PERMISSIONS } from '@/config/permissions';
import {
  MAIL_ERRORS,
  MAIL_TEMPLATES_PATH,
  STALE_CODE,
  VALIDATION_CODE,
  mailPaths,
} from '@/features/mail/api/mail.endpoints';
import { AUDIENCE_KEYS, EMAIL_TEMPLATES_BASE } from '@/features/mail/components/EmailTemplatesList';
import { tokenText, type MergeField } from '@/features/mail/components/InsertMergeField';
import { MergeFieldInput, MergeFieldTextarea } from '@/features/mail/components/MergeFieldInputs';
import { TemplatePreview } from '@/features/mail/components/TemplatePreview';
import { useEmailTemplate } from '@/features/mail/hooks/use-email-templates';
import { useSaveEmailTemplate } from '@/features/mail/hooks/use-save-email-template';
import { templateNameKey } from '@/features/mail/schemas/mail-names';
import {
  ENGLISH_LOCALE,
  MAIL_MESSAGE_MAX,
  MAIL_SUBJECT_MAX,
  emailTemplateFormSchema,
  fieldErrorOfIssue,
  readFieldError,
  templateListItemSchema,
  toEmailTemplateForm,
  toTemplateSaveBody,
  validationIssuesSchema,
  type EmailTemplateFormValues,
  type MailAudience,
  type TemplateListItem,
  type TemplateResponse,
  type TemplateSaveBody,
  type VersionValues,
} from '@/features/mail/schemas/mail.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import type { ApiResult } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import type { ApiError } from '@/lib/api/api-error';
import { replaceRowInLists, useRowSeed } from '@/lib/api/row-seed';
import { usePermissions } from '@/lib/auth/use-permissions';
import { isRetryableCode, type FeatureErrorCodes } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useBreadcrumbLabel } from '@/lib/hooks/use-breadcrumb-label';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import { useFormat } from '@/lib/i18n/format';
import { useQueryParam } from '@/lib/url/use-query-state';

const FORM_ID = 'email-template';
/** The sent-email log (plan 10), filtered by a template KEY. */
const SENT_EMAILS_BASE = '/setup/sent-emails';
/** What a 412 reads as here: the template's own words, "changed by someone else" (UI-SPEC § Failures). */
const STALE_MESSAGE_CODE = 'ERP-MAIL-0003';
/** The editor's codes: the feature's, plus the stale message the summary shows for a 412. */
const EDITOR_ERRORS: FeatureErrorCodes = {
  namespace: MAIL_ERRORS.namespace,
  codes: [...MAIL_ERRORS.codes, STALE_MESSAGE_CODE],
};
const EMPTY_FORM: EmailTemplateFormValues = { active: false, versions: {} };
const EMPTY_VERSION: VersionValues = { subject: '', message: '' };
/** `resetOptions` keeps dirty values (for the record read); a save or a reload replaces them. */
const CLEAN = { keepDirtyValues: false } as const;

type Values = EmailTemplateFormValues;
type Form = UseFormReturn<Values>;
type Translate = ReturnType<typeof useTranslations<'mail'>>;
type SaveFailure = Extract<ApiResult<TemplateResponse>, { ok: false }>;

/** What the form keeps showing after a save: the stale alert (D-14), the reload ask, a stray 400. */
interface Notice {
  readonly stale: boolean;
  readonly reloadAsk: boolean;
  /** A 400 whose issue names no field (`unknown_locale`, never expected): the form's alert. */
  readonly invalid: boolean;
}
const NO_NOTICE: Notice = { stale: false, reloadAsk: false, invalid: false };

/** What the title names: the template, its module and who it is sent to. */
interface Title {
  readonly name: string;
  readonly active: boolean;
  readonly module: string;
  readonly audience: MailAudience | null;
}

/** A template's name in the interface language, or its raw key when no name is known. */
function nameOf(t: Translate, key: string): string {
  const nameKey = templateNameKey(key);
  return nameKey === null ? key : t(nameKey);
}

const titleOf = (t: Translate, row: TemplateListItem | TemplateResponse): Title => ({
  name: nameOf(t, row.key),
  active: row.active,
  module: row.module,
  audience: row.audience,
});

/** The title row (UI-SPEC § Template editor): the name with its Active badge, then module and audience. */
function TitleRow({ title }: { readonly title: Title }): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const audience = title.audience === null ? tc('none') : t(AUDIENCE_KEYS[title.audience]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-2xl font-semibold wrap-anywhere">{title.name}</h1>
        <StatusBadge
          status={title.active ? 'active' : 'inactive'}
          label={t(title.active ? 'active' : 'inactive')}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t('title_meta', { module: t('module_label', { module: title.module }), audience })}
      </p>
    </div>
  );
}

/** While the record is unknown: the form's shape (with the row's title when the list seeded it), then why not. */
function LoadState({
  title,
  error,
  busy,
  retry,
}: {
  readonly title: Title | undefined;
  readonly error: ApiError | undefined;
  readonly busy: boolean;
  readonly retry: () => void;
}): ReactElement {
  const tc = useTranslations('common');
  const errorText = useErrorText(EDITOR_ERRORS);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {title === undefined ? null : <TitleRow title={title} />}
      {error === undefined ? (
        <PageSkeleton variant="form" />
      ) : (
        <InlineError
          message={errorText(error)}
          busy={busy}
          {...(error.retryable ? { onRetry: retry } : {})}
          back={{ href: readListReturn(EMAIL_TEMPLATES_BASE), label: tc('back_to_list') }}
        />
      )}
    </div>
  );
}

/** The stale alert (D-14): someone else saved; Reload goes through "Discard changes?" when dirty. */
function StaleAlert({ onReload }: { readonly onReload: () => void }): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const noun = t('noun_email_template');
  return (
    <Alert variant="destructive" data-testid="record-stale">
      <Icon name="triangle-exclamation" />
      <AlertDescription className="flex flex-col items-start gap-2 text-destructive">
        <span>{tc('record_stale', { noun })}</span>
        <Button type="button" variant="outline" className="text-foreground" onClick={onReload}>
          {tc('reload_noun', { noun })}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** The neutral notices above the form: formatting dropped at seed time; a template no module defines. */
function Notices({ record }: { readonly record: TemplateResponse }): ReactElement | null {
  const t = useTranslations('mail');
  const undefinedTemplate = record.mergeFields.length === 0;
  if (!record.formattingDropped && !undefinedTemplate) return null;
  return (
    <div className="flex max-w-5xl flex-col gap-2">
      {undefinedTemplate ? (
        <Alert data-testid="template-undefined">
          <AlertDescription>{t('template_undefined_notice')}</AlertDescription>
        </Alert>
      ) : null}
      {record.formattingDropped ? (
        <Alert data-testid="formatting-dropped">
          <AlertDescription>{t('formatting_dropped')}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** Details (UI-SPEC § Section 1): the name, module and audience as text, as Perfex shows the title. */
function DetailsList({ title }: { readonly title: Title }): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const rows = [
    { term: t('template_name'), value: title.name },
    { term: t('module'), value: t('module_label', { module: title.module }) },
    {
      term: t('sent_to'),
      value: title.audience === null ? tc('none') : t(AUDIENCE_KEYS[title.audience]),
    },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.term} className="flex min-w-0 flex-col gap-1">
          <dt className="text-sm font-semibold">{row.term}</dt>
          <dd className="text-sm wrap-anywhere">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What the version sections need besides the form: who may edit and where focus points the preview. */
interface VersionContext {
  readonly t: Translate;
  readonly editable: boolean;
  readonly fields: readonly MergeField[];
  readonly onFocusLocale: (locale: string) => void;
}

/** "Subject ({language})" or "Email message ({language})": the full label, also the summary's. */
function fieldLabel(t: Translate, field: 'subject' | 'message', locale: string): string {
  return t('label_in_language', {
    label: t(field === 'subject' ? 'template_subject' : 'email_template_email_message'),
    language: t('locale_label', { locale }),
  });
}

/** One locale's section (UI-SPEC § Sections 2 to n): its helper, then the subject and the message. */
function versionSection(locale: string, context: VersionContext): FormSectionSpec<Values> {
  const { t, editable, fields, onFocusLocale } = context;
  const english = locale === ENGLISH_LOCALE;
  const language = t('locale_label', { locale });
  const required = editable && english;
  const spec = (field: 'subject' | 'message'): FieldSpec<Values> => {
    const label = fieldLabel(t, field, locale);
    return {
      name: `versions.${locale}.${field}` as Path<Values>,
      label,
      kind: 'custom',
      required,
      disabled: !editable,
      render: (control, state) => {
        const shared = {
          id: state.id,
          label,
          describedBy: state.describedBy,
          invalid: state.invalid,
          disabled: state.disabled,
          value: typeof control.value === 'string' ? control.value : '',
          onChange: control.onChange,
          onFocus: () => {
            onFocusLocale(locale);
          },
          locale,
          fields,
          required,
        };
        return field === 'subject' ? (
          <MergeFieldInput {...shared} />
        ) : (
          <MergeFieldTextarea {...shared} helper={t('message_helper')} />
        );
      },
    };
  };
  return {
    id: `version-${locale}`,
    title: language,
    notice: (
      <p className="text-xs text-muted-foreground">
        {english ? t('english_version_helper') : t('other_version_helper', { language })}
      </p>
    ),
    fields: [spec('subject'), spec('message')],
  };
}

/** The form's sections: Details (with Active and the log link), then one per supported locale. */
function sectionsOf(args: {
  readonly record: TemplateResponse;
  readonly title: Title;
  readonly context: VersionContext;
  readonly canViewLog: boolean;
}): FormSectionSpec<Values>[] {
  const { record, title, context, canViewLog } = args;
  const { t, editable } = context;
  const logHref = `${SENT_EMAILS_BASE}?filter[template][in]=${encodeURIComponent(record.key)}`;
  const details: FormSectionSpec<Values> = {
    id: 'details',
    title: t('section_details'),
    notice: <DetailsList title={title} />,
    fields: [
      {
        name: 'active',
        label: t('active'),
        kind: 'checkbox',
        helper: t('active_helper'),
        disabled: !editable,
      },
    ],
    ...(canViewLog
      ? {
          content: (
            <Link href={logHref} className="w-fit text-sm underline underline-offset-4">
              {t('view_sent_emails_of_template')}
            </Link>
          ),
        }
      : {}),
  };
  return [details, ...record.locales.map((locale) => versionSection(locale, context))];
}

/**
 * The summary's lines (D-25.4, UI-SPEC § Save summary): Active as "from → to" first with the alert
 * mark (switching a template off stops an email); then per locale "{language} version added",
 * "{language} version removed", or each changed field as "updated". Wording is never echoed.
 */
function changesOf(
  body: TemplateSaveBody | null,
  record: TemplateResponse,
  t: Translate,
): readonly SummaryChange[] {
  if (body === null) return [];
  const word = (active: boolean): string => t(active ? 'active' : 'inactive');
  const lines: SummaryChange[] = [];
  if (body.active !== record.active) {
    const change = { from: word(record.active), to: word(body.active) };
    lines.push({ type: 'changed', label: t('active'), ...change, access: true });
  }
  const versions = record.locales.flatMap((locale) =>
    versionLines(t, locale, record.versions[locale], body.versions[locale] ?? null),
  );
  return [...lines, ...versions];
}

/** One locale's lines: the version added or removed, else each field that changed as "updated". */
function versionLines(
  t: Translate,
  locale: string,
  before: VersionValues | undefined,
  after: VersionValues | null,
): SummaryChange[] {
  const language = t('locale_label', { locale });
  if (before === undefined) {
    return after === null ? [] : [{ type: 'text', text: t('summary_version_added', { language }) }];
  }
  if (after === null) {
    return [{ type: 'text', text: t('summary_version_removed', { language }) }];
  }
  return (['subject', 'message'] as const)
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ type: 'updated', label: fieldLabel(t, field, locale) }));
}

/** The list row the save gives back (D-36): the record's fields and the locales that have a version. */
const rowOf = (saved: TemplateResponse): TemplateListItem => ({
  id: saved.id,
  key: saved.key,
  module: saved.module,
  audience: saved.audience,
  active: saved.active,
  locales: Object.keys(saved.versions),
});

/** Puts each 400 issue under its field; true when one named no field (the form's alert). */
function showIssues(form: Form, issues: unknown): boolean {
  const parsed = validationIssuesSchema.safeParse(issues);
  let stray = !parsed.success;
  for (const issue of parsed.success ? parsed.data : []) {
    const error = fieldErrorOfIssue(issue);
    if (error === null) stray = true;
    else form.setError(error.field, { message: error.message });
  }
  return stray;
}

/** The last save's failure when a Retry can fix it (the form's alert); a refusal stays in the dialog. */
function retryableFailure(result: ApiResult<TemplateResponse> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** A field error in words: its key, with the token in braces and the limit in the customer's digits. */
function useTranslateError(): (message: string) => string {
  const t = useTranslations('mail');
  const f = useFormat();
  return (message) => {
    const { key, token } = readFieldError(message);
    const max = key === 'subject_too_long' ? MAIL_SUBJECT_MAX : MAIL_MESSAGE_MAX;
    return t(key, { token: tokenText(token), max: f.number(max) });
  };
}

interface EditorProps {
  readonly id: string;
  readonly record: TemplateResponse;
  readonly reread: () => Promise<TemplateResponse | undefined>;
}

/**
 * The editor once its record is known. `editable` needs `.edit` AND a template a module still
 * defines (merge fields known): otherwise every field is disabled, there is no save and no test
 * (D-09, T-4.3-29); the preview still works.
 */
function Editor({ id, record, reread }: EditorProps): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const router = useRouter();
  const errorText = useErrorText(EDITOR_ERRORS);
  const translateError = useTranslateError();
  const copy = useConfirmCopy();
  const { can, isAdmin } = usePermissions();
  const form: Form = useForm<Values>({
    resolver: zodResolver(
      emailTemplateFormSchema(
        record.locales,
        record.mergeFields.map((field) => field.token),
      ),
    ),
    defaultValues: EMPTY_FORM,
    values: toEmailTemplateForm(record),
    resetOptions: { keepDirtyValues: true },
  });
  const save = useSaveEmailTemplate(id);
  const guard = useUnsavedChanges(form.formState.isDirty && !save.isMutating);
  const lastSent = useRef<TemplateSaveBody | null>(null);
  const [pending, setPending] = useState<TemplateSaveBody | null>(null);
  const [notice, setNotice] = useState<Notice>(NO_NOTICE);
  const [previewParam, setPreview] = useQueryParam('preview', {
    defaultValue: ENGLISH_LOCALE,
    history: 'replace',
  });
  const versions = useWatch({ control: form.control, name: 'versions' });
  const editable = can(PERMISSIONS.settings.emailTemplates.edit) && record.mergeFields.length > 0;
  const title = titleOf(t, record);
  const noun = t('noun_email_template');
  const submitLabel = tc('save_noun', { noun });
  const pendingLabel = tc('saving_noun', { noun });
  const previewLocale = record.locales.includes(previewParam) ? previewParam : ENGLISH_LOCALE;

  async function reload(): Promise<void> {
    const next = await reread();
    if (next !== undefined) form.reset(toEmailTemplateForm(next), CLEAN);
    setNotice(NO_NOTICE);
  }

  function afterRefusal(outcome: SaveFailure): ConfirmOutcome {
    if (outcome.code === STALE_CODE) {
      // The summary refuses in the template's words with Confirm disabled; the form keeps the alert.
      setNotice({ ...NO_NOTICE, stale: true });
      return { ok: false, code: STALE_MESSAGE_CODE, retryAfterS: null };
    }
    if (outcome.code === VALIDATION_CODE) {
      flushSync(() => {
        setPending(null);
        if (showIssues(form, outcome.issues)) setNotice({ ...NO_NOTICE, invalid: true });
      });
      document
        .getElementById(FORM_ID)
        ?.querySelector<HTMLElement>('[data-testid="error-summary"]')
        ?.focus();
      return { ok: true };
    }
    if (!isRetryableCode(outcome.code)) return outcome;
    setPending(null);
    return { ok: true };
  }

  /** One save with the record's fingerprint (ADR-0040, T-4.3-15) and where its outcome shows (D-29). */
  async function send(body: TemplateSaveBody): Promise<ConfirmOutcome> {
    lastSent.current = body;
    const outcome = await save.trigger(body, { ifMatch: record.etag });
    if (!outcome.ok) return afterRefusal(outcome);
    form.reset(toEmailTemplateForm(outcome.data), CLEAN);
    await replaceRowInLists(MAIL_TEMPLATES_PATH, rowOf(outcome.data), (row: TemplateListItem) => {
      return row.id === outcome.data.id;
    });
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(EMAIL_TEMPLATES_BASE), { scroll: false });
    return { ok: true };
  }

  const failure = retryableFailure(save.result);
  const serverError = notice.invalid
    ? { message: errorText({ code: VALIDATION_CODE, retryAfterS: null }) }
    : failure && {
        message: errorText(failure),
        onRetry: () => {
          if (lastSent.current !== null) void send(lastSent.current);
        },
      };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <TitleRow title={title} />
      <Notices record={record} />
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <div className="min-w-0">
          <SchemaForm
            id={FORM_ID}
            form={form}
            readOnly={!editable}
            notice={
              notice.stale ? (
                <StaleAlert
                  onReload={() => {
                    if (form.formState.isDirty) setNotice({ ...notice, reloadAsk: true });
                    else void reload();
                  }}
                />
              ) : null
            }
            sections={sectionsOf({
              record,
              title,
              canViewLog: isAdmin,
              context: { t, editable, fields: record.mergeFields, onFocusLocale: setPreview },
            })}
            onValid={(values) => {
              setNotice({ ...notice, invalid: false });
              setPending(toTemplateSaveBody(values, record.locales));
            }}
            translateError={translateError}
            submitLabel={submitLabel}
            pendingLabel={pendingLabel}
            isPending={save.isMutating}
            onBack={() => {
              guard.requestLeave(readListReturn(EMAIL_TEMPLATES_BASE));
            }}
            serverError={serverError}
          />
        </div>
        <div className="min-w-0 xl:sticky xl:top-[calc(var(--page-header-height)+1rem)] xl:-m-px xl:p-px xl:max-h-[calc(100svh-var(--page-header-height)-6.25rem)] xl:overflow-y-auto">
          <TemplatePreview
            templateId={id}
            templateName={title.name}
            locales={record.locales}
            locale={previewLocale}
            onLocaleChange={setPreview}
            draftOf={(locale) => versions[locale] ?? EMPTY_VERSION}
            test={editable ? record.sendTest : null}
            canViewLog={isAdmin}
          />
        </div>
      </div>
      <ConfirmDialog
        kind="summary"
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={tc('save_summary_title', { name: title.name })}
        changes={changesOf(pending, record, t)}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        featureErrors={EDITOR_ERRORS}
        onConfirm={() => (pending === null ? { ok: true } : send(pending))}
      />
      <ConfirmDialog
        kind="discard"
        open={guard.pendingHref !== null || notice.reloadAsk}
        onOpenChange={(open) => {
          if (open) return;
          guard.cancelLeave();
          setNotice({ ...notice, reloadAsk: false });
        }}
        {...copy.discard({ recordName: title.name })}
        onConfirm={() => {
          if (notice.reloadAsk) void reload();
          else guard.confirmLeave();
          return { ok: true };
        }}
      />
    </div>
  );
}

/** The record crumb (WR-10): the name once known; `null` once a failure shows (D-39). */
function crumbOf(title: Title | undefined, error: ApiError | undefined, known: boolean) {
  if (!known && error !== undefined) return null;
  return title?.name;
}

interface EmailTemplateFormProps {
  /** The template's id from `app/(shell)/setup/email-templates/[id]/page.tsx`. */
  readonly id: string;
}

/**
 * The email template editor (04.3 UI-SPEC § Template editor; Perfex's
 * `application/views/admin/emails/template.php`): the title with its Active badge, the formatting
 * notice, Details (the name, module and audience as text, the Active checkbox applied on Save, the
 * log link for administrators), one section per supported locale with English required and every
 * other optional (D-08), each subject and message in that locale's direction with Insert merge field
 * (`MergeFieldInput`, `MergeFieldTextarea`), and beside them from `xl` the live preview with
 * "Send a test to me" (`TemplatePreview`, `?preview=<locale>` following focus).
 *
 * The client refuses what the api refuses, with the same keys (`emailTemplateFormSchema`); an api
 * 400 lands on its field by `rule`. Every save is confirmed by the summary (D-25.4) and sends the
 * record's `etag` as `If-Match` (ADR-0040): a 412 refuses in the summary with the template's words
 * and the form keeps "Reload email template" (through "Discard changes?" when dirty); the form is
 * never reset by a failure. Success swaps the row into the cached list pages, toasts and returns to
 * the exact list URL (D-28, D-36). Text only: wording is never rendered as markup (T-4.3-02).
 */
export function EmailTemplateForm({ id }: EmailTemplateFormProps): ReactElement {
  const t = useTranslations('mail');
  const seed = useRowSeed(mailPaths.template(id), templateListItemSchema);
  const item = useEmailTemplate(id);
  const record = item.data;
  const known = record ?? seed;
  const title = known === undefined ? undefined : titleOf(t, known);
  useBreadcrumbLabel(crumbOf(title, item.error, record !== undefined));
  if (record === undefined) {
    return (
      <LoadState
        title={title}
        error={item.error}
        busy={item.isValidating}
        retry={() => {
          void item.mutate();
        }}
      />
    );
  }
  return <Editor id={id} record={record} reread={() => item.mutate()} />;
}

/** The route's guards (UIK-03): the form skeleton while the session or `/me` is unknown (D-39). */
export const GuardedEmailTemplateForm = withAuth(
  withPermission(EmailTemplateForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
