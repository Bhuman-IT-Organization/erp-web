import { z } from 'zod';
import type { PermissionModule } from '@/components/organisms/PermissionPicker';

/**
 * The wire mirrors of `erp-api src/v1/identity/dto/identity.dto.ts` (plans 03.1-11 and 03.1-12),
 * plus the two form shapes and the two pure transforms the member form needs. Every zod message is
 * a message KEY under the `staff` namespace, never text (FE-19): this module stays free of React
 * and of any locale, and the form resolves the key through `t(...)` before rendering it.
 *
 * `staffMemberSchema` is the LIST row (`GET /api/v1/identity/members`) — the schema the resource
 * hooks parse every page with — and `staffMemberDetailSchema` is the single member
 * (`GET …/members/:id`), which carries the profile, the departments and the permission set. They
 * are two schemas on purpose: parsing a list page with the detail schema would fail on every row.
 *
 * Nothing here knows a clean permission name: the catalogue arrives from the api and the member's
 * codes arrive with the member (ADR-0033 d.6, D-12 — a permission literal in a feature file is a
 * lint error, `S_PERMISSION_LITERAL`).
 */

/** Mirrors `createMemberBodySchema`'s `password` bounds (erp-api `PASSWORD_MIN`). */
export const PASSWORD_MIN = 8;

/** The fields whose validation copy travels as a key; indexed by the form field name for `setError`. */
export const STAFF_MESSAGE_KEYS = {
  firstName: 'enter_firstname',
  lastName: 'enter_lastname',
  email: 'enter_valid_email',
  password: 'enter_password',
  hourlyRate: 'enter_valid_hourly_rate',
} as const;

/** The same, for the role form's one validated field. A zod message is a KEY, never text (FE-19). */
export const ROLE_MESSAGE_KEYS = {
  name: 'enter_role_name',
} as const;

/** The fields a role save's 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const ROLE_FIELDS = ['name'] as const;
export type RoleField = (typeof ROLE_FIELDS)[number];

export function isRoleField(value: unknown): value is RoleField {
  return (ROLE_FIELDS as readonly unknown[]).includes(value);
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`), in the api's spelling. */
export const STAFF_MEMBER_FIELDS = ['firstName', 'lastName', 'email', 'password'] as const;
export type StaffMemberField = (typeof STAFF_MEMBER_FIELDS)[number];

export function isStaffMemberField(value: unknown): value is StaffMemberField {
  return (STAFF_MEMBER_FIELDS as readonly unknown[]).includes(value);
}

// --- wire mirrors ------------------------------------------------------------------------------

/** One row of `GET /api/v1/identity/members` (`memberListRowSchema`). */
export const staffMemberSchema = z.object({
  staffId: z.number().int(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phoneNumber: z.string().nullable(),
  isAdmin: z.boolean(),
  roleId: z.number().int().nullable(),
  /**
   * The Role column's text, on the row. It is NOT joined from `GET /api/v1/identity/roles`: that
   * list is administrator-only, so a join left the column blank for every non-administrator while
   * `tables/staff.php` shows the name to anyone who may view staff. `null` means "no role".
   */
  roleName: z.string().nullable(),
  active: z.boolean(),
  dateCreated: z.string(),
  /**
   * The photo (D-23): the 96 px `small_` copy for the 40 px thumbnail and the 320 px `thumb_` copy
   * for the preview, both same-origin paths the api built behind its file-name guard, or `null`
   * together; never the original upload. `lastLogin` is an ISO timestamp, `null` for never. Each
   * DEFAULTS to `null`, so a web deployed before the api still parses the rows (deploy-order safe).
   */
  profileImageUrl: z.string().nullable().default(null),
  profileImagePreviewUrl: z.string().nullable().default(null),
  lastLogin: z.string().nullable().default(null),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

/** `GET /api/v1/identity/members/:id` (`memberResponseSchema`). */
export const staffMemberDetailSchema = z.object({
  staffId: z.number().int(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phoneNumber: z.string().nullable(),
  facebook: z.string().nullable(),
  linkedin: z.string().nullable(),
  skype: z.string().nullable(),
  hourlyRate: z.number(),
  defaultLanguage: z.string().nullable(),
  emailSignature: z.string().nullable(),
  mediaPathSlug: z.string().nullable(),
  dateCreated: z.string(),
  /** ISO timestamp or `null`: carried so a saved record can replace its list row (D-36). */
  lastLogin: z.string().nullable().default(null),
  isAdmin: z.boolean(),
  roleId: z.number().int().nullable(),
  roleName: z.string().nullable(),
  active: z.boolean(),
  isNotStaff: z.boolean(),
  departmentIds: z.array(z.number().int()),
  permissions: z.array(z.string()),
  /** The photo, as on the list row (defaults to `null`: deploy-order safe). */
  profileImageUrl: z.string().nullable().default(null),
  profileImagePreviewUrl: z.string().nullable().default(null),
});
export type StaffMemberDetail = z.infer<typeof staffMemberDetailSchema>;

/**
 * The actor's own identity (`GET /api/v1/auth/me`). The administrator flag is read from HERE and
 * never from a permission code: ADR-0034 decision 2 makes granting admin-only precisely because a
 * code can be handed out by the mechanism it protects.
 *
 * The field list is deliberately the same as `src/lib/auth/use-permissions.ts`'s `meSchema`: both
 * hooks share one SWR key (`/api/v1/auth/me`), so whichever fetches first fills the cache for the
 * other, and a narrower schema here would strip `permissions` from the object the menu reads. The
 * schema test pins the two together by assigning a parse result to the exported `Me` type.
 */
export const actorSchema = z.object({
  staffId: z.number().int(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isAdmin: z.boolean(),
  roleId: z.number().int().nullable(),
  permissions: z.array(z.string()),
  locale: z.string().nullable(),
  /** The deployment's switched-off modules (ADR-0042); kept so the menu still reads them. */
  disabledModules: z.array(z.string()).default([]),
});
export type Actor = z.infer<typeof actorSchema>;

/** One row of `GET /api/v1/identity/permissions/catalogue`'s `data` (module → resources → actions). */
export const permissionCatalogueSchema = z.object({
  data: z.array(
    z.object({
      module: z.string(),
      resources: z.array(
        z.object({
          resource: z.string(),
          actions: z.array(z.object({ action: z.string(), code: z.string() })),
        }),
      ),
    }),
  ),
  meta: z.object({ total: z.number().int().nonnegative() }),
});
export type PermissionCatalogue = z.infer<typeof permissionCatalogueSchema>;

/**
 * `GET /api/v1/identity/locales`: what the language select may offer. `legacyLanguage` is the value
 * `tblstaff.default_language` stores; "System Default" is the web's own option (no row here).
 */
export const localeListSchema = z.object({
  data: z.array(z.object({ locale: z.string(), legacyLanguage: z.string() })),
  meta: z.object({ total: z.number().int().nonnegative() }),
});
export type LocaleList = z.infer<typeof localeListSchema>;

/** One row of `GET /api/v1/identity/departments` — the picker's two columns. */
export const departmentSchema = z.object({
  departmentId: z.number().int(),
  name: z.string(),
});
export type Department = z.infer<typeof departmentSchema>;

export const departmentListSchema = z.object({
  data: z.array(departmentSchema),
  meta: z.object({ total: z.number().int().nonnegative() }),
});
export type DepartmentList = z.infer<typeof departmentListSchema>;

/** One row of `GET /api/v1/identity/roles` — the select's options and the list's role column. */
export const roleOptionSchema = z.object({
  roleId: z.number().int(),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
});
export type RoleOption = z.infer<typeof roleOptionSchema>;

/**
 * The roles LIST row, which is the same wire row as the member form's select option: `GET
 * /api/v1/identity/roles` answers one shape and both screens read it. It is exported under the name
 * plan 03.1-08's `<interfaces>` block uses rather than copied, so there is one schema to keep in
 * step with `roleListRowSchema` in the api's DTO.
 */
export const staffRoleSchema = roleOptionSchema;
export type StaffRole = RoleOption;

export const roleListSchema = z.object({
  data: z.array(roleOptionSchema),
  meta: z.object({ nextCursor: z.string().nullable() }),
});
export type RoleList = z.infer<typeof roleListSchema>;

/** One member of a role in `GET /api/v1/identity/roles/:id` — the members panel's single column. */
export const roleMemberSchema = z.object({
  staffId: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  active: z.boolean(),
});
export type RoleMember = z.infer<typeof roleMemberSchema>;

/**
 * `GET /api/v1/identity/roles/:id` as the ROLE FORM reads it: the template plus the members holding
 * it. `roleTemplateSchema` above is the same endpoint as the MEMBER form reads it — a narrower
 * mirror that drops the members, because the role select only needs the codes to pre-tick. Two
 * schemas over one endpoint, for the same reason `staffMemberSchema` and `staffMemberDetailSchema`
 * are two: each screen parses what it renders, and a zod object strips what it does not declare.
 */
export const staffRoleDetailSchema = z.object({
  roleId: z.number().int(),
  name: z.string(),
  permissions: z.array(z.string()),
  members: z.array(roleMemberSchema),
  memberCount: z.number().int().nonnegative(),
});
export type StaffRoleDetail = z.infer<typeof staffRoleDetailSchema>;

/**
 * `GET /api/v1/identity/roles/:id` — the role's template in clean names. The member form reads it
 * when the role select changes, which is what Perfex's `/admin/staff/role_changed` AJAX did; the
 * Perfex path is never called from here (brief §3, plan 03.1-11 guarded this endpoint for it).
 */
export const roleTemplateSchema = z.object({
  roleId: z.number().int(),
  name: z.string(),
  permissions: z.array(z.string()),
});
export type RoleTemplate = z.infer<typeof roleTemplateSchema>;

/** The BE-19 list query the staff list sends: free-text `q`, `limit`, `cursor`. Never `page`/`size`. */
export const staffListParamsSchema = z.object({
  q: z.string().optional(),
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional(),
});
export type StaffListParams = z.infer<typeof staffListParamsSchema>;

/**
 * The `issues` array a 400 `ERP-VALIDATION-0001` carries. Parsed BEFORE any field error is set: a
 * body that does not parse yields the form-level line only, and the api's `message` is never
 * rendered (T-3.1-62).
 */
export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);

// --- write bodies (mirrors of the api's strict bodies) ------------------------------------------

const optionalText = z.string().nullable().optional();

const bodyProfileFields = {
  phoneNumber: optionalText,
  facebook: optionalText,
  linkedin: optionalText,
  skype: optionalText,
  hourlyRate: z.number().nonnegative().optional(),
  defaultLanguage: optionalText,
  emailSignature: optionalText,
  isNotStaff: z.boolean().optional(),
  departmentIds: z.array(z.number().int().positive()).optional(),
} as const;

/**
 * The three granting fields (ADR-0034 d.2). They are OPTIONAL here and the form omits all three
 * for an actor without the administrator flag, so a non-admin's save can never carry one — the api
 * refuses it with 403 `ERP-IDENTITY-0001` and a request that would 403 must never be offered.
 */
const bodyGrantingFields = {
  roleId: z.number().int().positive().nullable().optional(),
  permissions: z.array(z.string()).optional(),
  admin: z.boolean().optional(),
} as const;

/** Mirrors `createMemberBodySchema`. The api's body is strict: an unknown key is a 400. */
export const createStaffMemberSchema = z.object({
  email: z.email(STAFF_MESSAGE_KEYS.email),
  firstName: z.string().min(1, STAFF_MESSAGE_KEYS.firstName),
  lastName: z.string().min(1, STAFF_MESSAGE_KEYS.lastName),
  password: z.string().min(PASSWORD_MIN, STAFF_MESSAGE_KEYS.password),
  ...bodyProfileFields,
  ...bodyGrantingFields,
});
export type CreateStaffMemberInput = z.infer<typeof createStaffMemberSchema>;

/** Mirrors `updateMemberBodySchema`; an absent `password` means "unchanged" (brief §3). */
export const updateStaffMemberSchema = z.object({
  email: z.email(STAFF_MESSAGE_KEYS.email).optional(),
  firstName: z.string().min(1, STAFF_MESSAGE_KEYS.firstName).optional(),
  lastName: z.string().min(1, STAFF_MESSAGE_KEYS.lastName).optional(),
  password: z.string().min(PASSWORD_MIN, STAFF_MESSAGE_KEYS.password).optional(),
  ...bodyProfileFields,
  ...bodyGrantingFields,
});
export type UpdateStaffMemberInput = z.infer<typeof updateStaffMemberSchema>;

/** `PATCH /api/v1/identity/members/:id/status` — 204, no body in the response. */
export const staffMemberStatusSchema = z.object({ active: z.boolean() });
export type StaffMemberStatusInput = z.infer<typeof staffMemberStatusSchema>;

/** Mirrors the api's `createRoleBodySchema` (strict: an unknown key is a 400). */
export const createStaffRoleSchema = z.object({
  name: z.string().min(1, ROLE_MESSAGE_KEYS.name),
  permissions: z.array(z.string()),
});
export type CreateStaffRoleInput = z.infer<typeof createStaffRoleSchema>;

/**
 * Mirrors the api's `updateRoleBodySchema`. `applyToMembers` is Perfex's
 * `update_staff_permissions` checkbox: the api replaces every holder's permission rows in the same
 * transaction as the role write, and publishes one `identity.permissions.replaced` per member.
 */
export const updateStaffRoleSchema = z.object({
  name: z.string().min(1, ROLE_MESSAGE_KEYS.name).optional(),
  permissions: z.array(z.string()).optional(),
  applyToMembers: z.boolean().optional(),
});
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleSchema>;

// --- the form's own shape ----------------------------------------------------------------------

/**
 * What the CONTROLS hold, which is not what the wire takes: a `<select>` value is a string and the
 * empty string is its "nothing selected" option, a number input is a number, and the permission
 * set is a flat array of clean names. `toStaffMemberBody` is the one translation to the wire.
 */
/** A non-negative decimal, or nothing (an empty hourly rate is 0, as in Perfex). */
const DECIMAL = /^(\d+(\.\d+)?)?$/;

/**
 * The "System Default" option of the language select. A choice control cannot hold `''` (it reads
 * as "nothing selected"), so the form holds this token and the body sends `null`, which is what
 * Perfex stores for the system default. No Perfex language pack is named with a dot.
 */
export const SYSTEM_DEFAULT_LANGUAGE = '.system';

export const staffMemberFormSchema = z.object({
  firstName: z.string().trim().min(1, STAFF_MESSAGE_KEYS.firstName),
  lastName: z.string().trim().min(1, STAFF_MESSAGE_KEYS.lastName),
  email: z.email(STAFF_MESSAGE_KEYS.email),
  phoneNumber: z.string(),
  /** An amount box holds text; the body sends the number (an empty box is 0). */
  hourlyRate: z.string().trim().regex(DECIMAL, STAFF_MESSAGE_KEYS.hourlyRate),
  facebook: z.string(),
  linkedin: z.string(),
  skype: z.string(),
  /** A pack name (`english`), or `SYSTEM_DEFAULT_LANGUAGE` for Perfex's "System Default". */
  defaultLanguage: z.string(),
  emailSignature: z.string(),
  roleId: z.string(),
  /** The choice controls hold strings (a department id as text); the body sends numbers. */
  departmentIds: z.array(z.string()),
  admin: z.boolean(),
  isNotStaff: z.boolean(),
  permissions: z.array(z.string()),
  /** Create: required. Edit: the empty string means "unchanged" (the legacy note keys say so). */
  password: z.string(),
});
export type StaffMemberFormValues = z.infer<typeof staffMemberFormSchema>;

/** The create resolver: the same shape with the password required at the api's own minimum. */
export const createStaffMemberFormSchema = staffMemberFormSchema.extend({
  password: z.string().min(PASSWORD_MIN, STAFF_MESSAGE_KEYS.password),
});

/** The edit resolver: an empty password is "unchanged"; anything shorter than the minimum is not. */
export const updateStaffMemberFormSchema = staffMemberFormSchema.extend({
  password: z
    .string()
    .refine((value) => value === '' || value.length >= PASSWORD_MIN, STAFF_MESSAGE_KEYS.password),
});

/** The empty form: the create screen's defaults, and the shape `reset()` restores. */
export const EMPTY_STAFF_MEMBER_FORM: StaffMemberFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  hourlyRate: '',
  facebook: '',
  linkedin: '',
  skype: '',
  defaultLanguage: SYSTEM_DEFAULT_LANGUAGE,
  emailSignature: '',
  roleId: '',
  departmentIds: [],
  admin: false,
  isNotStaff: false,
  permissions: [],
  password: '',
};

/** A loaded member as form values; the password box always starts empty (it is never read back). */
export function toStaffMemberForm(member: StaffMemberDetail): StaffMemberFormValues {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phoneNumber: member.phoneNumber ?? '',
    hourlyRate: String(member.hourlyRate),
    facebook: member.facebook ?? '',
    linkedin: member.linkedin ?? '',
    skype: member.skype ?? '',
    defaultLanguage:
      member.defaultLanguage === null || member.defaultLanguage === ''
        ? SYSTEM_DEFAULT_LANGUAGE
        : member.defaultLanguage,
    emailSignature: member.emailSignature ?? '',
    roleId: member.roleId === null ? '' : String(member.roleId),
    departmentIds: member.departmentIds.map(String),
    admin: member.isAdmin,
    isNotStaff: member.isNotStaff,
    permissions: member.permissions,
    password: '',
  };
}

const emptyToNull = (value: string): string | null => (value === '' ? null : value);

/**
 * The profile half of the body: `''` becomes `null` for every nullable column, because the legacy
 * form's empty box means "no value" rather than "the empty string".
 */
function profileOf(values: StaffMemberFormValues) {
  return {
    email: values.email,
    firstName: values.firstName,
    lastName: values.lastName,
    phoneNumber: emptyToNull(values.phoneNumber),
    facebook: emptyToNull(values.facebook),
    linkedin: emptyToNull(values.linkedin),
    skype: emptyToNull(values.skype),
    hourlyRate: Number(values.hourlyRate),
    defaultLanguage:
      values.defaultLanguage === SYSTEM_DEFAULT_LANGUAGE
        ? null
        : emptyToNull(values.defaultLanguage),
    emailSignature: emptyToNull(values.emailSignature),
    isNotStaff: values.isNotStaff,
    departmentIds: values.departmentIds.map(Number),
  };
}

/**
 * The three granting fields, or NOTHING AT ALL. `actorIsAdmin` is the actor's `tblstaff.admin`
 * flag from the session's `/api/v1/auth/me` (never a permission code): when it is false the body
 * carries no `roleId`, no `permissions` and no `admin`, so the request the api would refuse with
 * 403 `ERP-IDENTITY-0001` is never sent and no control that 403s is ever offered (ADR-0034 d.2,
 * T-3.1-60B).
 */
function grantingOf(values: StaffMemberFormValues, actorIsAdmin: boolean) {
  if (!actorIsAdmin) return {};
  return {
    roleId: values.roleId === '' ? null : Number(values.roleId),
    // An administrator stores no permission rows at all (Perfex's own rule, brief §3).
    permissions: values.admin ? [] : values.permissions,
    admin: values.admin,
  };
}

/**
 * The create body: profile, departments and permissions in ONE request (brief §9.1 — one
 * transaction, which Perfex never had). The password is always sent; the api's own minimum applies.
 */
export function toCreateStaffMemberBody(
  values: StaffMemberFormValues,
  actorIsAdmin: boolean,
): CreateStaffMemberInput {
  return {
    ...profileOf(values),
    ...grantingOf(values, actorIsAdmin),
    password: values.password,
  };
}

/** The edit body: an empty password box is omitted, so the api leaves `tblstaff.password` alone. */
export function toUpdateStaffMemberBody(
  values: StaffMemberFormValues,
  actorIsAdmin: boolean,
): UpdateStaffMemberInput {
  return {
    ...profileOf(values),
    ...grantingOf(values, actorIsAdmin),
    ...(values.password === '' ? {} : { password: values.password }),
  };
}

// --- permission codes -------------------------------------------------------------------------

/** The feature key of a clean name: `sales.invoices.view` → `sales.invoices`. */
export function featureOf(code: string): string {
  return code.split('.').slice(0, -1).join('.');
}

/** The action of a clean name: `sales.invoices.view` → `view`. */
export function actionOf(code: string): string {
  return code.split('.').at(-1) ?? '';
}

/**
 * The message key of each normalised action (ADR-0033 decision 1). Anything else reads "Other":
 * a new action the catalogue grows is shown, never dropped.
 */
export const CAPABILITY_KEYS: Readonly<Record<string, string>> = {
  view: 'permission_view',
  viewOwn: 'permission_view_own',
  create: 'permission_create',
  edit: 'permission_edit',
  delete: 'permission_delete',
  editOwn: 'permission_edit_own',
  deleteOwn: 'permission_delete_own',
  assign: 'permission_assign',
  approve: 'permission_approve',
};
export const UNKNOWN_CAPABILITY_KEY = 'permission_unknown_capability';

/** Words the catalogue spells in camelCase that read as acronyms. */
const RESOURCE_ACRONYMS: Readonly<Record<string, string>> = { kpi: 'KPI', pdf: 'PDF' };

/**
 * Resources whose identifier cannot be humanised into a readable name (lead 2026-09-27): `faf` is
 * Perfex's own "FAF Request" (`modules/purchase/language/english/purchase_lang.php`
 * `pur_faf_requests`), `orgchart` is two words run together.
 */
const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  faf: 'FAF Request',
  orgchart: 'Org chart',
};

/**
 * The api's resource identifier as a readable name (lead 2026-09-27: never the camelCase key):
 * camelCase split into sentence case, an all-caps run kept (`manageQA` → "Manage QA"), the two
 * acronyms above upper-cased (`bonusKpi` → "Bonus KPI"); the few in `RESOURCE_LABELS` are named
 * explicitly. Perfex's own per-feature labels (and any
 * Arabic) are a later data task: README § Dropped on purpose.
 */
export function resourceLabel(resource: string): string {
  const explicit = RESOURCE_LABELS[resource];
  if (explicit !== undefined) return explicit;
  const text = resource
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      const kept = word.length > 1 && word === word.toUpperCase() ? word : lower;
      return RESOURCE_ACRONYMS[lower] ?? kept;
    })
    .join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The catalogue as `PermissionPicker` takes it (plan 11's mapping): a module per catalogue branch, a
 * feature per resource (`module.resource`, named by `resourceLabel`; Perfex's per-feature labels
 * are a README drop), a capability per action with its clean CODE, its action id (the picker's
 * column) and the action's label. `labels.module` names a module; `labels.capability` resolves a message key.
 */
export function toPermissionModules(
  catalogue: PermissionCatalogue,
  labels: {
    readonly module: (id: string) => string;
    readonly capability: (messageKey: string) => string;
  },
): PermissionModule[] {
  return catalogue.data.map((branch) => ({
    id: branch.module,
    label: labels.module(branch.module),
    features: branch.resources.map((resource) => ({
      id: `${branch.module}.${resource.resource}`,
      label: resourceLabel(resource.resource),
      capabilities: resource.actions.map((action) => ({
        code: action.code,
        action: action.action,
        label: labels.capability(CAPABILITY_KEYS[action.action] ?? UNKNOWN_CAPABILITY_KEY),
      })),
    })),
  }));
}

// --- the role form's own shape -----------------------------------------------------------------

/**
 * What the role form's CONTROLS hold. `applyToMembers` is the legacy `update_staff_permissions`
 * checkbox and is **unticked by default**: re-applying a template rewrites other people's access, so
 * it is opt-in (T-3.1-70). The permission set is a flat array of clean names, exactly as the member
 * form holds it, and `PermissionPicker` edits it on both screens.
 */
export const roleFormSchema = z.object({
  name: z.string().trim().min(1, ROLE_MESSAGE_KEYS.name),
  permissions: z.array(z.string()),
  applyToMembers: z.boolean(),
});
export type RoleFormValues = z.infer<typeof roleFormSchema>;

/** The empty form: the create screen's defaults, and the shape `reset()` restores. */
export const EMPTY_ROLE_FORM: RoleFormValues = {
  name: '',
  permissions: [],
  applyToMembers: false,
};

/** A loaded role as form values; the checkbox always starts unticked, whatever the last save sent. */
export function toRoleForm(role: StaffRoleDetail): RoleFormValues {
  return { name: role.name, permissions: role.permissions, applyToMembers: false };
}

/** The create body: a name and a template, which is all `POST /api/v1/identity/roles` takes. */
export function toCreateStaffRoleBody(values: RoleFormValues): CreateStaffRoleInput {
  return { name: values.name, permissions: values.permissions };
}

/**
 * The update body. `applyToMembers` always travels as a boolean rather than being omitted when
 * false: the api's body is strict either way, and an explicit `false` is what says "leave the
 * members' own rows alone" — which is the legacy's unticked checkbox, not the absence of an opinion.
 */
export function toUpdateStaffRoleBody(values: RoleFormValues): UpdateStaffRoleInput {
  return {
    name: values.name,
    permissions: values.permissions,
    applyToMembers: values.applyToMembers,
  };
}
