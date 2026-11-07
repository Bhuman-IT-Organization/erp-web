'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm, type UseFormReturn } from 'react-hook-form';
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
import { PERMISSIONS } from '@/config/permissions';
import {
  KNOWLEDGE_BASE_GROUPS_ERRORS,
  KNOWLEDGE_BASE_GROUPS_PATH,
  knowledgeBaseGroupPath,
  VALIDATION_CODE,
} from '@/features/knowledge-base-groups/api/knowledge-base-groups.endpoints';
import { useKnowledgeBaseGroup } from '@/features/knowledge-base-groups/hooks/use-knowledge-base-groups';
import { useSaveKnowledgeBaseGroups } from '@/features/knowledge-base-groups/hooks/use-save-knowledge-base-groups';
import {
  createKnowledgeBaseGroupFormSchema,
  EMPTY_KNOWLEDGE_BASE_GROUP_FORM,
  isKnowledgeBaseGroupField,
  KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS,
  KNOWLEDGE_BASE_NAME_MAX,
  knowledgeBaseGroupRowSchema,
  toKnowledgeBaseGroupForm,
  toKnowledgeBaseGroupWriteValues,
  updateKnowledgeBaseGroupFormSchema,
  validationIssuesSchema,
  type KnowledgeBaseGroup,
  type KnowledgeBaseGroupFormInput,
  type KnowledgeBaseGroupFormValues,
  type KnowledgeBaseGroupRow,
} from '@/features/knowledge-base-groups/schemas/knowledge-base-groups.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import type { ApiResult } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, revalidateLists, useRowSeed } from '@/lib/api/row-seed';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { usePermissions } from '@/lib/auth/use-permissions';
import { isRetryableCode } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useBreadcrumbLabel } from '@/lib/hooks/use-breadcrumb-label';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';

const LIST_BASE = '/setup/knowledge-base-groups';
const FORM_ID = 'knowledge-base-groups';

interface KnowledgeBaseGroupsFormProps {
  /** The record's id from `[id]/page.tsx`; `null` on `/setup/knowledge-base-groups/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<KnowledgeBaseGroup>;
type SaveFailure = Extract<ApiResult<KnowledgeBaseGroup>, { ok: false }>;

function recordPath(id: string | null): ReturnType<typeof knowledgeBaseGroupPath> | null {
  return id === null ? null : knowledgeBaseGroupPath(id);
}

function knownValues(record: KnowledgeBaseGroup | undefined): {
  values?: KnowledgeBaseGroupFormInput;
} {
  return record === undefined ? {} : { values: toKnowledgeBaseGroupForm(record) };
}

function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: KnowledgeBaseGroupRow | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

function breadcrumbLabel(
  id: string | null,
  record: KnowledgeBaseGroup | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

function retryableFailure(result: ApiResult<KnowledgeBaseGroup> | undefined): SaveFailure | null {
  if (result === undefined || result.ok) return null;
  return isRetryableCode(result.code) ? result : null;
}

async function syncListsAfterSave(
  id: string | null,
  seed: KnowledgeBaseGroupRow | undefined,
  saved: KnowledgeBaseGroup,
): Promise<void> {
  if (id === null || seed !== undefined) {
    await replaceRowInLists(
      KNOWLEDGE_BASE_GROUPS_PATH,
      saved,
      (one: KnowledgeBaseGroupRow) => one.id === saved.id,
    );
    return;
  }
  await revalidateLists(KNOWLEDGE_BASE_GROUPS_PATH);
}

function nameChanges(
  pending: KnowledgeBaseGroupFormInput | null,
  record: KnowledgeBaseGroup | undefined,
  nameLabel: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name.trim() === record.name.trim()
    ? []
    : [{ type: 'changed', label: nameLabel, from: record.name.trim(), to: pending.name.trim() }];
}

function discardTarget(
  record: KnowledgeBaseGroup | undefined,
  noun: string,
): { readonly recordName: string } | { readonly noun: string } {
  return record === undefined ? { noun } : { recordName: record.name };
}

function buildFormSections(t: (key: string) => string, showSlug: boolean) {
  return [
    {
      id: 'details',
      title: t('section_details'),
      fields: [
        {
          name: 'name' as const,
          label: t('group_name'),
          kind: 'text' as const,
          required: true,
        },
        ...(showSlug
          ? [
              {
                name: 'groupSlug' as const,
                label: t('slug'),
                kind: 'text' as const,
                required: true,
              },
            ]
          : []),
        {
          name: 'color' as const,
          label: t('color'),
          kind: 'color' as const,
        },
        {
          name: 'description' as const,
          label: t('short_description'),
          kind: 'textarea' as const,
        },
        {
          name: 'groupOrder' as const,
          label: t('order'),
          kind: 'number' as const,
        },
        {
          name: 'disabled' as const,
          label: t('disabled'),
          kind: 'checkbox' as const,
          helper: t('disabled_note'),
        },
      ],
    },
  ];
}

function getFormLabels(
  tc: (key: string, values?: Record<string, string>) => string,
  noun: string,
  isNew: boolean,
) {
  return {
    submitLabel: tc(isNew ? 'create_noun' : 'save_noun', { noun }),
    pendingLabel: tc(isNew ? 'creating_noun' : 'saving_noun', { noun }),
  };
}

function getSummaryTitle(
  tc: (key: string, values?: Record<string, string>) => string,
  noun: string,
  pendingName: string | undefined,
  recordName: string | undefined,
  isNew: boolean,
): string {
  return isNew
    ? tc('create_summary_title', { noun, name: pendingName ?? '' })
    : tc('save_summary_title', { name: recordName ?? '' });
}

function applyServerValidationErrors(
  issues: unknown,
  form: UseFormReturn<KnowledgeBaseGroupFormInput>,
  formId: string,
): void {
  const parsed = validationIssuesSchema.safeParse(issues);
  flushSync(() => {
    let matched = false;
    for (const issue of parsed.success ? parsed.data : []) {
      const field = issue.path[0];
      if (isKnowledgeBaseGroupField(field)) {
        form.setError(field, { message: KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS[field] });
        matched = true;
      }
    }
    if (!matched && parsed.success && parsed.data.length > 0) {
      form.setError('name', { message: KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.name });
    }
  });
  document
    .getElementById(formId)
    ?.querySelector<HTMLElement>('[data-testid="error-summary"]')
    ?.focus();
}

function getPageHeading(recordName: string | undefined, defaultHeading: string): string {
  return recordName ?? defaultHeading;
}

function useReadOnlyPermission(isNew: boolean): boolean {
  const { can } = usePermissions();
  if (isNew) {
    return !can(PERMISSIONS.knowledgeBase.articles.create);
  }
  return !can(PERMISSIONS.knowledgeBase.articles.edit);
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

export function KnowledgeBaseGroupsForm({ id }: KnowledgeBaseGroupsFormProps): ReactElement {
  const t = useTranslations('knowledge-base-groups');
  const tc = useTranslations('common');
  const router = useRouter();
  const errorText = useErrorText(KNOWLEDGE_BASE_GROUPS_ERRORS);
  const copy = useConfirmCopy();
  const isNew = id === null;
  const isReadOnly = useReadOnlyPermission(isNew);

  const seed = useRowSeed(recordPath(id), knowledgeBaseGroupRowSchema);
  const item = useKnowledgeBaseGroup(id);
  const record = item.data ?? seed;

  const form = useForm<
    z.input<typeof createKnowledgeBaseGroupFormSchema>,
    unknown,
    KnowledgeBaseGroupFormValues
  >({
    resolver: zodResolver(
      isNew ? createKnowledgeBaseGroupFormSchema : updateKnowledgeBaseGroupFormSchema,
    ),
    defaultValues: EMPTY_KNOWLEDGE_BASE_GROUP_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });

  const { create, update } = useSaveKnowledgeBaseGroups(id);
  const mutation = isNew ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const lastSent = useRef<KnowledgeBaseGroupFormInput | null>(null);
  const [pending, setPending] = useState<KnowledgeBaseGroupFormInput | null>(null);

  async function afterSave(saved: KnowledgeBaseGroup): Promise<void> {
    form.reset(toKnowledgeBaseGroupForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    await syncListsAfterSave(id, seed, saved);
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  async function send(values: KnowledgeBaseGroupFormInput): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const writePayload = toKnowledgeBaseGroupWriteValues(values, !isNew, record?.groupSlug);
    const outcome = await mutation.trigger(writePayload);
    if (outcome.ok) {
      await afterSave(outcome.data);
      return { ok: true };
    }
    if (outcome.code === VALIDATION_CODE) {
      setPending(null);
      applyServerValidationErrors(outcome.issues, form, FORM_ID);
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
  const noun = t('noun_knowledge_base_group');
  const { submitLabel, pendingLabel } = getFormLabels(
    (key, params) => tc(key, params),
    noun,
    isNew,
  );
  const changes = nameChanges(pending, record, t('group_name'));
  const sections = buildFormSections((key) => t(key), !isNew);
  const title = getSummaryTitle(
    (key, params) => tc(key, params),
    noun,
    pending?.name,
    record?.name,
    isNew,
  );
  const pageHeading = getPageHeading(record?.name, t('new_group'));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{pageHeading}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        readOnly={isReadOnly}
        sections={sections}
        onValid={(values) => {
          setPending(values);
        }}
        translateError={(key) => t(key, { max: KNOWLEDGE_BASE_NAME_MAX })}
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
                  if (lastSent.current !== null) {
                    void send(lastSent.current);
                  }
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
        title={title}
        changes={changes}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        featureErrors={KNOWLEDGE_BASE_GROUPS_ERRORS}
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

export const GuardedKnowledgeBaseGroupsForm = withAuth(
  withPermission(KnowledgeBaseGroupsForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
