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

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/services';
const itemRoute = (row: ServicesRow): string => `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * The Services list of `services/manage.php` on the kit's `ListPageTemplate` (UIK-06): the
 * template owns the URL state, the settled search, the sort (the Service Name ascending by default, as
 * Perfex's table orders it, with no arrow, D-16), the pager, the export and every state (loading,
 * empty, no results, error, loaded) in the D-39 order; this screen owns Perfex's two columns (ID,
 * Service Name, empty when Perfex stored none,
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
  const noun = t('service_lowercase');

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

  // Perfex's columns in Perfex's order (`services/manage.php`): ID, Service Name.
  const columns: readonly ListColumn<ServicesRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('services_dt_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
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
        createAction={{ label: t('new_service'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: SERVICES_EXPORT_PATH,
          columns: SERVICES_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('services_dt_name'),
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
