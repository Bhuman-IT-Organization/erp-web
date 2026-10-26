'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';

import { InlineError } from '@/components/molecules/InlineError';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmOutcome,
} from '@/components/organisms/ConfirmDialog';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { SchemaForm, type FormSectionSpec } from '@/components/organisms/SchemaForm';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { LEAD_STATUSES_PATH } from '../api/lead-statuses.endpoints';
import { useLeadStatuses } from '../hooks/use-lead-statuses';
import { useSaveLeadStatuses } from '../hooks/use-save-lead-statuses';
import {
  EMPTY_LEAD_STATUSES_FORM,
  leadStatusesFormSchema,
  toLeadStatusesForm,
  type LeadStatuses,
  type LeadStatusesFormValues,
} from '../schemas/lead-statuses.schema';

import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { revalidateLists } from '@/lib/api/row-seed';
import type { CommonApiResult } from '@/lib/api/use-common-api';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';

const LIST_BASE = '/setup/lead-statuses';
const FORM_ID = 'lead-statuses';

interface LeadStatusesFormProps {
  readonly id: string | null;
}

const FIELD_MESSAGES = {
  name: 'enter_name',
  color: 'invalid_color',
  statusorder: 'invalid_order',
} as const;

function isKnownField(field: unknown): field is keyof typeof FIELD_MESSAGES {
  return typeof field === 'string' && Object.prototype.hasOwnProperty.call(FIELD_MESSAGES, field);
}

function hasIssuePath(issue: unknown): issue is { path: unknown[] } {
  return (
    typeof issue === 'object' && issue !== null && 'path' in issue && Array.isArray(issue.path)
  );
}

function applyValidationIssues(
  issues: unknown,
  setError: UseFormSetError<LeadStatusesFormValues>,
): void {
  if (!Array.isArray(issues)) return;

  for (const issue of issues) {
    if (!hasIssuePath(issue)) continue;

    const field = issue.path[0];

    if (isKnownField(field)) {
      setError(field, {
        message: FIELD_MESSAGES[field],
      });
    }
  }
}

function knownValues(record: LeadStatuses | undefined) {
  return record === undefined ? {} : { values: toLeadStatusesForm(record) };
}

function parseOrder(value: string): number | undefined {
  return value === '' ? undefined : Number(value);
}

interface FieldLabels {
  readonly heading: string;
  readonly name: string;
  readonly color: string;
  readonly order: string;
}

function buildSections(labels: FieldLabels): readonly FormSectionSpec<LeadStatusesFormValues>[] {
  return [
    {
      id: 'details',
      title: labels.heading,
      fields: [
        {
          name: 'name',
          label: labels.name,
          kind: 'text',
          required: true,
        },
        {
          name: 'color',
          label: labels.color,
          kind: 'color',
          required: true,
        },
        {
          name: 'statusorder',
          label: labels.order,
          kind: 'custom',
          render: (field, state) => (
            <Field data-invalid={state.invalid}>
              <FieldLabel htmlFor={state.id}>{labels.order}</FieldLabel>

              <Input
                id={state.id}
                name={field.name}
                type="number"
                min={1}
                step={1}
                value={field.value ?? ''}
                onChange={(event) => {
                  field.onChange(parseOrder(event.target.value));
                }}
                onBlur={field.onBlur}
                disabled={state.disabled}
                aria-invalid={state.invalid}
                aria-describedby={state.describedBy}
              />
            </Field>
          ),
        },
      ],
    },
  ];
}

function RecordReadState({ item }: { readonly item: CommonApiResult<LeadStatuses> }): ReactElement {
  const tc = useTranslations('common');

  if (item.error === undefined) {
    return <PageSkeleton variant="form" />;
  }

  return (
    <InlineError
      message={tc('save_failed')}
      busy={item.isValidating}
      back={{
        href: LIST_BASE,
        label: tc('back_to_list'),
      }}
      {...(item.error.retryable
        ? {
            onRetry: () => {
              void item.mutate();
            },
          }
        : {})}
    />
  );
}

interface DialogsProps {
  readonly id: string | null;
  readonly pending: LeadStatusesFormValues | null;
  readonly name: string | undefined;
  readonly noun: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly setPending: (value: LeadStatusesFormValues | null) => void;
  readonly onSave: (values: LeadStatusesFormValues) => Promise<ConfirmOutcome>;
  readonly guard: ReturnType<typeof useUnsavedChanges>;
}

function EditorDialogs({
  id,
  pending,
  name,
  noun,
  submitLabel,
  pendingLabel,
  setPending,
  onSave,
  guard,
}: DialogsProps): ReactElement {
  const tc = useTranslations('common');
  const copy = useConfirmCopy();

  const summaryTitle =
    id === null
      ? tc('create_summary_title', {
          noun,
          name: pending?.name ?? '',
        })
      : tc('save_summary_title', {
          name: name ?? '',
        });

  const discardTarget = name === undefined ? { noun } : { recordName: name };

  return (
    <>
      <ConfirmDialog
        kind="summary"
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={summaryTitle}
        changes={[]}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        onConfirm={() => (pending === null ? { ok: true } : onSave(pending))}
      />

      <ConfirmDialog
        kind="discard"
        open={guard.pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) guard.cancelLeave();
        }}
        {...copy.discard(discardTarget)}
        onConfirm={() => {
          guard.confirmLeave();
          return { ok: true };
        }}
      />
    </>
  );
}

export function LeadStatusesForm({ id }: LeadStatusesFormProps): ReactElement {
  const t = useTranslations('lead-statuses');
  const tc = useTranslations('common');
  const router = useRouter();

  const item = useLeadStatuses(id);
  const { create, update } = useSaveLeadStatuses(id);
  const mutation = id === null ? create : update;

  const form = useForm<LeadStatusesFormValues>({
    resolver: zodResolver(leadStatusesFormSchema),
    defaultValues: EMPTY_LEAD_STATUSES_FORM,
    ...knownValues(item.data),
    resetOptions: { keepDirtyValues: true },
  });

  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);

  const [pending, setPending] = useState<LeadStatusesFormValues | null>(null);

  const noun = t('noun_lead_status');

  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });

  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });

  const sections = buildSections({
    heading: t('lead_statuses'),
    name: t('status_name'),
    color: t('color'),
    order: t('order'),
  });

  async function afterSave(saved: LeadStatuses): Promise<void> {
    form.reset(toLeadStatusesForm(saved));

    await revalidateLists(LEAD_STATUSES_PATH);

    toast.success(t('saved_toast'));

    router.push(readListReturn(LIST_BASE), {
      scroll: false,
    });
  }

  async function save(values: LeadStatusesFormValues): Promise<ConfirmOutcome> {
    const result = await mutation.trigger(values);

    if (result.ok) {
      await afterSave(result.data);
      return { ok: true };
    }

    if (result.code === 'ERP-VALIDATION-0001') {
      setPending(null);
      applyValidationIssues(result.issues, form.setError);
      return { ok: true };
    }

    return result;
  }

  if (id !== null && item.data === undefined) {
    return <RecordReadState item={item} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{item.data?.name ?? t('add_lead_status')}</h1>

      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={sections}
        onValid={(values) => {
          setPending(values);
        }}
        translateError={(key) => t(key)}
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        isPending={mutation.isMutating}
        onBack={() => {
          guard.requestLeave(readListReturn(LIST_BASE));
        }}
      />

      <EditorDialogs
        id={id}
        pending={pending}
        name={item.data?.name}
        noun={noun}
        submitLabel={submitLabel}
        pendingLabel={pendingLabel}
        setPending={setPending}
        onSave={save}
        guard={guard}
      />
    </div>
  );
}

export const GuardedLeadStatusesForm = withAuth(
  withPermission(LeadStatusesForm, {
    skeleton: 'form',
  }),
  { skeleton: 'form' },
);
