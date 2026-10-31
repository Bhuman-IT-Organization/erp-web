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
  TICKET_PRIORITIES_ERRORS,
  TICKET_PRIORITIES_PATH,
  ticketPrioritiesPath,
  VALIDATION_CODE,
} from '@/features/ticket-priorities/api/ticket-priorities.endpoints';
import { useSaveTicketPriorities } from '@/features/ticket-priorities/hooks/use-save-ticket-priorities';
import { useTicketPriorities } from '@/features/ticket-priorities/hooks/use-ticket-priorities';
import {
  EMPTY_TICKET_PRIORITIES_FORM,
  isTicketPrioritiesField,
  TICKET_PRIORITIES_MESSAGE_KEYS,
  TICKET_PRIORITIES_NAME_MAX,
  ticketPrioritiesFormSchema,
  ticketPrioritiesRowSchema,
  toTicketPrioritiesForm,
  validationIssuesSchema,
  type TicketPriorities,
  type TicketPrioritiesFormValues,
  type TicketPrioritiesRow,
} from '@/features/ticket-priorities/schemas/ticket-priorities.schema';
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

const LIST_BASE = '/setup/ticket-priorities';
const FORM_ID = 'ticket-priorities';

interface TicketPrioritiesFormProps {
  /** The record's id from `[id]/page.tsx`; `null` on `/setup/ticket-priorities/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<TicketPriorities>;
type SaveFailure = Extract<ApiResult<TicketPriorities>, { ok: false }>;

/** The record's api path, or `null` on `/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof ticketPrioritiesPath> | null {
  return id === null ? null : ticketPrioritiesPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: TicketPriorities | undefined): {
  values?: TicketPrioritiesFormValues;
} {
  return record === undefined ? {} : { values: toTicketPrioritiesForm(record) };
}

/**
 * True while there is no record to edit: a permalink before its record answers, or a row opened
 * from the list whose record answers a 4xx. A row whose read fails retryably keeps the form: the
 * row IS the whole record here.
 */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: TicketPrioritiesRow | undefined,
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
  record: TicketPriorities | undefined,
  item: RecordRead,
): string | null | undefined {
  if (id === null) return undefined;
  const failureShown =
    item.data === undefined &&
    item.error !== undefined &&
    (record === undefined || !item.error.retryable);
  return failureShown ? null : record?.name;
}

/** The last save's failure when a Retry can fix it (the form's alert); a refusal shows in the dialog. */
function retryableFailure(result: ApiResult<TicketPriorities> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The save summary's one possible change: the name, when the pending value differs. */
function nameChanges(
  pending: TicketPrioritiesFormValues | null,
  record: TicketPriorities | undefined,
  label: string,
): readonly SummaryChange[] {
  return pending === null || record === undefined || pending.name === record.name
    ? []
    : [{ type: 'changed', label, from: record.name, to: pending.name }];
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: TicketPriorities | undefined,
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
 * The Ticket Priorities create and edit pages on the kit's `SchemaForm`: one "Details" section with
 * Perfex's one field, the priority name (required, trimmed, at most 50 characters, every character
 * accepted, Arabic included; a name another priority holds is accepted, as in Perfex). Every save
 * is confirmed by a summary of what changes. The outcome decides where it shows: success returns to
 * the list the user came from with the saved row swapped in; a field problem closes the dialog and
 * lands under the field and in the focused summary; a network or server failure becomes the form's
 * alert with Retry; anything else (a priority deleted meanwhile) is a refusal and stays inside the
 * dialog in the feature's words. A dirty form asks before any in-app navigation. The title is
 * `ticket_priority_add` on `/new` and the record name on `/:id`. Names render as React text only.
 */
export function TicketPrioritiesForm({ id }: TicketPrioritiesFormProps): ReactElement {
  const t = useTranslations('ticket-priorities');
  const tc = useTranslations('common');
  const router = useRouter();
  const f = useFormat();
  const errorText = useErrorText(TICKET_PRIORITIES_ERRORS);
  const copy = useConfirmCopy();
  const seed = useRowSeed(recordPath(id), ticketPrioritiesRowSchema);
  const item = useTicketPriorities(id);
  const record = item.data ?? seed;
  const form = useForm<TicketPrioritiesFormValues>({
    resolver: zodResolver(ticketPrioritiesFormSchema),
    defaultValues: EMPTY_TICKET_PRIORITIES_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveTicketPriorities(id);
  const mutation = id === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again.
  const lastSent = useRef<TicketPrioritiesFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<TicketPrioritiesFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list. */
  async function afterSave(saved: TicketPriorities): Promise<void> {
    form.reset(toTicketPrioritiesForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      // A new record moves totals and positions; a permalink edit knows nothing the row adds.
      await revalidateLists(TICKET_PRIORITIES_PATH);
    } else {
      const row: TicketPrioritiesRow = { ...seed, ...saved };
      await replaceRowInLists(
        TICKET_PRIORITIES_PATH,
        row,
        (one: TicketPrioritiesRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows; `{ ok: true }` tells the dialog its part is done. */
  async function send(values: TicketPrioritiesFormValues): Promise<ConfirmOutcome> {
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
          if (isTicketPrioritiesField(field)) {
            form.setError(field, { message: TICKET_PRIORITIES_MESSAGE_KEYS[field] });
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
  const noun = t('ticket_priority_lowercase');
  const submitLabel = tc(id === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(id === null ? 'creating_noun' : 'saving_noun', { noun });
  const changes = nameChanges(pending, record, t('ticket_priority_add_edit_name'));

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('ticket_priority_add')}</h1>
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
                label: t('ticket_priority_add_edit_name'),
                kind: 'text',
                required: true,
              },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) => t(key, { max: f.number(TICKET_PRIORITIES_NAME_MAX) })}
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
        // A refusal stays in the dialog in the feature's words: a 404 reads "no longer exists".
        featureErrors={TICKET_PRIORITIES_ERRORS}
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
export const GuardedTicketPrioritiesForm = withAuth(
  withPermission(TicketPrioritiesForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
