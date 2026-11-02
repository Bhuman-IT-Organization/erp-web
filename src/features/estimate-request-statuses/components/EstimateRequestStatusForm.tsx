'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
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
  ESTIMATE_REQUEST_STATUSES_ERRORS,
  ESTIMATE_REQUEST_STATUSES_PATH,
  estimateRequestStatusesPath,
  VALIDATION_CODE,
} from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import { useEstimateRequestStatuses } from '@/features/estimate-request-statuses/hooks/use-estimate-request-statuses';
import { useSaveEstimateRequestStatuses } from '@/features/estimate-request-statuses/hooks/use-save-estimate-request-statuses';
import {
  EMPTY_ESTIMATE_REQUEST_STATUS_FORM,
  ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS,
  ESTIMATE_REQUEST_STATUS_NAME_MAX,
  estimateRequestStatusFormSchema,
  estimateRequestStatusRowSchema,
  isEstimateRequestStatusField,
  toEstimateRequestStatusForm,
  toEstimateRequestStatusWriteValues,
  validationIssuesSchema,
  type EstimateRequestStatus,
  type EstimateRequestStatusFormInput,
  type EstimateRequestStatusFormValues,
  type EstimateRequestStatusRow,
} from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';
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

const LIST_BASE = '/setup/estimate_request-statuses';
const FORM_ID = 'estimate-request-statuses';

interface EstimateRequestStatusFormProps {
  readonly id: string | null;
}

type RecordRead = CommonApiResult<EstimateRequestStatus>;
type SaveFailure = Extract<ApiResult<EstimateRequestStatus>, { ok: false }>;

function recordPath(id: string | null): ReturnType<typeof estimateRequestStatusesPath> | null {
  return id === null ? null : estimateRequestStatusesPath(id);
}

function knownValues(record: EstimateRequestStatus | undefined): {
  values?: EstimateRequestStatusFormInput;
} {
  return record === undefined ? {} : { values: toEstimateRequestStatusForm(record) };
}

function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: EstimateRequestStatusRow | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

function breadcrumbLabel(
  id: string | null,
  record: EstimateRequestStatus | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

function retryableFailure(
  result: ApiResult<EstimateRequestStatus> | undefined,
): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

function statusNameChange(
  pending: EstimateRequestStatusFormValues | null,
  record: EstimateRequestStatus | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

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

// eslint-disable-next-line complexity -- retains the shared confirmed-save flow for validation, retries, and record navigation.
export function EstimateRequestStatusForm({ id }: EstimateRequestStatusFormProps): ReactElement {
  const t = useTranslations('estimate-request-statuses');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(ESTIMATE_REQUEST_STATUSES_ERRORS);
  const copy = useConfirmCopy();
  const seed = useRowSeed(recordPath(id), estimateRequestStatusRowSchema);
  const item = useEstimateRequestStatuses(id);
  const record = item.data ?? seed;
  const form = useForm<
    z.input<typeof estimateRequestStatusFormSchema>,
    unknown,
    EstimateRequestStatusFormValues
  >({
    resolver: zodResolver(estimateRequestStatusFormSchema),
    defaultValues: EMPTY_ESTIMATE_REQUEST_STATUS_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveEstimateRequestStatuses(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const lastSent = useRef<EstimateRequestStatusFormValues | null>(null);
  const [pending, setPending] = useState<EstimateRequestStatusFormValues | null>(null);

  async function afterSave(saved: EstimateRequestStatus): Promise<void> {
    form.reset(toEstimateRequestStatusForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      await revalidateLists(ESTIMATE_REQUEST_STATUSES_PATH);
    } else {
      const row: EstimateRequestStatusRow = { ...seed, ...saved };
      await replaceRowInLists(
        ESTIMATE_REQUEST_STATUSES_PATH,
        row,
        (one: EstimateRequestStatusRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  async function send(values: EstimateRequestStatusFormValues): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const outcome = await mutation.trigger(toEstimateRequestStatusWriteValues(values));
    if (outcome.ok) {
      await afterSave(outcome.data);
      return { ok: true };
    }
    if (outcome.code === VALIDATION_CODE) {
      const issues = validationIssuesSchema.safeParse(outcome.issues);
      flushSync(() => {
        setPending(null);
        for (const issue of issues.success ? issues.data : []) {
          const field = issue.path[0];
          if (isEstimateRequestStatusField(field)) {
            form.setError(field, { message: ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS[field] });
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

  useBreadcrumbLabel(breadcrumbLabel(id, record, item));

  if (waitsForRecord(id, item, seed)) {
    return <RecordState item={item} errorText={errorText} backLabel={tc('back_to_list')} />;
  }

  const failure = retryableFailure(mutation.result);
  const noun = t('noun_status');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = statusNameChange(pending, record, t('status_name'));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('new_status')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [
              { name: 'name', label: t('status_name'), kind: 'text', required: true },
              { name: 'color', label: t('color'), kind: 'color' },
              { name: 'statusorder', label: t('status_order'), kind: 'number' },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(ESTIMATE_REQUEST_STATUS_NAME_MAX) })}
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
        title={
          id === null
            ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
            : tc('save_summary_title', { name: record?.name ?? '' })
        }
        changes={changes}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        featureErrors={ESTIMATE_REQUEST_STATUSES_ERRORS}
        onConfirm={() => (pending === null ? { ok: true } : send(pending))}
      />
      <ConfirmDialog
        kind="discard"
        open={guard.pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) guard.cancelLeave();
        }}
        {...copy.discard(record === undefined ? { noun } : { recordName: record.name })}
        onConfirm={() => {
          guard.confirmLeave();
          return { ok: true };
        }}
      />
    </div>
  );
}

export const GuardedEstimateRequestStatusForm = withAuth(
  withPermission(EstimateRequestStatusForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
