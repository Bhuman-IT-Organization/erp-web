'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  BUILT_IN_CODE,
  DEFAULT_REPLY_STATUS_CODE,
  IN_USE_CODE,
  TICKET_STATUSES_EXPORT_COLUMNS,
  TICKET_STATUSES_EXPORT_PATH,
  TICKET_STATUSES_ERRORS,
  TICKET_STATUSES_PATH,
  ticketStatusesPath,
} from '@/features/ticket-statuses/api/ticket-statuses.endpoints';
import { useDeleteTicketStatus } from '@/features/ticket-statuses/hooks/use-ticket-statuses';
import {
  ticketStatusRowSchema,
  type TicketStatusRow,
} from '@/features/ticket-statuses/schemas/ticket-status.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';

const LIST_BASE = '/setup/ticket-statuses';

const itemRoute = (row: TicketStatusRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

export function TicketStatusesList(): ReactElement {
  const t = useTranslations('ticket-statuses');
  const tc = useTranslations('common');
  const router = useRouter();
  const refusalText = (code: string): string | undefined => {
    if (code === IN_USE_CODE) return t('is_referenced');
    if (code === BUILT_IN_CODE) return t('cant_delete_default');
    if (code === DEFAULT_REPLY_STATUS_CODE) return t('change_setting_first');
    return undefined;
  };

  const [deleting, setDeleting] = useState<{
    readonly row: TicketStatusRow;
    readonly open: boolean;
  } | null>(null);

  const remove = useDeleteTicketStatus(deleting?.row.id ?? '0');

  const open = (row: TicketStatusRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(ticketStatusesPath(row.id), row);
    router.push(itemRoute(row));
  };

  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);

    if (outcome.ok) {
      toast.success(t('deleted_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
      setDeleting(null);
    } else if (
      outcome.code === 'ERP-CORE-0004' ||
      outcome.code === IN_USE_CODE ||
      outcome.code === BUILT_IN_CODE ||
      outcome.code === DEFAULT_REPLY_STATUS_CODE
    ) {
      await revalidateLists(TICKET_STATUSES_PATH);
    }

    return outcome;
  }

  const columns: readonly ListColumn<TicketStatusRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('ticket_statuses_dt_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => (
        <div className="flex flex-col">
          <span>{one.name}</span>
          <span className="text-sm text-muted-foreground">
            {t('total_ticket_count', { count: one.ticket_count })}
          </span>
        </div>
      ),
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('acs_ticket_statuses_submenu')}
        path={TICKET_STATUSES_PATH}
        rowSchema={ticketStatusRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        onRowOpen={(one) => {
          seedRow(ticketStatusesPath(one.id), one);
        }}
        columns={columns}
        rowActions={(one) => [
          {
            id: 'edit',
            kind: 'main',
            icon: 'pen-to-square',
            label: tc('edit'),
            ariaLabel: t('edit_action_named', { name: one.name }),
            onSelect: () => {
              open(one);
            },
          },
          ...(one.isdefault === 1
            ? []
            : [
                {
                  id: 'delete',
                  kind: 'destructive' as const,
                  icon: 'trash-can' as const,
                  label: tc('delete'),
                  ariaLabel: t('delete_action_named', { name: one.name }),
                  onSelect: () => {
                    setDeleting({ row: one, open: true });
                  },
                },
              ]),
        ]}
        createAction={{
          label: t('new_ticket_status'),
          href: `${LIST_BASE}/new`,
        }}
        exportAction={{
          path: TICKET_STATUSES_EXPORT_PATH,
          columns: TICKET_STATUSES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('ticket_statuses_dt_name'),
            ticket_count: t('ticket_statuses_table_total'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_ticket_statuses')}
        featureErrors={TICKET_STATUSES_ERRORS}
      />

      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: row?.name ?? '' })}
        body={t('delete_body')}
        dismissLabel={tc('keep_noun', {
          noun: t('noun_ticket_status'),
        })}
        confirmLabel={tc('delete_noun', {
          noun: t('noun_ticket_status'),
        })}
        pendingLabel={tc('deleting_noun', {
          noun: t('noun_ticket_status'),
        })}
        featureErrors={TICKET_STATUSES_ERRORS}
        refusal={refusalText}
        onConfirm={confirmDelete}
      />
    </>
  );
}

export const GuardedTicketStatusesList = withAuth(
  withPermission(TicketStatusesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
