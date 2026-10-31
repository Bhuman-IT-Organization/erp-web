'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';

import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';

import {
  BUILT_IN_CODE,
  DEFAULT_STATUS_CODE,
  IN_USE_CODE,
  LEAD_STATUSES_ERRORS,
  LEAD_STATUSES_EXPORT_COLUMNS,
  LEAD_STATUSES_EXPORT_PATH,
  LEAD_STATUSES_PATH,
  leadStatusesPath,
  NOT_FOUND_CODE,
} from '@/features/lead-statuses/api/lead-statuses.endpoints';

import { useDeleteLeadStatus } from '../hooks/use-lead-statuses';

import {
  leadStatusesRowSchema,
  type LeadStatusesRow,
} from '@/features/lead-statuses/schemas/lead-statuses.schema';

import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

const LIST_BASE = '/setup/lead-statuses';

const STALE_LIST_CODES: readonly string[] = [
  NOT_FOUND_CODE,
  IN_USE_CODE,
  BUILT_IN_CODE,
  DEFAULT_STATUS_CODE,
];

function itemRoute(row: LeadStatusesRow): string {
  return `${LIST_BASE}/${encodeURIComponent(row.id)}`;
}

function isBuiltInOrDefault(row: LeadStatusesRow): boolean {
  return row.isdefault === 1 || row.isConfiguredDefault;
}

function inUse(row: LeadStatusesRow | undefined): boolean {
  return (
    row !== undefined &&
    (row.usage.leads > 0 ||
      row.usage.lastLeadStatus > 0 ||
      row.usage.emailIntegration > 0 ||
      row.usage.webToLead > 0)
  );
}

export function LeadStatusesList(): ReactElement {
  const t = useTranslations('lead-statuses');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();

  const [deleting, setDeleting] = useState<{
    readonly row: LeadStatusesRow;
    readonly open: boolean;
  } | null>(null);

  const remove = useDeleteLeadStatus(deleting?.row.id ?? '0');

  const noun = t('noun_lead_status');

  function open(row: LeadStatusesRow): void {
    recordListReturn(LIST_BASE);
    seedRow(leadStatusesPath(row.id), row);
    router.push(itemRoute(row));
  }

  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);

    if (outcome.ok) {
      toast.success(t('deleted_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(LEAD_STATUSES_PATH);
    }

    return outcome;
  }
  function deleteBody(row: LeadStatusesRow | undefined): ReactNode {
    if (row === undefined) {
      return t('delete_body');
    }

    if (isBuiltInOrDefault(row)) {
      return t('cant_delete_default', {
        item: t('noun_lead_status'),
      });
    }

    if (inUse(row)) {
      return (
        <>
          <span>
            {t('is_referenced', {
              item: t('noun_lead_status'),
            })}
          </span>{' '}
          {row.usage.leads > 0 && (
            <span>
              {t('in_use_leads', {
                countN: row.usage.leads,
              })}
            </span>
          )}{' '}
          {row.usage.lastLeadStatus > 0 && (
            <span>
              {t('in_use_last_lead_status', {
                countN: row.usage.lastLeadStatus,
              })}
            </span>
          )}{' '}
          {row.usage.emailIntegration > 0 && (
            <span>
              {t('in_use_email_integration', {
                countN: row.usage.emailIntegration,
              })}
            </span>
          )}{' '}
          {row.usage.webToLead > 0 && (
            <span>
              {t('in_use_web_to_lead', {
                countN: row.usage.webToLead,
              })}
            </span>
          )}
        </>
      );
    }

    return t('delete_body');
  }

  const columns: readonly ListColumn<LeadStatusesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('leads_status_table_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
    {
      id: 'leads',
      header: t('leads_count'),
      cell: (one) => <bdi className="tabular-nums">{f.number(one.usage.leads)}</bdi>,
    },

    {
      id: 'color',
      header: t('leads_status_color'),
      cell: (one) => <bdi>{one.color ?? ''}</bdi>,
    },

    {
      id: 'statusorder',
      header: t('leads_status_add_edit_order'),
      hideBelow: 'md',
      cell: (one) =>
        one.statusorder === null ? null : (
          <bdi className="tabular-nums">{f.number(one.statusorder)}</bdi>
        ),
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('acs_leads_statuses_submenu')}
        path={LEAD_STATUSES_PATH}
        rowSchema={leadStatusesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        onRowOpen={(one) => {
          seedRow(leadStatusesPath(one.id), one);
        }}
        columns={columns}
        rowActions={(one) => {
          const editAction = {
            id: 'edit',
            kind: 'main',
            icon: 'pen-to-square',
            label: tc('edit'),
            ariaLabel: t('edit_action_named', {
              name: one.name,
            }),
            onSelect: () => {
              open(one);
            },
          } as const;

          if (isBuiltInOrDefault(one)) {
            return [editAction];
          }

          return [
            editAction,
            {
              id: 'delete',
              kind: 'destructive',
              icon: 'trash-can',
              label: tc('delete'),
              ariaLabel: t('delete_action_named', {
                name: one.name,
              }),
              onSelect: () => {
                setDeleting({
                  row: one,
                  open: true,
                });
              },
            },
          ];
        }}
        createAction={{
          label: t('lead_new_status'),
          href: `${LIST_BASE}/new`,
        }}
        exportAction={{
          path: LEAD_STATUSES_EXPORT_PATH,
          columns: LEAD_STATUSES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('leads_status_table_name'),
            statusorder: t('leads_status_add_edit_order'),
            color: t('leads_status_color'),
            isdefault: t('built_in'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_lead_statuses')}
        featureErrors={LEAD_STATUSES_ERRORS}
      />

      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', {
          name: row?.name ?? '',
        })}
        body={deleteBody(row)}
        refusedCode={inUse(row) ? IN_USE_CODE : undefined}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={LEAD_STATUSES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

export const GuardedLeadStatusesList = withAuth(
  withPermission(LeadStatusesList, {
    skeleton: 'list',
  }),
  {
    skeleton: 'list',
  },
);
