'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  IN_USE_CODE,
  NOT_FOUND_CODE,
  TAXES_ERRORS,
  TAXES_EXPORT_COLUMNS,
  TAXES_EXPORT_PATH,
  TAXES_PATH,
  taxesPath,
} from '@/features/taxes/api/taxes.endpoints';
import { useDeleteTax } from '@/features/taxes/hooks/use-taxes';
import {
  inUseGroups,
  taxesRowSchema,
  type TaxesRow,
  type TaxesUsageGroup,
} from '@/features/taxes/schemas/taxes.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/taxes';
const itemRoute = (row: TaxesRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * A delete refused because the list is stale: the row was deleted by someone else (404) or has been
 * put to use since the list loaded (409). The list pages ask again, so the dialog reopened from the
 * refreshed row names the uses, and a deleted row is gone once the dialog closes (UI-SPEC G8).
 */
const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE, IN_USE_CODE];

/** The dialog line of each usage group, in the api's order (D-07). */
const USAGE_LINE_KEYS = {
  items: 'in_use_items',
  expenses: 'in_use_expenses',
  subscriptions: 'in_use_subscriptions',
  vendorItems: 'in_use_vendor_items',
  purchaseLines: 'in_use_purchase_lines',
  warehouseLines: 'in_use_warehouse_lines',
  fixedEquipmentLines: 'in_use_fixed_equipment_lines',
  salesReturnLines: 'in_use_sales_return_lines',
  accounting: 'in_use_accounting',
} as const satisfies Record<TaxesUsageGroup, string>;

/** True when anything still uses the row: the delete is refused before it is asked (D-07). */
function inUse(row: TaxesRow | undefined): boolean {
  return row !== undefined && inUseGroups(row.usage).length > 0;
}

/**
 * The Taxes list of `taxes/manage.php` + `tables/taxes.php` on the kit's `ListPageTemplate` (UIK-06):
 * the template owns the URL state, the settled search, the sort (the rate ascending by default, as
 * Perfex's `[2, 'asc']`, with no arrow, D-16), the pager, the export and every state (loading, empty,
 * no results, error, loaded) in the D-39 order; this screen owns Perfex's three columns, the labelled
 * Edit and Delete and the delete dialog. No bulk action: Perfex has none (D-16). Every visible string
 * is a key (FE-19), classes are logical (FE-20), and a name is rendered as React text only, never
 * markup: Node refuses no character but `|` that a Perfex name may hold, so this is the XSS defence
 * (D-19, T-4.1-48). Flow parity and the drops are in the feature README.
 *
 * **Delete** is ConfirmDialog kind 1 (D-25.1), keyed on the row it names (the `RolesList` shape): a
 * row whose usage says it is still used is refused up front (`refusedCode`, one line per group, no
 * request sent); otherwise the api's 409 or 404 stays inside the dialog and the list pages ask again;
 * a 204 toasts and the list pages ask again (the hook invalidates them).
 */
export function TaxesList(): ReactElement {
  const t = useTranslations('taxes');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: TaxesRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteTax(deleting?.row.id ?? '0');
  const noun = t('tax_lowercase');

  /** Opening a tax: record the list's URL and scroll, seed the form from the row (D-28, D-35). */
  const open = (row: TaxesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(taxesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it (UAT 7). */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(TAXES_PATH);
    }
    return outcome;
  }

  /** The dialog's body: what still uses the row, one line per group, or "cannot be undone". */
  function deleteBody(row: TaxesRow | undefined): ReactNode {
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

  // Perfex's columns in Perfex's order (`tables/taxes.php`): ID, Tax Name, Rate (percent).
  const columns: readonly ListColumn<TaxesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('tax_dt_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
    {
      id: 'rate',
      header: t('tax_dt_rate'),
      sortField: 'rate',
      // The two-decimal string as the api answers it: never re-formatted, so it reads as Perfex's.
      cell: (one) => <bdi className="tabular-nums">{one.rate}</bdi>,
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('taxes')}
        path={TAXES_PATH}
        rowSchema={taxesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on (D-35).
        onRowOpen={(one) => {
          seedRow(taxesPath(one.id), one);
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
        createAction={{ label: t('new_tax'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: TAXES_EXPORT_PATH,
          columns: TAXES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('tax_dt_name'),
            rate: t('tax_dt_rate'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_taxes')}
        featureErrors={TAXES_ERRORS}
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
        featureErrors={TAXES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * `/setup/taxes` behind the two guards: a list skeleton until the session and `/me` answer (UIK-03,
 * D-39), then the gate `ROUTE_GATES` declares for the path, `ADMIN_GATE` (administrators only, D-06,
 * equal to `@erp/contracts`); the api refuses everyone else regardless.
 */
export const GuardedTaxesList = withAuth(withPermission(TaxesList, { skeleton: 'list' }), {
  skeleton: 'list',
});
