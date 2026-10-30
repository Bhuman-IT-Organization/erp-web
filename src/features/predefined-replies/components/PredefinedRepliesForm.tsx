'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
  PREDEFINED_REPLIES_ERRORS,
  PREDEFINED_REPLIES_PATH,
  predefinedRepliesPath,
  VALIDATION_CODE,
} from '@/features/predefined-replies/api/predefined-replies.endpoints';
import { usePredefinedReplies } from '@/features/predefined-replies/hooks/use-predefined-replies';
import { useSavePredefinedReplies } from '@/features/predefined-replies/hooks/use-save-predefined-replies';
import {
  EMPTY_PREDEFINED_REPLIES_FORM,
  PREDEFINED_REPLIES_MESSAGE_KEYS,
  PREDEFINED_REPLIES_NAME_MAX,
  predefinedRepliesFormSchema,
  predefinedRepliesRowSchema,
  isPredefinedRepliesField,
  toPredefinedRepliesForm,
  validationIssuesSchema,
  type PredefinedReplies,
  type PredefinedRepliesFormValues,
  type PredefinedRepliesRow,
} from '@/features/predefined-replies/schemas/predefined-replies.schema';
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

const LIST_BASE = '/setup/predefined-replies';
const FORM_ID = 'predefined-replies';

interface PredefinedRepliesFormProps {
  readonly id: string | null;
}

type RecordRead = CommonApiResult<PredefinedReplies>;
type SaveFailure = Extract<ApiResult<PredefinedReplies>, { ok: false }>;

function recordPath(id: string | null): ReturnType<typeof predefinedRepliesPath> | null {
  return id === null ? null : predefinedRepliesPath(id);
}

function knownValues(record: PredefinedReplies | undefined): {
  values?: PredefinedRepliesFormValues;
} {
  return record === undefined ? {} : { values: toPredefinedRepliesForm(record) };
}

function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: PredefinedRepliesRow | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

function breadcrumbLabel(
  id: string | null,
  record: PredefinedReplies | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;

  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);

  return failureShown ? null : record?.name;
}

function retryableFailure(result: ApiResult<PredefinedReplies> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

function nameChanges(
  pending: PredefinedRepliesFormValues | null,
  record: PredefinedReplies | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

function discardTarget(
  record: PredefinedReplies | undefined,
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

function recordHasOtherFormatting(record: unknown): boolean {
  return (
    typeof record === 'object' &&
    record !== null &&
    'hasOtherFormatting' in record &&
    record.hasOtherFormatting === true
  );
}

function FormattingNotice({ record }: { record: unknown }): ReactElement | null {
  const t = useTranslations('predefined-replies');

  if (!recordHasOtherFormatting(record)) return null;

  return (
    <div
      role="status"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
    >
      {t('formatting_warning')}
    </div>
  );
}

export function PredefinedRepliesForm({ id }: PredefinedRepliesFormProps): ReactElement {
  const t = useTranslations('predefined-replies');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(PREDEFINED_REPLIES_ERRORS);
  const copy = useConfirmCopy();

  const seed = useRowSeed(recordPath(id), predefinedRepliesRowSchema);
  const item = usePredefinedReplies(id);
  const record = item.data ?? seed;

  const form = useForm<
    z.input<typeof predefinedRepliesFormSchema>,
    unknown,
    PredefinedRepliesFormValues
  >({
    resolver: zodResolver(predefinedRepliesFormSchema),
    defaultValues: EMPTY_PREDEFINED_REPLIES_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });

  const { create, update } = useSavePredefinedReplies(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);

  const lastSent = useRef<PredefinedRepliesFormValues | null>(null);
  const [pending, setPending] = useState<PredefinedRepliesFormValues | null>(null);

  async function afterSave(saved: PredefinedReplies): Promise<void> {
    form.reset(toPredefinedRepliesForm(saved));

    if (id !== null) await item.mutate(saved, { revalidate: false });

    if (id === null || seed === undefined) {
      await revalidateLists(PREDEFINED_REPLIES_PATH);
    } else {
      const row: PredefinedRepliesRow = { ...seed, ...saved };
      await replaceRowInLists(
        PREDEFINED_REPLIES_PATH,
        row,
        (one: PredefinedRepliesRow) => one.id === row.id,
      );
    }

    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  async function send(values: PredefinedRepliesFormValues): Promise<ConfirmOutcome> {
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

          if (isPredefinedRepliesField(field)) {
            form.setError(field, { message: PREDEFINED_REPLIES_MESSAGE_KEYS[field] });
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
  const noun = t('noun_predefined_reply');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('predefined_replies_dt_name'));

  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('new_predefined_reply')}</h1>

      <FormattingNotice record={record} />
      <p className="text-sm text-muted-foreground">{t('message_paragraph_helper')}</p>

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
                label: t('predefined_replies_dt_name'),
                kind: 'text',
                required: true,
              },
              {
                name: 'message',
                label: t('ticket_form_message'),
                kind: 'textarea',
                required: false,
              },
            ],
          },
        ]}
        onValid={(values) => {
          setPending({
            ...values,
            message: values.message ?? '',
          });
        }}
        translateError={(key) => t(key, { max: f.number(PREDEFINED_REPLIES_NAME_MAX) })}
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
        featureErrors={PREDEFINED_REPLIES_ERRORS}
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

export const GuardedPredefinedRepliesForm = withAuth(
  withPermission(PredefinedRepliesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
