'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
// import {
//   TICKETSTATUSES_PATH,
//   ticketStatusesPath,
// } from '@/features/ticket/api/ticket-status.endpoints';
import {
  TICKETSTATUSES_EXPORT_COLUMNS,
  TICKETSTATUSES_EXPORT_PATH,
  TICKETSTATUSES_ERRORS,
  TICKETSTATUSES_PATH,
  ticketStatusesPath,
} from '@/features/ticket/api/ticket-status.endpoints';
import {
  ticketStatusRowSchema,
  ticketStatusesListResponseSchema,
  type TicketStatusRow,
} from '@/features/ticket/schemas/ticket-status.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';

const LIST_BASE = '/setup/ticket-statuses';

const itemRoute = (row: TicketStatusRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

export function TicketStatusList(): ReactElement {
  const t = useTranslations('ticket');
  const tc = useTranslations('common');
  const router = useRouter();

  const open = (row: TicketStatusRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(ticketStatusesPath(row.id), row);
    router.push(itemRoute(row));
  };

  const columns: readonly ListColumn<TicketStatusRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      sortValue: (one) => Number(one.id),
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('ticket_status_name'),
      sortField: 'name',
      sortValue: (one) => one.name,
      primary: true,
      cell: (one) => one.name,
    },
  ];

  return (
    <ListPageTemplate
      title={t('ticket_statuses')}
      path={TICKETSTATUSES_PATH}
      rowSchema={ticketStatusRowSchema}
      unpaginated={{
        responseSchema: ticketStatusesListResponseSchema,
        clientPagination: true,
        matchesSearch: (one, query) =>
          one.id.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
          one.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      }}
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
      ]}
      createAction={{
        label: t('add_ticket_status'),
        href: `${LIST_BASE}/new`,
      }}
      exportAction={{
        path: TICKETSTATUSES_EXPORT_PATH,
        columns: TICKETSTATUSES_EXPORT_COLUMNS,
        labels: {
          id: t('id'),
          name: t('ticket_status_name'),
        },
      }}
      empty={{
        nothingYetHeading: t('empty_heading'),
        nothingYetBody: t('empty_body'),
        noResultsHeading: (query) => t('no_match_heading', { query }),
        noResultsBody: t('no_match_body'),
      }}
      recordsNoun={t('noun_ticket_statuses')}
      featureErrors={TICKETSTATUSES_ERRORS}
    />
  );
}

export const GuardedTicketStatusesList = withAuth(
  withPermission(TicketStatusList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
