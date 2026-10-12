'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import type { RowAction } from '@/components/molecules/RowActions';
import { SearchableMultiSelect } from '@/components/molecules/SearchableMultiSelect';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { DateFilterInput, type FilterControl } from '@/components/organisms/FilterBar';
import { isLongText, readText } from '@/components/templates/EditableTable';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import { Badge } from '@/components/ui/badge';
import { MAIL_ERRORS, MAIL_SENT_EMAILS_PATH, mailPaths } from '@/features/mail/api/mail.endpoints';
import { ResendDialog } from '@/features/mail/components/ResendDialog';
import { useSentEmails } from '@/features/mail/hooks/use-sent-emails';
import { templateNameKey } from '@/features/mail/schemas/mail-names';
import {
  SENT_EMAIL_STATUSES,
  STATUS_TEST_FILTER,
  sentEmailRowSchema,
  type SentEmailRow,
  type SentEmailStatus,
} from '@/features/mail/schemas/mail.schema';
import {
  FROM_FILTER,
  SENT_EMAIL_FILTERS,
  STATUS_FILTER,
  TEMPLATE_FILTER,
  TO_FILTER,
  sentEmailApiParams,
} from '@/features/mail/schemas/sent-email-filters';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';
import type { FilterValue } from '@/lib/url/use-query-state';

/** The log's own route: where the return to the list is recorded and restored (D-28). */
export const SENT_EMAILS_BASE = '/setup/sent-emails';
export const sentEmailRoute = (id: string): string =>
  `${SENT_EMAILS_BASE}/${encodeURIComponent(id)}`;
/** How long the log keeps an entry (D-09, O-4: 12 months, erp-api's `mail.purge`). */
export const RETENTION_MONTHS = 12;
/** One row is enough to read the log's meta: every stored template key. */
const FACETS = { limit: 1 } as const;

/** A sent email's status as a badge: finished `done`, waiting `pending`, failed `alert` (never red). */
export const STATUS_BADGES: Readonly<
  Record<SentEmailStatus, { readonly status: 'done' | 'pending' | 'alert'; readonly key: string }>
> = {
  queued: { status: 'pending', key: 'status_queued' },
  retrying: { status: 'pending', key: 'status_retrying' },
  sent: { status: 'done', key: 'status_sent' },
  failed: { status: 'alert', key: 'status_failed' },
};

/** A single unbroken word (a key, an address) past 32 characters breaks anywhere inside the long-text box. */
const LONG_WORD = 'inline-block max-w-xs min-w-40 align-middle break-all whitespace-normal';

/** A raw key or an address: text in `<bdi>` (T-4.3-16), the long-text box when long. */
export function rawWord(text: string): ReactElement {
  return <bdi className={isLongText(text) ? LONG_WORD : undefined}>{text}</bdi>;
}

/** Resend is offered on a finished entry that is not a test (UI-SPEC § Sent emails log; a test is never resent). */
export const canResend = (row: Pick<SentEmailRow, 'status' | 'isTest'>): boolean =>
  !row.isTest && (row.status === 'sent' || row.status === 'failed');

/** The names a log entry is read by: its template (or "Test email"), and the template filter's options. */
export function useSentEmailLabels(): {
  readonly templateName: (key: string | null) => string;
} {
  const t = useTranslations('mail');
  return {
    templateName: (key) => {
      if (key === null) return t('test_email_template');
      const nameKey = templateNameKey(key);
      return nameKey === null ? key : t(nameKey);
    },
  };
}

/** The template's name (a raw key in `<bdi>` when it has none), then the Test badge for a template test. */
export function TemplateCell({ row }: { readonly row: SentEmailRow }): ReactElement {
  const t = useTranslations('mail');
  const labels = useSentEmailLabels();
  const named = row.templateKey === null || templateNameKey(row.templateKey) !== null;
  const name = labels.templateName(row.templateKey);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {named ? readText(name) : rawWord(name)}
      {row.isTest && row.templateKey !== null ? (
        <Badge data-testid="test-badge" variant="secondary">
          {t('test_badge')}
        </Badge>
      ) : null}
    </span>
  );
}

/** The status badge, and under Retrying the 12px "Next try at {time}". */
export function StatusCell({ row }: { readonly row: SentEmailRow }): ReactElement {
  const t = useTranslations('mail');
  const f = useFormat();
  const badge = STATUS_BADGES[row.status];
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status={badge.status} label={t(badge.key)} />
      {row.status === 'retrying' && row.nextTryAt !== null ? (
        <span data-testid="next-try" className="text-muted-foreground text-xs">
          {t('next_try_caption', { time: f.dateTime(row.nextTryAt) })}
        </span>
      ) : null}
    </div>
  );
}

const asList = (value: FilterValue | undefined): readonly string[] =>
  value === undefined || typeof value === 'string' ? [] : value;

/**
 * Setup > Email > Sent emails (D-05; Perfex keeps no sent-mail log, so there is no legacy screen)
 * on `ListPageTemplate`: the title and the two captions (the content isn't kept; entries older than
 * 12 months are removed), the recipient search, the Template, Status, From date and To date
 * filters in the URL (the days as `YYYY-MM-DD`, sent as the member's local day bounds), the columns
 * When, Template, Recipient, Language, Status and Attempts, newest first, and the pager; no create
 * and no export (choice 13: the log holds recipients' addresses). The whole row opens the entry;
 * View is the quiet main action and Resend (finished entries that are not tests) sits in the
 * sticky row menu, confirmed by `ResendDialog`. Addresses and keys are React text in `<bdi>`
 * (T-4.3-16).
 */
export function SentEmailsList(): ReactElement {
  const t = useTranslations('mail');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const labels = useSentEmailLabels();
  const facets = useSentEmails(FACETS);
  const [resending, setResending] = useState<SentEmailRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const recordName = (row: SentEmailRow): string =>
    t('email_record', { template: labels.templateName(row.templateKey), recipient: row.recipient });
  /** Opening an entry records the log's URL and seeds the detail from the row (D-28, D-35). */
  const open = (row: SentEmailRow): void => {
    recordListReturn(SENT_EMAILS_BASE);
    seedRow(mailPaths.sentEmail(row.id), row);
    router.push(sentEmailRoute(row.id));
  };

  const templateOptions = [
    ...(facets.data?.meta.templates ?? []).map((key) => ({
      value: key,
      label: labels.templateName(key),
    })),
    { value: STATUS_TEST_FILTER, label: t('test_email_template') },
  ];
  const statusOptions = SENT_EMAIL_STATUSES.map((status) => ({
    value: status,
    label: t(STATUS_BADGES[status].key),
  }));
  const multi = (
    options: readonly { readonly value: string; readonly label: string }[],
  ): FilterControl['render'] =>
    function MultiFilter({ id, value, onChange, triggerText }) {
      return (
        <SearchableMultiSelect
          id={id}
          options={options}
          value={asList(value)}
          onChange={(next) => {
            onChange(next);
          }}
          triggerText={triggerText}
          showChips={false}
        />
      );
    };
  const controls: readonly FilterControl[] = [
    { key: TEMPLATE_FILTER, label: t('template'), inline: true, render: multi(templateOptions) },
    { key: STATUS_FILTER, label: t('status'), inline: true, render: multi(statusOptions) },
    // The days (the kit's native date box, its words above it); the URL keeps the day, the api gets its local bounds.
    {
      key: FROM_FILTER,
      label: t('from_date'),
      inline: true,
      fit: 'content',
      render: DateFilterInput,
    },
    { key: TO_FILTER, label: t('to_date'), inline: true, fit: 'content', render: DateFilterInput },
  ];

  const columns: readonly ListColumn<SentEmailRow>[] = [
    {
      id: 'when',
      header: t('sent_when'),
      sortField: 'queuedAt',
      cell: (row) => <bdi className="whitespace-nowrap">{f.dateTime(row.queuedAt)}</bdi>,
    },
    {
      id: 'template',
      header: t('template'),
      primary: true,
      cell: (row) => <TemplateCell row={row} />,
    },
    // Status before Recipient (screen review, decided, lead to confirm): the result is what the
    // log is read for, and after Recipient and Language it fell behind the sticky actions at 1280.
    { id: 'status', header: t('status'), cell: (row) => <StatusCell row={row} /> },
    {
      id: 'recipient',
      header: t('recipient'),
      hideBelow: 'md',
      cell: (row) => rawWord(row.recipient),
    },
    {
      id: 'language',
      header: t('language'),
      hideBelow: 'lg',
      cell: (row) => t('locale_label', { locale: row.locale }),
    },
    {
      id: 'attempts',
      header: t('attempts'),
      hideBelow: 'lg',
      align: 'end',
      cell: (row) => <span className="tabular-nums">{f.number(row.attempts)}</span>,
    },
  ];
  const rowActions = (row: SentEmailRow): readonly RowAction[] => {
    const view: RowAction = {
      id: 'view',
      kind: 'main',
      icon: 'eye',
      label: t('view'),
      ariaLabel: t('view_named', { recipient: row.recipient }),
      onSelect: () => {
        open(row);
      },
    };
    if (!canResend(row)) return [view];
    return [
      view,
      {
        id: 'resend',
        kind: 'neutral',
        icon: 'paper-plane',
        label: t('resend'),
        ariaLabel: t('resend_named', { recipient: row.recipient }),
        onSelect: () => {
          setResending(row);
          setDialogOpen(true);
        },
      },
    ];
  };

  const header: ReactNode = (
    <div data-testid="sent-emails-captions" className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{t('sent_emails')}</h1>
      <p className="text-muted-foreground text-xs">{t('body_not_kept')}</p>
      <p className="text-muted-foreground text-xs">
        {t('retention_caption', { months: f.number(RETENTION_MONTHS) })}
      </p>
    </div>
  );

  return (
    <>
      <ListPageTemplate
        title={t('sent_emails')}
        header={header}
        path={MAIL_SENT_EMAILS_PATH}
        rowSchema={sentEmailRowSchema}
        filterBar={{ defs: SENT_EMAIL_FILTERS, controls }}
        filterQuery={sentEmailApiParams}
        searchLabel={t('search_recipient')}
        listBase={SENT_EMAILS_BASE}
        rowKey={(row) => row.id}
        rowHref={(row) => sentEmailRoute(row.id)}
        recordName={recordName}
        onRowOpen={(row) => {
          seedRow(mailPaths.sentEmail(row.id), row);
        }}
        columns={columns}
        rowActions={rowActions}
        compactRowActions
        empty={{
          nothingYetHeading: t('log_empty_heading'),
          nothingYetBody: t('log_empty_body'),
          noResultsHeading: () =>
            tc('no_match_filters_heading', { records: t('noun_sent_emails') }),
          noResultsBody: tc('no_match_filters_body', { record: t('noun_sent_email') }),
        }}
        recordsNoun={t('noun_sent_emails')}
        featureErrors={MAIL_ERRORS}
      />
      {resending === null ? null : (
        <ResendDialog
          entry={resending}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onResent={() => undefined}
        />
      )}
    </>
  );
}

/**
 * `/setup/sent-emails` behind the two guards: the list skeleton until the session and `/me` answer
 * (D-39), then `ROUTE_GATES`' administrator gate (D-05); the api refuses everyone else regardless.
 */
export const GuardedSentEmailsList = withAuth(
  withPermission(SentEmailsList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
