'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { InlineError } from '@/components/molecules/InlineError';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmOutcome,
  type SummaryChange,
} from '@/components/organisms/ConfirmDialog';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { SchemaForm, type FieldSpec } from '@/components/organisms/SchemaForm';
import {
  PAYMENT_MODES_ERRORS,
  PAYMENT_MODES_PATH,
  paymentModesPath,
  VALIDATION_CODE,
} from '@/features/payment-modes/api/payment-modes.endpoints';
import { usePaymentModes } from '@/features/payment-modes/hooks/use-payment-modes';
import { useSavePaymentModes } from '@/features/payment-modes/hooks/use-save-payment-modes';
import {
  EMPTY_PAYMENT_MODES_FORM,
  PAYMENT_MODES_MESSAGE_KEYS,
  PAYMENT_MODES_NAME_MAX,
  paymentModesFormSchema,
  paymentModesRowSchema,
  isPaymentModesField,
  toPaymentModesForm,
  validationIssuesSchema,
  type PaymentModes,
  type PaymentModesFormValues,
  type PaymentModesRow,
} from '@/features/payment-modes/schemas/payment-modes.schema';
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

const LIST_BASE = '/setup/payment-modes';
const FORM_ID = 'payment-modes';

interface PaymentModesFormProps {
  /** The record's id from `app/(shell)/setup/payment-modes/[id]/page.tsx`; `null` on `/setup/payment-modes/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<PaymentModes>;
type SaveFailure = Extract<ApiResult<PaymentModes>, { ok: false }>;

/** The record's api path, or `null` on `/setup/payment-modes/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof paymentModesPath> | null {
  return id === null ? null : paymentModesPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: PaymentModes | undefined): { values?: PaymentModesFormValues } {
  return record === undefined ? {} : { values: toPaymentModesForm(record) };
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
  seed: PaymentModesRow | undefined,
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
  record: PaymentModes | undefined,
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
function retryableFailure(result: ApiResult<PaymentModes> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The seven fields in the form's order: the order the save summary lists the changed ones in. */
const SUMMARY_FIELDS = [
  'name',
  'description',
  'active',
  'showOnPdf',
  'selectedByDefault',
  'invoicesOnly',
  'expensesOnly',
] as const satisfies readonly (keyof PaymentModesFormValues)[];
type SummaryField = (typeof SUMMARY_FIELDS)[number];

/** A field's value as the summary reads it: text as text, a box in Perfex's Yes and No. */
function summaryValue(value: string | boolean, yesNo: { yes: string; no: string }): string {
  if (typeof value === 'string') return value;
  return value ? yesNo.yes : yesNo.no;
}

/**
 * The save summary's lines on `/:id`: one per field whose pending value differs from the record's,
 * labelled as the field (the Taxes `fieldChanges` shape over the seven fields).
 */
function fieldChanges(
  pending: PaymentModesFormValues | null,
  record: PaymentModes | undefined,
  labels: Readonly<Record<SummaryField, string>>,
  yesNo: { yes: string; no: string },
): readonly SummaryChange[] {
  if (pending === null || record === undefined) return [];
  return SUMMARY_FIELDS.filter((field) => pending[field] !== record[field]).map(
    (field): SummaryChange => ({
      type: 'changed',
      label: labels[field],
      from: summaryValue(record[field], yesNo),
      to: summaryValue(pending[field], yesNo),
    }),
  );
}

/**
 * Perfex's form rule for the two "only" boxes (`paymentmode.php` :70-82): while one is ticked and
 * the other is not, the other is disabled; a record saved with both ticked shows both enabled, so
 * either can be cleared. Computed in render from the watched values (no effect, FE-04).
 */
function exclusiveDisabled(
  invoicesOnly: boolean,
  expensesOnly: boolean,
): { readonly invoicesOnly: boolean; readonly expensesOnly: boolean } {
  return {
    invoicesOnly: expensesOnly && !invoicesOnly,
    expensesOnly: invoicesOnly && !expensesOnly,
  };
}

/**
 * The one "Details" section of Perfex's modal (`paymentmode.php` :20-46), its seven fields in
 * Perfex's order with Perfex's labels: the name (required), the description with Perfex's tooltip
 * as its helper, then the five boxes. No show-to-client field: Perfex's form has none (D-35).
 */
function detailsFields(
  labels: Readonly<Record<SummaryField, string>>,
  descriptionHelper: string,
  disabled: { readonly invoicesOnly: boolean; readonly expensesOnly: boolean },
): FieldSpec<PaymentModesFormValues>[] {
  return [
    { name: 'name', label: labels.name, kind: 'text', required: true },
    {
      name: 'description',
      label: labels.description,
      kind: 'textarea',
      helper: descriptionHelper,
    },
    { name: 'active', label: labels.active, kind: 'checkbox' },
    { name: 'showOnPdf', label: labels.showOnPdf, kind: 'checkbox' },
    { name: 'selectedByDefault', label: labels.selectedByDefault, kind: 'checkbox' },
    {
      name: 'invoicesOnly',
      label: labels.invoicesOnly,
      kind: 'checkbox',
      disabled: disabled.invoicesOnly,
    },
    {
      name: 'expensesOnly',
      label: labels.expensesOnly,
      kind: 'checkbox',
      disabled: disabled.expensesOnly,
    },
  ];
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: PaymentModes | undefined,
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
 * The Payment Modes create and edit pages of Perfex's modal `paymentmodes/paymentmode.php` (D-04:
 * the modal became `/new` and `/:id`) on the kit's `SchemaForm` (UIK-06): one "Details" section
 * with Perfex's seven fields (D-34): Payment Mode Name (required, trimmed, 1 to 100 characters, every
 * character accepted; a name another mode holds is accepted, as in Perfex), the description (any
 * text, sent as typed; the api stores it as Perfex does) with Perfex's tooltip as its helper, Active
 * (ticked on `/new`, paymentmode.php :93), Show on PDF, Selected by default on invoice, and Invoices
 * Only and Expenses Only, each disabling the other while ticked as Perfex's form does. Every box is
 * sent, so an unticked one saves 0. No show-to-client field (D-35). Every save is confirmed by a
 * summary of what changes, one line per changed field (D-25.4). The outcome decides where it shows
 * (D-29): success returns to the list the user came from with the saved row swapped in (D-28,
 * D-36); a field problem closes the dialog and lands under the field and in the focused summary; a
 * network or server failure becomes the form's alert with Retry, which re-sends without asking
 * again; anything else (a mode deleted meanwhile) is a refusal and stays inside the dialog in the
 * feature's words. A dirty form asks before any in-app navigation (D-25.3; browser Back is D-40's
 * known limit). The labels are the shared verb plus Perfex's lowercase noun (`common.save_noun` +
 * `payment_mode_lowercase`). The title is the 24px page title (`payment_mode_add_heading` on
 * `/new`, the record name on `/:id`), and the record's name goes to the shell's breadcrumb through
 * `useBreadcrumbLabel`, `null` once a failure shows. Names and descriptions render as React text
 * only (T-4.1-124).
 */
export function PaymentModesForm({ id }: PaymentModesFormProps): ReactElement {
  const t = useTranslations('payment-modes');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  // The feature's own codes first: a permalink to a missing record says so, not "Something went wrong".
  const errorText = useErrorText(PAYMENT_MODES_ERRORS);
  const copy = useConfirmCopy();
  // The row the list was clicked on renders at once; the full record replaces it (D-35). It is read
  // as a LIST row, so an edit can swap the saved record back into the list without dropping what
  // the list row adds.
  const seed = useRowSeed(recordPath(id), paymentModesRowSchema);
  const item = usePaymentModes(id);
  const record = item.data ?? seed;
  const form = useForm<PaymentModesFormValues>({
    resolver: zodResolver(paymentModesFormSchema),
    defaultValues: EMPTY_PAYMENT_MODES_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSavePaymentModes(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again (D-29).
  const lastSent = useRef<PaymentModesFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<PaymentModesFormValues | null>(null);
  // The two "only" boxes, watched so their disabled state is computed in render (FE-04).
  const [invoicesOnly, expensesOnly] = useWatch({
    control: form.control,
    name: ['invoicesOnly', 'expensesOnly'],
  });

  /** After a save: the caches from the returned record, the toast, back to the list (D-28, D-36). */
  async function afterSave(saved: PaymentModes): Promise<void> {
    form.reset(toPaymentModesForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      // A new record moves totals and positions; a permalink edit knows nothing the list row adds:
      // the list pages ask again.
      await revalidateLists(PAYMENT_MODES_PATH);
    } else {
      // The saved record plus what the list row adds, which an edit does not change (D-36).
      const row: PaymentModesRow = { ...seed, ...saved };
      await replaceRowInLists(PAYMENT_MODES_PATH, row, (one: PaymentModesRow) => one.id === row.id);
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows (D-29); `{ ok: true }` tells the dialog its part is done. */
  async function send(values: PaymentModesFormValues): Promise<ConfirmOutcome> {
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
          if (isPaymentModesField(field)) {
            form.setError(field, { message: PAYMENT_MODES_MESSAGE_KEYS[field] });
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
  const noun = t('payment_mode_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const labels = {
    name: t('payment_mode_add_edit_name'),
    description: t('payment_mode_add_edit_description'),
    active: t('payment_mode_add_edit_active'),
    // Perfex's `{0}` is the description's label (`paymentmode.php` :30).
    showOnPdf: t('show_on_invoice_on_pdf', { 0: t('payment_mode_add_edit_description') }),
    selectedByDefault: t('settings_paymentmethod_default_selected_on_invoice'),
    invoicesOnly: t('payment_mode_invoices_only'),
    expensesOnly: t('payment_mode_expenses_only'),
  };
  const changes = fieldChanges(pending, record, labels, {
    yes: t('settings_yes'),
    no: t('settings_no'),
  });

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('payment_mode_add_heading')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: detailsFields(
              labels,
              t('payment_mode_add_edit_description_tooltip'),
              exclusiveDisabled(invoicesOnly, expensesOnly),
            ),
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(PAYMENT_MODES_NAME_MAX) })}
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
        featureErrors={PAYMENT_MODES_ERRORS}
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
export const GuardedPaymentModesForm = withAuth(
  withPermission(PaymentModesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
