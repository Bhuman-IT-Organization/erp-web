import {
  IDENTITY_CATALOGUE_PATH,
  IDENTITY_DEPARTMENTS_PATH,
  IDENTITY_LOCALES_PATH,
  IDENTITY_ROLES_PATH,
  rolePath,
} from '@/features/staff/api/staff.endpoints';
import {
  departmentListSchema,
  localeListSchema,
  permissionCatalogueSchema,
  roleListSchema,
  roleTemplateSchema,
  type DepartmentList,
  type LocaleList,
  type PermissionCatalogue,
  type RoleList,
  type RoleTemplate,
} from '@/features/staff/schemas/staff.schema';
import { useCommonApi, type CommonApiResult } from '@/lib/api/use-common-api';

/**
 * The three read-only lookups the staff screens render: the permission catalogue (the grid's
 * rows), the departments picker and the roles the select offers. Plan 03.1-08's roles screens read
 * the catalogue through the same hook.
 *
 * None of them is paged from the database: the catalogue and the picker answer
 * `{ data, meta: { total } }` and the roles list answers BE-19's envelope with a cursor this
 * screen does not follow — a role select showing the first page of roles is the legacy behaviour
 * (Perfex renders every role into the `<select>`), so the limit is deliberately generous.
 */

/** Every role fits one page: Perfex renders the whole list into the select (21 rows today). */
const ROLE_PAGE_SIZE = 200;

export function usePermissionCatalogue(): CommonApiResult<PermissionCatalogue> {
  return useCommonApi(IDENTITY_CATALOGUE_PATH, permissionCatalogueSchema);
}

export function useDepartments(): CommonApiResult<DepartmentList> {
  return useCommonApi(IDENTITY_DEPARTMENTS_PATH, departmentListSchema);
}

/** The language select's options (`GET identity/locales`); the web adds "System Default". */
export function useLocales(): CommonApiResult<LocaleList> {
  return useCommonApi(IDENTITY_LOCALES_PATH, localeListSchema);
}

/**
 * The selected role's template (`GET identity/roles/:id`, administrator-only like the select), for
 * the picker's "behind the role" line and "Reset to role". `null` → no request: no role, or an
 * actor who may not read it.
 */
export function useRoleTemplate(roleId: number | null): CommonApiResult<RoleTemplate> {
  return useCommonApi(roleId === null ? null : rolePath(roleId), roleTemplateSchema);
}

/**
 * The roles, or nothing at all — the member form's select, and nothing else. The form passes
 * `enabled = false` for an actor without the administrator flag: only an administrator may change a
 * role (ADR-0034 d.2), and `GET /api/v1/identity/roles` is itself administrator-only, so a non-admin
 * is shown the member's own `roleName` as text and no request is made for options they could not
 * apply and would be refused anyway. The staff LIST is not a caller: its Role column reads the
 * `roleName` the api puts on every row rather than joining a list it may not read.
 */
export function useRoleOptions(enabled: boolean): CommonApiResult<RoleList> {
  return useCommonApi(enabled ? IDENTITY_ROLES_PATH : null, roleListSchema, {
    limit: ROLE_PAGE_SIZE,
  });
}
