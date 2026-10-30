'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  LEAD_SOURCES_ERRORS,
  LEAD_SOURCES_EXPORT_COLUMNS,
  LEAD_SOURCES_EXPORT_PATH,
  LEAD_SOURCES_PATH,
  leadSourcesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
} from '@/features/lead-sources/api/lead-sources.endpoints';
import { useDeleteLeadSource } from '@/features/lead-sources/hooks/use-lead-sources';
import {
  leadSourcesRowSchema,
  inUseGroups,
  type LeadSourcesRow,
  type LeadSourcesUsageGroup,
} from '@/features/lead-sources/schemas/lead-sources.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route where return state is recorded and restored. */
const LIST_BASE = '/setup/lead-sources';
const itemRoute = (row: LeadSourcesRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/** Stale list codes when the source has been deleted or become in-use since the list loaded. */
const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE, IN_USE_CODE];

/** True when any reference group still uses the source. */
function inUse(row: LeadSourcesRow | undefined): boolean {
  return row !== undefined && inUseGroups(row.usage).length > 0;
}

const IN_USE_MESSAGE_KEYS = {
  leads: 'in_use_leads',
  emailIntegrations: 'in_use_email_integrations',
  webToLeadForms: 'in_use_web_to_lead_forms',
} as const satisfies Record<LeadSourcesUsageGroup, string>;

export function LeadSourcesList(): ReactElement {
  const t = useTranslations('lead-sources');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();

  const [deleting, setDeleting] = useState<{
    readonly row: LeadSourcesRow;
    readonly open: boolean;
  } | null>(null);

  const remove = useDeleteLeadSource(deleting?.row.id ?? '0');
  const noun = t('noun_lead_source');

  /** Opening a lead source record: records URL state and seeds initial form state. */
  const open = (row: LeadSourcesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(leadSourcesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** Perform delete action inside dialog. */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(LEAD_SOURCES_PATH);
    }
    return outcome;
  }

  /** Renders one refusal line for each reference group still using the source. */
  function deleteBody(row: LeadSourcesRow | undefined): ReactNode {
    if (row === undefined || !inUse(row)) return t('delete_body');

    return inUseGroups(row.usage).map((group) => (
      <span className="block" key={group}>
        {t(IN_USE_MESSAGE_KEYS[group], {
          count: row.usage[group],
          countN: f.number(row.usage[group]),
        })}
      </span>
    ));
  }

  // Columns: ID and Lead Source Name with total leads subtext; the template provides row actions.
  const columns: readonly ListColumn<LeadSourcesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('leads_sources_table_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{one.name}</span>
          <span className="text-xs text-muted-foreground">
            {t('leads_table_total', {
              count: one.usage.leads,
              countN: f.number(one.usage.leads),
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
        title={t('lead_sources')}
        path={LEAD_SOURCES_PATH}
        rowSchema={leadSourcesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        onRowOpen={(one) => {
          seedRow(leadSourcesPath(one.id), one);
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
          {
            id: 'delete',
            kind: 'destructive',
            icon: 'trash-can',
            label: tc('delete'),
            ariaLabel: t('delete_action_named', { name: one.name }),
            onSelect: () => {
              setDeleting({ row: one, open: true });
            },
          },
        ]}
        createAction={{ label: t('lead_new_source'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: LEAD_SOURCES_EXPORT_PATH,
          columns: LEAD_SOURCES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('leads_sources_table_name'),
            totalLeads: t('leads_table_total_export'),
          },
        }}
        empty={{
          nothingYetHeading: t('leads_sources_not_found'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_lead_sources')}
        featureErrors={LEAD_SOURCES_ERRORS}
      />

      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: row?.name ?? '' })}
        body={deleteBody(row)}
        refusedCode={inUse(row) ? IN_USE_CODE : undefined}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={LEAD_SOURCES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

export const GuardedLeadSourcesList = withAuth(
  withPermission(LeadSourcesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
