'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type ReactElement } from 'react';
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
import { FIXED_EQUIPMENT_SETTINGS_CODES } from '@/config/fixed-equipment-settings';
import type { PermissionCode } from '@/config/permissions';
import {
  FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS,
  FIXED_EQUIPMENT_DEPRECIATIONS_PATH,
  fixedEquipmentDepreciationsPath,
  VALIDATION_CODE,
} from '@/features/fixed-equipment-depreciations/api/fixed-equipment-depreciations.endpoints';
import { useFixedEquipmentDepreciations } from '@/features/fixed-equipment-depreciations/hooks/use-fixed-equipment-depreciations';
import { useSaveFixedEquipmentDepreciations } from '@/features/fixed-equipment-depreciations/hooks/use-save-fixed-equipment-depreciations';
import {
  EMPTY_FIXED_EQUIPMENT_DEPRECIATIONS_FORM,
  FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS,
  FIXED_EQUIPMENT_DEPRECIATIONS_NAME_MAX,
  fixedEquipmentDepreciationsFormSchema,
  fixedEquipmentDepreciationsRowSchema,
  isFixedEquipmentDepreciationsField,
  toFixedEquipmentDepreciationsBody,
  toFixedEquipmentDepreciationsForm,
  validationIssuesSchema,
  type FixedEquipmentDepreciations,
  type FixedEquipmentDepreciationsField,
  type FixedEquipmentDepreciationsFormValues,
  type FixedEquipmentDepreciationsRow,
} from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import type { ApiResult } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, revalidateLists, useRowSeed } from '@/lib/api/row-seed';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { usePermissions } from '@/lib/auth/use-permissions';
import { isRetryableCode } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useBreadcrumbCrumbs } from '@/lib/hooks/use-breadcrumb-label';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import { useFormat } from '@/lib/i18n/format';

const LIST_BASE = '/setup/fixed-equipment-depreciations';
const FORM_ID = 'fixed-equipment-depreciations';

interface FixedEquipmentDepreciationsFormProps {
  /** The record's id from `[id]/page.tsx`; `null` on `/setup/fixed-equipment-depreciations/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<FixedEquipmentDepreciations>;
type SaveFailure = Extract<ApiResult<FixedEquipmentDepreciations>, { ok: false }>;

/** The record's api path, or `null` on `/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof fixedEquipmentDepreciationsPath> | null {
  return id === null ? null : fixedEquipmentDepreciationsPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: FixedEquipmentDepreciations | undefined): {
  values?: FixedEquipmentDepreciationsFormValues;
} {
  return record === undefined ? {} : { values: toFixedEquipmentDepreciationsForm(record) };
}

/**
 * True while there is no record to edit: a permalink before its record answers, or a row opened
 * from the list whose record answers a 4xx. A row whose read fails retryably keeps the form: the
 * row IS the whole record here.
 */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: FixedEquipmentDepreciationsRow | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

/** The record crumb: the name, undefined on /new or while loading, null once a failure shows. */
function breadcrumbLabel(
  id: string | null,
  record: FixedEquipmentDepreciations | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

/** The form's last crumb: "Add Depreciations" on /new, else the record's name (or loading or failed). */
function leafCrumb(
  id: string | null,
  record: FixedEquipmentDepreciations | undefined,
  item: RecordRead,
  addLabel: string,
): string | null | undefined {
  return id === null ? addLabel : breadcrumbLabel(id, record, item);
}

/** The last save's failure when a Retry can fix it (the form's alert); a refusal shows in the dialog. */
function retryableFailure(
  result: ApiResult<FixedEquipmentDepreciations> | undefined,
): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/**
 * The save summary's changes: the name and the number of months, each when the value that will be
 * sent differs from the record's. `pending` is the form schema's output, already trimmed and
 * normalised (`007` is `7`), and the record goes through the same mapping, so a value that only
 * looks different is no change. A record with no term reads `none` as its "from".
 */
function summaryChanges(
  pending: FixedEquipmentDepreciationsFormValues | null,
  record: FixedEquipmentDepreciations | undefined,
  labels: { readonly name: string; readonly term: string; readonly none: string },
): readonly SummaryChange[] {
  if (pending === null || record === undefined) return [];
  const stored = toFixedEquipmentDepreciationsForm(record);
  const changes: SummaryChange[] = [];
  if (pending.name !== stored.name) {
    changes.push({ type: 'changed', label: labels.name, from: stored.name, to: pending.name });
  }
  if (pending.term !== stored.term) {
    changes.push({
      type: 'changed',
      label: labels.term,
      from: stored.term === '' ? labels.none : stored.term,
      to: pending.term,
    });
  }
  return changes;
}

/**
 * The message key for an api issue on a field: the name's "enter a name", and for the number of
 * months "enter it" only while the field is empty; with a value in it the api refused the number,
 * so `months_whole`.
 */
function issueKey(field: FixedEquipmentDepreciationsField, value: string): string {
  if (field === 'name') return FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.name;
  return value === ''
    ? FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.term
    : FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.termWhole;
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: FixedEquipmentDepreciations | undefined,
  noun: string,
): { readonly recordName: string } | { readonly noun: string } {
  return record === undefined ? { noun } : { recordName: record.name };
}

/** The codes a save needs: any group's `create` for a new depreciation, any group's `edit` for one. */
function saveCodes(id: string | null): readonly PermissionCode[] {
  const codes = FIXED_EQUIPMENT_SETTINGS_CODES.depreciation;
  return id === null ? codes.create : codes.edit;
}

/** The page while `waitsForRecord`: the form's shape until the record answers, then why not. */
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
 * The Depreciations create and edit pages on the kit's `SchemaForm`: one "Details" section with
 * Perfex's two fields, Depreciation Name (required, trimmed, at most 200 characters, every character
 * accepted, Arabic included; a name another depreciation holds is accepted, as in Perfex) and Number
 * of Months (required, a whole number greater than 0 the api can store). Every save is confirmed by
 * a summary of what changes. The outcome decides where it shows: success returns to the list the
 * user came from with the saved row swapped in; a field problem closes the dialog and lands under
 * the field and in the focused summary; a network or server failure becomes the form's alert with
 * Retry; anything else (a depreciation deleted meanwhile, a code the member no longer holds) is a
 * refusal and stays inside the dialog in the feature's words. A dirty form asks before any in-app
 * navigation. The title is `fe_add_depreciations` on `/new` and the record name on `/:id`; the
 * breadcrumb adds Depreciations, then the same. Names render as React text only.
 *
 * Without any of the tab's five groups' `create` on `/new`, or `edit` on `/:id`, the form is
 * read-only: the fields are locked and there is no Save. Perfex has no read-only form (the README
 * lists this as a Difference).
 */
export function FixedEquipmentDepreciationsForm({
  id,
}: FixedEquipmentDepreciationsFormProps): ReactElement {
  const t = useTranslations('fixed-equipment-depreciations');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS);
  const copy = useConfirmCopy();
  const { canAny } = usePermissions();
  const canSave = canAny(saveCodes(id));
  const seed = useRowSeed(recordPath(id), fixedEquipmentDepreciationsRowSchema);
  const item = useFixedEquipmentDepreciations(id);
  const record = item.data ?? seed;
  const form = useForm<FixedEquipmentDepreciationsFormValues>({
    resolver: zodResolver(fixedEquipmentDepreciationsFormSchema),
    defaultValues: EMPTY_FIXED_EQUIPMENT_DEPRECIATIONS_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveFixedEquipmentDepreciations(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again.
  const lastSent = useRef<FixedEquipmentDepreciationsFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<FixedEquipmentDepreciationsFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list. */
  async function afterSave(saved: FixedEquipmentDepreciations): Promise<void> {
    form.reset(toFixedEquipmentDepreciationsForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      // A new record moves totals and positions; a permalink edit knows nothing the row adds.
      await revalidateLists(FIXED_EQUIPMENT_DEPRECIATIONS_PATH);
    } else {
      const row: FixedEquipmentDepreciationsRow = { ...seed, ...saved };
      await replaceRowInLists(
        FIXED_EQUIPMENT_DEPRECIATIONS_PATH,
        row,
        (one: FixedEquipmentDepreciationsRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows; `{ ok: true }` tells the dialog its part is done. */
  async function send(values: FixedEquipmentDepreciationsFormValues): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const outcome = await mutation.trigger(toFixedEquipmentDepreciationsBody(values));
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
          if (isFixedEquipmentDepreciationsField(field)) {
            form.setError(field, { message: issueKey(field, form.getValues(field)) });
          }
        }
      });
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

  // Hooks, so before the early return below. The menu only `covers` this page, so it names its own
  // crumbs: Depreciations (back to the list), then "Add Depreciations" on /new or the record's name
  // on /:id (undefined while it loads, null once a failure shows).
  const leaf = leafCrumb(id, record, item, t('fe_add_depreciations'));
  const crumbs = useMemo(
    () => [{ label: t('fe_depreciations'), href: LIST_BASE }, { label: leaf }],
    [t, leaf],
  );
  useBreadcrumbCrumbs(crumbs);

  if (waitsForRecord(id, item, seed)) {
    return <RecordState item={item} errorText={errorText} backLabel={tc('back_to_list')} />;
  }

  const failure = retryableFailure(mutation.result);
  const noun = t('depreciation_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = summaryChanges(pending, record, {
    name: t('fe_depreciation_name'),
    term: t('fe_number_of_months'),
    none: tc('none'),
  });

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('fe_add_depreciations')}</h1>
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
                label: t('fe_depreciation_name'),
                kind: 'text',
                required: true,
              },
              {
                name: 'term',
                label: t('fe_number_of_months'),
                kind: 'number',
                required: true,
              },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) =>
          t(key, {
            max: FIXED_EQUIPMENT_DEPRECIATIONS_NAME_MAX,
            maxN: f.number(FIXED_EQUIPMENT_DEPRECIATIONS_NAME_MAX),
          })
        }
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        isPending={mutation.isMutating}
        readOnly={!canSave}
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
        // A refusal stays in the dialog in the feature's words: a 404 reads "no longer exists".
        featureErrors={FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS}
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

/** The route's guards: the form skeleton while the session or `/me` is unknown. */
export const GuardedFixedEquipmentDepreciationsForm = withAuth(
  withPermission(FixedEquipmentDepreciationsForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
