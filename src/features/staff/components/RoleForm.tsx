'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm, type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';
import { FieldBlocksSkeleton } from '@/components/molecules/FieldBlocksSkeleton';
import { InlineError } from '@/components/molecules/InlineError';
import {
  ConfirmDialog,
  useConfirmCopy,
  type ConfirmOutcome,
  type SummaryChange,
} from '@/components/organisms/ConfirmDialog';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import {
  PermissionPicker,
  type PermissionPickerLabels,
} from '@/components/organisms/PermissionPicker';
import {
  SchemaForm,
  type FieldSpec,
  type FormSectionSpec,
} from '@/components/organisms/SchemaForm';
import {
  IDENTITY_ROLES_PATH,
  rolePath,
  STAFF_ERROR_CODES,
  VALIDATION_CODE,
} from '@/features/staff/api/staff.endpoints';
import { RoleMembers } from '@/features/staff/components/RoleMembers';
import { usePermissionCatalogue } from '@/features/staff/hooks/use-identity-lookups';
import { useRole, useSaveRole } from '@/features/staff/hooks/use-roles';
import { diffRoleForSummary } from '@/features/staff/schemas/save-summary';
import {
  actionOf,
  CAPABILITY_KEYS,
  EMPTY_ROLE_FORM,
  featureOf,
  isRoleField,
  ROLE_MESSAGE_KEYS,
  roleFormSchema,
  staffRoleSchema,
  toCreateStaffRoleBody,
  resourceLabel,
  toPermissionModules,
  toRoleForm,
  toUpdateStaffRoleBody,
  UNKNOWN_CAPABILITY_KEY,
  validationIssuesSchema,
  type RoleFormValues,
  type StaffRole,
  type StaffRoleDetail,
} from '@/features/staff/schemas/staff.schema';
import { withAuth } from '@/hocs/withAuth';
import { withPermission } from '@/hocs/withPermission';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { replaceRowInLists, revalidateLists, useRowSeed } from '@/lib/api/row-seed';
import { isRetryableCode } from '@/lib/errors/error-messages';
import { useErrorText } from '@/lib/errors/use-error-text';
import { useBreadcrumbLabel } from '@/lib/hooks/use-breadcrumb-label';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import { useFormat } from '@/lib/i18n/format';

/** The list this form returns to, exactly where the member left it (D-28). */
const LIST_BASE = '/setup/roles';
const FORM_ID = 'role-form';

type Values = RoleFormValues;

export interface RoleFormProps {
  readonly mode: 'create' | 'edit';
  /** The role's id; required in `edit` mode, absent in `create`. */
  readonly id?: number;
}

/**
 * Every field of `fields` disabled while `locked`: a row opened from the list carries no permissions
 * and no members, so nothing may be edited, and therefore saved, until the detail arrives
 * (T-1e2-02). Per field, not `SchemaForm readOnly`: that disables the whole fieldset, Retry included.
 */
function lockedWhile<T extends FieldValues>(
  locked: boolean,
  fields: readonly FieldSpec<T>[],
): FieldSpec<T>[] {
  return fields.map((spec) => (locked ? { ...spec, disabled: true } : spec));
}

/** The save summary waiting for the member's answer, or nothing (D-25: dialogs never stack). */
type Pending = { readonly values: Values; readonly changes: readonly SummaryChange[] } | null;

/**
 * `/setup/roles/new` and `/setup/roles/:id` (UIK-04, UAT 6), the form of `views/admin/roles/role.php` on the
 * kit: one `SchemaForm` card with the sections Role and Permissions, and on edit the role's holders
 * in their own card beside it from 63rem of content width (under it below that), as legacy's
 * `col-md-5` panel sits beside its `col-md-7` form.
 *
 * - **Role:** Role Name, short and required, with an example placeholder (UAT 6). On edit, when the
 *   role has members, Perfex's "Update all staff members permissions that are using this role"
 *   checkbox on its own row under Role Name, with Perfex's warning as a footnote under its label
 *   (unticked by default, T-3.2-81). The members are in the side card (`RoleMembers`), no longer
 *   in this section.
 * - **Permissions:** the `PermissionPicker` open in its editable accordion at once, because a role
 *   IS the template (UI-SPEC § PermissionPicker "Role form"); there is no role to re-apply.
 *
 * Every save is confirmed by a summary of what changes (D-25.4), the apply-to-members change first;
 * a success toasts "Role saved", updates the caches from the returned role and goes back to the
 * exact list position (D-28, D-36); a field problem lands under the field, a network failure in the
 * form with Retry, a refusal inside the dialog (D-29, UAT 7). Administrator-only through
 * `GuardedRoleForm` (ADR-0034 d.2); the api refuses every role write from anyone else regardless.
 */
export function RoleForm({ mode, id }: RoleFormProps): ReactElement {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const f = useFormat();
  const router = useRouter();
  const errorText = useErrorText(STAFF_ERROR_CODES);

  const editId = mode === 'edit' && id !== undefined ? id : null;
  // The seed and the detail read run side by side: the seed is cache only (D-35, D-36).
  const seed = useRowSeed(editId === null ? null : rolePath(editId), staffRoleSchema);
  const role = useRole(editId);
  const catalogue = usePermissionCatalogue();

  const form = useForm<Values>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: EMPTY_ROLE_FORM,
    // The seed first, then the full role; what the member already typed is kept (D-35).
    ...(role.data !== undefined
      ? { values: toRoleForm(role.data) }
      : seed !== undefined
        ? { values: { ...EMPTY_ROLE_FORM, name: seed.name } }
        : {}),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveRole(editId);
  const mutation = editId === null ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const copy = useConfirmCopy();
  // The last values sent: Retry re-sends exactly them, without asking again (D-29).
  const lastSent = useRef<Values | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const name = role.data?.name ?? seed?.name;

  const detailMissing = editId !== null && role.data === undefined;
  const detailFailure = detailMissing ? role.error : undefined;
  const retryable = detailFailure !== undefined && isRetryableCode(detailFailure.code);
  const pageFailed =
    detailMissing && (seed === undefined || (detailFailure !== undefined && !retryable));
  // A failed page names no record (null), so the breadcrumb stops waiting (D-39).
  useBreadcrumbLabel(pageFailed && detailFailure !== undefined ? null : name);
  if (pageFailed) {
    // A permalink: nothing to show until the role answers (D-39), then the error, if any. A row
    // opened from the list whose role answers a 4xx is the same page: the role is not there.
    if (detailFailure === undefined) return <PageSkeleton variant="form" />;
    return (
      <InlineError
        message={errorText(detailFailure)}
        busy={role.isValidating}
        {...(retryable ? { onRetry: () => void role.mutate() } : {})}
        back={{ href: readListReturn(LIST_BASE), label: tc('back_to_list') }}
      />
    );
  }

  /** "Sales · Invoices · View": one permission, worded as the member form and the audit word it. */
  function permissionLine(code: string): string {
    const [module = '', ...resource] = featureOf(code).split('.');
    return t('permission_line', {
      feature: t('permission_feature', {
        module: t('permission_module', { module }),
        resource: resourceLabel(resource.join('.')),
      }),
      capability: t(CAPABILITY_KEYS[actionOf(code)] ?? UNKNOWN_CAPABILITY_KEY),
    });
  }

  function summaryOf(values: Values): SummaryChange[] {
    return diffRoleForSummary(
      role.data === undefined ? null : toRoleForm(role.data),
      values,
      form.formState.dirtyFields,
      {
        mode,
        label: () => t('role_add_edit_name'),
        permissionLine,
        t: {
          applyToMembers: t('role_update_staff_permissions'),
          permissionSummary: (added, removed) =>
            tc('permission_changes_summary', {
              added,
              addedN: f.number(added),
              removed,
              removedN: f.number(removed),
            }),
          createRole: (role, count) =>
            t('create_summary_role', { role, count, n: f.number(count) }),
        },
      },
    );
  }

  /** After a save: the caches from the returned role, the toast, back to the list (D-28, D-36). */
  async function saved(record: StaffRoleDetail): Promise<void> {
    form.reset(toRoleForm(record));
    if (editId === null) {
      // A new role moves totals and positions: the list pages ask again.
      await revalidateLists(IDENTITY_ROLES_PATH);
    } else {
      await role.mutate(record, { revalidate: false });
      const row = staffRoleSchema.parse(record);
      await replaceRowInLists(IDENTITY_ROLES_PATH, row, (one: StaffRole) => {
        return one.roleId === row.roleId;
      });
    }
    toast.success(t('toast_role_saved'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /**
   * One save and where its outcome shows (D-29), as the member form routes it: success → `saved`; a
   * field problem closes the dialog and shows under the field and in the focused summary; a network
   * or server failure closes the dialog and becomes the form's alert with Retry; anything else is a
   * refusal and stays inside the dialog (UAT 7).
   */
  async function send(values: Values): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const outcome =
      editId === null
        ? await create.trigger(toCreateStaffRoleBody(values))
        : await update.trigger(toUpdateStaffRoleBody(values));
    if (outcome.ok) {
      await saved(outcome.data);
      return { ok: true };
    }
    if (outcome.code === VALIDATION_CODE) {
      // The api's own `message` is never read; a malformed body shows no field error.
      const issues = validationIssuesSchema.safeParse(outcome.issues);
      flushSync(() => {
        setPending(null);
        for (const issue of issues.success ? issues.data : []) {
          const field = issue.path[0];
          if (isRoleField(field)) form.setError(field, { message: ROLE_MESSAGE_KEYS[field] });
        }
      });
      document
        .getElementById(FORM_ID)
        ?.querySelector<HTMLElement>('[data-testid="error-summary"]')
        ?.focus();
      return { ok: true };
    }
    if (isRetryableCode(outcome.code)) {
      setPending(null);
      return { ok: true };
    }
    return outcome;
  }

  // The last failure a Retry can fix is the form's alert; a refusal was shown in the dialog.
  const failure =
    mutation.result !== undefined && !mutation.result.ok && isRetryableCode(mutation.result.code)
      ? mutation.result
      : null;

  const members = role.data?.members ?? [];
  const pickerLabels: PermissionPickerLabels = {
    summary: (count, modules) =>
      t('role_grants_summary', {
        role: name ?? '',
        count,
        n: f.number(count),
        modules,
        m: f.number(modules),
      }),
    moduleCount: (granted, total) =>
      t('module_granted_count', { granted: f.number(granted), total: f.number(total) }),
    customise: t('customise_permissions'),
    search: t('search_permissions'),
    runningTotal: (count) => t('permissions_granted_count', { count, n: f.number(count) }),
    selectAllIn: (module) => t('select_all_in_module', { module }),
    resetToRole: t('reset_to_role'),
    behindRole: () => '',
    reapplyRole: t('reapply_role'),
    featureColumn: t('feature'),
  };
  const modules =
    catalogue.data === undefined
      ? undefined
      : toPermissionModules(catalogue.data, {
          module: (module) => t('permission_module', { module }),
          capability: (key) => t(key),
        });

  const roleSection: FormSectionSpec<Values> = {
    id: 'role',
    title: t('role'),
    fields: lockedWhile(detailMissing, [
      {
        name: 'name',
        label: t('role_add_edit_name'),
        kind: 'text',
        required: true,
        placeholder: t('role_name_placeholder'),
      },
      // Perfex renders it only when someone holds the role (`total_rows(staff, role) > 0`).
      ...(members.length > 0
        ? [
            {
              name: 'applyToMembers',
              label: t('role_update_staff_permissions'),
              kind: 'checkbox',
              helper: t('change_role_permission_warning'),
              // UI-SPEC: a field with a helper longer than one line is full width.
              span: 'full',
            } as const,
          ]
        : []),
    ]),
  };

  const permissionsSection: FormSectionSpec<Values> = {
    id: 'permissions',
    title: t('staff_add_edit_permissions'),
    // D-35: opened from the list, the row carries no template; its own blocks until it arrives.
    loading: editId !== null && role.data === undefined,
    fields: [
      {
        name: 'permissions',
        label: t('staff_add_edit_permissions'),
        kind: 'custom',
        render: (field, state) =>
          catalogue.error !== undefined ? (
            <InlineError
              message={errorText(catalogue.error)}
              busy={catalogue.isValidating}
              {...(isRetryableCode(catalogue.error.code)
                ? { onRetry: () => void catalogue.mutate() }
                : {})}
            />
          ) : modules === undefined ? (
            <div role="status" aria-busy="true">
              <span className="sr-only">{tc('loading')}</span>
              <FieldBlocksSkeleton count={1} />
            </div>
          ) : (
            // A role IS the template: straight into the editable accordion, nothing to re-apply.
            <PermissionPicker
              id={state.id}
              catalogue={modules}
              value={Array.isArray(field.value) ? field.value : []}
              onChange={field.onChange}
              initialMode="edit"
              readOnly={state.disabled}
              labels={pickerLabels}
            />
          ),
      },
    ],
  };

  // Opened from the list, the role failed retryably: the error where the role is needed, with
  // Retry (D-31), instead of blocks that would never end; "Back to list" is the save bar's.
  const permissionsShown: FormSectionSpec<Values> =
    detailFailure === undefined
      ? permissionsSection
      : {
          ...permissionsSection,
          loading: false,
          fields: [],
          notice: (
            <InlineError
              message={errorText(detailFailure)}
              busy={role.isValidating}
              onRetry={() => void role.mutate()}
              testId="permissions-error"
            />
          ),
        };

  // Legacy's col-md-5 panel. Not on create; withheld after a failed read (one error, the Permissions one).
  const membersCard =
    editId === null || detailFailure !== undefined ? null : (
      <RoleMembers members={role.data?.members} />
    );

  const noun = t('noun_role');
  const submitLabel = tc(editId === null ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(editId === null ? 'creating_noun' : 'saving_noun', { noun });
  return (
    <div className="@container flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{name ?? t('new_role')}</h1>
      <div className="grid grid-cols-1 items-start gap-6 @min-[63rem]:grid-cols-[minmax(0,64rem)_20rem]">
        <SchemaForm
          id={FORM_ID}
          form={form}
          sections={[roleSection, permissionsShown]}
          onValid={(values) => {
            // Defence in depth (T-1e2-02): the fields are locked, but a save built from the row alone
            // would send the role's permissions as empty.
            if (detailMissing) return;
            setPending({ values, changes: summaryOf(values) });
          }}
          translateError={(key) => t(key)}
          submitLabel={submitLabel}
          pendingLabel={pendingLabel}
          isPending={mutation.isMutating}
          onBack={() => {
            guard.requestLeave(readListReturn(LIST_BASE));
          }}
          serverError={
            failure === null
              ? null
              : {
                  message: errorText(failure),
                  onRetry: () => {
                    if (lastSent.current !== null) void send(lastSent.current);
                  },
                }
          }
        />
        {membersCard}
      </div>
      <ConfirmDialog
        kind="summary"
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          editId === null
            ? tc('create_summary_title', { noun, name: pending?.values.name ?? '' })
            : tc('save_summary_title', { name: name ?? '' })
        }
        changes={pending?.changes ?? []}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        featureErrors={STAFF_ERROR_CODES}
        onConfirm={() => (pending === null ? { ok: true } : send(pending.values))}
      />
      <ConfirmDialog
        kind="discard"
        open={guard.pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) guard.cancelLeave();
        }}
        {...copy.discard(name === undefined ? { noun } : { recordName: name })}
        onConfirm={() => {
          guard.confirmLeave();
          return { ok: true };
        }}
      />
    </div>
  );
}

/** The route's guard (UIK-03): the form skeleton while the session or `/me` is unknown (D-39). */
export const GuardedRoleForm = withAuth(withPermission(RoleForm, { skeleton: 'form' }), {
  skeleton: 'form',
});
