'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  BUILT_IN_CODE,
  ESTIMATE_REQUEST_STATUSES_ERRORS,
  ESTIMATE_REQUEST_STATUSES_EXPORT_COLUMNS,
  ESTIMATE_REQUEST_STATUSES_EXPORT_PATH,
  ESTIMATE_REQUEST_STATUSES_PATH,
  estimateRequestStatusesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
} from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import { useDeleteEstimateRequestStatus } from '@/features/estimate-request-statuses/hooks/use-estimate-request-statuses';
import {
  type EstimateRequestStatusRow,
  estimateRequestStatusRowSchema,
} from '@/features/estimate-request-statuses/schemas/estimate-request-statuses.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

const LIST_BASE = '/setup/estimate-request-statuses';

function statusPath(row: EstimateRequestStatusRow): string {
  return `${LIST_BASE}/${encodeURIComponent(row.id)}`;
}

const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE, IN_USE_CODE, BUILT_IN_CODE];

export function EstimateRequestStatusesList(): ReactElement {
  const t = useTranslations('estimate-request-statuses');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: EstimateRequestStatusRow;
    readonly open: boolean;
  } | null>(null);
  const remove = useDeleteEstimateRequestStatus(deleting?.row.id ?? '0');
  const noun = t('noun_status');

  function openEdit(row: EstimateRequestStatusRow): void {
    recordListReturn(LIST_BASE);
    seedRow(estimateRequestStatusesPath(row.id), row);
    router.push(statusPath(row));
  }

  function seedStatusRow(row: EstimateRequestStatusRow): void {
    seedRow(estimateRequestStatusesPath(row.id), row);
  }

  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(ESTIMATE_REQUEST_STATUSES_PATH);
    }
    return outcome;
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

  const row = deleting?.row;

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
          ...(!row.flag
            ? [
                {
                  id: 'delete',
                  kind: 'destructive' as const,
                  icon: 'trash-can' as const,
                  label: tc('delete'),
                  ariaLabel: t('delete_action_named', { name: row.name }),
                  onSelect: () => {
                    setDeleting({ row, open: true });
                  },
                },
              ]
            : []),
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
      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: row?.name ?? '' })}
        body={t('delete_body')}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={ESTIMATE_REQUEST_STATUSES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

export const GuardedEstimateRequestStatusesList = withAuth(
  withPermission(EstimateRequestStatusesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
