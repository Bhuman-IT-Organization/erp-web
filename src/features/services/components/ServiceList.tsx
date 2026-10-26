'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  SERVICES_ERRORS,
  SERVICES_EXPORT_COLUMNS,
  SERVICES_EXPORT_PATH,
  SERVICES_PATH,
  servicesPath,
} from '@/features/services/api/services.endpoints';

import { servicesRowSchema, type ServicesRow } from '@/features/services/schemas/services.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useDeleteService } from '../hooks/use-services';
// import { USAGE_LINE_KEYS } from '@/features/currencies/schemas/currencies.schema';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/services';
const itemRoute = (row: ServicesRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * A delete refused because the list is stale: the row was deleted by someone else (404) or has been
 * put to use since the list loaded (409). The list pages ask again, so the dialog reopened from the
 * refreshed row names the uses, and a deleted row is gone once the dialog closes (UI-SPEC G8).
 */
// const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE];

// /** The dialog line of each usage group, in the api's order (D-07, D-28). */
// const USAGE_LINE_KEYS = {
//   purchaseRequests: 'in_use_purchase_requests',
//   purchaseOrders: 'in_use_purchase_orders',
//   purchaseQuotations: 'in_use_purchase_quotations',
//   shippingCharges: 'in_use_shipping_charges',
//   expenses: 'in_use_expenses',
//   assets: 'in_use_assets',
// } as const satisfies Record<ServicesUsageGroup, string>;

/** True when anything still uses the row: the delete is refused before it is asked (D-07). */
// function inUse(row: ServicesRow | undefined): boolean {
//   return row !== undefined && inUseGroups(row.id).length > 0;
// }

/**
 * The Cost Centers list of `cost_centers/manage.php` on the kit's `ListPageTemplate` (UIK-06): the
 * template owns the URL state, the settled search, the sort (the ID descending by default, as
 * Perfex's table orders it, with no arrow, D-16), the pager, the export and every state (loading,
 * empty, no results, error, loaded) in the D-39 order; this screen owns Perfex's three columns (ID,
 * Cost Center Name, Date Created: a date in the customer's format, empty when Perfex stored none,
 * D-31), the labelled Edit and Delete and the delete dialog. No bulk action: Perfex has none (D-16).
 * Every visible string is a key (FE-19), classes are logical (FE-20), and a name is rendered as React
 * text only, never markup: Node accepts every character Perfex accepts, so this is the XSS defence
 * (T-4.1-91). Flow parity and the drops are in the feature README.
 *
 * **Delete** is ConfirmDialog kind 1 (D-25.1), keyed on the row it names (the `RolesList` shape): a
 * row whose usage says it is still used is refused up front (`refusedCode`, one line per group, no
 * request sent, D-07, D-28); otherwise the api's 409 or 404 stays inside the dialog and the list
 * pages ask again; a 204 toasts and the list pages ask again (the hook invalidates them).
 */
export function ServicesList(): ReactElement {
  const t = useTranslations('services');
  const tc = useTranslations('common');
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: ServicesRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteService(deleting?.row.id ?? '0');
  const noun = t('noun_service');

  /** Opening a service: record the list's URL and scroll, seed the form from the row (D-28, D-35). */
  const open = (row: ServicesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(servicesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it (UAT 7). */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);

    if (outcome.ok) {
      toast.success(t('deleted_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    } else {
      await revalidateLists(SERVICES_PATH);
    }

    return outcome;
  }
  // async function confirmDelete(): Promise<ConfirmOutcome> {
  //   const outcome = await remove.trigger(undefined);
  //   if (outcome.ok) {
  //     toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
  //   } else if (STALE_LIST_CODES.includes(outcome.code)) {
  //     await revalidateLists(SERVICES_PATH);
  //   }
  //   return outcome;
  // }

  /** The dialog's body: what still uses the row, one line per group, or "cannot be undone". */
  //   function deleteBody(row: ServicesRow | undefined): ReactNode {
  //     if (row === undefined || !inUse(row)) return t('delete_body');
  //     // Inside the dialog's description (a <p>), so each line is a block <span>, never a <p>.
  //     return inUseGroups(row.id).map((group) => (
  //       <span key={group} className="block">
  //         {t(USAGE_LINE_KEYS[group], {
  //           count: row.usage[group],
  //           countN: f.number(row.usage[group]),
  //         })}
  //       </span>
  //     ));
  //   }

  // Perfex's columns in Perfex's order (`cost_centers/manage.php`): ID, Cost Center Name, Date Created.
  const columns: readonly ListColumn<ServicesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('service_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
    // {
    //   id: 'dateCreated',
    //   header: t('date_created'),
    //   hideBelow: 'md',
    //   // Not sortable (the column may be empty, and the ID order is the creation order); empty when
    //   // Perfex stored no date (D-31). Date and time, as Perfex's `_d()` hands a value with a time
    //   // to `_dt()`.
    //   cell: (one) =>
    //     one.dateCreated === null ? null : (
    //       <time dateTime={one.dateCreated}>{f.dateTime(one.dateCreated)}</time>
    //     ),
    // },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('services')}
        path={SERVICES_PATH}
        rowSchema={servicesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on (D-35).
        onRowOpen={(one) => {
          seedRow(servicesPath(one.id), one);
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
        createAction={{ label: t('add_service'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: SERVICES_EXPORT_PATH,
          columns: SERVICES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('service_name'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_services')}
        featureErrors={SERVICES_ERRORS}
      />

      {/* <ConfirmDialog
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
        featureErrors={SERVICES_ERRORS}
        onConfirm={confirmDelete}
      /> */}
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
        featureErrors={SERVICES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * `/setup/services` behind the two guards: a list skeleton until the session and `/me` answer
 * (UIK-03, D-39), then the gate `ROUTE_GATES` declares for the path, `ADMIN_GATE` (administrators
 * only, D-06 and D-26, equal to `@erp/contracts`); the api refuses everyone else regardless.
 */
export const GuardedServicesList = withAuth(withPermission(ServicesList, { skeleton: 'list' }), {
  skeleton: 'list',
});
