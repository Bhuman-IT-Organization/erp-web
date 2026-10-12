'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import {
  IDENTITY_ROLES_EXPORT_PATH,
  IDENTITY_ROLES_PATH,
  ROLE_EXPORT_COLUMNS,
  rolePath,
  STAFF_ERROR_CODES,
} from '@/features/staff/api/staff.endpoints';
import { useDeleteRole } from '@/features/staff/hooks/use-roles';
import { staffRoleSchema, type StaffRole } from '@/features/staff/schemas/staff.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { seedRow } from '@/lib/api/row-seed';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The api's refusal for a role someone still holds (`staff.errors.ERP-IDENTITY-0006`). */
const ROLE_IN_USE = 'ERP-IDENTITY-0006';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/roles';
const roleRoute = (roleId: number): string => `${LIST_BASE}/${String(roleId)}`;

/**
 * The roles list of `views/admin/roles/manage.php` + `views/admin/tables/roles.php`, on the kit's
 * `ListPageTemplate` (UIK-04): the template owns the URL state, the server search, the sort, the
 * pager, the export and every state (D-17…D-20, D-26, D-30, D-31, D-39); this screen owns its one
 * column, its two labelled actions and the delete (UAT 6, finding 4). Flow parity and the drops are
 * in the feature README (FE-18).
 *
 * **Delete** is ConfirmDialog kind 1 (D-25.1): it names the role, confirms in the fixed destructive
 * red with the trash icon, and the api's 409 `ERP-IDENTITY-0006` (a member still holds the role) stays
 * INSIDE the dialog with "Delete role" disabled, so a second click cannot re-send it (UAT 7). The
 * screen is administrator-only through `GuardedRolesList` (`ROUTE_GATES['/setup/roles'] = 'admin'`,
 * ADR-0034 d.2); the api refuses every roles read and write from anyone else regardless.
 */
export function RolesList(): ReactElement {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{
    readonly role: StaffRole;
    readonly open: boolean;
  } | null>(null);
  // One mutation for the list's one dialog, keyed on the role it names (never triggered while none).
  const remove = useDeleteRole(deleting?.role.roleId ?? 0);
  const noun = t('noun_role');

  /** Opening a role: record the list's URL and scroll, seed the form from the row (D-28, D-35). */
  const open = (role: StaffRole): void => {
    recordListReturn(LIST_BASE);
    seedRow(rolePath(role.roleId), role);
    router.push(roleRoute(role.roleId));
  };

  /** The delete's outcome, shown by the dialog: a 409 stays inside it (UAT 7). */
  async function confirmDelete(): Promise<ConfirmOutcome> {
    const outcome = await remove.trigger(undefined);
    // The hook revalidates the list pages (the totals moved); the dialog closes on `ok`.
    if (outcome.ok)
      toast.success(t('toast_role_deleted'), { duration: CLIENT_TIMINGS.toast.durationMs });
    return outcome;
  }

  const columns: readonly ListColumn<StaffRole>[] = [
    {
      id: 'name',
      header: t('roles_dt_name'),
      // D-41: `name` is a roles keyset key (`ROLE_SORT_FIELDS`); the member count is not.
      sortField: 'name',
      primary: true,
      // `tables/roles.php` puts the count on a second line of the same cell.
      cell: (role) => (
        <>
          <span className="block">{role.name}</span>
          <span className="text-muted-foreground block text-xs">
            {t('roles_total_users')}
            {f.number(role.memberCount)}
          </span>
        </>
      ),
    },
  ];

  const name = deleting?.role.name ?? '';
  // The row already knows who holds the role (D-35): a held role is refused up front, naming how
  // many hold it, and no DELETE that cannot succeed is sent. The api's 409 stays for the race (the
  // count was 0 when the list loaded and someone has been given the role since).
  const held = deleting?.role.memberCount ?? 0;

  return (
    <>
      <ListPageTemplate
        title={t('staff_roles')}
        path={IDENTITY_ROLES_PATH}
        rowSchema={staffRoleSchema}
        listBase={LIST_BASE}
        rowKey={(role) => String(role.roleId)}
        rowHref={(role) => roleRoute(role.roleId)}
        recordName={(role) => role.name}
        onRowOpen={(role) => {
          seedRow(rolePath(role.roleId), role);
        }}
        columns={columns}
        rowActions={(role) => [
          {
            id: 'edit',
            kind: 'main',
            icon: 'pen-to-square',
            label: tc('edit'),
            ariaLabel: t('edit_role_action', { name: role.name }),
            onSelect: () => {
              open(role);
            },
          },
          {
            id: 'delete',
            kind: 'destructive',
            icon: 'trash-can',
            label: tc('delete'),
            ariaLabel: t('delete_role_action', { name: role.name }),
            onSelect: () => {
              setDeleting({ role, open: true });
            },
          },
        ]}
        createAction={{ label: t('new_role'), href: `${LIST_BASE}/new` }}
        exportAction={{
          path: IDENTITY_ROLES_EXPORT_PATH,
          columns: ROLE_EXPORT_COLUMNS,
          labels: {
            roleId: t('the_number_sign'),
            name: t('roles_dt_name'),
            memberCount: t('total_users'),
          },
        }}
        empty={{
          nothingYetHeading: t('no_roles_heading'),
          nothingYetBody: t('no_roles_body'),
          noResultsHeading: (query) => t('no_roles_match_heading', { query }),
          noResultsBody: t('no_roles_match_body'),
        }}
        recordsNoun={t('noun_roles')}
        featureErrors={STAFF_ERROR_CODES}
      />
      <ConfirmDialog
        kind="destructive"
        open={deleting?.open === true}
        onOpenChange={(next) => {
          setDeleting((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('delete_role_title', { name })}
        body={
          held > 0
            ? t('delete_role_body_held', { count: held, countN: f.number(held) })
            : t('delete_role_body')
        }
        refusedCode={held > 0 ? ROLE_IN_USE : undefined}
        dismissLabel={tc('keep_noun', { noun })}
        confirmLabel={tc('delete_noun', { noun })}
        pendingLabel={tc('deleting_noun', { noun })}
        featureErrors={STAFF_ERROR_CODES}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/** `/setup/roles` behind the two guards: a list skeleton until the session and `/me` answer (UIK-03, D-39). */
export const GuardedRolesList = withAuth(withPermission(RolesList, { skeleton: 'list' }), {
  skeleton: 'list',
});
