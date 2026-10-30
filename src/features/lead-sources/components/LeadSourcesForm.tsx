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
  LEAD_SOURCES_ERRORS,
  LEAD_SOURCES_PATH,
  leadSourcesPath,
  VALIDATION_CODE,
} from '@/features/lead-sources/api/lead-sources.endpoints';
import { useLeadSources } from '@/features/lead-sources/hooks/use-lead-sources';
import { useSaveLeadSources } from '@/features/lead-sources/hooks/use-save-lead-sources';
import {
  EMPTY_LEAD_SOURCES_FORM,
  LEAD_SOURCES_MESSAGE_KEYS,
  LEAD_SOURCES_NAME_MAX,
  leadSourcesFormSchema,
  leadSourcesRowSchema,
  isLeadSourcesField,
  toLeadSourcesForm,
  validationIssuesSchema,
  type LeadSources,
  type LeadSourcesFormValues,
  type LeadSourcesRow,
} from '@/features/lead-sources/schemas/lead-sources.schema';
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

const LIST_BASE = '/setup/lead-sources';
const FORM_ID = 'lead-sources';

interface LeadSourcesFormProps {
  /** The record's id from `app/(shell)/setup/lead-sources/[id]/page.tsx`; `null` on `/setup/lead-sources/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<LeadSources>;
type SaveFailure = Extract<ApiResult<LeadSources>, { ok: false }>;

/** The record's api path, or `null` on `/setup/lead-sources/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof leadSourcesPath> | null {
  return id === null ? null : leadSourcesPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: LeadSources | undefined): { values?: LeadSourcesFormValues } {
  return record === undefined ? {} : { values: toLeadSourcesForm(record) };
}

/**
 * True while there is no record to edit (D-39): a permalink before its record answers, or a row
 * opened from the list whose record answers a 4xx.
 */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: LeadSourcesRow | undefined,
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
  record: LeadSources | undefined,
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
function retryableFailure(result: ApiResult<LeadSources> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The save summary's one possible change: the name, when the pending value differs from the record's. */
function nameChanges(
  pending: LeadSourcesFormValues | null,
  record: LeadSources | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: LeadSources | undefined,
  noun: string,
): { readonly recordName: string } | { readonly noun: string } {
  return record === undefined ? { noun } : { recordName: record.name };
}

/**
 * The page while `waitsForRecord`: the form's shape until the record answers, then the record or
 * why not, with "Back to list" leading out (D-39).
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

export function LeadSourcesForm({ id }: LeadSourcesFormProps): ReactElement {
  const t = useTranslations('lead-sources');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(LEAD_SOURCES_ERRORS);
  const copy = useConfirmCopy();

  const seed = useRowSeed(recordPath(id), leadSourcesRowSchema);
  const item = useLeadSources(id);
  const record = item.data ?? seed;

  const form = useForm<LeadSourcesFormValues>({
    resolver: zodResolver(leadSourcesFormSchema),
    defaultValues: EMPTY_LEAD_SOURCES_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });

  const { create, update } = useSaveLeadSources(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);

  const lastSent = useRef<LeadSourcesFormValues | null>(null);
  const [pending, setPending] = useState<LeadSourcesFormValues | null>(null);

  async function afterSave(saved: LeadSources): Promise<void> {
    form.reset(toLeadSourcesForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      await revalidateLists(LEAD_SOURCES_PATH);
    } else {
      const row: LeadSourcesRow = { ...seed, ...saved };
      await replaceRowInLists(LEAD_SOURCES_PATH, row, (one: LeadSourcesRow) => one.id === row.id);
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  async function send(values: LeadSourcesFormValues): Promise<ConfirmOutcome> {
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
          if (isLeadSourcesField(field)) {
            form.setError(field, { message: LEAD_SOURCES_MESSAGE_KEYS[field] });
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
  const noun = t('noun_lead_source');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('noun_lead_source'));

  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('lead_new_source')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [
              { name: 'name', label: t('leads_sources_table_name'), kind: 'text', required: true },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(LEAD_SOURCES_NAME_MAX) })}
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
        featureErrors={LEAD_SOURCES_ERRORS}
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

export const GuardedLeadSourcesForm = withAuth(
  withPermission(LeadSourcesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
