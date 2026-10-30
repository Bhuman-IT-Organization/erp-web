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
  CUSTOMER_GROUPS_ERRORS,
  CUSTOMER_GROUPS_PATH,
  customerGroupsPath,
  VALIDATION_CODE,
} from '@/features/customer-groups/api/customer-groups.endpoints';
import { useCustomerGroups } from '@/features/customer-groups/hooks/use-customer-groups';
import { useSaveCustomerGroups } from '@/features/customer-groups/hooks/use-save-customer-groups';
import {
  EMPTY_CUSTOMER_GROUPS_FORM,
  CUSTOMER_GROUPS_MESSAGE_KEYS,
  CUSTOMER_GROUPS_NAME_MAX,
  customerGroupsFormSchema,
  customerGroupsRowSchema,
  isCustomerGroupsField,
  toCustomerGroupsForm,
  validationIssuesSchema,
  type CustomerGroups,
  type CustomerGroupsFormValues,
  type CustomerGroupsRow,
} from '@/features/customer-groups/schemas/customer-groups.schema';
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

const LIST_BASE = '/setup/customer-groups';
const FORM_ID = 'customer-groups';

interface CustomerGroupsFormProps {
  /** The record's id from `[id]/page.tsx`; `null` on `/setup/customer-groups/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<CustomerGroups>;
type SaveFailure = Extract<ApiResult<CustomerGroups>, { ok: false }>;

/** The record's api path, or `null` on `/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof customerGroupsPath> | null {
  return id === null ? null : customerGroupsPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: CustomerGroups | undefined): { values?: CustomerGroupsFormValues } {
  return record === undefined ? {} : { values: toCustomerGroupsForm(record) };
}

/** True while there is no record to edit: a permalink before its record answers, or a 4xx read. */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: CustomerGroupsRow | undefined,
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
  record: CustomerGroups | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

/** The last save's failure when a Retry can fix it (the form's alert). */
function retryableFailure(result: ApiResult<CustomerGroups> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The save summary's one possible change: the name, when the pending value differs. */
function nameChanges(
  pending: CustomerGroupsFormValues | null,
  record: CustomerGroups | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: CustomerGroups | undefined,
  noun: string,
): { readonly recordName: string } | { readonly noun: string } {
  return record === undefined ? { noun } : { recordName: record.name };
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
 * The Customer Groups create and edit pages on the kit's `SchemaForm`: one "Details" section with
 * one field, the name (required, trimmed). Every save is confirmed by a summary of what changes.
 * Success returns to the list with the saved row swapped in; a field problem lands under the field;
 * a network or server failure becomes the form's alert with Retry; anything else (a group deleted
 * meanwhile) stays inside the dialog in the feature's words. A dirty form asks before leaving.
 * Names render as React text only.
 */
export function CustomerGroupsForm({ id }: CustomerGroupsFormProps): ReactElement {
  const t = useTranslations('customer-groups');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(CUSTOMER_GROUPS_ERRORS);
  const copy = useConfirmCopy();
  const seed = useRowSeed(recordPath(id), customerGroupsRowSchema);
  const item = useCustomerGroups(id);
  const record = item.data ?? seed;
  const form = useForm<CustomerGroupsFormValues>({
    resolver: zodResolver(customerGroupsFormSchema),
    defaultValues: EMPTY_CUSTOMER_GROUPS_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveCustomerGroups(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again.
  const lastSent = useRef<CustomerGroupsFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<CustomerGroupsFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list. */
  async function afterSave(saved: CustomerGroups): Promise<void> {
    form.reset(toCustomerGroupsForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      await revalidateLists(CUSTOMER_GROUPS_PATH);
    } else {
      const row: CustomerGroupsRow = { ...seed, ...saved };
      await replaceRowInLists(
        CUSTOMER_GROUPS_PATH,
        row,
        (one: CustomerGroupsRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows; `{ ok: true }` tells the dialog its part is done. */
  async function send(values: CustomerGroupsFormValues): Promise<ConfirmOutcome> {
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
          if (isCustomerGroupsField(field)) {
            form.setError(field, { message: CUSTOMER_GROUPS_MESSAGE_KEYS[field] });
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

  // A hook, so before the early return below: the shell's crumb names the record, or stops waiting.
  useBreadcrumbLabel(breadcrumbLabel(id, record, item));

  if (waitsForRecord(id, item, seed)) {
    return <RecordState item={item} errorText={errorText} backLabel={tc('back_to_list')} />;
  }

  const failure = retryableFailure(mutation.result);
  const noun = t('customer_group_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('customer_group_name'));

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('customer_group_add_heading')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [
              { name: 'name', label: t('customer_group_name'), kind: 'text', required: true },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(CUSTOMER_GROUPS_NAME_MAX) })}
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
        featureErrors={CUSTOMER_GROUPS_ERRORS}
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
export const GuardedCustomerGroupsForm = withAuth(
  withPermission(CustomerGroupsForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
