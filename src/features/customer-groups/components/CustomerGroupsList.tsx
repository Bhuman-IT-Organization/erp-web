'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  CUSTOMER_GROUPS_ERRORS,
  CUSTOMER_GROUPS_EXPORT_COLUMNS,
  CUSTOMER_GROUPS_EXPORT_PATH,
  CUSTOMER_GROUPS_PATH,
  customerGroupsPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
} from '@/features/customer-groups/api/customer-groups.endpoints';
import { useDeleteCustomerGroup } from '@/features/customer-groups/hooks/use-customer-groups';
import {
  customerGroupsRowSchema,
  type CustomerGroupsRow,
} from '@/features/customer-groups/schemas/customer-groups.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';

/** The list's own route: where the return to the list is recorded and restored. */
const LIST_BASE = '/setup/customer-groups';
const itemRoute = (row: CustomerGroupsRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/** A delete refused because the row is already gone (404): the list pages ask again. */
const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE, IN_USE_CODE];

/**
 * The Customer Groups list on the kit's `ListPageTemplate`: the template owns the URL state, the
 * search, the sort, the pager and every state (loading, empty, no results, error, loaded); this
 * screen owns the Name column, the labelled Edit and Delete and the delete dialog.
 * Every visible string is a key, and a name is rendered as React text only, never markup.
 */
export function CustomerGroupsList(): ReactElement {
  const t = useTranslations('customer-groups');
  const tc = useTranslations('common');
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: CustomerGroupsRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteCustomerGroup(deleting?.row.id ?? '0');
  const noun = t('customer_group_lowercase');

  /** Opening a group: record the list's URL and scroll, seed the form from the row. */
  const open = (row: CustomerGroupsRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(customerGroupsPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it. */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(CUSTOMER_GROUPS_PATH);
    }
    return outcome;
  }

  const columns: readonly ListColumn<CustomerGroupsRow>[] = [
    {
      id: 'name',
      header: t('customer_group_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('customer_groups')}
        path={CUSTOMER_GROUPS_PATH}
        rowSchema={customerGroupsRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        onRowOpen={(one) => {
          seedRow(customerGroupsPath(one.id), one);
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
        createAction={{ label: t('new_customer_group'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: CUSTOMER_GROUPS_EXPORT_PATH,
          columns: CUSTOMER_GROUPS_EXPORT_COLUMNS,
          labels: { name: t('customer_group_name') },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('customer_group_lowercase')}
        featureErrors={CUSTOMER_GROUPS_ERRORS}
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
        featureErrors={CUSTOMER_GROUPS_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/** `/setup/customer-groups` behind the two guards: a list skeleton, then the gate `ROUTE_GATES` declares. */
export const GuardedCustomerGroupsList = withAuth(
  withPermission(CustomerGroupsList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
