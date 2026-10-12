import { callApi, type ApiAdapter, type ApiPath, type ApiResult } from '@/lib/api/call-api';
import { createResourceHooks } from '@/lib/api/create-resource-hooks';
import type { FeatureErrorCodes } from '@/lib/errors/error-messages';
import {
  roleTemplateSchema,
  staffMemberSchema,
  staffRoleSchema,
  type CreateStaffMemberInput,
  type CreateStaffRoleInput,
  type RoleTemplate,
  type StaffMember,
  type StaffRole,
  type UpdateStaffMemberInput,
  type UpdateStaffRoleInput,
} from '@/features/staff/schemas/staff.schema';

/**
 * The wire contract of `erp-api src/v1/identity` (plans 03.1-11 and 03.1-12) for all four screens
 * of W1-06 — the two staff screens and the two roles screens, which share these paths, the error
 * codes and the message namespace.
 *
 * Reads go through `useCommonApi`/`useList` (retried by the SWR policy, ADR-0031 §5), writes
 * through `useCommonMutation` (NEVER retried; the only retry is the member's own click). The one
 * `callApi` here is `fetchRoleTemplate`: it is fired from the role select's change handler, not
 * from a hook, because a request in an effect is FE-04's whole subject — and `api/*.ts` is the
 * layer allowed to call the transport (the auth feature's endpoints set the precedent).
 *
 * Paths are relative, so every request goes to the Nginx origin the page was served from.
 */
export const IDENTITY_MEMBERS_PATH = '/api/v1/identity/members' as const satisfies ApiPath;
/** The CSV of every member matching the list's search and sort (plan 03.2-05, D-26). */
export const IDENTITY_MEMBERS_EXPORT_PATH =
  '/api/v1/identity/members/export' as const satisfies ApiPath;
/**
 * The export's columns, in erp-api's `MEMBER_EXPORT_COLUMNS` order: the list sends one translated
 * header label per column, in this order, or the api answers 400 on `header` (D-42).
 */
export const MEMBER_EXPORT_COLUMNS = [
  'staffId',
  'firstName',
  'lastName',
  'email',
  'roleName',
  'active',
  'lastLogin',
] as const;
/** The roles screens' resource, and the member form's role select and list role column. */
export const IDENTITY_ROLES_PATH = '/api/v1/identity/roles' as const satisfies ApiPath;
/** The CSV of every role matching the list's search and sort (plan 03.2-05, D-26). */
export const IDENTITY_ROLES_EXPORT_PATH =
  '/api/v1/identity/roles/export' as const satisfies ApiPath;
/** erp-api's `ROLE_EXPORT_COLUMNS`, in its order: one translated header label per column (D-42). */
export const ROLE_EXPORT_COLUMNS = ['roleId', 'name', 'memberCount'] as const;
export const IDENTITY_CATALOGUE_PATH =
  '/api/v1/identity/permissions/catalogue' as const satisfies ApiPath;
export const IDENTITY_DEPARTMENTS_PATH = '/api/v1/identity/departments' as const satisfies ApiPath;
/** The language select's options: the locales this deployment ships messages for. */
export const IDENTITY_LOCALES_PATH = '/api/v1/identity/locales' as const satisfies ApiPath;

/** `GET /api/v1/auth/me` — the actor's own row, the ONLY source of the administrator flag (ADR-0034 d.2). */
export const AUTH_ME_PATH = '/api/v1/auth/me' as const satisfies ApiPath;

export const staffMemberHooks = createResourceHooks<
  StaffMember,
  CreateStaffMemberInput,
  UpdateStaffMemberInput
>(IDENTITY_MEMBERS_PATH, staffMemberSchema);

/**
 * The roles resource: list, create, update and the DELETE the confirmation dialog triggers. The
 * factory's five hooks are exactly what the two roles screens need, so there is no `callApi` here —
 * `useRemove` already answers 204 with `expectNoContent` and invalidates the list by prefix.
 */
export const staffRoleHooks = createResourceHooks<
  StaffRole,
  CreateStaffRoleInput,
  UpdateStaffRoleInput
>(IDENTITY_ROLES_PATH, staffRoleSchema);

/** The path of one member, and of its status sub-resource (`PATCH …/status`, 204). */
export const memberPath = (id: number): ApiPath => `${IDENTITY_MEMBERS_PATH}/${String(id)}`;
export const memberStatusPath = (id: number): ApiPath => `${memberPath(id)}/status`;
export const rolePath = (id: number): ApiPath => `${IDENTITY_ROLES_PATH}/${String(id)}`;

/** The 400 whose problem body carries `issues` the form maps onto its fields. */
export const VALIDATION_CODE = 'ERP-VALIDATION-0001';

/**
 * The identity module's own codes, each with a `staff.errors.<code>` message, for `useErrorText`
 * and `ConfirmDialog`'s `featureErrors` (FE-13, D-32). The shared transport, auth and validation
 * codes resolve through `common.errors`, never here.
 */
export const STAFF_ERROR_CODES: FeatureErrorCodes = {
  namespace: 'staff',
  codes: [
    'ERP-IDENTITY-0001',
    'ERP-IDENTITY-0002',
    'ERP-IDENTITY-0003',
    'ERP-IDENTITY-0004',
    'ERP-IDENTITY-0005',
    'ERP-IDENTITY-0006',
    'ERP-IDENTITY-0007',
    'ERP-IDENTITY-0008',
    'ERP-IDENTITY-0009',
  ],
};

/**
 * The role's permission template, read when the role select changes so the grid can pre-tick it —
 * Perfex did this with `GET /admin/staff/role_changed`, which Node never calls (brief §3).
 *
 * The endpoint is **administrator-only** since the migration-lead decision of 2026-09-24
 * (`ROUTE_GATES['/setup/roles/:id'] === 'admin'`), and that is exactly who sees a role select: only an
 * administrator may change a role (ADR-0034 d.2), so the member form renders the role as text for
 * everyone else and this call is never made for them. Never throws; `adapter` is a test seam only.
 */
export function fetchRoleTemplate(
  roleId: number,
  adapter?: ApiAdapter,
): Promise<ApiResult<RoleTemplate>> {
  return callApi(rolePath(roleId), {
    schema: roleTemplateSchema,
    ...(adapter ? { adapter } : {}),
  });
}
