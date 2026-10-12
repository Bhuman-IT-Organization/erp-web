'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { readText } from '@/components/templates/EditableTable';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  CREDIT_MODE_CODE,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  PAYMENT_MODES_ERRORS,
  PAYMENT_MODES_EXPORT_COLUMNS,
  PAYMENT_MODES_EXPORT_PATH,
  PAYMENT_MODES_PATH,
  paymentModesPath,
} from '@/features/payment-modes/api/payment-modes.endpoints';
import {
  useDeletePaymentMode,
  usePaymentModeActive,
} from '@/features/payment-modes/hooks/use-payment-modes';
import {
  inUseGroups,
  paymentModesRowSchema,
  refusalOf,
  type PaymentModesRow,
  type PaymentModesUsageGroup,
} from '@/features/payment-modes/schemas/payment-modes.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, revalidateLists, seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/payment-modes';
const itemRoute = (row: PaymentModesRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * A delete refused because the list is stale: the row was deleted by someone else (404), has been
 * put to use since the list loaded, or became the credit expense mode (409). The list pages ask
 * again, so the dialog reopened from the refreshed row names the uses, and a deleted row is gone
 * once the dialog closes (UI-SPEC G8).
 */
const STALE_LIST_CODES: readonly string[] = [NOT_FOUND_CODE, IN_USE_CODE, CREDIT_MODE_CODE];

/** The dialog line of each usage group, in the api's order (D-33). */
const USAGE_LINE_KEYS = {
  invoicePayments: 'in_use_invoice_payments',
  expenses: 'in_use_expenses',
  creditNoteRefunds: 'in_use_credit_note_refunds',
  purchaseInvoicePayments: 'in_use_purchase_invoice_payments',
  purchaseOrderPayments: 'in_use_purchase_order_payments',
  debitNoteRefunds: 'in_use_debit_note_refunds',
  fixedEquipmentRefunds: 'in_use_fixed_equipment_refunds',
  orderReturnRefunds: 'in_use_order_return_refunds',
} as const satisfies Record<PaymentModesUsageGroup, string>;

/**
 * The Active cell: Perfex's `change_payment_mode_status` switch (`tables/payment_modes.php` :33-37),
 * one click and no confirmation (D-34). Its own mutation, never retried (ADR-0031 §5); the saved flag
 * is swapped into the cached list pages in place (no list request), with a toast; a failure puts the
 * switch back and says so beside it. Allowed for a mode in use and for the credit expense mode:
 * switching off is how they are retired (D-33, D-37). A click beside it never opens the row.
 */
function ActiveCell({ row }: { readonly row: PaymentModesRow }): ReactElement {
  const t = useTranslations('payment-modes');
  const active = usePaymentModeActive(row.id);
  const [state, setState] = useState<{
    readonly pending: boolean | null;
    readonly failed: boolean;
  }>({ pending: null, failed: false });

  async function toggle(next: boolean): Promise<void> {
    setState({ pending: next, failed: false });
    const outcome = await active.trigger({ active: next });
    if (outcome.ok) {
      await replaceRowInLists(
        PAYMENT_MODES_PATH,
        { ...row, active: outcome.data.active },
        (one: PaymentModesRow) => one.id === row.id,
      );
      toast.success(t(outcome.data.active ? 'activated_toast' : 'deactivated_toast'), {
        duration: CLIENT_TIMINGS.toast.durationMs,
      });
    }
    setState({ pending: null, failed: !outcome.ok });
  }

  return (
    // A click beside the switch is not "open the row" either.
    <div data-row-ignore="" className="flex items-center gap-2">
      <Switch
        checked={state.pending ?? row.active}
        disabled={active.isMutating}
        aria-label={t('toggle_active', { name: row.name })}
        onCheckedChange={(next) => {
          void toggle(next);
        }}
      />
      {state.failed ? (
        <span role="status" className="text-destructive text-xs">
          {t('active_not_saved')}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The Payment Modes list of `paymentmodes/manage.php` and `tables/payment_modes.php` on the kit's
 * `ListPageTemplate` (UIK-06): the template owns the URL state, the settled search (the name, the
 * description or an exact id, server side), the sort (the name ascending by default, as Perfex's
 * table orders it, with no arrow, D-16), the pager, the four-format export and every state (loading,
 * empty, no results, error, loaded) in the D-39 order; this screen owns Perfex's announcement line
 * above the table (manage.php :16), its four columns (ID, Payment Mode Name, Bank Accounts /
 * Description: the read form as text with its line breaks, never markup, and Active: the one-click
 * switch, D-34), the labelled Edit and Delete and the delete dialog. No bulk action: Perfex has none
 * (D-16). Every visible string is a key (FE-19), classes are logical (FE-20), and names and
 * descriptions are React text only (T-4.1-124). Flow parity and the drops are in the feature README.
 *
 * **Delete** is ConfirmDialog kind 1 (D-25.1), keyed on the row it names (the Cost Centers shape): a
 * row Perfex's `expense_credit_payment_mode` names (D-37) or that any of the eight transactional
 * groups uses (D-33) is refused up front (`refusedCode` from `refusalOf`, one line per group, no
 * request sent), the refusal pointing to the Active switch; otherwise the api's 409 or 404 stays
 * inside the dialog and the list pages ask again; a 204 toasts and the list pages ask again (the
 * hook invalidates them).
 */
export function PaymentModesList(): ReactElement {
  const t = useTranslations('payment-modes');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly row: PaymentModesRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeletePaymentMode(deleting?.row.id ?? '0');
  const noun = t('payment_mode_lowercase');

  /** Opening a payment mode: record the list's URL and scroll, seed the form from the row (D-28, D-35). */
  const open = (row: PaymentModesRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(paymentModesPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it (UAT 7). */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (STALE_LIST_CODES.includes(outcome.code)) {
      await revalidateLists(PAYMENT_MODES_PATH);
    }
    return outcome;
  }

  /**
   * The dialog's body: what still uses the row, one line per group; nothing more for the credit
   * expense mode no group uses (its refusal says why); else "cannot be undone".
   */
  function deleteBody(row: PaymentModesRow | undefined): ReactNode {
    if (row === undefined) return t('delete_body');
    const groups = inUseGroups(row.usage);
    if (groups.length === 0) return row.isCreditExpenseMode ? null : t('delete_body');
    // Inside the dialog's description (a <p>), so each line is a block <span>, never a <p>.
    return groups.map((group) => (
      <span key={group} className="block">
        {t(USAGE_LINE_KEYS[group], {
          count: row.usage[group],
          countN: f.number(row.usage[group]),
        })}
      </span>
    ));
  }

  // Perfex's columns in Perfex's order (`paymentmodes/manage.php` :19-23): ID, Payment Mode Name,
  // Bank Accounts / Description, Active; Options are the row actions.
  const columns: readonly ListColumn<PaymentModesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('payment_modes_dt_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
    {
      id: 'description',
      header: t('payment_modes_dt_description'),
      hideBelow: 'md',
      // Not sortable (a long text column). The read form as React text: a long or multi-line text
      // in the kit's long-text box (`whitespace-pre-line`, 160 to 320 px), so its line breaks stay
      // without turning any markup into an element (T-4.1-124).
      cell: (one) => readText(one.description),
    },
    {
      id: 'active',
      header: t('payment_modes_dt_active'),
      sortField: 'active',
      cell: (one) => <ActiveCell row={one} />,
    },
  ];

  const row = deleting?.row;

  return (
    <>
      <ListPageTemplate
        title={t('payment_modes')}
        // The page title, then Perfex's announcement above the table (manage.php :16).
        header={
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold">{t('payment_modes')}</h1>
            <Alert role="note" data-testid="payment-modes-announcement">
              <AlertDescription>{t('payment_modes_add_edit_announcement')}</AlertDescription>
            </Alert>
          </div>
        }
        path={PAYMENT_MODES_PATH}
        rowSchema={paymentModesRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on (D-35).
        onRowOpen={(one) => {
          seedRow(paymentModesPath(one.id), one);
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
        createAction={{ label: t('new_payment_mode'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: PAYMENT_MODES_EXPORT_PATH,
          columns: PAYMENT_MODES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('payment_modes_dt_name'),
            description: t('payment_modes_dt_description'),
            active: t('payment_modes_dt_active'),
          },
        }}
        empty={{
          nothingYetHeading: t('empty_heading'),
          nothingYetBody: t('empty_body'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        recordsNoun={t('noun_payment_modes')}
        featureErrors={PAYMENT_MODES_ERRORS}
      />
      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: row?.name ?? '' })}
        body={deleteBody(row)}
        refusedCode={refusalOf(row)}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={PAYMENT_MODES_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * `/setup/payment-modes` behind the two guards: a list skeleton until the session and `/me` answer
 * (UIK-03, D-39), then the gate `ROUTE_GATES` declares for the path, `ADMIN_GATE` (administrators
 * only, D-06 and D-32, equal to `@erp/contracts`); the api refuses everyone else regardless.
 */
export const GuardedPaymentModesList = withAuth(
  withPermission(PaymentModesList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
