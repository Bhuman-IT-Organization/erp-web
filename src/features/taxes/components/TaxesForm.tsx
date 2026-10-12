'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { LabelText } from '@/components/molecules/ChoiceField';
import { InlineError } from '@/components/molecules/InlineError';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmOutcome,
  type SummaryChange,
} from '@/components/organisms/ConfirmDialog';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { SchemaForm } from '@/components/organisms/SchemaForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  TAXES_ERRORS,
  TAXES_PATH,
  taxesPath,
  VALIDATION_CODE,
} from '@/features/taxes/api/taxes.endpoints';
import { useTaxes } from '@/features/taxes/hooks/use-taxes';
import { useSaveTaxes } from '@/features/taxes/hooks/use-save-taxes';
import {
  cleanTaxesName,
  EMPTY_TAXES_FORM,
  isLocked,
  TAXES_MESSAGE_KEYS,
  TAXES_NAME_MAX,
  taxesFormSchema,
  taxesRowSchema,
  isTaxesField,
  toTaxesForm,
  validationIssuesSchema,
  type Taxes,
  type TaxesFormValues,
  type TaxesRow,
} from '@/features/taxes/schemas/taxes.schema';
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

const LIST_BASE = '/setup/taxes';
const FORM_ID = 'taxes';

interface TaxesFormProps {
  /** The record's id from `app/(shell)/setup/taxes/[id]/page.tsx`; `null` on `/setup/taxes/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<Taxes>;
type SaveFailure = Extract<ApiResult<Taxes>, { ok: false }>;

/** The record's api path, or `null` on `/setup/taxes/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof taxesPath> | null {
  return id === null ? null : taxesPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: Taxes | undefined): { values?: TaxesFormValues } {
  return record === undefined ? {} : { values: toTaxesForm(record) };
}

/**
 * True while there is no record to edit (D-39): a permalink before its record answers, or a row
 * opened from the list whose record answers a 4xx. A row whose read fails retryably keeps the form:
 * the row IS the whole record here (a feature whose detail carries more than its row locks the
 * seeded fields and shows the error where the detail is needed, as the staff forms do).
 */
function waitsForRecord(id: string | null, item: RecordRead, seed: TaxesRow | undefined): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

/** The record crumb (WR-10): the name, undefined on /new or while loading, null once a failure shows (D-39). */
function breadcrumbLabel(
  id: string | null,
  record: Taxes | undefined,
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
function retryableFailure(result: ApiResult<Taxes> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The save summary's lines on `/:id`: the name and the rate, each when the pending value differs. */
function fieldChanges(
  pending: TaxesFormValues | null,
  record: Taxes | undefined,
  labels: { readonly name: string; readonly rate: string },
): readonly SummaryChange[] {
  if (pending === null || record === undefined) return [];
  return (['name', 'rate'] as const)
    .filter((field) => pending[field] !== record[field])
    .map((field): SummaryChange => ({
      type: 'changed',
      label: labels[field],
      from: record[field],
      to: pending[field],
    }));
}

/** A reason a tax opens read-only: the message key of its warning line. */
type LockReason =
  | 'tax_is_used_in_expenses_warning'
  | 'tax_is_used_in_subscriptions_warning'
  | 'default_tax_warning';

/**
 * Why a tax opens read-only, in Perfex's order (its modal shows the two `tax_is_used_in_*` warnings
 * and disables its fields), then ours: a default tax in Settings (D-21). Empty when it is editable.
 */
function lockReasons(record: Taxes | undefined): readonly LockReason[] {
  if (record === undefined || !isLocked(record)) return [];
  return [
    ...(record.usage.expenses > 0 ? (['tax_is_used_in_expenses_warning'] as const) : []),
    ...(record.usage.subscriptions > 0 ? (['tax_is_used_in_subscriptions_warning'] as const) : []),
    ...(record.isDefault ? (['default_tax_warning'] as const) : []),
  ];
}

/** Why the tax is read-only, one line per reason in order; nothing when it is editable. */
function LockNotice({ reasons }: { readonly reasons: readonly LockReason[] }): ReactElement | null {
  const t = useTranslations('taxes');
  if (reasons.length === 0) return null;
  return (
    <Alert role="status" data-testid="taxes-locked">
      <AlertDescription className="text-foreground">
        {reasons.map((reason) => (
          <p key={reason}>{t(reason)}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: Taxes | undefined,
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
 * The Taxes create and edit form of `taxes/manage.php`'s modal as a page (D-04) on the kit's
 * `SchemaForm` (UIK-06): one "Details" section with Perfex's two fields, Tax Name (cleaned as it is
 * typed: every `|` removed, runs of spaces collapsed) and Tax Rate (percent) (decimal text, end-
 * aligned). A tax that expenses or subscriptions use, or that Perfex's `default_tax` setting names,
 * opens read-only with Perfex's warnings and no submit, as Perfex's modal disables its fields (D-21).
 * Every save is confirmed by a summary of what changes (D-25.4). The outcome decides where it shows
 * (D-29): success returns to the list the user came from with the saved row swapped in (D-28,
 * D-36); a field problem closes the dialog and lands under the field and in the focused summary; a
 * network or server failure becomes the form's alert with Retry, which re-sends without asking
 * again; anything else (a name taken, a tax put to use or made a default meanwhile, a deleted tax)
 * is a refusal and stays inside the dialog in the feature's words. A dirty form asks before any
 * in-app navigation (D-25.3; browser Back is D-40's known limit). The labels are the shared verb plus
 * Perfex's lowercase noun (`common.save_noun` + `tax_lowercase`, UI-SPEC choice 36). The title is
 * the 24px page title, and the record's name goes to the shell's breadcrumb through
 * `useBreadcrumbLabel`, `null` once a failure shows, so the crumb is never a skeleton forever. Names
 * render as React text only (T-4.1-48).
 */
export function TaxesForm({ id }: TaxesFormProps): ReactElement {
  const t = useTranslations('taxes');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  // The feature's own codes first: a permalink to a missing record says so, not "Something went wrong".
  const errorText = useErrorText(TAXES_ERRORS);
  const copy = useConfirmCopy();
  // The row the list was clicked on renders at once; the full record replaces it (D-35). It is read
  // as a LIST row, so an edit can swap the saved record back into the list without dropping what
  // the list row adds.
  const seed = useRowSeed(recordPath(id), taxesRowSchema);
  const item = useTaxes(id);
  const record = item.data ?? seed;
  const form = useForm<TaxesFormValues>({
    resolver: zodResolver(taxesFormSchema),
    defaultValues: EMPTY_TAXES_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveTaxes(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again (D-29).
  const lastSent = useRef<TaxesFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<TaxesFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list (D-28, D-36). */
  async function afterSave(saved: Taxes): Promise<void> {
    form.reset(toTaxesForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      // A new record moves totals and positions; a permalink edit knows nothing the list row adds:
      // the list pages ask again.
      await revalidateLists(TAXES_PATH);
    } else {
      // The saved record plus what the list row adds, which an edit does not change (D-36).
      const row: TaxesRow = { ...seed, ...saved };
      await replaceRowInLists(TAXES_PATH, row, (one: TaxesRow) => one.id === row.id);
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows (D-29); `{ ok: true }` tells the dialog its part is done. */
  async function send(values: TaxesFormValues): Promise<ConfirmOutcome> {
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
          if (isTaxesField(field)) {
            form.setError(field, { message: TAXES_MESSAGE_KEYS[field] });
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
  const noun = t('tax_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  // A tax that expenses or subscriptions use, or a default tax in Settings, opens read-only with
  // Perfex's warnings and no submit (its modal disables the fields); "Back to list" stays (D-21).
  const reasons = lockReasons(record);
  const locked = reasons.length > 0;
  const changes = fieldChanges(pending, record, {
    name: t('tax_add_edit_name'),
    rate: t('tax_add_edit_rate'),
  });

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('tax_add_title')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [
              {
                name: 'name',
                label: t('tax_add_edit_name'),
                // Custom only to clean the name as it is typed, as Perfex's change handler does
                // (`taxes/manage.php` :89-99): every `|` removed and runs of spaces collapsed. The
                // control is the kit's text input, the width the kit's short cell.
                kind: 'custom',
                span: 'short',
                required: true,
                render: (field, state) => (
                  <>
                    <FieldLabel htmlFor={state.id}>
                      <LabelText label={t('tax_add_edit_name')} required />
                    </FieldLabel>
                    <Input
                      id={state.id}
                      name={field.name}
                      type="text"
                      value={field.value}
                      onChange={(event) => {
                        field.onChange(cleanTaxesName(event.target.value));
                      }}
                      onBlur={field.onBlur}
                      disabled={state.disabled}
                      aria-invalid={state.invalid}
                      aria-required
                      aria-describedby={state.describedBy === '' ? undefined : state.describedBy}
                      autoComplete="off"
                    />
                  </>
                ),
              },
              { name: 'rate', label: t('tax_add_edit_rate'), kind: 'amount', required: true },
            ],
          },
        ]}
        onValid={setPending}
        readOnly={locked}
        notice={<LockNotice reasons={reasons} />}
        translateError={(key) => t(key, { max: f.number(TAXES_NAME_MAX) })}
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
        featureErrors={TAXES_ERRORS}
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
export const GuardedTaxesForm = withAuth(withPermission(TaxesForm, { skeleton: 'form' }), {
  skeleton: 'form',
});
