'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { ImageThumbnail } from '@/components/molecules/ImageThumbnail';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { ConfirmDialog, type ConfirmOutcome } from '@/components/organisms/ConfirmDialog';
import { ListPageTemplate, type ListColumn } from '@/components/templates/ListPageTemplate';
import { Switch } from '@/components/ui/switch';
import { PERMISSIONS } from '@/config/permissions';
import {
  IDENTITY_MEMBERS_EXPORT_PATH,
  IDENTITY_MEMBERS_PATH,
  MEMBER_EXPORT_COLUMNS,
  memberPath,
  STAFF_ERROR_CODES,
} from '@/features/staff/api/staff.endpoints';
import { useStaffMemberStatus } from '@/features/staff/hooks/use-staff-member-status';
import { staffMemberSchema, type StaffMember } from '@/features/staff/schemas/staff.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, seedRow } from '@/lib/api/row-seed';
import { usePermissions } from '@/lib/auth/use-permissions';
import { recordListReturn } from '@/lib/hooks/use-return-to-list';
import { useFormat } from '@/lib/i18n/format';

/** The list's own route: where the return to the list is recorded and restored (D-28). */
const LIST_BASE = '/setup/staff';
const memberRoute = (staffId: number): string => `${LIST_BASE}/${String(staffId)}`;
const fullName = (row: StaffMember): string => `${row.firstName} ${row.lastName}`;

/** The saved row replaces the cached one on every list page that holds it: no list request (D-36). */
async function applySaved(saved: StaffMember, message: string): Promise<void> {
  await replaceRowInLists(IDENTITY_MEMBERS_PATH, saved, (row: StaffMember) => {
    return row.staffId === saved.staffId;
  });
  toast.success(message, { duration: CLIENT_TIMINGS.toast.durationMs });
}

/** Turning a member off waits for the list's one ConfirmDialog; `confirm` makes the write. */
interface DeactivateRequest {
  readonly row: StaffMember;
  readonly confirm: () => Promise<ConfirmOutcome>;
}

interface ActiveCellProps {
  readonly row: StaffMember;
  readonly canEdit: boolean;
  readonly onDeactivate: (request: DeactivateRequest) => void;
}

/**
 * The Active column: an immediate action, not a form field (UI-SPEC § Row actions "Per screen").
 * Turning a member ON applies at once — optimistic, reverted and said so on failure, never retried.
 * Turning a member OFF is an access change, so it asks first through the list's ConfirmDialog
 * (D-25.2), which shows a refusal inside itself. A viewer who may not edit sees the status as a
 * badge in the fixed meaning colours (D-06): a switch the api would refuse is not rendered.
 */
function ActiveCell({ row, canEdit, onDeactivate }: ActiveCellProps): ReactElement {
  const t = useTranslations('staff');
  const { setActive, isMutating } = useStaffMemberStatus(row);
  const [state, setState] = useState<{ readonly pending: boolean; readonly failed: boolean }>({
    pending: false,
    failed: false,
  });
  if (!canEdit) {
    return row.active ? (
      <StatusBadge status="active" label={t('staff_dt_active')} />
    ) : (
      <StatusBadge status="inactive" label={t('inactive')} />
    );
  }

  async function activate(): Promise<void> {
    setState({ pending: true, failed: false });
    const outcome = await setActive(true);
    if (outcome.ok) await applySaved(outcome.data, t('member_activated_toast'));
    setState({ pending: false, failed: !outcome.ok });
  }

  return (
    // A click beside the switch is not "open the row" either.
    <div data-row-ignore="" className="flex items-center gap-2">
      <Switch
        checked={state.pending || row.active}
        disabled={isMutating}
        aria-label={t('toggle_active', { name: fullName(row) })}
        onCheckedChange={(next) => {
          if (next) {
            void activate();
            return;
          }
          onDeactivate({
            row,
            confirm: async () => {
              const outcome = await setActive(false);
              if (outcome.ok) await applySaved(outcome.data, t('member_deactivated_toast'));
              return outcome;
            },
          });
        }}
      />
      {/* Only a failure is announced here; a success is the toast. */}
      {state.failed ? (
        <span role="status" className="text-destructive text-xs">
          {t('status_not_saved')}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The staff list of `views/admin/staff/manage.php` + `views/admin/tables/staff.php`, on the kit's
 * `ListPageTemplate` (UIK-04): the template owns the URL state, the server search, the sort, the
 * pager, the export and every state (D-17…D-20, D-26, D-30, D-31, D-39); this screen owns its
 * columns and actions. Flow parity and the drops are in the feature README (FE-18).
 */
export function StaffList(): ReactElement {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can(PERMISSIONS.staff.members.edit);
  const [deactivating, setDeactivating] = useState<
    (DeactivateRequest & { readonly open: boolean }) | null
  >(null);

  /** Opening a record: record the list's URL and scroll, seed the detail from the row (D-28, D-35). */
  const open = (row: StaffMember): void => {
    recordListReturn(LIST_BASE);
    seedRow(memberPath(row.staffId), row);
    router.push(memberRoute(row.staffId));
  };

  const columns: readonly ListColumn<StaffMember>[] = [
    {
      id: 'photo',
      header: t('staff_edit_profile_image'),
      headerHidden: true,
      // The <img> elements are the feature's (FE-17): the api built the paths behind its file-name
      // guard; the kit owns the frame, the placeholder, the button and the preview dialog (D-23).
      cell: (row) => (
        <ImageThumbnail
          name={fullName(row)}
          placeholderIcon="user"
          thumbnail={
            row.profileImageUrl === null ? null : (
              // eslint-disable-next-line @next/next/no-img-element -- api-served user data (FE-17), as BrandLogo
              <img
                src={row.profileImageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-10 object-cover"
              />
            )
          }
          preview={
            row.profileImagePreviewUrl === null ? null : (
              // eslint-disable-next-line @next/next/no-img-element -- api-served user data (FE-17), as BrandLogo
              <img
                src={row.profileImagePreviewUrl}
                alt={fullName(row)}
                className="max-h-[80vh] max-w-full object-contain"
              />
            )
          }
        />
      ),
    },
    {
      id: 'name',
      header: t('staff_dt_name'),
      sortField: 'firstName',
      primary: true,
      cell: fullName,
    },
    {
      id: 'email',
      header: t('staff_dt_email'),
      sortField: 'email',
      hideBelow: 'md',
      cell: (row) => <bdi>{row.email}</bdi>,
    },
    // D-41: Role and Last login are not keyset keys, so neither sorts.
    { id: 'role', header: t('role'), hideBelow: 'lg', cell: (row) => row.roleName ?? t('no_role') },
    {
      id: 'lastLogin',
      header: t('staff_dt_last_login'),
      hideBelow: 'lg',
      cell: (row) => (row.lastLogin === null ? t('never') : f.dateTime(row.lastLogin)),
    },
    {
      id: 'active',
      header: t('staff_dt_active'),
      sortField: 'active',
      cell: (row) => (
        <ActiveCell
          row={row}
          canEdit={canEdit}
          onDeactivate={(request) => {
            setDeactivating({ ...request, open: true });
          }}
        />
      ),
    },
  ];

  const name = deactivating === null ? '' : fullName(deactivating.row);

  return (
    <>
      <ListPageTemplate
        title={t('staff_members')}
        path={IDENTITY_MEMBERS_PATH}
        rowSchema={staffMemberSchema}
        listBase={LIST_BASE}
        rowKey={(row) => String(row.staffId)}
        rowHref={(row) => memberRoute(row.staffId)}
        recordName={fullName}
        onRowOpen={(row) => {
          seedRow(memberPath(row.staffId), row);
        }}
        columns={columns}
        rowActions={(row) => [
          {
            id: 'view',
            kind: 'main',
            icon: 'eye',
            label: t('view'),
            ariaLabel: tc('view_named', { name: fullName(row) }),
            onSelect: () => {
              open(row);
            },
          },
        ]}
        createAction={
          can(PERMISSIONS.staff.members.create)
            ? { label: t('new_staff'), href: `${LIST_BASE}/new` }
            : null
        }
        exportAction={{
          path: IDENTITY_MEMBERS_EXPORT_PATH,
          columns: MEMBER_EXPORT_COLUMNS,
          labels: {
            staffId: t('the_number_sign'),
            firstName: t('staff_add_edit_firstname'),
            lastName: t('staff_add_edit_lastname'),
            email: t('staff_dt_email'),
            roleName: t('role'),
            active: t('staff_dt_active'),
            lastLogin: t('staff_dt_last_login'),
          },
          // PDF and Print read an empty cell as the list does (D-26): the same two keys as the cells.
          blanks: { roleName: t('no_role'), lastLogin: t('never') },
        }}
        empty={{
          nothingYetHeading: t('no_staff_heading'),
          nothingYetBody: t('no_staff_body'),
          noResultsHeading: (query) => t('no_staff_match_heading', { query }),
          noResultsBody: t('no_staff_match_body'),
        }}
        recordsNoun={t('noun_staff_members')}
        featureErrors={STAFF_ERROR_CODES}
        imageColumn
      />
      <ConfirmDialog
        kind="access"
        open={deactivating?.open === true}
        onOpenChange={(next) => {
          setDeactivating((current) => (current === null ? null : { ...current, open: next }));
        }}
        title={t('deactivate_title', { name })}
        body={t('deactivate_body', { name })}
        dismissLabel={t('keep_active')}
        confirmLabel={t('deactivate_member')}
        pendingLabel={t('deactivating_member')}
        featureErrors={STAFF_ERROR_CODES}
        onConfirm={() => deactivating?.confirm() ?? { ok: true }}
      />
    </>
  );
}

/** `/setup/staff` behind the two guards: a list skeleton until the session and `/me` answer (UIK-03, D-39). */
export const GuardedStaffList = withAuth(withPermission(StaffList, { skeleton: 'list' }), {
  skeleton: 'list',
});
