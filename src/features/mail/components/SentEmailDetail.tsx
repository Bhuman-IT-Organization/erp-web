'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { InlineError } from '@/components/molecules/InlineError';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { DisclosureSection } from '@/components/organisms/DisclosureSection';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MAIL_ERRORS, NOT_FOUND_CODE, mailPaths } from '@/features/mail/api/mail.endpoints';
import { ResendDialog } from '@/features/mail/components/ResendDialog';
import {
  SENT_EMAILS_BASE,
  STATUS_BADGES,
  canResend,
  rawWord,
  sentEmailRoute,
  useSentEmailLabels,
} from '@/features/mail/components/SentEmailsList';
import { useEmailTemplates } from '@/features/mail/hooks/use-email-templates';
import { useSentEmail } from '@/features/mail/hooks/use-sent-emails';
import {
  sentEmailRowSchema,
  type SentEmailResponse,
  type SentEmailRow,
} from '@/features/mail/schemas/mail.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import type { ApiError } from '@/lib/api/api-error';
import { useRowSeed } from '@/lib/api/row-seed';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useBreadcrumbLabel } from '@/lib/hooks/use-breadcrumb-label';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The template editor's route, for the Template row's link. */
const EMAIL_TEMPLATES_BASE = '/setup/email-templates';
/** A template key is matched among the templates whose key contains it: one page is plenty. */
const TEMPLATE_LOOKUP_LIMIT = 25;

/** One row of a read-only definition list: its term, its value, and whether it spans both columns. */
export interface Definition {
  readonly term: string;
  readonly value: ReactNode;
  readonly full?: boolean;
}

/**
 * A read-only definition list in the two-column `FieldGrid` form (04.3 UI-SPEC § Sent email detail,
 * § Email status): one column below `md`, two from `md` with a 24px column and 16px row gap; terms
 * 14/600, values 14/400; a full row spans both. A `<dl>`, because a `FieldGrid` draws `<div>`s.
 */
export function DefinitionList({ rows }: { readonly rows: readonly Definition[] }): ReactElement {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.term}
          className={
            row.full === true
              ? 'flex min-w-0 flex-col gap-1 md:col-span-2'
              : 'flex min-w-0 flex-col gap-1'
          }
        >
          <dt className="text-sm font-semibold">{row.term}</dt>
          <dd className="text-sm wrap-anywhere">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The title row: the template's name ("Test email" for a status-page test), its status, and Test. */
function TitleRow({ entry }: { readonly entry: SentEmailRow }): ReactElement {
  const t = useTranslations('mail');
  const labels = useSentEmailLabels();
  const badge = STATUS_BADGES[entry.status];
  return (
    <div data-testid="sent-email-title" className="flex flex-wrap items-center gap-2">
      <h1 className="text-2xl font-semibold wrap-anywhere">
        {labels.templateName(entry.templateKey)}
      </h1>
      <StatusBadge status={badge.status} label={t(badge.key)} />
      {entry.isTest && entry.templateKey !== null ? (
        <Badge variant="secondary">{t('test_badge')}</Badge>
      ) : null}
    </div>
  );
}

/**
 * The Template row: the name, linking to its editor once the template is found by its key (the log
 * carries the key, not the template's id); plain text for a status-page test or a template that is
 * no longer stored.
 */
function TemplateValue({ templateKey }: { readonly templateKey: string | null }): ReactElement {
  const labels = useSentEmailLabels();
  const found = useEmailTemplates(
    templateKey === null ? null : { q: templateKey, limit: TEMPLATE_LOOKUP_LIMIT },
  );
  const name = labels.templateName(templateKey);
  const template = found.data?.data.find((row) => row.key === templateKey);
  if (template === undefined) return <span>{name}</span>;
  return (
    <Link
      href={`${EMAIL_TEMPLATES_BASE}/${encodeURIComponent(template.id)}`}
      className="text-foreground underline underline-offset-4"
    >
      {name}
    </Link>
  );
}

type Translate = ReturnType<typeof useTranslations<'mail'>>;

/** Error (failed or retrying, full width): the reason, then the mail server's reply, collapsed. */
function errorRow(entry: SentEmailResponse, t: Translate): Definition | null {
  const failing = entry.status === 'failed' || entry.status === 'retrying';
  const reason = entry.failureReason ?? (entry.status === 'failed' ? 'unknown' : null);
  if (!failing || reason === null) return null;
  return {
    term: t('error'),
    full: true,
    value: (
      <div className="flex flex-col gap-2">
        <span>{t(`failure_reason.${reason}`)}</span>
        {entry.serverReply === null ? null : (
          <DisclosureSection title={t('server_reply')} forceOpen={false}>
            {/* The mail server's own words, as received: data, never markup (T-4.3-16). */}
            <bdi className="block text-sm whitespace-pre-line">{entry.serverReply}</bdi>
          </DisclosureSection>
        )}
      </div>
    ),
  };
}

/** Resent from: "An earlier email", only while the original entry still exists. */
function resentRow(entry: SentEmailResponse, t: Translate): Definition | null {
  if (entry.resentFromId === null || !entry.resentFromExists) return null;
  return {
    term: t('resent_from'),
    value: (
      <Link
        href={sentEmailRoute(entry.resentFromId)}
        className="text-foreground underline underline-offset-4"
      >
        {t('earlier_email')}
      </Link>
    ),
  };
}

/** The definition list of one entry (04.3 UI-SPEC § Sent email detail), in its order. */
function useEntryRows(entry: SentEmailResponse): readonly Definition[] {
  const t = useTranslations('mail');
  const f = useFormat();
  const time = (value: string): ReactElement => <bdi>{f.dateTime(value)}</bdi>;
  const rows: (Definition | null)[] = [
    { term: t('template'), value: <TemplateValue templateKey={entry.templateKey} /> },
    { term: t('recipient'), value: rawWord(entry.recipient) },
    { term: t('language'), value: t('locale_label', { locale: entry.locale }) },
    { term: t('queued_at'), value: time(entry.queuedAt) },
    { term: t('sent_at'), value: entry.sentAt === null ? t('not_sent') : time(entry.sentAt) },
    {
      term: t('attempts'),
      value: (
        <span className="tabular-nums">
          {t('attempts_of', {
            attempts: f.number(entry.attempts),
            max: f.number(entry.maxAttempts),
          })}
        </span>
      ),
    },
    entry.status === 'retrying' && entry.nextTryAt !== null
      ? { term: t('next_try_at'), value: time(entry.nextTryAt) }
      : null,
    errorRow(entry, t),
    resentRow(entry, t),
  ];
  return rows.filter((row): row is Definition => row !== null);
}

/** The loaded entry: the title row, one card with the definition list and the actions, the caption. */
function Entry({ entry }: { readonly entry: SentEmailResponse }): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const router = useRouter();
  const rows = useEntryRows(entry);
  const [resendOpen, setResendOpen] = useState(false);
  return (
    <div data-testid="sent-email-detail" className="flex min-w-0 flex-col gap-4">
      <TitleRow entry={entry} />
      <section className="bg-card flex max-w-5xl flex-col gap-6 rounded-lg border p-6">
        <DefinitionList rows={rows} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href={readListReturn(SENT_EMAILS_BASE)}>{tc('back_to_list')}</Link>
          </Button>
          {canResend(entry) ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                setResendOpen(true);
              }}
            >
              <Icon name="paper-plane" />
              {t('resend')}
            </Button>
          ) : null}
        </div>
      </section>
      <p data-testid="sent-email-caption" className="text-muted-foreground max-w-5xl text-xs">
        {t('body_not_kept')}
      </p>
      <ResendDialog
        entry={entry}
        open={resendOpen}
        onOpenChange={setResendOpen}
        onResent={(newId) => {
          router.push(sentEmailRoute(newId));
        }}
      />
    </div>
  );
}

/** Before the entry is known: the form skeleton, or the failure in plain words with Back to list. */
function LoadState({
  seed,
  error,
  busy,
  retry,
}: {
  readonly seed: SentEmailRow | undefined;
  readonly error: ApiError | undefined;
  readonly busy: boolean;
  readonly retry: () => void;
}): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const errorText = useErrorText(MAIL_ERRORS);
  const message = (failure: ApiError): string =>
    failure.code === NOT_FOUND_CODE ? t('sent_email_not_found') : errorText(failure);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {seed === undefined ? null : <TitleRow entry={seed} />}
      {error === undefined ? (
        <PageSkeleton variant="form" testId="sent-email-loading" />
      ) : (
        <InlineError
          message={message(error)}
          busy={busy}
          {...(error.retryable ? { onRetry: retry } : {})}
          back={{ href: readListReturn(SENT_EMAILS_BASE), label: tc('back_to_list') }}
        />
      )}
    </div>
  );
}

/** The record crumb (WR-10): the name once known; `null` once a failure shows, so it never waits forever (D-39). */
function crumbOf(name: string | undefined, error: ApiError | undefined): string | null | undefined {
  if (name !== undefined) return name;
  return error === undefined ? undefined : null;
}

interface SentEmailDetailProps {
  /** The entry's id from `app/(shell)/setup/sent-emails/[id]/page.tsx`. */
  readonly id: string;
}

/**
 * One sent email (04.3 UI-SPEC § Sent email detail, D-05; Perfex keeps no such log): the template's
 * name as the title with its status, one card holding the definition list (Template linking to its
 * editor, Recipient, Language, Queued at, Sent at or "Not sent", Attempts "{n} of {max}", Next try
 * while retrying, the failure reason with the mail server's own reply in a collapsed disclosure, and
 * "An earlier email" on a resend), Back to list (the recorded list URL) and Resend at the card's end,
 * and the caption that the content isn't kept. While queued or retrying the entry is re-read every
 * 2 s (`useSentEmail`) until it is sent or failed. Resend goes to the new entry's permalink. The
 * record crumb is the template's name; the document title stays the static `mail.sent_email`
 * (T-4.3-33). Every address, key and reply is React text in `<bdi>` (T-4.3-16).
 */
export function SentEmailDetail({ id }: SentEmailDetailProps): ReactElement {
  const labels = useSentEmailLabels();
  const seed = useRowSeed(mailPaths.sentEmail(id), sentEmailRowSchema);
  const item = useSentEmail(id);
  const known = item.data ?? seed;
  useBreadcrumbLabel(
    crumbOf(known === undefined ? undefined : labels.templateName(known.templateKey), item.error),
  );
  if (item.data === undefined) {
    return (
      <LoadState
        seed={seed}
        error={item.error}
        busy={item.isValidating}
        retry={() => {
          void item.mutate();
        }}
      />
    );
  }
  return <Entry entry={item.data} />;
}

/** The route's guards (UIK-03): the form skeleton while the session or `/me` is unknown (D-39). */
export const GuardedSentEmailDetail = withAuth(
  withPermission(SentEmailDetail, { skeleton: 'form' }),
  { skeleton: 'form' },
);
