'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  CONTRACT_TYPES_ERRORS,
  CONTRACT_TYPES_EXPORT_COLUMNS,
  CONTRACT_TYPES_EXPORT_PATH,
  CONTRACT_TYPES_PATH,
  contractTypesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
} from '@/features/contract-types/api/contract-types.endpoints';
import { useDeleteContractType } from '@/features/contract-types/hooks/use-contract-types';
import {
  contractTypesRowSchema,
  inUseGroups,
  type ContractTypesRow,
  type ContractTypeUsageGroup,
} from '@/features/contract-types/schemas/contract-types.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/contract-types';
const itemRoute = (row: ContractTypesRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * A delete refused because the list is stale: the row was deleted by someone else (404) or has been
 * put to use since the list loaded (409). The list pages ask again, so the dialog reopened from the
 * refreshed row names the uses, and a deleted row is gone once the dialog closes (UI-SPEC G8).
 */
const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE, IN_USE_CODE];

/** The dialog line of each usage group, in the api's order (D-07, D-28). */
const USAGE_LINE_KEYS = {
  contracts: 'in_use_contracts',
  goals: 'in_use_goals',
} as const satisfies Record<ContractTypeUsageGroup, string>;

/** True when anything still uses the row: the delete is refused before it is asked (D-07). */
function inUse(row: ContractTypesRow | undefined): boolean {
  return row !== undefined && inUseGroups(row.usage).length > 0;
}

/**
 * The Contract Types list on the kit's `ListPageTemplate` (UIK-06): the template owns the URL state,
 * the settled search, the sort (the name descending by default, as Perfex's table orders it, with no arrow),
 * the pager, the export and every state (loading, empty, no results, error, loaded) in the D-39 order;
 * this screen owns the Name column with the number of contracts using each type, the labelled Edit and Delete,
 * and the delete dialog.
 */
export function ContractTypesList(): ReactElement {
  const t = useTranslations('contract-types');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: ContractTypesRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteContractType(deleting?.row.id ?? '0');
  const noun = t('noun_contract_type');

  /** Opening a contract type: record the list's URL and scroll, seed the form from the row (D-28, D-35). */
  const open = (row: ContractTypesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(contractTypesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it (UAT 7). */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(CONTRACT_TYPES_PATH);
    }
    return outcome;
  }

  /** The dialog's body: what still uses the row, one line per group, or "cannot be undone". */
  function deleteBody(row: ContractTypesRow | undefined): ReactNode {
    if (row === undefined || !inUse(row)) return t('delete_body');
    // Inside the dialog's description (a <p>), so each line is a block <span>, never a <p>.
    return inUseGroups(row.usage).map((group) => (
      <span key={group} className="block">
        {t(USAGE_LINE_KEYS[group], {
          count: row.usage[group],
          countN: f.number(row.usage[group]),
        })}
      </span>
    ));
  }

  // Perfex's columns: Name and the number of contracts using each type.
  const columns: readonly ListColumn<ContractTypesRow>[] = [
    {
      id: 'name',
      header: t('contract_type_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => (
        <span className="flex items-center gap-2">
          <span>{one.name}</span>
          <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {f.number(one.usage.contracts)}
          </span>
        </span>
      ),
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('contract_types')}
        path={CONTRACT_TYPES_PATH}
        rowSchema={contractTypesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on (D-35).
        onRowOpen={(one) => {
          seedRow(contractTypesPath(one.id), one);
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
        createAction={{ label: t('new_contract_type'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: CONTRACT_TYPES_EXPORT_PATH,
          columns: CONTRACT_TYPES_EXPORT_COLUMNS,
          labels: {
            name: t('contract_type_name'),
            contracts: t('contracts'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_contract_types')}
        featureErrors={CONTRACT_TYPES_ERRORS}
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
        featureErrors={CONTRACT_TYPES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * `/setup/contract-types` behind the two guards: a list skeleton until the session and `/me` answer
 * (UIK-03, D-39), then the gate `ROUTE_GATES` declares for the path, `ADMIN_GATE` (administrators
 * only, D-06 and D-26, equal to `@erp/contracts`); the api refuses everyone else regardless.
 */
export const GuardedContractTypesList = withAuth(
  withPermission(ContractTypesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
