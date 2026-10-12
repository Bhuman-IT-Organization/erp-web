'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { InlineError } from '@/components/molecules/InlineError';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmOutcome,
  type SummaryChange,
} from '@/components/organisms/ConfirmDialog';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { ChoiceField, type ChoiceOption } from '@/components/molecules/ChoiceField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SchemaForm, type FieldSpec } from '@/components/organisms/SchemaForm';
import { CURRENCY_CODE_MAX } from '@/config/currency-code';
import {
  CURRENCIES_ERRORS,
  CURRENCIES_PATH,
  currenciesPath,
  VALIDATION_CODE,
} from '@/features/currencies/api/currencies.endpoints';
import { useCurrencies } from '@/features/currencies/hooks/use-currencies';
import { useSaveCurrencies } from '@/features/currencies/hooks/use-save-currencies';
import {
  CURRENCIES_MESSAGE_KEYS,
  CURRENCIES_SYMBOL_MAX,
  currenciesFormSchema,
  currenciesRowSchema,
  isCodeLocked,
  isCurrenciesField,
  linesOfUse,
  newCurrenciesForm,
  toCurrenciesForm,
  validationIssuesSchema,
  type Currencies,
  type CurrenciesFormValues,
  type CurrenciesRow,
} from '@/features/currencies/schemas/currencies.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import type { ApiResult } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, revalidateLists, useRowSeed } from '@/lib/api/row-seed';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { isRetryableCode } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useBreadcrumbLabel } from '@/lib/hooks/use-breadcrumb-label';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import { useFormat } from '@/lib/i18n/format';
import { useFormatSettings } from '@/lib/i18n/FormatSettingsProvider';

const LIST_BASE = '/setup/currencies';
const FORM_ID = 'currencies';

interface CurrenciesFormProps {
  /** The record's id from `app/(shell)/setup/currencies/[id]/page.tsx`; `null` on `/setup/currencies/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<Currencies>;
type SaveFailure = Extract<ApiResult<Currencies>, { ok: false }>;

/** The record's api path, or `null` on `/setup/currencies/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof currenciesPath> | null {
  return id === null ? null : currenciesPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: Currencies | undefined): { values?: CurrenciesFormValues } {
  return record === undefined ? {} : { values: toCurrenciesForm(record) };
}

/**
 * True while there is no record to edit (D-39): a permalink before its record answers, or a row
 * opened from the list whose record answers a 4xx. A row whose read fails retryably keeps the form:
 * the row IS the whole record here (a feature whose detail carries more than its row locks the
 * seeded fields and shows the error where the detail is needed, as the staff forms do).
 */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: CurrenciesRow | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

/** The record crumb (WR-10): the name, undefined on /new or while loading, null once a failure shows (D-39). */
function breadcrumbLabel(
  id: string | null,
  record: Currencies | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  // The failure page shows: a failed read with no seed, or a 4xx under a seeded row.
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

/** The last save's failure when a Retry can fix it (the form's alert); a refusal was shown in the dialog. */
function retryableFailure(result: ApiResult<Currencies> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The five fields in the form's order: the order the save summary lists the changed ones in. */
const SUMMARY_FIELDS = [
  'name',
  'symbol',
  'decimalSeparator',
  'thousandSeparator',
  'placement',
] as const satisfies readonly (keyof CurrenciesFormValues)[];
type SummaryField = (typeof SUMMARY_FIELDS)[number];

/** What the form shows for one field: its label and, for a choice, its options' labels. */
interface FieldCopy {
  readonly labels: Readonly<Record<SummaryField, string>>;
  /** Perfex's placeholder for the code (`manage.php` :43, `iso_code`). */
  readonly isoCode: string;
  readonly decimal: readonly ChoiceOption[];
  readonly thousand: readonly ChoiceOption[];
  readonly placement: readonly ChoiceOption[];
  readonly none: string;
}

/** A value as the summary reads it: text as typed, a choice by its option's label, no choice as None. */
function summaryValue(
  value: string | null,
  options: readonly ChoiceOption[] | null,
  none: string,
): string {
  if (value === null) return none;
  if (options === null) return value;
  return options.find((option) => option.value === toChoice(value))?.label ?? value;
}

/**
 * The save summary's lines on `/:id`: one per field whose pending value differs from the record's,
 * labelled as the field, a choice by its option's label (the Payment Modes `fieldChanges` shape).
 */
function fieldChanges(
  pending: CurrenciesFormValues | null,
  record: Currencies | undefined,
  copy: FieldCopy,
): readonly SummaryChange[] {
  if (pending === null || record === undefined) return [];
  const before = toCurrenciesForm(record);
  const options: Readonly<Record<SummaryField, readonly ChoiceOption[] | null>> = {
    name: null,
    symbol: null,
    decimalSeparator: copy.decimal,
    thousandSeparator: copy.thousand,
    placement: copy.placement,
  };
  return SUMMARY_FIELDS.filter((field) => pending[field] !== before[field]).map(
    (field): SummaryChange => ({
      type: 'changed',
      label: copy.labels[field],
      from: summaryValue(before[field], options[field], copy.none),
      to: summaryValue(pending[field], options[field], copy.none),
    }),
  );
}

/**
 * Perfex's "none" thousand separator is the empty text, which the kit's radio group reads as "no
 * choice made"; the radio carries this private value instead and the form keeps `''`.
 */
const NONE_CHOICE = 'none';
function toChoice(value: string | null): string | null {
  return value === '' ? NONE_CHOICE : value;
}
function fromChoice(choice: string | null): string | null {
  return choice === NONE_CHOICE ? '' : choice;
}

/**
 * The one "Details" section of Perfex's modal (`currencies/manage.php` :41-86), its five fields in
 * Perfex's order with Perfex's labels: the code (required, through the one shared code schema,
 * Perfex's ISO code placeholder; read-only while anything uses the currency, D-42 widened), the
 * symbol (required), then the decimal separator, the thousand separator and the placement as radio
 * buttons holding Perfex's options (six or fewer: the kit's radios, lead 2026-09-26).
 */
function detailsFields(copy: FieldCopy, codeLocked: boolean): FieldSpec<CurrenciesFormValues>[] {
  return [
    {
      name: 'name',
      label: copy.labels.name,
      kind: 'text',
      required: true,
      placeholder: copy.isoCode,
      disabled: codeLocked,
    },
    { name: 'symbol', label: copy.labels.symbol, kind: 'text', required: true },
    {
      name: 'decimalSeparator',
      label: copy.labels.decimalSeparator,
      kind: 'choice',
      required: true,
      options: copy.decimal,
    },
    {
      name: 'thousandSeparator',
      label: copy.labels.thousandSeparator,
      kind: 'custom',
      required: true,
      // The kit's choice control, with Perfex's "none" carried as a private value (`toChoice`).
      render: (field, state) => (
        <ChoiceField
          id={state.id}
          label={copy.labels.thousandSeparator}
          options={copy.thousand}
          required
          disabled={state.disabled}
          invalid={state.invalid}
          {...(state.describedBy === '' ? {} : { describedBy: state.describedBy })}
          multiple={false}
          value={toChoice(field.value)}
          onChange={(choice) => {
            field.onChange(fromChoice(choice));
          }}
        />
      ),
    },
    {
      name: 'placement',
      label: copy.labels.placement,
      kind: 'choice',
      required: true,
      options: copy.placement,
    },
  ];
}

/** The labels of the five fields and of every option, in the feature's words (FE-19). */
function useFieldCopy(): FieldCopy {
  const t = useTranslations('currencies');
  const tc = useTranslations('common');
  return {
    isoCode: t('iso_code'),
    labels: {
      name: t('currency_add_edit_description'),
      symbol: t('currency_add_edit_rate'),
      decimalSeparator: t('settings_sales_decimal_separator'),
      thousandSeparator: t('settings_sales_thousand_separator'),
      placement: t('settings_sales_currency_placement'),
    },
    decimal: [
      { value: ',', label: t('separator_comma') },
      { value: '.', label: t('separator_period') },
    ],
    thousand: [
      { value: ',', label: t('separator_comma') },
      { value: '.', label: t('separator_period') },
      { value: "'", label: t('separator_apostrophe') },
      { value: NONE_CHOICE, label: t('separator_none') },
      { value: ' ', label: t('separator_space') },
    ],
    placement: [
      { value: 'before', label: t('settings_sales_currency_placement_before') },
      { value: 'after', label: t('settings_sales_currency_placement_after') },
    ],
    none: tc('none'),
  };
}

/**
 * The notes above the fields: Perfex's code-validity help (`manage.php` :42) as an information
 * note, and, while anything uses the currency, the lock note naming each use and saying what stays
 * editable (D-42 widened, answers 2 and 8 c; the Taxes lock shape, `role="status"`).
 */
function FormNotes({ record }: { readonly record: Currencies | undefined }): ReactElement {
  const t = useTranslations('currencies');
  const f = useFormat();
  const lines =
    record === undefined || !isCodeLocked(record) ? [] : linesOfUse(record, { lock: true });
  return (
    <div className="flex flex-col gap-3">
      <Alert role="note" data-testid="currencies-code-help">
        <AlertDescription>{t('currency_valid_code_help')}</AlertDescription>
      </Alert>
      {lines.length === 0 ? null : (
        <Alert role="status" data-testid="currencies-code-locked">
          <AlertDescription className="text-foreground">
            <p>{t('code_locked_warning')}</p>
            {lines.map((line) => (
              <p key={line.id}>
                {t(line.messageKey, { count: line.count, countN: f.number(line.count) })}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** The `{max}` of each length message: the code's from the one shared code schema, never restated. */
const MAX_OF: Readonly<Record<string, number>> = {
  [CURRENCIES_MESSAGE_KEYS.nameTooLong]: CURRENCY_CODE_MAX,
  [CURRENCIES_MESSAGE_KEYS.symbolTooLong]: CURRENCIES_SYMBOL_MAX,
};

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: Currencies | undefined,
  noun: string,
): { readonly recordName: string } | { readonly noun: string } {
  return record === undefined ? { noun } : { recordName: record.name };
}

/**
 * The page while `waitsForRecord`: the form's shape until the record answers, then the record or
 * why not, with "Back to list" leading out (D-39, lead 2026-09-27).
 */
function RecordState({
  item,
  errorText,
  backLabel,
}: {
  readonly item: RecordRead;
  readonly errorText: ReturnType<typeof useErrorText>;
  readonly backLabel: string;
}): ReactElement {
  if (item.error === undefined) return <PageSkeleton variant="form" />;
  return (
    <InlineError
      message={errorText(item.error)}
      busy={item.isValidating}
      {...(item.error.retryable
        ? {
            onRetry: () => {
              void item.mutate();
            },
          }
        : {})}
      back={{ href: readListReturn(LIST_BASE), label: backLabel }}
    />
  );
}

/**
 * The create and edit form on the kit's `SchemaForm` (UIK-06): the sections, the required marks,
 * the error summary and the sticky save bar are the kit's; this screen owns its fields and its save.
 * Every save is confirmed by a summary of what changes (D-25.4). The outcome decides where it shows
 * (D-29): success returns to the list the user came from with the saved row swapped in (D-28,
 * D-36); a field problem closes the dialog and lands under the field and in the focused summary; a
 * network or server failure becomes the form's alert with Retry, which re-sends without asking
 * again; anything else is a refusal and stays inside the dialog. A dirty form asks before any
 * in-app navigation (D-25.3; browser Back is D-40's known limit). The labels are the shared verb
 * plus this feature's noun (`common.save_noun` + `noun_currency`, UI-SPEC choice 36). The
 * title is the 24px page title, and the record's name goes to the shell's breadcrumb through
 * `useBreadcrumbLabel`, `null` once a failure shows, so the crumb is never a skeleton forever.
 */
export function CurrenciesForm({ id }: CurrenciesFormProps): ReactElement {
  const t = useTranslations('currencies');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  // The deployment's number format seeds a new currency's separators, as Perfex's modal does with
  // its `get_option` values (manage.php :122-126); read in render, no effect (FE-04).
  const format = useFormatSettings();
  // The feature's own codes first: a permalink to a missing record says so, not "Something went wrong".
  const errorText = useErrorText(CURRENCIES_ERRORS);
  const copy = useConfirmCopy();
  const fields = useFieldCopy();
  // The row the list was clicked on renders at once; the full record replaces it (D-35). It is read
  // as a LIST row, so an edit can swap the saved record back into the list without dropping what
  // the list row adds.
  const seed = useRowSeed(recordPath(id), currenciesRowSchema);
  const item = useCurrencies(id);
  const record = item.data ?? seed;
  const form = useForm<CurrenciesFormValues>({
    resolver: zodResolver(currenciesFormSchema),
    defaultValues: newCurrenciesForm(format),
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveCurrencies(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again (D-29).
  const lastSent = useRef<CurrenciesFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<CurrenciesFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list (D-28, D-36). */
  async function afterSave(saved: Currencies): Promise<void> {
    form.reset(toCurrenciesForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      // A new record moves totals and positions; a permalink edit knows nothing the list row adds:
      // the list pages ask again.
      await revalidateLists(CURRENCIES_PATH);
    } else {
      // The saved record plus what the list row adds, which an edit does not change (D-36).
      const row: CurrenciesRow = { ...seed, ...saved };
      await replaceRowInLists(CURRENCIES_PATH, row, (one: CurrenciesRow) => one.id === row.id);
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows (D-29); `{ ok: true }` tells the dialog its part is done. */
  async function send(values: CurrenciesFormValues): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const outcome = await mutation.trigger(values);
    if (outcome.ok) {
      await afterSave(outcome.data);
      return { ok: true };
    }
    if (outcome.code === VALIDATION_CODE) {
      // The api's own `message` is never read; a malformed body shows no field error (T-3-26).
      const issues = validationIssuesSchema.safeParse(outcome.issues);
      flushSync(() => {
        setPending(null);
        for (const issue of issues.success ? issues.data : []) {
          const field = issue.path[0];
          if (isCurrenciesField(field)) {
            form.setError(field, { message: CURRENCIES_MESSAGE_KEYS[field] });
          }
        }
      });
      // The summary is SchemaForm's (its test id is the kit's contract): focus moves to it (D-29).
      document
        .getElementById(FORM_ID)
        ?.querySelector<HTMLElement>('[data-testid="error-summary"]')
        ?.focus();
      return { ok: true };
    }
    if (isRetryableCode(outcome.code)) {
      setPending(null);
      return { ok: true };
    }
    return outcome;
  }

  // A hook, so before the early return below: the shell's crumb names the record, or stops waiting.
  useBreadcrumbLabel(breadcrumbLabel(id, record, item));

  if (waitsForRecord(id, item, seed)) {
    return <RecordState item={item} errorText={errorText} backLabel={tc('back_to_list')} />;
  }

  const failure = retryableFailure(mutation.result);
  const noun = t('currency_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = fieldChanges(pending, record, fields);

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('currency_add_heading')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: detailsFields(fields, isCodeLocked(record)),
          },
        ]}
        notice={<FormNotes record={record} />}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(MAX_OF[key] ?? CURRENCY_CODE_MAX) })}
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        isPending={mutation.isMutating}
        onBack={() => {
          guard.requestLeave(readListReturn(LIST_BASE));
        }}
        serverError={
          failure === null
            ? null
            : {
                message: errorText(failure),
                onRetry: () => {
                  if (lastSent.current !== null) void send(lastSent.current);
                },
              }
        }
      />
      <ConfirmDialog
        kind="summary"
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={summaryTitle()}
        changes={changes}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        // A refusal stays in the dialog in the feature's words: a 404 reads "no longer exists" (D-32).
        featureErrors={CURRENCIES_ERRORS}
        onConfirm={() => (pending === null ? { ok: true } : send(pending))}
      />
      <ConfirmDialog
        kind="discard"
        open={guard.pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) guard.cancelLeave();
        }}
        {...copy.discard(discardTarget(record, noun))}
        onConfirm={() => {
          guard.confirmLeave();
          return { ok: true };
        }}
      />
    </div>
  );
}

/** The route's guards (UIK-03): the form skeleton while the session or `/me` is unknown (D-39). */
export const GuardedCurrenciesForm = withAuth(
  withPermission(CurrenciesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
