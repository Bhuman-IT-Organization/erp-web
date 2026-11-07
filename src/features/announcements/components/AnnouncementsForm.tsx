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
  ANNOUNCEMENTS_ERRORS,
  ANNOUNCEMENTS_PATH,
  announcementsPath,
  VALIDATION_CODE,
} from '@/features/announcements/api/announcements.endpoints';
import { useAnnouncements } from '@/features/announcements/hooks/use-announcements';
import { useSaveAnnouncements } from '@/features/announcements/hooks/use-save-announcements';
import {
  EMPTY_ANNOUNCEMENTS_FORM,
  ANNOUNCEMENTS_MESSAGE_KEYS,
  ANNOUNCEMENTS_NAME_MAX,
  announcementsFormSchema,
  announcementsRowSchema,
  isAnnouncementsField,
  toAnnouncementsForm,
  validationIssuesSchema,
  type Announcements,
  type AnnouncementsFormValues,
  type AnnouncementsRow,
} from '@/features/announcements/schemas/announcements.schema';
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

const LIST_BASE = '/setup/announcements';
const FORM_ID = 'announcements';

interface AnnouncementsFormProps {
  /** The record's id from `[id]/page.tsx`; `null` on `/setup/announcements/new`. */
  readonly id: string | null;
}

type RecordRead = CommonApiResult<Announcements>;
type SaveFailure = Extract<ApiResult<Announcements>, { ok: false }>;

/** The record's api path, or `null` on `/new` (no seed and no read). */
function recordPath(id: string | null): ReturnType<typeof announcementsPath> | null {
  return id === null ? null : announcementsPath(id);
}

/** The form's values once a record is known; until then it keeps its empty defaults. */
function knownValues(record: Announcements | undefined): { values?: AnnouncementsFormValues } {
  return record === undefined ? {} : { values: toAnnouncementsForm(record) };
}

/** True while there is no record to edit: a permalink before its record answers, or a 4xx read. */
function waitsForRecord(
  id: string | null,
  item: RecordRead,
  seed: AnnouncementsRow | undefined,
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
  record: Announcements | undefined,
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
function retryableFailure(result: ApiResult<Announcements> | undefined): SaveFailure | null {
  return result !== undefined && !result.ok && isRetryableCode(result.code) ? result : null;
}

/** The save summary's changes: each stored field whose pending value differs from the record. */
function summaryChanges(
  pending: AnnouncementsFormValues | null,
  record: Announcements | undefined,
  labels: {
    readonly name: string;
    readonly message: string;
    readonly showtousers: string;
    readonly showtostaff: string;
    readonly showname: string;
  },
  yesNo: { readonly yes: string; readonly no: string },
): readonly SummaryChange[] {
  if (pending === null || record === undefined) return [];
  const changes: SummaryChange[] = [];
  const stored = toAnnouncementsForm(record);
  if (pending.name !== stored.name) {
    changes.push({ type: 'changed', label: labels.name, from: stored.name, to: pending.name });
  }
  if (pending.message !== stored.message) {
    changes.push({ type: 'updated', label: labels.message });
  }
  for (const key of ['showtostaff', 'showtousers', 'showname'] as const) {
    if (pending[key] !== stored[key]) {
      changes.push({
        type: 'changed',
        label: labels[key],
        from: stored[key] ? yesNo.yes : yesNo.no,
        to: pending[key] ? yesNo.yes : yesNo.no,
      });
    }
  }
  return changes;
}

/** What the discard dialog names: the record, or the new noun before there is one. */
function discardTarget(
  record: Announcements | undefined,
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
 * The Announcements create and edit pages on the kit's `SchemaForm`: one "Details" section with
 * the name (required), the message (a textarea) and the three Show switches. Every save is
 * confirmed by a summary of what changes. Success returns to the list with the saved row swapped
 * in; a field problem lands under the field; a network or server failure becomes the form's alert
 * with Retry; anything else (an announcement deleted meanwhile) stays inside the dialog in the
 * feature's words. A dirty form asks before leaving. Names render as React text only.
 */
function selectMutation<T>(id: string | null, create: T, update: T): T {
  return id === null ? create : update;
}

function announcementActionLabels(
  id: string | null,
  tc: ReturnType<typeof useTranslations>,
  noun: string,
): { submitLabel: string; pendingLabel: string } {
  const creating = id === null;
  return {
    submitLabel: tc(creating ? 'create_noun' : 'save_noun', { noun }),
    pendingLabel: tc(creating ? 'creating_noun' : 'saving_noun', { noun }),
  };
}
export function AnnouncementsForm({ id }: AnnouncementsFormProps): ReactElement {
  const t = useTranslations('announcements');
  const tc = useTranslations('common');
  const router = useRouter();
  const errorText = useErrorText(ANNOUNCEMENTS_ERRORS);
  const copy = useConfirmCopy();
  const seed = useRowSeed(recordPath(id), announcementsRowSchema);
  const item = useAnnouncements(id);
  const record = item.data ?? seed;
  const form = useForm<AnnouncementsFormValues>({
    resolver: zodResolver(announcementsFormSchema),
    defaultValues: EMPTY_ANNOUNCEMENTS_FORM,
    ...knownValues(record),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveAnnouncements(id);
  const mutation = selectMutation(id, create, update);
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  // The last values sent: Retry re-sends exactly them, without asking again.
  const lastSent = useRef<AnnouncementsFormValues | null>(null);
  // The values waiting for the save summary's confirmation; `null` when it is closed.
  const [pending, setPending] = useState<AnnouncementsFormValues | null>(null);

  /** After a save: the caches from the returned record, the toast, back to the list. */
  async function afterSave(saved: Announcements): Promise<void> {
    form.reset(toAnnouncementsForm(saved));
    if (id !== null) await item.mutate(saved, { revalidate: false });
    if (id === null || seed === undefined) {
      await revalidateLists(ANNOUNCEMENTS_PATH);
    } else {
      const row: AnnouncementsRow = { ...seed, ...saved };
      await replaceRowInLists(
        ANNOUNCEMENTS_PATH,
        row,
        (one: AnnouncementsRow) => one.id === row.id,
      );
    }
    toast.success(t('saved_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /** One save and where its outcome shows; `{ ok: true }` tells the dialog its part is done. */
  async function send(values: AnnouncementsFormValues): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const { message, ...valuesWithoutMessage } = values;
    const request =
      id !== null && record !== undefined && message === (record.message ?? '')
        ? valuesWithoutMessage
        : values;
    const outcome = await mutation.trigger(request);
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
          if (isAnnouncementsField(field)) {
            form.setError(field, { message: ANNOUNCEMENTS_MESSAGE_KEYS[field] });
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
  const noun = t('announcement_lowercase');
  const { submitLabel, pendingLabel } = announcementActionLabels(id, tc, noun);
  const changes = summaryChanges(
    pending,
    record,
    {
      name: t('announcement_name'),
      message: t('announcement_message'),
      showtousers: t('show_to_users'),
      showtostaff: t('show_to_staff'),
      showname: t('show_name'),
    },
    {
      yes: t('settings_yes'),
      no: t('settings_no'),
    },
  );

  /** The save summary's title: the new record's name, or the saved record's. */
  function summaryTitle(): string {
    return id === null
      ? tc('create_summary_title', { noun, name: pending?.name ?? '' })
      : tc('save_summary_title', { name: record?.name ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{record?.name ?? t('announcement_add_heading')}</h1>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={[
          {
            id: 'details',
            title: t('section_details'),
            fields: [
              { name: 'name', label: t('announcement_name'), kind: 'text', required: true },
              { name: 'showtostaff', label: t('show_to_staff'), kind: 'checkbox' },
              { name: 'showtousers', label: t('show_to_users'), kind: 'checkbox' },
              { name: 'showname', label: t('show_name'), kind: 'checkbox' },
              {
                name: 'message',
                label: t('announcement_message'),
                kind: 'textarea',
                ...(record?.hasOtherFormatting === true
                  ? { helper: t('announcement_formatting_warning') }
                  : {}),
              },
            ],
          },
        ]}
        onValid={setPending}
        translateError={(key) =>
          t(key, { max: ANNOUNCEMENTS_NAME_MAX, maxN: String(ANNOUNCEMENTS_NAME_MAX) })
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
        featureErrors={ANNOUNCEMENTS_ERRORS}
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
export const GuardedAnnouncementsForm = withAuth(
  withPermission(AnnouncementsForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
