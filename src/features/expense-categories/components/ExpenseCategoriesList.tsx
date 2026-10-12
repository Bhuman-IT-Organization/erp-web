'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  EXPENSE_CATEGORIES_ERRORS,
  EXPENSE_CATEGORIES_EXPORT_COLUMNS,
  EXPENSE_CATEGORIES_EXPORT_PATH,
  EXPENSE_CATEGORIES_PATH,
  expenseCategoriesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
} from '@/features/expense-categories/api/expense-categories.endpoints';
import { useDeleteExpenseCategory } from '@/features/expense-categories/hooks/use-expense-categories';
import {
  expenseCategoriesRowSchema,
  type ExpenseCategoriesRow,
} from '@/features/expense-categories/schemas/expense-categories.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/expense-categories';
const itemRoute = (row: ExpenseCategoriesRow): string =>
  `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * A delete refused because the list is stale: the row was deleted by someone else (404) or has been
 * put to use since the list loaded (409). The list pages ask again, so the dialog reopened from the
 * refreshed row names the counts, and a deleted row is gone once the dialog closes (UI-SPEC G8).
 */
const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE, IN_USE_CODE];

/** One line per referencing source that holds the category, in the api's order (D-07, D-15). */
const USAGE_LINES = [
  { count: (row: ExpenseCategoriesRow) => row.expenseCount, key: 'in_use_expenses' },
  { count: (row: ExpenseCategoriesRow) => row.mappingCount, key: 'in_use_accounting_mappings' },
  { count: (row: ExpenseCategoriesRow) => row.pettyCashCount, key: 'in_use_petty_cash_advances' },
] as const;

/** True when anything still uses the row: the delete is refused before it is asked (D-07). */
function inUse(row: ExpenseCategoriesRow | undefined): boolean {
  return row !== undefined && USAGE_LINES.some((line) => line.count(row) > 0);
}

/**
 * The Expense Categories list of `expenses/manage_categories.php` + `tables/expenses_categories.php`
 * on the kit's `ListPageTemplate` (UIK-06): the template owns the URL state, the settled search, the
 * sort (name ascending by default, no arrow, D-16), the pager, the export and every state (loading,
 * empty, no results, error, loaded) in the D-39 order; this screen owns Perfex's three columns, the
 * labelled Edit and Delete and the delete dialog. No bulk action: Perfex has none (D-16). Every
 * visible string is a key (FE-19), classes are logical (FE-20), and a name or a description is
 * rendered as React text only, never markup: Node refuses no character a Perfex name may hold, so
 * this is the XSS defence (D-19, T-4.1-25). Flow parity and the drops are in the feature README.
 *
 * **Delete** is ConfirmDialog kind 1 (D-25.1), keyed on the row it names (the `RolesList` shape): a
 * row whose usage counts say it is still used is refused up front (`refusedCode`, one sentence per
 * source, no request sent); otherwise the api's 409 or 404 stays inside the dialog and the list
 * pages ask again; a 204 toasts and the list pages ask again (the hook invalidates them).
 */
export function ExpenseCategoriesList(): ReactElement {
  const t = useTranslations('expense-categories');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: ExpenseCategoriesRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteExpenseCategory(deleting?.row.id ?? '0');
  const noun = t('expense_category_lowercase');

  /** Opening a category: record the list's URL and scroll, seed the form from the row (D-28, D-35). */
  const open = (row: ExpenseCategoriesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(expenseCategoriesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it (UAT 7). */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(EXPENSE_CATEGORIES_PATH);
    }
    return outcome;
  }

  /** The dialog's body: what still uses the row, one sentence per source, or "cannot be undone". */
  function deleteBody(row: ExpenseCategoriesRow | undefined): ReactNode {
    if (row === undefined || !inUse(row)) return t('delete_body');
    // Inside the dialog's description (a <p>), so each sentence is a block <span>, never a <p>.
    return USAGE_LINES.filter((line) => line.count(row) > 0).map((line) => (
      <span key={line.key} className="block">
        {t(line.key, { count: line.count(row), countN: f.number(line.count(row)) })}
      </span>
    ));
  }

  // Perfex's columns in Perfex's order (`tables/expenses_categories.php`): ID, Name, Description.
  const columns: readonly ListColumn<ExpenseCategoriesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (row) => <bdi className="tabular-nums">{row.id}</bdi>,
    },
    { id: 'name', header: t('name'), sortField: 'name', primary: true, cell: (row) => row.name },
    {
      id: 'description',
      header: t('dt_expense_description'),
      hideBelow: 'md',
      // Plain text, line breaks kept by CSS: never markup (T-4.1-25); not a keyset key (D-41).
      cell: (row) =>
        row.description === '' ? (
          <span className="text-muted-foreground">{tc('none')}</span>
        ) : (
          <span className="break-words whitespace-pre-line">{row.description}</span>
        ),
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('expense_categories')}
        path={EXPENSE_CATEGORIES_PATH}
        rowSchema={expenseCategoriesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on (D-35).
        onRowOpen={(one) => {
          seedRow(expenseCategoriesPath(one.id), one);
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
        createAction={{ label: t('new_expense_category'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: EXPENSE_CATEGORIES_EXPORT_PATH,
          columns: EXPENSE_CATEGORIES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('name'),
            description: t('dt_expense_description'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_expense_categories')}
        featureErrors={EXPENSE_CATEGORIES_ERRORS}
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
        featureErrors={EXPENSE_CATEGORIES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * `/setup/expense-categories` behind the two guards: a list skeleton until the session and `/me`
 * answer (UIK-03, D-39), then the gate `ROUTE_GATES` declares for the path, `ADMIN_GATE`
 * (administrators only, D-06, equal to `@erp/contracts`); the api refuses everyone else regardless.
 */
export const GuardedExpenseCategoriesList = withAuth(
  withPermission(ExpenseCategoriesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
