'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  BASE_CODE,
  BASE_LOCKED_CODE,
  CURRENCIES_ERRORS,
  CURRENCIES_EXPORT_COLUMNS,
  CURRENCIES_EXPORT_PATH,
  CURRENCIES_PATH,
  currenciesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  OTHER_MODULE_CODE,
} from '@/features/currencies/api/currencies.endpoints';
import { useDeleteCurrency, useMakeBaseCurrency } from '@/features/currencies/hooks/use-currencies';
import {
  currenciesRowSchema,
  linesOfUse,
  makeBaseRefusalOf,
  refusalOf,
  type CurrenciesRow,
} from '@/features/currencies/schemas/currencies.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/currencies';
const itemRoute = (row: CurrenciesRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * A delete or a make-base refused because the list is stale: the row was deleted by someone else
 * (404), was put to use or made the base since the list loaded, or the current base got a
 * transaction (409). The list pages ask again, so the dialog reopened from the refreshed row names
 * the reason up front, and a deleted row is gone once the dialog closes (UI-SPEC G8).
 */
const STALE_LIST_CODES: readonly string[] = [
  NOT_FOUND_CODE,
  IN_USE_CODE,
  BASE_CODE,
  OTHER_MODULE_CODE,
  BASE_LOCKED_CODE,
];

/** One dialog keyed on the row it names: open, or closing (the row kept while it fades), or none. */
type RowDialog = { readonly row: CurrenciesRow; readonly open: boolean } | null;
/** The row a dialog names, its id for the mutation (never triggered while none) and its name. */
const dialogRow = (state: RowDialog): CurrenciesRow | undefined => state?.row;
const dialogId = (state: RowDialog): string => state?.row.id ?? '0';
const dialogName = (state: RowDialog): string => state?.row.name ?? '';
const dialogOpen = (state: RowDialog): boolean => state?.open === true;
/** The dialog's own open state follows Radix's, keeping the row while it closes. */
const withOpen =
  (next: boolean) =>
  (current: RowDialog): RowDialog =>
    current === null ? null : { ...current, open: next };

/**
 * The code cell: the code as text, and under the base row's code Perfex's base label as a small
 * muted line (`tables/currencies.php` :36-39). Inside the row's link, so the link reads both.
 */
function CodeCell({ row }: { readonly row: CurrenciesRow }): ReactNode {
  const t = useTranslations('currencies');
  if (!row.isBase) return row.name;
  return (
    <span className="flex flex-col">
      <span>{row.name}</span>
      <span data-testid="currency-base" className="text-muted-foreground text-xs">
        {t('base_currency_string')}
      </span>
    </span>
  );
}

/**
 * The Currencies list of `currencies/manage.php` and `tables/currencies.php` on the kit's
 * `ListPageTemplate` (UIK-06): the template owns the URL state, the settled search (the code or the
 * symbol, or an exact id, server side), the sort (the code descending by default, Perfex's
 * DataTable order, with no arrow, D-16), the pager, the four-format export and every state
 * (loading, empty, no results, error, loaded) in the D-39 order; this screen owns Perfex's two
 * columns (Currency Code, with Perfex's base label under the base row's code, and Symbol), the
 * labelled Edit, Make base currency (a non-base row only, as Perfex's star) and Delete, and their
 * two dialogs. No bulk action: Perfex has none (D-16). Every visible string is a key (FE-19),
 * classes are logical (FE-20), and codes and symbols are React text only (T-4.1-159). Flow parity
 * and the drops are in the feature README.
 *
 * **Delete** is ConfirmDialog kind 1 (D-25.1), keyed on the row it names (the Payment Modes shape):
 * a row any delete group uses (D-40), the base (D-38) or a row another module registered a use for
 * (D-41) is refused up front (`refusedCode` from `refusalOf`, one line per use, no request sent);
 * otherwise the api's 409 or 404 stays inside the dialog and the list pages ask again; a 204 toasts
 * and the list pages ask again (the hook invalidates them).
 *
 * **Make base** (D-39) asks first, a recorded UX addition (Perfex's star changed the base in one
 * click): a row whose `canMakeBase` is false is refused up front with `ERP-CURRENCIES-0004` and
 * nothing is sent; a 200 toasts Perfex's `base_currency_set` and the list pages ask again (two rows
 * change); a live 409 or 404 stays inside the dialog. Never retried (ADR-0031).
 */
export function CurrenciesList(): ReactElement {
  const t = useTranslations('currencies');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState<RowDialog>(null);
  const [makingBase, setMakingBase] = useState<RowDialog>(null);
  // One mutation per dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteCurrency(dialogId(deleting));
  const makeBase = useMakeBaseCurrency(dialogId(makingBase));
  const noun = t('currency_lowercase');

  /** Opening a currency: record the list's URL and scroll, seed the form from the row (D-28, D-35). */
  const open = (row: CurrenciesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(currenciesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it (UAT 7). */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(CURRENCIES_PATH);
    }
    return outcome;
  }

  /** The make-base's outcome: Perfex's own success line, or the refusal inside the dialog (D-39). */
  async function confirmMakeBase(): Promise<ConfirmOutcome> {
    const outcome = await makeBase.trigger({});
    if (outcome.ok) {
      toast.success(t('base_currency_set'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(CURRENCIES_PATH);
    }
    return outcome;
  }

  /**
   * The delete dialog's body: what still uses the row, one line per use; nothing more for the base
   * no one uses (its refusal says why); else "cannot be undone".
   */
  function deleteBody(row: CurrenciesRow | undefined): ReactNode {
    if (row === undefined) return t('delete_body');
    // The delete groups, then the registered uses; the exchange rates never block a delete (D-40).
    const lines = linesOfUse(row, { lock: false });
    if (lines.length === 0) return refusalOf(row) === undefined ? t('delete_body') : null;
    // Inside the dialog's description (a <p>), so each line is a block <span>, never a <p>.
    return lines.map((line) => (
      <span key={line.id} className="block">
        {t(line.messageKey, { count: line.count, countN: f.number(line.count) })}
      </span>
    ));
  }

  // Perfex's columns in Perfex's order (`currencies/manage.php` :16-17): the code (with Perfex's
  // base label under the base row's code, `tables/currencies.php` :36-39), then the symbol; Options
  // are the row actions.
  const columns: readonly ListColumn<CurrenciesRow>[] = [
    {
      id: 'name',
      header: t('currency_list_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => <CodeCell row={one} />,
    },
    {
      id: 'symbol',
      header: t('currency_list_symbol'),
      sortField: 'symbol',
      cell: (one) => one.symbol,
    },
  ];

  return (
    <>
      <ListPageTemplate
        title={t('currencies')}
        path={CURRENCIES_PATH}
        rowSchema={currenciesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on (D-35).
        onRowOpen={(one) => {
          seedRow(currenciesPath(one.id), one);
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
          // Perfex's star, on a non-base row only (`tables/currencies.php` :49-56); the registry
          // has no star, so its closest glyph.
          ...(one.isBase
            ? []
            : [
                {
                  id: 'make-base',
                  kind: 'neutral' as const,
                  icon: 'circle-check' as const,
                  label: t('make_base_currency'),
                  ariaLabel: t('make_base_action_named', { name: one.name }),
                  onSelect: () => {
                    setMakingBase({ row: one, open: true });
                  },
                },
              ]),
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
        createAction={{ label: t('new_currency'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: CURRENCIES_EXPORT_PATH,
          columns: CURRENCIES_EXPORT_COLUMNS,
          labels: {
            name: t('currency_list_name'),
            symbol: t('currency_list_symbol'),
            isBase: t('base_currency_string'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_currencies')}
        featureErrors={CURRENCIES_ERRORS}
      />
      <ConfirmDialog
        kind="destructive"
        open={dialogOpen(deleting)}
        onOpenChange={(next) => {
          setDeleting(withOpen(next));
        }}
        title={t('delete_title', { name: dialogName(deleting) })}
        body={deleteBody(dialogRow(deleting))}
        refusedCode={refusalOf(dialogRow(deleting))}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={CURRENCIES_ERRORS}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        kind="access"
        open={dialogOpen(makingBase)}
        onOpenChange={(next) => {
          setMakingBase(withOpen(next));
        }}
        title={t('make_base_title', { name: dialogName(makingBase) })}
        body={t('make_base_body')}
        refusedCode={makeBaseRefusalOf(dialogRow(makingBase))}
        dismissLabel={t('make_base_keep')}
        confirmLabel={t('make_base_currency')}
        featureErrors={CURRENCIES_ERRORS}
        onConfirm={confirmMakeBase}
      />
    </>
  );
}

/**
 * `/setup/currencies` behind the two guards: a list skeleton until the session and `/me` answer
 * (UIK-03, D-39), then the gate `ROUTE_GATES` declares for the path, `ADMIN_GATE` (administrators
 * only, D-06 and D-38, equal to `@erp/contracts`); the api refuses everyone else regardless.
 */
export const GuardedCurrenciesList = withAuth(
  withPermission(CurrenciesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
