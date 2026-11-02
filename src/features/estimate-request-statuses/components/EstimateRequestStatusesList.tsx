'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  ESTIMATE_REQUEST_STATUSES_ERRORS,
  ESTIMATE_REQUEST_STATUSES_EXPORT_COLUMNS,
  ESTIMATE_REQUEST_STATUSES_EXPORT_PATH,
  ESTIMATE_REQUEST_STATUSES_PATH,
  estimateRequestStatusesPath,
} from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import {
  estimateRequestStatusRowSchema,
  type EstimateRequestStatusRow,
} from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { seedRow } from '@/lib/api/row-seed';

const LIST_BASE = '/setup/estimate_request-statuses';
const itemRoute = (row: EstimateRequestStatusRow): string =>
  `${LIST_BASE}/${encodeURIComponent(row.id)}`;

export function EstimateRequestStatusesList(): ReactElement {
  const t = useTranslations('estimate-request-statuses');
  const tc = useTranslations('common');
  const router = useRouter();

  const open = (row: EstimateRequestStatusRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(estimateRequestStatusesPath(row.id), row);
    router.push(itemRoute(row));
  };

  const columns: readonly ListColumn<EstimateRequestStatusRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (status) => <bdi className="tabular-nums">{status.id}</bdi>,
    },
    {
      id: 'name',
      header: t('status_name'),
      sortField: 'name',
      primary: true,
      cell: (status) => (
        <div className="flex flex-col">
          <span>{status.name}</span>
          <span className="text-sm text-muted-foreground">
            {t('total_request_count', { count: status.total_request })}
          </span>
        </div>
      ),
    },
  ];

  return (
    <ListPageTemplate
      title={t('title')}
      path={ESTIMATE_REQUEST_STATUSES_PATH}
      rowSchema={estimateRequestStatusRowSchema}
      listBase={LIST_BASE}
      rowKey={(status) => status.id}
      rowHref={itemRoute}
      recordName={(status) => status.name}
      onRowOpen={open}
      columns={columns}
      rowActions={(status) => [
        {
          id: 'edit',
          kind: 'main',
          icon: 'pen-to-square',
          label: tc('edit'),
          ariaLabel: t('edit_action_named', { name: status.name }),
          onSelect: () => {
            open(status);
          },
        },
      ]}
      createAction={{ label: t('new_status'), href: `${LIST_BASE}/new` }}
      exportAction={{
        path: ESTIMATE_REQUEST_STATUSES_EXPORT_PATH,
        columns: ESTIMATE_REQUEST_STATUSES_EXPORT_COLUMNS,
        labels: {
          id: t('id'),
          name: t('status_name'),
          total_request: t('total_label'),
        },
      }}
      empty={{
        nothingYetHeading: t('empty_heading'),
        nothingYetBody: t('empty_body'),
        noResultsHeading: (query) => t('no_match_heading', { query }),
        noResultsBody: t('no_match_body'),
      }}
      recordsNoun={t('noun_statuses')}
      featureErrors={ESTIMATE_REQUEST_STATUSES_ERRORS}
    />
  );
}

export const GuardedEstimateRequestStatusesList = withAuth(
  withPermission(EstimateRequestStatusesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
