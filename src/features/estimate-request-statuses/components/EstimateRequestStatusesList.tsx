'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
  type EstimateRequestStatusRow,
  estimateRequestStatusRowSchema,
} from '@/features/estimate-request-statuses/schemas/estimate-request-status.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

const LIST_BASE = '/setup/estimate_request-statuses';

function statusPath(row: EstimateRequestStatusRow): string {
  return `${LIST_BASE}/${encodeURIComponent(row.id)}`;
}

export function EstimateRequestStatusesList(): ReactElement {
  const t = useTranslations('estimate-request-statuses');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();

  function openEdit(row: EstimateRequestStatusRow): void {
    recordListReturn(LIST_BASE);
    seedRow(estimateRequestStatusesPath(row.id), row);
    router.push(statusPath(row));
  }

  function seedStatusRow(row: EstimateRequestStatusRow): void {
    seedRow(estimateRequestStatusesPath(row.id), row);
  }

  const columns: readonly ListColumn<EstimateRequestStatusRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (row) => <bdi className="tabular-nums">{row.id}</bdi>,
    },
    {
      id: 'name',
      header: t('status_name'),
      sortField: 'name',
      primary: true,
      cell: (row) => (
        <div className="flex flex-col items-start">
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="text-sm text-muted-foreground">
            {t('total_request', {
              count: row.total_request,
              countN: f.number(row.total_request),
            })}
          </span>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageTemplate
        title={t('statuses')}
        path={ESTIMATE_REQUEST_STATUSES_PATH}
        rowSchema={estimateRequestStatusRowSchema}
        listBase={LIST_BASE}
        rowKey={(row) => row.id}
        rowHref={statusPath}
        recordName={(row) => row.name}
        onRowOpen={seedStatusRow}
        columns={columns}
        rowActions={(row) => [
          {
            id: 'edit',
            kind: 'main',
            icon: 'pen-to-square',
            label: tc('edit'),
            ariaLabel: t('edit_action_named', { name: row.name }),
            onSelect: () => {
              openEdit(row);
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
            total_request: t('total_request_export'),
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
    </>
  );
}

export const GuardedEstimateRequestStatusesList = withAuth(
  withPermission(EstimateRequestStatusesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
