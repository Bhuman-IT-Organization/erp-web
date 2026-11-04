'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import { FIXED_EQUIPMENT_SETTINGS_CODES } from '@/config/fixed-equipment-settings';
import {
  FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS,
  FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_COLUMNS,
  FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_PATH,
  FIXED_EQUIPMENT_DEPRECIATIONS_PATH,
  fixedEquipmentDepreciationsPath,
  NOT_FOUND_CODE,
} from '@/features/fixed-equipment-depreciations/api/fixed-equipment-depreciations.endpoints';
import { useDeleteFixedEquipmentDepreciation } from '@/features/fixed-equipment-depreciations/hooks/use-fixed-equipment-depreciations';
import {
  fixedEquipmentDepreciationsRowSchema,
  type FixedEquipmentDepreciationsRow,
} from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { revalidateLists, seedRow } from '@/lib/api/row-seed';
import { usePermissions } from '@/lib/auth/use-permissions';
import { useBreadcrumbCrumbs } from '@/lib/hooks/use-breadcrumb-label';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored. */
const LIST_BASE = '/setup/fixed-equipment-depreciations';
/** Who may do what on this tab: the depreciation settings group and the four item groups. */
const CODES = FIXED_EQUIPMENT_SETTINGS_CODES.depreciation;
const itemRoute = (row: FixedEquipmentDepreciationsRow): string =>
  `${LIST_BASE}/${encodeURIComponent(row.id)}`;

/**
 * The Depreciations list of Perfex's Fixed Equipment settings tab
 * (`admin/fixed_equipment/settings?tab=depreciations`) on the kit's `ListPageTemplate`: the
 * template owns the URL state, the search, the sort, the pager, every state (loading, empty, no
 * results, error, loaded) and the Export menu; this screen owns Perfex's three columns, ID, Name and
 * Term (one plural message per count), the labelled Edit and Delete, and the delete dialog. Add,
 * Edit and Delete show when the member holds that action's code in any of the tab's five groups
 * (`FIXED_EQUIPMENT_SETTINGS_CODES.depreciation`); a member who may neither edit nor delete gets no
 * row actions at all, so no empty ⋮ menu. No bulk action: Perfex has none here. Every visible
 * string is a key (FE-19), classes are the kit's, and a name is rendered as React text only, never
 * markup.
 *
 * **Delete** is ConfirmDialog kind 1. The row carries no usage, so the api decides: a 409
 * `ERP-FIXEDEQUIPMENTDEPRECIATIONS-0001` (the depreciation is still in use) or `-0002` (its use
 * could not be checked) stays inside the dialog in the feature's words; a 404 means the list is
 * stale, so the list pages ask again; a 204 toasts and the hook revalidates the list pages.
 */
export function FixedEquipmentDepreciationsList(): ReactElement {
  const t = useTranslations('fixed-equipment-depreciations');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const { canAny } = usePermissions();
  const canCreate = canAny(CODES.create);
  const canEdit = canAny(CODES.edit);
  const canDelete = canAny(CODES.delete);
  const [deleting, setDeleting] = useState<{
    readonly row: FixedEquipmentDepreciationsRow;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the row it names (never triggered while none).
  const remove = useDeleteFixedEquipmentDepreciation(deleting?.row.id ?? '0');
  const noun = t('depreciation_lowercase');
  // The menu only `covers` this page (Fixed Equipment › Settings): the page names itself after it.
  const crumbs = useMemo(() => [{ label: t('fe_depreciations') }], [t]);
  useBreadcrumbCrumbs(crumbs);

  /** Opening a depreciation: record the list's URL and scroll, seed the form from the row. */
  const open = (row: FixedEquipmentDepreciationsRow): void => {
    recordListReturn(LIST_BASE);
    seedRow(fixedEquipmentDepreciationsPath(row.id), row);
    router.push(itemRoute(row));
  };

  /** The delete's outcome, shown by the dialog: a refusal stays inside it. */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    if (outcome.ok) {
      toast.success(t('deleted_toast'), { duration: CLIENT_TIMINGS.toast.durationMs });
    } else if (outcome.code === NOT_FOUND_CODE) {
      await revalidateLists(FIXED_EQUIPMENT_DEPRECIATIONS_PATH);
    }
    return outcome;
  }

  /** Perfex's Term cell: the number of months as one plural message; "None" for a row without one. */
  const termText = (one: FixedEquipmentDepreciationsRow): string =>
    one.term === null
      ? tc('none')
      : t('term_months', { count: one.term, countN: f.number(one.term) });

  // Perfex's columns: ID, Name (`fe_name`) and Term (`fe_term`); the actions column is the template's.
  const columns: readonly ListColumn<FixedEquipmentDepreciationsRow>[] = [
    {
      id: 'id',
      header: t('id'),
      sortField: 'id',
      cell: (one) => <bdi className="tabular-nums">{one.id}</bdi>,
    },
    {
      id: 'name',
      header: t('fe_name'),
      sortField: 'name',
      primary: true,
      cell: (one) => one.name,
    },
    {
      id: 'term',
      header: t('fe_term'),
      cell: (one) => <bdi className="tabular-nums">{termText(one)}</bdi>,
    },
  ];

  /** Edit and Delete, each only with its code; left out entirely when the member may use neither. */
  const rowActions = (one: FixedEquipmentDepreciationsRow) => [
    ...(canEdit
      ? [
          {
            id: 'edit',
            kind: 'main' as const,
            icon: 'pen-to-square' as const,
            label: tc('edit'),
            ariaLabel: t('edit_action_named', { name: one.name }),
            onSelect: () => {
              open(one);
            },
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            id: 'delete',
            kind: 'destructive' as const,
            icon: 'trash-can' as const,
            label: tc('delete'),
            ariaLabel: t('delete_action_named', { name: one.name }),
            onSelect: () => {
              setDeleting({ row: one, open: true });
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <ListPageTemplate
        title={t('fe_depreciations')}
        path={FIXED_EQUIPMENT_DEPRECIATIONS_PATH}
        rowSchema={fixedEquipmentDepreciationsRowSchema}
        listBase={LIST_BASE}
        rowKey={(one) => one.id}
        rowHref={itemRoute}
        recordName={(one) => one.name}
        // The record opens at once from the row it was clicked on.
        onRowOpen={(one) => {
          seedRow(fixedEquipmentDepreciationsPath(one.id), one);
        }}
        columns={columns}
        {...(canEdit || canDelete ? { rowActions } : {})}
        createAction={canCreate ? { label: t('add'), href: `${LIST_BASE}/new` } : null}
        empty={{
          nothingYetHeading: t('no_depreciations_found'),
          // A member who cannot add is not told to add one.
          nothingYetBody: canCreate ? t('empty_body') : t('empty_body_readonly'),
          noResultsHeading: (query) => t('no_match_heading', { query }),
          noResultsBody: t('no_match_body'),
        }}
        exportAction={{
          path: FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_PATH,
          columns: FIXED_EQUIPMENT_DEPRECIATIONS_EXPORT_COLUMNS,
          labels: {
            id: t('id'),
            name: t('fe_name'),
            term: t('fe_term'),
          },
          blanks: { term: tc('none') },
        }}
        recordsNoun={t('noun_depreciations')}
        featureErrors={FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS}
      />
      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_title', { name: deleting?.row.name ?? '' })}
        body={t('delete_body')}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={FIXED_EQUIPMENT_DEPRECIATIONS_ERRORS}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * `/setup/fixed-equipment-depreciations` behind the two guards: a list skeleton until the session
 * and `/me` answer, then the gate `ROUTE_GATES` declares for the path (`src/config/route-gates.ts`):
 * any view or view-own code of the tab's five groups (`FIXED_EQUIPMENT_SETTINGS_CODES.depreciation`).
 */
export const GuardedFixedEquipmentDepreciationsList = withAuth(
  withPermission(FixedEquipmentDepreciationsList, { skeleton: 'list' }),
  { skeleton: 'list' },
);
