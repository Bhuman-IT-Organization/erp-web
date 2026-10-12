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
  COST_CENTERS_ERRORS,
  COST_CENTERS_PATH,
  costCentersPath,
  VALIDATION_CODE,
} from '@/features/cost-centers/api/cost-centers.endpoints';
import { useCostCenters } from '@/features/cost-centers/hooks/use-cost-centers';
import { useSaveCostCenters } from '@/features/cost-centers/hooks/use-save-cost-centers';
import {
  EMPTY_COST_CENTERS_FORM,
  COST_CENTERS_MESSAGE_KEYS,
  COST_CENTERS_NAME_MAX,
  costCentersFormSchema,
  costCentersRowSchema,
  isCostCentersField,
  toCostCentersForm,
  validationIssuesSchema,
  type CostCenters,
  type CostCentersFormValues,
  type CostCentersRow,
} from '@/features/cost-centers/schemas/cost-centers.schema';
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

const LIST_BASE = '/setup/cost-centers';
const FORM_ID = 'cost-centers';

interface CostCentersFormProps {
  /** The record's id from `app/(shell)/setup/cost-centers/[id]/page.tsx`; `null` on `/setup/cost-centers/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<CostCenters>;
type SaveFailure = Extract<ApiResult<CostCenters>, { ok: false }>;

/** The record's api path, or `null` on `/setup/cost-centers/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof costCentersPath> | null {
  return id === null ? null : costCentersPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: CostCenters | undefined): { values?: CostCentersFormValues } {
  return record === undefined ? {} : { values: toCostCentersForm(record) };
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
  seed: CostCentersRow | undefined,
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
  record: CostCenters | undefined,
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
function retryableFailure(result: ApiResult<CostCenters> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The save summary's one possible change: the name, when the pending value differs from the record's. */
function nameChanges(
  pending: CostCentersFormValues | null,
  record: CostCenters | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: CostCenters | undefined,
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
 * The Cost Centers create and edit pages of `cost_centers/form.php` (Perfex already used pages, so
 * D-04 changes nothing) on the kit's `SchemaForm` (UIK-06): one "Details" section with Perfex's one
 * field, Cost Center Name (required, trimmed, 1 to 255 characters, every character accepted and
 * nothing cleaned as it is typed; a name another cost center holds is accepted, as in Perfex, D-29).
 * Every save is confirmed by a summary of what changes (D-25.4). The outcome decides where it shows
 * (D-29): success returns to the list the user came from with the saved row swapped in (D-28,
 * D-36); a field problem closes the dialog and lands under the field and in the focused summary; a
 * network or server failure becomes the form's alert with Retry, which re-sends without asking
 * again; anything else (a cost center deleted meanwhile) is a refusal and stays inside the dialog in
 * the feature's words. A dirty form asks before any in-app navigation (D-25.3; browser Back is
 * D-40's known limit). The labels are the shared verb plus our lowercase noun (`common.save_noun` +
 * `noun_cost_center`: Perfex has no lowercase key, UI-SPEC choice 36). The title is the 24px page
 * title (`add_cost_center` on `/new`, the record name on `/:id`), and the record's name goes to the
 * shell's breadcrumb through `useBreadcrumbLabel`, `null` once a failure shows, so the crumb is
 * never a skeleton forever. Names render as React text only (T-4.1-91).
 */
export function CostCentersForm({ id }: CostCentersFormProps): ReactElement {
  const t = useTranslations('cost-centers');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  // The feature's own codes first: a permalink to a missing record says so, not "Something went wrong".
  const errorText = useErrorText(COST_CENTERS_ERRORS);
  const copy = useConfirmCopy();
  // The row the list was clicked on renders at once; the full record replaces it (D-35). It is read
  // as a LIST row, so an edit can swap the saved record back into the list without dropping what
  // the list row adds.
  const seed = useRowSeed(recordPath(id), costCentersRowSchema);
  const item = useCostCenters(id);
  const record = item.data ?? seed;
  const form = useForm<CostCentersFormValues>({
    resolver: zodResolver(costCentersFormSchema),
    defaultValues: EMPTY_COST_CENTERS_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveCostCenters(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again (D-29).
  const lastSent = useRef<CostCentersFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<CostCentersFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list (D-28, D-36). */
  async function afterSave(saved: CostCenters): Promise<void> {
    form.reset(toCostCentersForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      // A new record moves totals and positions; a permalink edit knows nothing the list row adds:
      // the list pages ask again.
      await revalidateLists(COST_CENTERS_PATH);
    } else {
      // The saved record plus what the list row adds, which an edit does not change (D-36).
      const row: CostCentersRow = { ...seed, ...saved };
      await replaceRowInLists(COST_CENTERS_PATH, row, (one: CostCentersRow) => one.id === row.id);
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows (D-29); `{ ok: true }` tells the dialog its part is done. */
  async function send(values: CostCentersFormValues): Promise<ConfirmOutcome> {
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
          if (isCostCentersField(field)) {
            form.setError(field, { message: COST_CENTERS_MESSAGE_KEYS[field] });
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
  const noun = t('noun_cost_center');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('cost_center_name'));

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('add_cost_center')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [{ name: 'name', label: t('cost_center_name'), kind: 'text', required: true }],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(COST_CENTERS_NAME_MAX) })}
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
        featureErrors={COST_CENTERS_ERRORS}
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
export const GuardedCostCentersForm = withAuth(
  withPermission(CostCentersForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
