'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type Dispatch, type ReactElement, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { useForm, type UseFormReturn } from 'react-hook-form';
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
  ESTIMATE_REQUEST_STATUSES_ERRORS,
  ESTIMATE_REQUEST_STATUSES_PATH,
  estimateRequestStatusesPath,
  VALIDATION_CODE,
} from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import {
  useEstimateRequestStatuses,
  useEstimateRequestStatusesCount,
} from '@/features/estimate-request-statuses/hooks/use-estimate-request-statuses';
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
} from '@/features/estimate-request-statuses/schemas/estimate-request-statuses.schema';
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

const LIST_BASE = '/setup/estimate-request-statuses';
const FORM_ID = 'estimate-request-statuses';

interface EstimateRequestStatusesFormProps {
  readonly id: string | null;
}

type RecordRead = CommonApiResult<EstimateRequestStatus>;
type SaveFailure = Extract<ApiResult<EstimateRequestStatus>, { ok: false }>;
type StatusMutation = ReturnType<typeof useSaveEstimateRequestStatuses>['create'];
type StatusFormState = UseFormReturn<EstimateRequestStatusFormInput>;

function recordPath(id: string | null) {
  return id === null ? null : estimateRequestStatusesPath(id);
}

function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: EstimateRequestStatus | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

function retryableFailure(
  result: ApiResult<EstimateRequestStatus> | undefined,
): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
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

async function afterStatusSave({
  id,
  saved,
  successMessage,
  form,
  item,
  seed,
  router,
}: {
  readonly id: string | null;
  readonly saved: EstimateRequestStatus;
  readonly successMessage: string;
  readonly form: StatusFormState;
  readonly item: RecordRead;
  readonly seed: EstimateRequestStatus | undefined;
  readonly router: ReturnType<typeof useRouter>;
}): Promise<void> {
  form.reset(toEstimateRequestStatusForm(saved));
  if (id !== null) await item.mutate(saved, { revalidate: false });
  if (id === null || seed === undefined) {
    await revalidateLists(ESTIMATE_REQUEST_STATUSES_PATH);
  } else {
    await replaceRowInLists(
      ESTIMATE_REQUEST_STATUSES_PATH,
      saved,
      (row: EstimateRequestStatus) => row.id === saved.id,
    );
  }
  toast.success(successMessage, { duration: CLIENT_TIMINGS.toast.durationMs });
  router.push(readListReturn(LIST_BASE), { scroll: false });
}

async function sendStatus({
  values,
  mutation,
  form,
  setPending,
  onSaved,
}: {
  readonly values: EstimateRequestStatusFormValues;
  readonly mutation: StatusMutation;
  readonly form: StatusFormState;
  readonly setPending: Dispatch<SetStateAction<EstimateRequestStatusFormValues | null>>;
  readonly onSaved: (saved: EstimateRequestStatus) => Promise<void>;
}): Promise<ConfirmOutcome> {
  const outcome = await mutation.trigger(toEstimateRequestStatusWriteValues(values));
  if (outcome.ok) {
    await onSaved(outcome.data);
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

function statusChanges(
  pending: EstimateRequestStatusFormValues | null,
  record: EstimateRequestStatus | undefined,
  labels: { readonly name: string; readonly color: string; readonly order: string },
): readonly SummaryChange[] {
  if (pending === null || record === undefined) return [];
  const changes: SummaryChange[] = [];
  const order = pending.statusorder === '' ? '' : String(pending.statusorder);
  const previousOrder = record.statusorder === null ? '' : String(record.statusorder);
  if (pending.name !== record.name) {
    changes.push({ type: 'changed', label: labels.name, from: record.name, to: pending.name });
  }
  if (pending.color !== record.color) {
    changes.push({ type: 'changed', label: labels.color, from: record.color, to: pending.color });
  }
  if (order !== previousOrder) {
    changes.push({ type: 'changed', label: labels.order, from: previousOrder, to: order });
  }
  return changes;
}

function RecordState({
  item,
  errorText,
}: {
  readonly item: RecordRead;
  readonly errorText: ReturnType<typeof useErrorText>;
}): ReactElement {
  const tc = useTranslations('common');
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
      back={{ href: readListReturn(LIST_BASE), label: tc('back_to_list') }}
    />
  );
}

function statusFormValues(
  record: EstimateRequestStatus | undefined,
  total: number | undefined,
): EstimateRequestStatusFormInput {
  return record === undefined
    ? {
        ...EMPTY_ESTIMATE_REQUEST_STATUS_FORM,
        statusorder: String((total ?? 0) + 1),
      }
    : toEstimateRequestStatusForm(record);
}

function emptyWhenUndefined(value: string | undefined): string {
  return value ?? '';
}

function chooseStatusValue<T>(id: string | null, create: T, update: T): T {
  return id === null ? create : update;
}

function statusFormTitle(
  id: string | null,
  record: EstimateRequestStatus | undefined,
  newTitle: string,
  editTitle: string,
): string {
  return record?.name ?? (id === null ? newTitle : editTitle);
}

interface StatusFormConfirmationsProps {
  readonly pending: EstimateRequestStatusFormValues | null;
  readonly id: string | null;
  readonly noun: string;
  readonly name: string | undefined;
  readonly createTitle: string;
  readonly saveTitle: string;
  readonly changes: readonly SummaryChange[];
  readonly copy: ReturnType<typeof useConfirmCopy>;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly setPending: Dispatch<SetStateAction<EstimateRequestStatusFormValues | null>>;
  readonly send: (values: EstimateRequestStatusFormValues) => Promise<ConfirmOutcome>;
  readonly guard: ReturnType<typeof useUnsavedChanges>;
  readonly featureErrors: typeof ESTIMATE_REQUEST_STATUSES_ERRORS;
}

function StatusFormConfirmations({
  pending,
  id,
  noun,
  name,
  createTitle,
  saveTitle,
  changes,
  copy,
  submitLabel,
  pendingLabel,
  setPending,
  send,
  guard,
  featureErrors,
}: StatusFormConfirmationsProps): ReactElement {
  return (
    <>
      <ConfirmDialog
        kind="summary"
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={id === null ? createTitle : saveTitle}
        changes={changes}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        featureErrors={featureErrors}
        onConfirm={() => (pending === null ? { ok: true } : send(pending))}
      />
      <ConfirmDialog
        kind="discard"
        open={guard.pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) guard.cancelLeave();
        }}
        {...copy.discard(name === undefined ? { noun } : { recordName: name })}
        onConfirm={() => {
          guard.confirmLeave();
          return { ok: true };
        }}
      />
    </>
  );
}

export function EstimateRequestStatusesForm({
  id,
}: EstimateRequestStatusesFormProps): ReactElement {
  const t = useTranslations('estimate-request-statuses');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(ESTIMATE_REQUEST_STATUSES_ERRORS);
  const copy = useConfirmCopy();
  const path = recordPath(id);
  const seed = useRowSeed(path, estimateRequestStatusRowSchema);
  const item = useEstimateRequestStatuses(id);
  const record = item.data ?? seed;
  const list = useEstimateRequestStatusesCount();
  const { create, update } = useSaveEstimateRequestStatuses(id);
  const mutation = chooseStatusValue(id, create, update);
  const defaultValues = statusFormValues(record, list.data?.meta.total);
  const form = useForm<EstimateRequestStatusFormInput>({
    resolver: zodResolver(estimateRequestStatusFormSchema),
    defaultValues: EMPTY_ESTIMATE_REQUEST_STATUS_FORM,
    values: defaultValues,
    resetOptions: { keepDirtyValues: true },
  });
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const lastSent = useRef<EstimateRequestStatusFormValues | null>(null);
  const [pending, setPending] = useState<EstimateRequestStatusFormValues | null>(null);

  function send(values: EstimateRequestStatusFormValues): Promise<ConfirmOutcome> {
    lastSent.current = values;
    return sendStatus({
      values,
      mutation,
      form,
      setPending,
      onSaved: (saved) =>
        afterStatusSave({ id, saved, successMessage: t('saved_toast'), form, item, seed, router }),
    });
  }

  useBreadcrumbLabel(breadcrumbLabel(id, record, item));

  if (waitsForRecord(id, item, seed)) {
    return <RecordState item={item} errorText={errorText} />;
  }

  const failure = retryableFailure(mutation.result);
  const noun = t('noun_status');
  const submitLabel = chooseStatusValue(id, tc('create_noun', { noun }), tc('save_noun', { noun }));
  const pendingLabel = chooseStatusValue(
    id,
    tc('creating_noun', { noun }),
    tc('saving_noun', { noun }),
  );
  const changes = statusChanges(pending, record, {
    name: t('status_name'),
    color: t('color'),
    order: t('status_order'),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {statusFormTitle(id, record, t('new_status'), t('edit_status'))}
      </h1>
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
        translateError={(key) =>
          t(key, {
            max: ESTIMATE_REQUEST_STATUS_NAME_MAX,
            maxN: f.number(ESTIMATE_REQUEST_STATUS_NAME_MAX),
          })
        }
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
      <StatusFormConfirmations
        pending={pending}
        id={id}
        noun={noun}
        name={record?.name}
        createTitle={tc('create_summary_title', {
          noun,
          name: emptyWhenUndefined(pending?.name),
        })}
        saveTitle={tc('save_summary_title', { name: emptyWhenUndefined(record?.name) })}
        changes={changes}
        copy={copy}
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        setPending={setPending}
        send={send}
        guard={guard}
        featureErrors={ESTIMATE_REQUEST_STATUSES_ERRORS}
      />
    </div>
  );
}

export const GuardedEstimateRequestStatusesForm = withAuth(
  withPermission(EstimateRequestStatusesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
