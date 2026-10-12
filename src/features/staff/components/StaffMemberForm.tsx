'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch, type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { ChoiceField, LabelText, type ChoiceOption } from '@/components/molecules/ChoiceField';
import { FieldBlocksSkeleton } from '@/components/molecules/FieldBlocksSkeleton';
import { InlineError } from '@/components/molecules/InlineError';
import { SearchableSelect } from '@/components/molecules/SearchableSelect';
import { StatusBadge } from '@/components/molecules/StatusBadge';
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
  type CustomFieldState,
  type FieldSpec,
  type FormSectionSpec,
} from '@/components/organisms/SchemaForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldLabel } from '@/components/ui/field';
import {
  fetchRoleTemplate,
  IDENTITY_MEMBERS_PATH,
  memberPath,
  STAFF_ERROR_CODES,
  VALIDATION_CODE,
} from '@/features/staff/api/staff.endpoints';
import { useActor } from '@/features/staff/hooks/use-actor';
import {
  useDepartments,
  useLocales,
  usePermissionCatalogue,
  useRoleOptions,
  useRoleTemplate,
} from '@/features/staff/hooks/use-identity-lookups';
import { useSaveStaffMember } from '@/features/staff/hooks/use-save-staff-member';
import { useStaffMember } from '@/features/staff/hooks/use-staff-members';
import { diffMemberForSummary } from '@/features/staff/schemas/save-summary';
import {
  actionOf,
  CAPABILITY_KEYS,
  createStaffMemberFormSchema,
  EMPTY_STAFF_MEMBER_FORM,
  featureOf,
  isStaffMemberField,
  STAFF_MESSAGE_KEYS,
  staffMemberSchema,
  SYSTEM_DEFAULT_LANGUAGE,
  toCreateStaffMemberBody,
  resourceLabel,
  toPermissionModules,
  toStaffMemberForm,
  toUpdateStaffMemberBody,
  UNKNOWN_CAPABILITY_KEY,
  updateStaffMemberFormSchema,
  validationIssuesSchema,
  type StaffMember,
  type StaffMemberDetail,
  type StaffMemberFormValues,
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
const LIST_BASE = '/setup/staff';
const FORM_ID = 'staff-member';

/**
 * The four member-page tabs that belong to other modules stay on Perfex (brief §9.1): plain links
 * to the Perfex member page, each with the external-link glyph and a note that it opens in Perfex
 * (flow parity: the same entry points). Staff delete stays on Perfex too.
 */
const LEGACY_MEMBER_TABS = [
  { id: 'notes', labelKey: 'staff_add_edit_notes', noteKey: 'tab_notes_on_legacy' },
  { id: 'timesheets', labelKey: 'task_timesheets', noteKey: 'tab_timesheets_on_legacy' },
  { id: 'projects', labelKey: 'projects', noteKey: 'tab_projects_on_legacy' },
  { id: 'face', labelKey: 'tab_face_registration', noteKey: 'tab_face_on_legacy' },
] as const;
const legacyMemberUrl = (id: number): string => `/admin/staff/member/${String(id)}?legacy=1`;
const LEGACY_STAFF_LIST = '/admin/staff?legacy=1';
/** A member who changed their own password or role was signed out everywhere by the api. */
const LOGIN_ROUTE = '/login?next=%2Fstaff';
/**
 * The Role select's "no role" option (Perfex's `render_select` blank, `dropdown_non_selected_tex`):
 * a choice cannot hold `''`, so the control holds this token and the form holds `''` (no role).
 */
const NO_ROLE = '.none';

type Values = StaffMemberFormValues;

export interface StaffMemberFormProps {
  readonly mode: 'create' | 'edit';
  /** The member's staff id; required in `edit` mode, absent in `create`. */
  readonly id?: number;
}

/** The screen's own dialogs, one at a time (D-25: dialogs never stack). */
type Dialog =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'summary';
      readonly values: Values;
      readonly changes: readonly SummaryChange[];
    };

/** The row the list seeded, as the form's first values: its fields at once, the rest empty (D-35). */
function fromSeed(row: StaffMember): Values {
  return {
    ...EMPTY_STAFF_MEMBER_FORM,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phoneNumber: row.phoneNumber ?? '',
    roleId: row.roleId === null ? '' : String(row.roleId),
    admin: row.isAdmin,
  };
}

/**
 * Every field of `fields` disabled while `locked`: a row opened from the list carries no permissions
 * or departments, so nothing may be edited, and therefore saved, until the detail arrives
 * (T-1e2-02). Per field, not `SchemaForm readOnly`: that disables the whole fieldset, Retry included.
 */
function lockedWhile<T extends FieldValues>(
  locked: boolean,
  fields: readonly FieldSpec<T>[],
): FieldSpec<T>[] {
  return fields.map((spec) => (locked ? { ...spec, disabled: true } : spec));
}

const asOne = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const describedByOf = (state: CustomFieldState) =>
  state.describedBy === '' ? {} : { describedBy: state.describedBy };

/**
 * `/setup/staff/new` and `/setup/staff/:id` (UIK-04), the form of `views/admin/staff/member.php` on the kit:
 * one `SchemaForm` card with the sections Profile, Access and "In Perfex" — no tabs (ui-kit-decisions
 * §3), short fields two to a row, required fields marked, the social profiles behind one disclosure
 * (finding 7), and no Direction field (finding 8: direction follows the locale).
 *
 * **The kit chooses every control (D-24)**: Role, Default Language and Departments are `ChoiceField`s
 * whose control follows the option count; Role and Default Language are declared half width, so
 * nothing moves when their options arrive (lead decision (a)). Administrator is a checkbox; the
 * password has a named reveal (finding 9).
 *
 * **Permissions are role-first (ui-kit-decisions §1).** An administrator sees what the role grants
 * and "Customise these permissions"; a member behind their role gets "Re-apply role", which asks
 * first when it would take a permission away. **Granting is admin-only and the screen says so
 * once** (UAT 12, ADR-0034 d.2): for anyone else the refusal is one notice at the top of Access, the
 * role select is disabled, the picker is read-only but reviewable, there is no Administrator
 * checkbox, and the save omits every granting field. The administrator flag is the SESSION's
 * (`useActor`), never a permission code. The api refuses a granting write regardless.
 *
 * **Loading (D-35, D-39).** Opened from the list, the row's fields render at once, locked, and Access
 * shows its own field blocks until the full record arrives; a permalink shows the form skeleton.
 * **A detail that fails** (lead 2026-09-27): a permalink, or a row whose detail answers a 4xx, is
 * `InlineError` in the form's place with "Back to list" (and Retry when retrying can help); a row
 * whose detail fails retryably keeps its fields, locked, and Access shows the error with Retry.
 */
export function StaffMemberForm({ mode, id }: StaffMemberFormProps): ReactElement {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const ts = useTranslations('shell');
  const f = useFormat();
  const router = useRouter();
  const errorText = useErrorText(STAFF_ERROR_CODES);
  const actor = useActor();

  const editId = mode === 'edit' && id !== undefined ? id : null;
  // The seed and the detail read run side by side: the seed is cache only (D-36).
  const seed = useRowSeed(editId === null ? null : memberPath(editId), staffMemberSchema);
  const member = useStaffMember(editId);
  const departments = useDepartments();
  const locales = useLocales();
  const catalogue = usePermissionCatalogue();
  // Only an administrator may change a role, so only an administrator asks for the options.
  const roles = useRoleOptions(actor.isAdmin);
  const savedRoleId = member.data?.roleId ?? seed?.roleId ?? null;
  const savedTemplate = useRoleTemplate(actor.isAdmin ? savedRoleId : null);

  const form = useForm<Values>({
    resolver: zodResolver(
      mode === 'create' ? createStaffMemberFormSchema : updateStaffMemberFormSchema,
    ),
    defaultValues: EMPTY_STAFF_MEMBER_FORM,
    // The seed first, then the full record; what the member already typed is kept (D-35).
    ...(member.data !== undefined
      ? { values: toStaffMemberForm(member.data) }
      : seed !== undefined
        ? { values: fromSeed(seed) }
        : {}),
    resetOptions: { keepDirtyValues: true },
  });
  const { create, update } = useSaveStaffMember(editId);
  const mutation = mode === 'create' ? create : update;
  const guard = useUnsavedChanges(form.formState.isDirty && !mutation.isMutating);
  const copy = useConfirmCopy();
  // The last values sent: Retry re-sends exactly them, without asking again (D-29).
  const lastSent = useRef<Values | null>(null);
  const roleId = useWatch({ control: form.control, name: 'roleId' });
  const admin = useWatch({ control: form.control, name: 'admin' });

  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  // A role picked on this screen: its template, fetched when the select changes (Perfex's
  // `role_changed`), so the picker can compare and reset against it.
  const [picked, setPicked] = useState<{ roleId: string; codes: readonly string[] } | null>(null);

  const name =
    member.data !== undefined
      ? `${member.data.firstName} ${member.data.lastName}`
      : seed === undefined
        ? undefined
        : `${seed.firstName} ${seed.lastName}`;

  const detailMissing = editId !== null && member.data === undefined;
  const detailFailure = detailMissing ? member.error : undefined;
  const retryable = detailFailure !== undefined && isRetryableCode(detailFailure.code);
  const pageFailed =
    detailMissing && (seed === undefined || (detailFailure !== undefined && !retryable));
  // A failed page names no record (null), so the breadcrumb stops waiting (D-39).
  useBreadcrumbLabel(pageFailed && detailFailure !== undefined ? null : name);
  if (pageFailed) {
    // A permalink: nothing to show until the record answers (D-39), then the error, if any. A row
    // opened from the list whose detail answers a 4xx is the same page: the record is not there.
    if (detailFailure === undefined) return <PageSkeleton variant="form" withBadge />;
    return (
      <InlineError
        message={errorText(detailFailure)}
        busy={member.isValidating}
        {...(retryable ? { onRetry: () => void member.mutate() } : {})}
        back={{ href: readListReturn(LIST_BASE), label: tc('back_to_list') }}
      />
    );
  }

  const active = member.data?.active ?? seed?.active ?? true;
  const noRole = t('dropdown_non_selected_tex');
  const roleOptions: ChoiceOption[] | undefined =
    roles.data === undefined
      ? undefined
      : [
          { value: NO_ROLE, label: noRole },
          ...roles.data.data.map((role) => ({ value: String(role.roleId), label: role.name })),
        ];
  const roleName =
    roleOptions?.find((option) => option.value === roleId)?.label ??
    (roleId === String(savedRoleId) ? (member.data?.roleName ?? seed?.roleName) : undefined) ??
    noRole;
  const roleTemplate =
    picked !== null && picked.roleId === roleId
      ? picked.codes
      : roleId === String(savedRoleId)
        ? savedTemplate.data?.permissions
        : undefined;
  const accessLoading = (editId !== null && member.data === undefined) || actor.isLoading;
  /** Every field's label, as the form shows it and the save summary names it. */
  const labels: Record<keyof Values, string> = {
    firstName: t('staff_add_edit_firstname'),
    lastName: t('staff_add_edit_lastname'),
    email: t('staff_add_edit_email'),
    phoneNumber: t('staff_add_edit_phonenumber'),
    hourlyRate: t('staff_hourly_rate'),
    defaultLanguage: t('localization_default_language'),
    emailSignature: t('settings_email_signature'),
    facebook: t('staff_add_edit_facebook'),
    linkedin: t('staff_add_edit_linkedin'),
    skype: t('staff_add_edit_skype'),
    roleId: t('staff_add_edit_role'),
    permissions: t('staff_add_edit_permissions'),
    departmentIds: t('staff_add_edit_departments'),
    admin: t('staff_add_edit_administrator'),
    isNotStaff: t('is_not_staff_member'),
    password: t('staff_add_edit_password'),
  };

  async function pickRole(next: string | null): Promise<void> {
    if (next === null) return;
    const template = await fetchRoleTemplate(Number(next));
    if (!template.ok) return;
    setPicked({ roleId: next, codes: template.data.permissions });
    form.setValue('permissions', [...template.data.permissions], { shouldDirty: true });
  }

  /**
   * Re-apply role in ONE click (lead 2026-09-26: less friction, fewer clicks): the picker takes the
   * template and the form is dirty. It has no dialog of its own, because nothing is written yet —
   * the save summary confirms the access change, with the removals listed openly.
   */
  function reapplyRole(): void {
    if (roleTemplate !== undefined) {
      form.setValue('permissions', [...roleTemplate], { shouldDirty: true });
    }
  }

  const languageOptions: ChoiceOption[] | undefined =
    locales.data === undefined
      ? undefined
      : [
          { value: SYSTEM_DEFAULT_LANGUAGE, label: t('system_default_string') },
          ...locales.data.data.map((entry) => ({
            value: entry.legacyLanguage,
            label: ts('language_name', { locale: entry.locale }),
          })),
        ];
  // A language Perfex stored that this deployment does not offer stays selectable as it is.
  const storedLanguage = member.data?.defaultLanguage ?? null;
  if (
    languageOptions !== undefined &&
    storedLanguage !== null &&
    storedLanguage !== '' &&
    !languageOptions.some((option) => option.value === storedLanguage)
  ) {
    languageOptions.push({ value: storedLanguage, label: storedLanguage });
  }

  /** "Sales · Invoices": the module's label and the resource, as the picker shows them. */
  function featureLabel(code: string): string {
    const [module = '', ...resource] = featureOf(code).split('.');
    return t('permission_feature', {
      module: t('permission_module', { module }),
      resource: resourceLabel(resource.join('.')),
    });
  }

  /** "Sales · Invoices · View": one permission, worded the same in every dialog. */
  function permissionLine(code: string): string {
    return t('permission_line', {
      feature: featureLabel(code),
      capability: t(CAPABILITY_KEYS[actionOf(code)] ?? UNKNOWN_CAPABILITY_KEY),
    });
  }

  /** "Adds 5 permissions and removes 1." — the counts of the one diff, a zero half omitted. */
  function permissionSummary(added: number, removed: number): string {
    return tc('permission_changes_summary', {
      added,
      addedN: f.number(added),
      removed,
      removedN: f.number(removed),
    });
  }

  function summaryOf(values: Values): SummaryChange[] {
    const departmentName = new Map(
      (departments.data?.data ?? []).map((d) => [String(d.departmentId), d.name]),
    );
    const languageName = new Map((languageOptions ?? []).map((o) => [o.value, o.label]));
    const roleNames = new Map((roleOptions ?? []).map((o) => [o.value, o.label]));
    const before = member.data === undefined ? null : toStaffMemberForm(member.data);
    return diffMemberForSummary(before, values, form.formState.dirtyFields, {
      mode,
      label: (field) => labels[field],
      roleName: (id) =>
        id === null
          ? noRole
          : (roleNames.get(String(id)) ??
            (id === savedRoleId ? member.data?.roleName : undefined) ??
            noRole),
      languageName: (code) =>
        code === null ? t('system_default_string') : (languageName.get(code) ?? code),
      departmentNames: (ids) =>
        ids.length === 0 ? tc('none') : f.list(ids.map((id) => departmentName.get(id) ?? id)),
      yesNo: (value) => t(value ? 'settings_yes' : 'settings_no'),
      permissionLine,
      t: {
        passwordChanged: t('password_changed'),
        permissionSummary,
        createRole: (role, count) => t('create_summary_role', { role, count, n: f.number(count) }),
      },
    });
  }

  /**
   * A member who changes their OWN role or password is signed out everywhere, refresh cookie
   * included (the api ends every session of the subject on an access change): the save answers 200
   * and the next request would be a 401, so the screen goes to the sign-in page itself, with a full
   * navigation that drops the dead in-memory session.
   */
  function signsActorOut(values: Values): boolean {
    if (editId === null || actor.staffId !== editId) return false;
    const roleChanged = actor.isAdmin && values.roleId !== String(member.data?.roleId ?? '');
    return values.password !== '' || roleChanged;
  }

  /** After a save: the caches from the returned record, the toast, back to the list (D-28, D-36). */
  async function saved(record: StaffMemberDetail, values: Values): Promise<void> {
    form.reset(toStaffMemberForm(record));
    if (signsActorOut(values)) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full navigation on purpose: it drops the in-memory session the api has just ended
      window.location.assign(LOGIN_ROUTE);
      return;
    }
    if (editId === null) {
      // A new member moves totals and positions: the list pages ask again.
      await revalidateLists(IDENTITY_MEMBERS_PATH);
    } else {
      await member.mutate(record, { revalidate: false });
      const row = staffMemberSchema.parse(record);
      await replaceRowInLists(IDENTITY_MEMBERS_PATH, row, (one: StaffMember) => {
        return one.staffId === row.staffId;
      });
    }
    toast.success(t('toast_staff_saved'), { duration: CLIENT_TIMINGS.toast.durationMs });
    router.push(readListReturn(LIST_BASE), { scroll: false });
  }

  /**
   * One save and where its outcome shows (D-29). Success: `saved`. A field problem closes the dialog
   * and shows under each field and in the focused summary. A network or server failure closes the
   * dialog and becomes the form's alert with Retry. Anything else is a refusal and stays inside the
   * dialog (UAT 7). `{ ok: true }` tells the dialog its part is done; the form shows the rest.
   */
  async function send(values: Values): Promise<ConfirmOutcome> {
    lastSent.current = values;
    const outcome =
      editId === null
        ? await create.trigger(toCreateStaffMemberBody(values, actor.isAdmin))
        : await update.trigger(toUpdateStaffMemberBody(values, actor.isAdmin));
    if (outcome.ok) {
      await saved(outcome.data, values);
      return { ok: true };
    }
    if (outcome.code === VALIDATION_CODE) {
      // The api's own `message` is never read; a malformed body shows no field error.
      const issues = validationIssuesSchema.safeParse(outcome.issues);
      flushSync(() => {
        setDialog({ kind: 'none' });
        for (const issue of issues.success ? issues.data : []) {
          const field = issue.path[0];
          if (isStaffMemberField(field)) {
            form.setError(field, { message: STAFF_MESSAGE_KEYS[field] });
          }
        }
      });
      // The summary is SchemaForm's (its test id is in the kit contract): focus moves to it, as
      // after a client-side failure (D-29).
      document
        .getElementById(FORM_ID)
        ?.querySelector<HTMLElement>('[data-testid="error-summary"]')
        ?.focus();
      return { ok: true };
    }
    if (isRetryableCode(outcome.code)) {
      setDialog({ kind: 'none' });
      return { ok: true };
    }
    return outcome;
  }

  // The last failure a Retry can fix is the form's alert; a refusal was shown in the dialog.
  const failure =
    mutation.result !== undefined && !mutation.result.ok && isRetryableCode(mutation.result.code)
      ? mutation.result
      : null;

  const pickerLabels: PermissionPickerLabels = {
    summary: (count, modules) =>
      t('role_grants_summary', {
        role: roleName,
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
    behindRole: (missing, extra) =>
      t('behind_role', {
        name: name ?? '',
        role: roleName,
        missing,
        missingN: f.number(missing),
        extra,
        extraN: f.number(extra),
      }),
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

  const renderRole = (
    field: { value: unknown; onChange: (value: string) => void },
    state: CustomFieldState,
  ): ReactElement => {
    const label = t('staff_add_edit_role');
    if (actor.isAdmin) {
      return (
        <ChoiceField
          id={state.id}
          label={label}
          options={roleOptions}
          multiple={false}
          value={asOne(field.value) ?? NO_ROLE}
          onChange={(next) => {
            const role = next === null || next === NO_ROLE ? '' : next;
            field.onChange(role);
            if (role !== '') void pickRole(role);
          }}
          disabled={state.disabled}
          invalid={state.invalid}
          {...describedByOf(state)}
        />
      );
    }
    // ADR-0034 d.2: the role is shown, never offered — a disabled select holding the current role.
    const current = asOne(field.value);
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={state.id}>
          <LabelText label={label} required={false} />
        </FieldLabel>
        <SearchableSelect
          id={state.id}
          options={current === null ? [] : [{ value: current, label: roleName }]}
          value={current}
          onChange={() => undefined}
          disabled
        />
      </div>
    );
  };

  const renderPermissions = (
    field: { value: unknown; onChange: (value: string[]) => void },
    state: CustomFieldState,
  ): ReactElement => (
    <div className="flex flex-col gap-2">
      <p id={`${state.id}-label`} className="text-sm font-medium">
        {t('staff_add_edit_permissions')}
      </p>
      {admin ? (
        // An administrator stores NO permission rows at all (Perfex's rule, brief §3).
        <p className="text-sm text-muted-foreground">{t('permissions_administrator_note')}</p>
      ) : catalogue.error !== undefined ? (
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
        <PermissionPicker
          // A member with no role has no template to start from: straight into the accordion, as
          // on `/setup/roles/new`; picking a role brings the role-first summary back.
          key={`${actor.isAdmin ? 'grant' : 'review'}-${roleId === '' ? 'none' : 'role'}`}
          id={state.id}
          catalogue={modules}
          value={asList(field.value)}
          onChange={field.onChange}
          // An administrator starts from the role; anyone else reviews the grouped boxes.
          initialMode={actor.isAdmin && roleId !== '' ? 'summary' : 'edit'}
          roleTemplate={actor.isAdmin ? roleTemplate : undefined}
          onReapplyRole={reapplyRole}
          readOnly={!actor.isAdmin || state.disabled}
          labels={pickerLabels}
        />
      )}
    </div>
  );

  const profile: FormSectionSpec<Values> = {
    id: 'profile',
    title: t('staff_profile_string'),
    fields: lockedWhile(detailMissing, [
      { name: 'firstName', label: t('staff_add_edit_firstname'), kind: 'text', required: true },
      { name: 'lastName', label: t('staff_add_edit_lastname'), kind: 'text', required: true },
      { name: 'email', label: t('staff_add_edit_email'), kind: 'email', required: true },
      { name: 'phoneNumber', label: t('staff_add_edit_phonenumber'), kind: 'tel' },
      { name: 'hourlyRate', label: t('staff_hourly_rate'), kind: 'amount' },
      {
        name: 'defaultLanguage',
        label: t('localization_default_language'),
        kind: 'choice',
        options: languageOptions,
        span: 'short',
      },
    ]),
    // Rarely used fields behind ONE disclosure (finding 7), which opens by itself while any of them
    // holds a value or an error, so a stored signature is never hidden without a hint (lead
    // 2026-09-26: the common case fits one viewport).
    disclosure: {
      title: t('more_details'),
      fields: lockedWhile(detailMissing, [
        {
          name: 'emailSignature',
          label: t('settings_email_signature'),
          kind: 'textarea',
          helper: t('staff_email_signature_help'),
        },
        { name: 'facebook', label: t('staff_add_edit_facebook'), kind: 'text' },
        { name: 'linkedin', label: t('staff_add_edit_linkedin'), kind: 'text' },
        { name: 'skype', label: t('staff_add_edit_skype'), kind: 'text' },
      ]),
    },
  };

  const accessFields: FieldSpec<Values>[] = [
    {
      name: 'roleId',
      label: t('staff_add_edit_role'),
      kind: 'custom',
      span: 'short',
      render: (field, state) => renderRole(field, state),
    },
    {
      name: 'permissions',
      label: t('staff_add_edit_permissions'),
      kind: 'custom',
      render: (field, state) => renderPermissions(field, state),
    },
    {
      name: 'departmentIds',
      label: t('staff_add_edit_departments'),
      kind: 'choice',
      multiple: true,
      options: departments.data?.data.map((department) => ({
        value: String(department.departmentId),
        label: department.name,
      })),
    },
    ...(actor.isAdmin
      ? [
          {
            name: 'admin',
            label: t('staff_add_edit_administrator'),
            kind: 'checkbox',
          } as const satisfies FieldSpec<Values>,
        ]
      : []),
    { name: 'isNotStaff', label: t('is_not_staff_member'), kind: 'checkbox' },
    {
      name: 'password',
      label: t('staff_add_edit_password'),
      kind: 'password',
      required: mode === 'create',
      ...(mode === 'edit' ? { helper: t('staff_add_edit_password_note') } : {}),
    },
  ];
  const access: FormSectionSpec<Values> = {
    id: 'access',
    title: t('section_access'),
    fields: lockedWhile(detailMissing, accessFields),
    loading: accessLoading,
    // UAT 12: the refusal stated ONCE, at the top of the section, before the role.
    notice: actor.isAdmin ? undefined : (
      <Alert role="status">
        <AlertDescription className="text-foreground">{t('granting_admin_only')}</AlertDescription>
      </Alert>
    ),
  };
  // Opened from the list, the detail failed retryably: the error where the detail is needed, with
  // Retry (D-31), instead of blocks that would never end; "Back to list" is the save bar's.
  const accessShown: FormSectionSpec<Values> =
    detailFailure === undefined
      ? access
      : {
          ...access,
          loading: false,
          fields: [],
          notice: (
            <InlineError
              message={errorText(detailFailure)}
              busy={member.isValidating}
              onRetry={() => void member.mutate()}
              testId="access-error"
            />
          ),
        };
  const inPerfex: FormSectionSpec<Values> | null =
    editId === null
      ? null
      : {
          id: 'in-perfex',
          title: t('section_in_perfex'),
          fields: [],
          content: (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {LEGACY_MEMBER_TABS.map((tab) => (
                <li key={tab.id}>
                  <a
                    href={legacyMemberUrl(editId)}
                    className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    {t(tab.labelKey)}
                    <Icon name="external-link" className="size-3" />
                    <span className="sr-only">{t(tab.noteKey)}</span>
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={LEGACY_STAFF_LIST}
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  {t('delete_on_legacy')}
                  <Icon name="external-link" className="size-3" />
                </a>
              </li>
            </ul>
          ),
        };

  const noun = t('noun_staff_member');
  const submitLabel = tc(mode === 'create' ? 'create_noun' : 'save_noun', { noun });
  const pendingLabel = tc(mode === 'create' ? 'creating_noun' : 'saving_noun', { noun });
  const summaryName =
    dialog.kind === 'summary' ? `${dialog.values.firstName} ${dialog.values.lastName}` : '';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{name ?? t('new_staff')}</h1>
        {editId === null ? null : active ? (
          <StatusBadge status="active" label={t('staff_dt_active')} />
        ) : (
          <StatusBadge status="inactive" label={t('inactive')} />
        )}
      </div>
      <SchemaForm
        id={FORM_ID}
        form={form}
        sections={inPerfex === null ? [profile, accessShown] : [profile, accessShown, inPerfex]}
        onValid={(values) => {
          // Defence in depth (T-1e2-02): the fields are locked, but a save built from the row alone
          // would send empty permissions and departments.
          if (detailMissing) return;
          setDialog({ kind: 'summary', values, changes: summaryOf(values) });
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
      <ConfirmDialog
        kind="summary"
        open={dialog.kind === 'summary'}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: 'none' });
        }}
        title={
          editId === null
            ? tc('create_summary_title', { noun, name: summaryName })
            : tc('save_summary_title', { name: name ?? summaryName })
        }
        changes={dialog.kind === 'summary' ? dialog.changes : []}
        dismissLabel={copy.backToForm}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        featureErrors={STAFF_ERROR_CODES}
        onConfirm={() => (dialog.kind === 'summary' ? send(dialog.values) : { ok: true })}
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
export const GuardedStaffMemberForm = withAuth(
  withPermission(StaffMemberForm, { skeleton: 'form' }),
  { skeleton: 'form' },
);
