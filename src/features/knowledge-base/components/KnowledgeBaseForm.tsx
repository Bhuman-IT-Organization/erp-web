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
  KNOWLEDGE_BASE_ERRORS,
  KNOWLEDGE_BASE_PATH,
  knowledgeBasePath,
  VALIDATION_CODE,
} from '@/features/knowledge-base/api/knowledge-base.endpoints';
import { useKnowledgeBase } from '@/features/knowledge-base/hooks/use-knowledge-base';
import { useSaveKnowledgeBase } from '@/features/knowledge-base/hooks/use-save-knowledge-base';
import {
  EMPTY_KNOWLEDGE_BASE_FORM,
  KNOWLEDGE_BASE_MESSAGE_KEYS,
  KNOWLEDGE_BASE_NAME_MAX,
  knowledgeBaseFormSchema,
  knowledgeBaseRowSchema,
  isKnowledgeBaseField,
  toKnowledgeBaseForm,
  validationIssuesSchema,
  type KnowledgeBase,
  type KnowledgeBaseFormValues,
  type KnowledgeBaseRow,
} from '@/features/knowledge-base/schemas/knowledge-base.schema';
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

const LIST_BASE = '/setup/knowledge-base';
const FORM_ID = 'knowledge-base';

interface KnowledgeBaseFormProps {
  /** The record's id from `app/(shell)/setup/knowledge-base/[id]/page.tsx`; `null` on `/setup/knowledge-base/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<KnowledgeBase>;
type SaveFailure = Extract<ApiResult<KnowledgeBase>, { ok: false }>;

/** The record's api path, or `null` on `/setup/knowledge-base/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof knowledgeBasePath> | null {
  return id === null ? null : knowledgeBasePath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: KnowledgeBase | undefined): { values?: KnowledgeBaseFormValues } {
  return record === undefined ? {} : { values: toKnowledgeBaseForm(record) };
}

/**
 * True while there is no record to edit (D-39): a permalink before its record answers, or a row
 * opened from the list whose record answers a 4xx. A row whose read fails retryably keeps the form:
 * the row IS the whole record here.
 */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: KnowledgeBaseRow | undefined,
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
  record: KnowledgeBase | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

/** The last save's failure when a Retry can fix it (the form's alert); a refusal was shown in the dialog. */
function retryableFailure(result: ApiResult<KnowledgeBase> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The save summary's one possible change: the name, when the pending value differs from the record's. */
function nameChanges(
  pending: KnowledgeBaseFormValues | null,
  record: KnowledgeBase | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: KnowledgeBase | undefined,
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
 * The Knowledge Base create and edit pages on the kit's `SchemaForm` (UIK-06): one "Details" section
 * with Knowledge Base Name (required, trimmed, 1 to 255 characters, every character accepted and
 * nothing cleaned as it is typed; a name another knowledge base holds is accepted, D-29).
 */
export function KnowledgeBaseForm({ id }: KnowledgeBaseFormProps): ReactElement {
  const t = useTranslations('knowledge-base');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(KNOWLEDGE_BASE_ERRORS);
  const copy = useConfirmCopy();
  const seed = useRowSeed(recordPath(id), knowledgeBaseRowSchema);
  const item = useKnowledgeBase(id);
  const record = item.data ?? seed;
  const form = useForm<KnowledgeBaseFormValues>({
    resolver: zodResolver(knowledgeBaseFormSchema),
    defaultValues: EMPTY_KNOWLEDGE_BASE_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveKnowledgeBase(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const lastSent = useRef<KnowledgeBaseFormValues | null>(null);
  const [pending, setPending] = useState<KnowledgeBaseFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list (D-28, D-36). */
  async function afterSave(saved: KnowledgeBase): Promise<void> {
    form.reset(toKnowledgeBaseForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      await revalidateLists(KNOWLEDGE_BASE_PATH);
    } else {
      const row: KnowledgeBaseRow = { ...seed, ...saved };
      await replaceRowInLists(
        KNOWLEDGE_BASE_PATH,
        row,
        (one: KnowledgeBaseRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows (D-29); `{ ok: true }` tells the dialog its part is done. */
  async function send(values: KnowledgeBaseFormValues): Promise<ConfirmOutcome> {
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
          if (isKnowledgeBaseField(field)) {
            form.setError(field, { message: KNOWLEDGE_BASE_MESSAGE_KEYS[field] });
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
  const noun = t('noun_knowledge_base');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('knowledge_base_name'));

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('add_knowledge_base')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [
              { name: 'name', label: t('knowledge_base_name'), kind: 'text', required: true },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(KNOWLEDGE_BASE_NAME_MAX) })}
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
        featureErrors={KNOWLEDGE_BASE_ERRORS}
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
export const GuardedKnowledgeBaseForm = withAuth(
  withPermission(KnowledgeBaseForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
