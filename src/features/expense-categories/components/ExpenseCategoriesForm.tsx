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
import { SchemaForm } from '@/components/organisms/SchemaForm';
import {
  EXPENSE_CATEGORIES_ERRORS,
  EXPENSE_CATEGORIES_PATH,
  expenseCategoriesPath,
  VALIDATION_CODE,
} from '@/features/expense-categories/api/expense-categories.endpoints';
import { useExpenseCategories } from '@/features/expense-categories/hooks/use-expense-categories';
import { useSaveExpenseCategories } from '@/features/expense-categories/hooks/use-save-expense-categories';
import {
  EMPTY_EXPENSE_CATEGORIES_FORM,
  EXPENSE_CATEGORIES_MESSAGE_KEYS,
  EXPENSE_CATEGORIES_NAME_MAX,
  expenseCategoriesFormSchema,
  expenseCategoriesRowSchema,
  isExpenseCategoriesField,
  toExpenseCategoriesForm,
  validationIssuesSchema,
  type ExpenseCategories,
  type ExpenseCategoriesFormValues,
  type ExpenseCategoriesRow,
} from '@/features/expense-categories/schemas/expense-categories.schema';
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

const LIST_BASE = '/setup/expense-categories';
const FORM_ID = 'expense-categories';

interface ExpenseCategoriesFormProps {
  /** The record's id from `app/(shell)/setup/expense-categories/[id]/page.tsx`; `null` on `/setup/expense-categories/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<ExpenseCategories>;
type SaveFailure = Extract<ApiResult<ExpenseCategories>, { ok: false }>;

/** The record's api path, or `null` on `/setup/expense-categories/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof expenseCategoriesPath> | null {
  return id === null ? null : expenseCategoriesPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: ExpenseCategories | undefined): {
  values?: ExpenseCategoriesFormValues;
} {
  return record === undefined ? {} : { values: toExpenseCategoriesForm(record) };
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
  seed: ExpenseCategoriesRow | undefined,
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
  record: ExpenseCategories | undefined,
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
function retryableFailure(result: ApiResult<ExpenseCategories> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/**
 * The save summary's lines on `/:id` (D-25.4, UI-SPEC Form): the name as "from → to" when it
 * changed, and the description as "updated" when it changed, never echoing its value (it may be
 * long). On `/new` there is no record to compare with, so no line.
 */
function summaryChanges(
  pending: ExpenseCategoriesFormValues | null,
  record: ExpenseCategories | undefined,
  labels: { readonly name: string; readonly description: string },
): readonly SummaryChange[] {
  if (pending === null || record === undefined) return [];
  const changes: SummaryChange[] = [];
  if (pending.name !== record.name) {
    changes.push({ type: 'changed', label: labels.name, from: record.name, to: pending.name });
  }
  if ((pending.description ?? '') !== record.description) {
    changes.push({ type: 'updated', label: labels.description });
  }
  return changes;
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: ExpenseCategories | undefined,
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
 * The create and edit form of `expenses/expense_category.php` (Perfex's modal) on the kit's
 * `SchemaForm` (UIK-06): the sections, the required marks, the error summary and the sticky save bar
 * are the kit's; this screen owns Perfex's two fields, Category Name and Category Description, and
 * the save. It accepts exactly what Perfex accepts (D-19: a trimmed name of 1 to 191 characters with
 * no character refused, a description with no cap), and the name is rendered as React text only in
 * the title, the dialogs and the breadcrumb (T-4.1-25). No delete here: Perfex's modal has none.
 * Every save is confirmed by a summary of what changes (D-25.4). The outcome decides where it shows
 * (D-29): success returns to the list the user came from with the saved row swapped in (D-28,
 * D-36); a field problem closes the dialog and lands under the field and in the focused summary; a
 * network or server failure becomes the form's alert with Retry, which re-sends without asking
 * again; anything else is a refusal and stays inside the dialog. A dirty form asks before any
 * in-app navigation (D-25.3; browser Back is D-40's known limit). The labels are the shared verb
 * plus the legacy lowercase noun (`common.save_noun` + `expense_category_lowercase`, choice 36). The
 * title is the 24px page title, and the record's name goes to the shell's breadcrumb through
 * `useBreadcrumbLabel`, `null` once a failure shows, so the crumb is never a skeleton forever.
 */
export function ExpenseCategoriesForm({ id }: ExpenseCategoriesFormProps): ReactElement {
  const t = useTranslations('expense-categories');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  // The feature's own codes first: a permalink to a missing record says so, not "Something went wrong".
  const errorText = useErrorText(EXPENSE_CATEGORIES_ERRORS);
  const copy = useConfirmCopy();
  // The row the list was clicked on renders at once; the full record replaces it (D-35). It is read
  // as a LIST row, usage counts included, so an edit can swap the saved record back into the list
  // without dropping the counts the delete refuses on.
  const seed = useRowSeed(recordPath(id), expenseCategoriesRowSchema);
  const item = useExpenseCategories(id);
  const record = item.data ?? seed;
  const form = useForm<ExpenseCategoriesFormValues>({
    resolver: zodResolver(expenseCategoriesFormSchema),
    defaultValues: EMPTY_EXPENSE_CATEGORIES_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveExpenseCategories(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again (D-29).
  const lastSent = useRef<ExpenseCategoriesFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<ExpenseCategoriesFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list (D-28, D-36). */
  async function afterSave(saved: ExpenseCategories): Promise<void> {
    form.reset(toExpenseCategoriesForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      // A new record moves totals and positions; a permalink edit knows no usage counts to keep:
      // the list pages ask again.
      await revalidateLists(EXPENSE_CATEGORIES_PATH);
    } else {
      // The saved record plus the row's usage counts, which an edit does not change (D-36).
      const row: ExpenseCategoriesRow = { ...seed, ...saved };
      await replaceRowInLists(
        EXPENSE_CATEGORIES_PATH,
        row,
        (one: ExpenseCategoriesRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows (D-29); `{ ok: true }` tells the dialog its part is done. */
  async function send(values: ExpenseCategoriesFormValues): Promise<ConfirmOutcome> {
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
          if (isExpenseCategoriesField(field)) {
            form.setError(field, { message: EXPENSE_CATEGORIES_MESSAGE_KEYS[field] });
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
  const noun = t('expense_category_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = summaryChanges(pending, record, {
    name: t('expense_add_edit_name'),
    description: t('expense_add_edit_description'),
  });

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('new_expense_category')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            // Perfex's two fields in Perfex's order (`expenses/expense_category.php`).
            fields: [
              { name: 'name', label: t('expense_add_edit_name'), kind: 'text', required: true },
              { name: 'description', label: t('expense_add_edit_description'), kind: 'textarea' },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(EXPENSE_CATEGORIES_NAME_MAX) })}
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
        featureErrors={EXPENSE_CATEGORIES_ERRORS}
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
export const GuardedExpenseCategoriesForm = withAuth(
  withPermission(ExpenseCategoriesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
