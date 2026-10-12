import type { SummaryChange } from '@/components/organisms/ConfirmDialog';
import { permissionSetDiff } from '@/components/organisms/PermissionPicker';
import type { RoleFormValues, StaffMemberFormValues } from './staff.schema';

/** A field of the member form, by its form name. */
export type StaffMemberFormField = keyof StaffMemberFormValues;

/** Every word the summary needs, already translated by the screen (this module is pure). */
export interface MemberSummaryContext {
  readonly mode: 'create' | 'edit';
  /** The form's own label for a field. */
  readonly label: (field: StaffMemberFormField) => string;
  readonly roleName: (roleId: number | null) => string;
  readonly languageName: (code: string | null) => string;
  readonly departmentNames: (ids: readonly string[]) => string;
  /** Legacy `settings_yes` / `settings_no`. */
  readonly yesNo: (value: boolean) => string;
  /** "{feature} · {capability}", one line per code; the dialog groups them as Removed / added. */
  readonly permissionLine: (code: string) => string;
  readonly t: {
    readonly passwordChanged: string;
    /** "Adds 5 permissions and removes 1." — a zero half omitted (`common.permission_changes_summary`). */
    readonly permissionSummary: (added: number, removed: number) => string;
    readonly createRole: (role: string, count: number) => string;
  };
}

/** The form's order (Profile, its social disclosure, then Access): the order of the plain lines. */
const FORM_ORDER: readonly StaffMemberFormField[] = [
  'firstName',
  'lastName',
  'email',
  'phoneNumber',
  'hourlyRate',
  'defaultLanguage',
  'emailSignature',
  'facebook',
  'linkedin',
  'skype',
  'roleId',
  'permissions',
  'departmentIds',
  'admin',
  'isNotStaff',
  'password',
];

/** The order of the access lines, which come first: the flag, the role, its codes, the password. */
const ACCESS_ORDER: readonly StaffMemberFormField[] = [
  'admin',
  'roleId',
  'permissions',
  'password',
];

/** Free text: a change reads "{Label} updated" and the value is never echoed (T-3.2-74). */
const FREE_TEXT = new Set<StaffMemberFormField>([
  'firstName',
  'lastName',
  'email',
  'phoneNumber',
  'hourlyRate',
  'emailSignature',
  'facebook',
  'linkedin',
  'skype',
]);

/** react-hook-form marks a dirty array as `boolean[]` and a dirty leaf as `true`. */
function marked(value: unknown): boolean {
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(marked);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(marked);
  return false;
}

const roleOf = (roleId: string): number | null => (roleId === '' ? null : Number(roleId));
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** What the api stores: an administrator holds no permission rows (Perfex's rule, brief §3). */
const heldCodes = (values: StaffMemberFormValues): readonly string[] =>
  values.admin ? [] : values.permissions;

/**
 * The added and removed codes, computed exactly as erp-api's `isGrantingChange`
 * (`src/v1/identity/service/granting-policy.ts`) writes the audit log: one
 * row per code, the added codes sorted with `localeCompare`, then the removed codes sorted the same
 * way. So the lines the member confirms are the rows the log will hold (T-3.2-72). It is the kit's
 * one diff (`permissionSetDiff`), which the behind-the-role line reads too.
 */
const permissionDiff = permissionSetDiff;

interface Line {
  readonly field: StaffMemberFormField;
  readonly change: SummaryChange;
}

function createLines(after: StaffMemberFormValues, ctx: MemberSummaryContext): Line[] {
  const lines: Line[] = [];
  const diff = permissionDiff([], heldCodes(after));
  const lists = { added: diff.added.map(ctx.permissionLine), removed: [] };
  if (after.admin) {
    lines.push({
      field: 'admin',
      change: {
        type: 'changed',
        label: ctx.label('admin'),
        from: ctx.yesNo(false),
        to: ctx.yesNo(true),
        access: true,
      },
    });
  }
  if (after.roleId !== '') {
    const text = ctx.t.createRole(ctx.roleName(roleOf(after.roleId)), diff.added.length);
    lines.push({ field: 'roleId', change: { type: 'permissions', text, access: true, ...lists } });
  } else if (diff.added.length > 0) {
    const text = ctx.t.permissionSummary(diff.added.length, 0);
    lines.push({
      field: 'permissions',
      change: { type: 'permissions', text, access: false, ...lists },
    });
  }
  return lines;
}

function editLines(
  before: StaffMemberFormValues,
  after: StaffMemberFormValues,
  dirty: Partial<Record<StaffMemberFormField, unknown>>,
  ctx: MemberSummaryContext,
): Line[] {
  const diff = permissionDiff(heldCodes(before), heldCodes(after));
  const removes = diff.removed.length > 0;
  const lines: Line[] = [];
  for (const field of FORM_ORDER) {
    if (field === 'permissions') {
      // The codes move with the permissions themselves, and with the flag (an administrator holds none).
      if (!marked(dirty.permissions) && !marked(dirty.admin)) continue;
      if (diff.added.length === 0 && !removes) continue;
      lines.push({
        field,
        change: {
          type: 'permissions',
          text: ctx.t.permissionSummary(diff.added.length, diff.removed.length),
          access: removes,
          added: diff.added.map(ctx.permissionLine),
          removed: diff.removed.map(ctx.permissionLine),
        },
      });
      continue;
    }
    if (!marked(dirty[field])) continue;
    const change = fieldChange(field, before, after, removes, ctx);
    if (change !== null) lines.push({ field, change });
  }
  return lines;
}

function fieldChange(
  field: Exclude<StaffMemberFormField, 'permissions'>,
  before: StaffMemberFormValues,
  after: StaffMemberFormValues,
  removes: boolean,
  ctx: MemberSummaryContext,
): SummaryChange | null {
  const label = ctx.label(field);
  if (field === 'password') {
    return after.password === ''
      ? null
      : { type: 'text', text: ctx.t.passwordChanged, access: true };
  }
  if (FREE_TEXT.has(field)) {
    return before[field] === after[field] ? null : { type: 'updated', label };
  }
  switch (field) {
    case 'admin':
    case 'isNotStaff':
      return before[field] === after[field]
        ? null
        : {
            type: 'changed',
            label,
            from: ctx.yesNo(before[field]),
            to: ctx.yesNo(after[field]),
            ...(field === 'admin' ? { access: true } : {}),
          };
    case 'roleId':
      return before.roleId === after.roleId
        ? null
        : {
            type: 'changed',
            label,
            from: ctx.roleName(roleOf(before.roleId)),
            to: ctx.roleName(roleOf(after.roleId)),
            // A role change is an access change when its template takes codes away, and when the
            // member is left with no role at all (Perfex allows it).
            access: removes || after.roleId === '',
          };
    case 'defaultLanguage':
      return before.defaultLanguage === after.defaultLanguage
        ? null
        : {
            type: 'changed',
            label,
            from: ctx.languageName(before.defaultLanguage),
            to: ctx.languageName(after.defaultLanguage),
          };
    case 'departmentIds':
      return sameList(before.departmentIds, after.departmentIds)
        ? null
        : {
            type: 'changed',
            label,
            from: ctx.departmentNames(before.departmentIds),
            to: ctx.departmentNames(after.departmentIds),
          };
    default:
      return null;
  }
}

/**
 * The save summary the member confirms before every save (D-25.4, UI-SPEC § "The save summary
 * content"): only what changed, never "Are you sure?".
 *
 * - Free text reads "{Label} updated" and the password "Password changed" — no value is ever echoed.
 * - A choice reads "{Label}: {from} → {to}" (the arrow is `common.change_from_to`'s).
 * - Permissions read "+{n} permissions, −{m} permissions" (a zero part omitted), with one line per
 *   code in the audit's order (`permissionDiff`).
 * - Access changes come first — the administrator flag, a role change or a permission change that
 *   removes any code, the password — then everything else in form order.
 * - On create (`before === null`) only what the new member is granted is listed: the role and its
 *   count ("Role: {role}, {count} permissions"), or the permissions alone, and the flag.
 */
export function diffMemberForSummary(
  before: StaffMemberFormValues | null,
  after: StaffMemberFormValues,
  dirty: Partial<Record<StaffMemberFormField, unknown>>,
  ctx: MemberSummaryContext,
): SummaryChange[] {
  const lines =
    before === null || ctx.mode === 'create'
      ? createLines(after, ctx)
      : editLines(before, after, dirty, ctx);
  const rank = (field: StaffMemberFormField): number => ACCESS_ORDER.indexOf(field);
  const access = lines
    .filter((line) => line.change.access === true)
    .sort((a, b) => rank(a.field) - rank(b.field));
  const rest = lines.filter((line) => line.change.access !== true);
  return [...access, ...rest].map((line) => line.change);
}

// --- the role form ------------------------------------------------------------------------------

/** A field of the role form, by its form name. */
export type RoleFormField = keyof RoleFormValues;

/** Every word the role summary needs, already translated by the screen (this module is pure). */
export interface RoleSummaryContext {
  readonly mode: 'create' | 'edit';
  readonly label: (field: RoleFormField) => string;
  /** "{feature} · {capability}", one line per code. */
  readonly permissionLine: (code: string) => string;
  readonly t: {
    /** Legacy `role_update_staff_permissions`: the checkbox's own words, as an access change. */
    readonly applyToMembers: string;
    readonly permissionSummary: (added: number, removed: number) => string;
    /** "Role: {name}, {count} permissions" (`staff.create_summary_role`). */
    readonly createRole: (name: string, count: number) => string;
  };
}

/**
 * The role's save summary (D-25.4), the member summary's twin over the same one diff
 * (`permissionSetDiff`), so the lines are the audit's rows.
 *
 * - Ticking "Update all staff members permissions that are using this role" rewrites other people's
 *   access, so it is the FIRST line and an access change (T-3.2-81).
 * - A permission change is one `permissions` line: the sentence, removals open, additions behind
 *   "Show N added" (`PermissionChanges`); it is an access change when it removes a code.
 * - A renamed role reads "Role Name updated"; the name is never echoed.
 * - On create: "Role: {name}, {count} permissions" with every code as an added line.
 */
export function diffRoleForSummary(
  before: RoleFormValues | null,
  after: RoleFormValues,
  dirty: Partial<Record<RoleFormField, unknown>>,
  ctx: RoleSummaryContext,
): SummaryChange[] {
  if (before === null || ctx.mode === 'create') {
    const added = permissionDiff([], after.permissions).added.map(ctx.permissionLine);
    const text = ctx.t.createRole(after.name, added.length);
    return [{ type: 'permissions', text, added, removed: [] }];
  }
  const changes: SummaryChange[] = [];
  if (after.applyToMembers) {
    changes.push({ type: 'text', text: ctx.t.applyToMembers, access: true });
  }
  const diff = permissionDiff(before.permissions, after.permissions);
  if (marked(dirty.permissions) && diff.added.length + diff.removed.length > 0) {
    changes.push({
      type: 'permissions',
      text: ctx.t.permissionSummary(diff.added.length, diff.removed.length),
      access: diff.removed.length > 0,
      added: diff.added.map(ctx.permissionLine),
      removed: diff.removed.map(ctx.permissionLine),
    });
  }
  if (marked(dirty.name) && before.name !== after.name) {
    changes.push({ type: 'updated', label: ctx.label('name') });
  }
  return changes;
}
