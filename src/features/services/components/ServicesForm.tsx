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
  SERVICES_ERRORS,
  SERVICES_PATH,
  servicesPath,
  VALIDATION_CODE,
} from '@/features/services/api/services.endpoints';
import { useServices } from '@/features/services/hooks/use-services';
import { useSaveServices } from '@/features/services/hooks/use-save-services';
import {
  EMPTY_SERVICES_FORM,
  isServicesField,
  SERVICES_MESSAGE_KEYS,
  SERVICES_NAME_MAX,
  servicesFormSchema,
  servicesRowSchema,
  toServicesForm,
  validationIssuesSchema,
  type Services,
  type ServicesFormValues,
  type ServicesRow,
} from '@/features/services/schemas/services.schema';
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

const LIST_BASE = '/setup/services';
const FORM_ID = 'services';

interface ServicesFormProps {
  /** The record's id from `[id]/page.tsx`; `null` on `/setup/services/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<Services>;
type SaveFailure = Extract<ApiResult<Services>, { ok: false }>;

function recordPath(id: string | null): ReturnType<typeof servicesPath> | null {
  return id === null ? null : servicesPath(id);
}

function knownValues(record: Services | undefined): { values?: ServicesFormValues } {
  return record === undefined ? {} : { values: toServicesForm(record) };
}

/** True while there is no record to edit: a permalink before its record answers, or a 4xx read. */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: ServicesRow | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

function breadcrumbLabel(
  id: string | null,
  record: Services | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

function retryableFailure(result: ApiResult<Services> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

function nameChanges(
  pending: ServicesFormValues | null,
  record: Services | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

function discardTarget(
  record: Services | undefined,
  noun: string,
): { readonly recordName: string } | { readonly noun: string } {
  return record === undefined ? { noun } : { recordName: record.name };
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

/**
 * The Services create and edit pages of Perfex's `service.php` (a modal there, a page here) on the
 * kit's `SchemaForm`: one "Details" section with Perfex's one field, Service Name (required,
 * trimmed, 1 to 50 characters). Every save is confirmed by a summary; the outcome handling is the
 * Services form's. Names render as React text only.
 */
export function ServicesForm({ id }: ServicesFormProps): ReactElement {
  const t = useTranslations('services');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(SERVICES_ERRORS);
  const copy = useConfirmCopy();
  const seed = useRowSeed(recordPath(id), servicesRowSchema);
  const item = useServices(id);
  const record = item.data ?? seed;
  const form = useForm<ServicesFormValues>({
    resolver: zodResolver(servicesFormSchema),
    defaultValues: EMPTY_SERVICES_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveServices(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const lastSent = useRef<ServicesFormValues | null>(null);
  const [pending, setPending] = useState<ServicesFormValues | null>(null);

  async function afterSave(saved: Services): Promise<void> {
    form.reset(toServicesForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      await revalidateLists(SERVICES_PATH);
    } else {
      const row: ServicesRow = { ...seed, ...saved };
      await replaceRowInLists(SERVICES_PATH, row, (one: ServicesRow) => one.id === row.id);
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  async function send(values: ServicesFormValues): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const outcome = await mutation.trigger(values);
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
          if (isServicesField(field)) {
            form.setError(field, { message: SERVICES_MESSAGE_KEYS[field] });
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
  const noun = t('service_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('services_dt_name'));

  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('new_service')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [{ name: 'name', label: t('services_dt_name'), kind: 'text', required: true }],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(SERVICES_NAME_MAX) })}
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
        featureErrors={SERVICES_ERRORS}
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

export const GuardedServicesForm = withAuth(withPermission(ServicesForm, { skeleton: 'form' }), {
  skeleton: 'form',
});
