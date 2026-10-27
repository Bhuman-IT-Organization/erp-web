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
  TICKET_STATUSES_ERRORS,
  TICKET_STATUSES_PATH,
  ticketStatusesPath,
  VALIDATION_CODE,
} from '@/features/ticket-statuses/api/ticket-statuses.endpoints';
import { useTicketStatuses } from '@/features/ticket-statuses/hooks/use-ticket-statuses';
import { useSaveTicketStatuses } from '@/features/ticket-statuses/hooks/use-save-ticket-statuses';
import {
  EMPTY_TICKET_STATUS_FORM,
  isTicketStatusField,
  TICKET_STATUS_MESSAGE_KEYS,
  TICKET_STATUS_NAME_MAX,
  toTicketStatusWriteValues,
  ticketStatusFormSchema,
  ticketStatusRowSchema,
  toTicketStatusForm,
  validationIssuesSchema,
  type TicketStatus,
  type TicketStatusFormInput,
  type TicketStatusFormValues,
  type TicketStatusRow,
} from '@/features/ticket-statuses/schemas/ticket-status.schema';
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

const LIST_BASE = '/setup/ticket-statuses';
const FORM_ID = 'ticket-statuses';

interface TicketStatusesFormProps {
  /** The record's id from `[id]/page.tsx`; `null` on `/setup/ticket-statuses/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<TicketStatus>;
type SaveFailure = Extract<ApiResult<TicketStatus>, { ok: false }>;

function recordPath(id: string | null): ReturnType<typeof ticketStatusesPath> | null {
  return id === null ? null : ticketStatusesPath(id);
}

function knownValues(record: TicketStatus | undefined): { values?: TicketStatusFormInput } {
  return record === undefined ? {} : { values: toTicketStatusForm(record) };
}

/** True while there is no record to edit: a permalink before its record answers, or a 4xx read. */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: TicketStatusRow | undefined,
): boolean {
  return (
    id !== null &&
    item.data === undefined &&
    (seed === undefined || (item.error !== undefined && !item.error.retryable))
  );
}

function breadcrumbLabel(
  id: string | null,
  record: TicketStatus | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

function retryableFailure(result: ApiResult<TicketStatus> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

function nameChanges(
  pending: TicketStatusFormValues | null,
  record: TicketStatus | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

function discardTarget(
  record: TicketStatus | undefined,
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
 * The create and edit pages for Perfex's `tickets_statuses/manage.php` (a modal there, a page here) on the
 * kit's `SchemaForm`: one "Details" section with Perfex's editable name, colour and order fields.
 * Every save is confirmed by a summary; names render as React text only.
 */
export function TicketStatusesForm({ id }: TicketStatusesFormProps): ReactElement {
  const t = useTranslations('ticket-statuses');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(TICKET_STATUSES_ERRORS);
  const copy = useConfirmCopy();
  const seed = useRowSeed(recordPath(id), ticketStatusRowSchema);
  const item = useTicketStatuses(id);
  const record = item.data ?? seed;
  const form = useForm<z.input<typeof ticketStatusFormSchema>, unknown, TicketStatusFormValues>({
    resolver: zodResolver(ticketStatusFormSchema),
    defaultValues: EMPTY_TICKET_STATUS_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveTicketStatuses(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const lastSent = useRef<TicketStatusFormValues | null>(null);
  const [pending, setPending] = useState<TicketStatusFormValues | null>(null);

  async function afterSave(saved: TicketStatus): Promise<void> {
    form.reset(toTicketStatusForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      await revalidateLists(TICKET_STATUSES_PATH);
    } else {
      const row: TicketStatusRow = { ...seed, ...saved };
      await replaceRowInLists(
        TICKET_STATUSES_PATH,
        row,
        (one: TicketStatusRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  async function send(values: TicketStatusFormValues): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const outcome = await mutation.trigger(toTicketStatusWriteValues(values));
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
          if (isTicketStatusField(field)) {
            form.setError(field, { message: TICKET_STATUS_MESSAGE_KEYS[field] });
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
  const noun = t('noun_ticket_status');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('ticket_statuses_dt_name'));

  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('new_ticket_status')}</h1>
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
                label: t('ticket_statuses_dt_name'),
                kind: 'text',
                required: true,
              },
              {
                name: 'statuscolor',
                label: t('ticket_status_add_edit_color'),
                kind: 'color',
              },
              {
                name: 'statusorder',
                label: t('ticket_status_add_edit_order'),
                kind: 'number',
              },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(TICKET_STATUS_NAME_MAX) })}
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
        title={summaryTitle()}
        changes={changes}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        featureErrors={TICKET_STATUSES_ERRORS}
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

export const GuardedTicketStatusesForm = withAuth(
  withPermission(TicketStatusesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
