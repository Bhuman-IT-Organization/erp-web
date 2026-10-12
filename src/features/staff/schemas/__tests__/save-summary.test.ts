import { describe, expect, it } from 'vitest';
import type { SummaryChange } from '@/components/organisms/ConfirmDialog';
import {
  diffMemberForSummary,
  diffRoleForSummary,
  type MemberSummaryContext,
  type RoleSummaryContext,
} from '../save-summary';
import {
  EMPTY_ROLE_FORM,
  EMPTY_STAFF_MEMBER_FORM,
  SYSTEM_DEFAULT_LANGUAGE,
  type RoleFormValues,
  type StaffMemberFormValues,
} from '../staff.schema';

/**
 * The save summary (D-25.4, UI-SPEC § "The save summary content"): what the member confirms before a
 * save. The permission part must read exactly as the audit log will record it — erp-api's
 * `isGrantingChange`: codes sorted, every add before every remove.
 */
const ROLES: Readonly<Record<string, string>> = { '3': 'Employee', '5': 'Warehouse Supervisor' };

const ctx: MemberSummaryContext = {
  mode: 'edit',
  label: (field) => `L:${field}`,
  roleName: (roleId) => (roleId === null ? '—' : (ROLES[String(roleId)] ?? '?')),
  languageName: (code) =>
    code === SYSTEM_DEFAULT_LANGUAGE ? 'System Default' : `lang:${code ?? ''}`,
  departmentNames: (ids) => (ids.length === 0 ? '—' : ids.map((id) => `dep${id}`).join(', ')),
  yesNo: (value) => (value ? 'Yes' : 'No'),
  permissionLine: (code) => `line:${code}`,
  t: {
    passwordChanged: 'Password changed',
    permissionSummary: (added, removed) => `+${String(added)}/−${String(removed)}`,
    createRole: (role, count) => `Role: ${role}, ${String(count)} permissions`,
  },
};

/** A change's visible name: the label of a field line, the sentence of a text or permissions line. */
const nameOf = (change: SummaryChange): string =>
  change.type === 'changed' || change.type === 'updated' ? change.label : (change.text ?? '');

const BEFORE: StaffMemberFormValues = {
  ...EMPTY_STAFF_MEMBER_FORM,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.invalid',
  phoneNumber: '0501234567',
  roleId: '3',
  departmentIds: ['2'],
  permissions: ['sales.invoices.view', 'staff.members.view'],
};

const summary = (
  after: Partial<StaffMemberFormValues>,
  dirty: readonly (keyof StaffMemberFormValues)[],
  over: Partial<MemberSummaryContext> = {},
) =>
  diffMemberForSummary(
    BEFORE,
    { ...BEFORE, ...after },
    Object.fromEntries(dirty.map((name) => [name, true])),
    { ...ctx, ...over },
  );

/** Every string a change renders, so a test can prove a value never appears in any of them. */
const allText = (changes: ReturnType<typeof summary>): string => JSON.stringify(changes);

describe('diffMemberForSummary (D-25.4: what changed, access first, as the audit records it)', () => {
  it('edit, dirty {phoneNumber} → one "updated" line, and the value never appears in the output', () => {
    const changes = summary({ phoneNumber: '0559876543' }, ['phoneNumber']);
    expect(changes).toEqual([{ type: 'updated', label: 'L:phoneNumber' }]);
    expect(allText(changes)).not.toContain('0559876543');
    expect(allText(changes)).not.toContain('0501234567');
  });

  it('a role change whose template removes codes is FIRST, marked access, named from → to', () => {
    const changes = summary(
      { phoneNumber: '0559876543', roleId: '5', permissions: ['sales.invoices.view'] },
      ['phoneNumber', 'roleId', 'permissions'],
    );
    expect(changes[0]).toEqual({
      type: 'changed',
      label: 'L:roleId',
      from: 'Employee',
      to: 'Warehouse Supervisor',
      access: true,
    });
    expect(changes.at(-1)).toEqual({ type: 'updated', label: 'L:phoneNumber' });
  });

  it('a role change that only adds codes is not an access change', () => {
    const changes = summary(
      { roleId: '5', permissions: [...BEFORE.permissions, 'sales.estimates.view'] },
      ['roleId', 'permissions'],
    );
    expect(changes[0]).toMatchObject({ type: 'changed', label: 'L:roleId', access: false });
  });

  it('a role cleared to none is an access change even when no permission moves (Perfex allows a member with no role)', () => {
    const changes = summary({ roleId: '' }, ['roleId']);
    expect(changes).toEqual([
      { type: 'changed', label: 'L:roleId', from: 'Employee', to: '—', access: true },
    ]);
  });

  it('dirty {isAdmin true→false} is first, marked access, from → to through yesNo', () => {
    const before = { ...BEFORE, admin: true, permissions: [] };
    const changes = diffMemberForSummary(
      before,
      { ...before, admin: false, phoneNumber: '1' },
      { admin: true, phoneNumber: true },
      ctx,
    );
    expect(changes[0]).toEqual({
      type: 'changed',
      label: 'L:admin',
      from: 'Yes',
      to: 'No',
      access: true,
    });
  });

  it('dirty {password} → "Password changed", marked access; the password never appears', () => {
    const changes = summary({ password: 'a-secret-password' }, ['password']);
    expect(changes).toEqual([{ type: 'text', text: 'Password changed', access: true }]);
    expect(allText(changes)).not.toContain('a-secret-password');
  });

  it('+3/−1 permissions: one permissions change with the sentence, the 3 adds sorted by code and the remove, from ONE diff; access (a removal)', () => {
    const changes = summary(
      {
        permissions: [
          'staff.members.view',
          'sales.invoices.edit',
          'accounting.bills.view',
          'sales.invoices.create',
        ],
      },
      ['permissions'],
    );
    expect(changes).toEqual([
      {
        type: 'permissions',
        text: '+3/−1',
        access: true,
        added: [
          'line:accounting.bills.view',
          'line:sales.invoices.create',
          'line:sales.invoices.edit',
        ],
        removed: ['line:sales.invoices.view'],
      },
    ]);
  });

  it('+2/−0 permissions: no removals, and not an access change', () => {
    const changes = summary(
      { permissions: [...BEFORE.permissions, 'sales.estimates.view', 'crm.leads.view'] },
      ['permissions'],
    );
    expect(changes).toEqual([
      {
        type: 'permissions',
        text: '+2/−0',
        access: false,
        added: ['line:crm.leads.view', 'line:sales.estimates.view'],
        removed: [],
      },
    ]);
  });

  it('ticking Administrator sends no permission rows, so the summary lists every held code as removed (the audit does)', () => {
    const changes = summary({ admin: true }, ['admin']);
    expect(changes.map((change) => nameOf(change))).toEqual(['L:admin', '+0/−2']);
    expect(changes.every((change) => change.access === true)).toBe(true);
  });

  it('a dirty field whose value came back to where it was lists nothing', () => {
    expect(summary({}, ['phoneNumber', 'permissions', 'departmentIds'])).toEqual([]);
  });

  it('choice fields read from → to; free text reads "updated"', () => {
    const changes = summary(
      { departmentIds: ['2', '4'], defaultLanguage: 'arabic', emailSignature: 'Kind regards' },
      ['departmentIds', 'defaultLanguage', 'emailSignature'],
    );
    expect(changes).toEqual([
      { type: 'changed', label: 'L:defaultLanguage', from: 'System Default', to: 'lang:arabic' },
      { type: 'updated', label: 'L:emailSignature' },
      { type: 'changed', label: 'L:departmentIds', from: 'dep2', to: 'dep2, dep4' },
    ]);
    expect(allText(changes)).not.toContain('Kind regards');
  });

  it('access changes always precede the rest; the rest keep form order', () => {
    const changes = summary(
      {
        email: 'j@example.invalid',
        firstName: 'Janet',
        password: 'a-secret-password',
        departmentIds: [],
        roleId: '5',
        permissions: ['sales.invoices.view'],
      },
      ['email', 'firstName', 'password', 'departmentIds', 'roleId', 'permissions'],
    );
    const names = changes.map((change) => nameOf(change));
    expect(names).toEqual([
      'L:roleId',
      '+0/−1',
      'Password changed',
      'L:firstName',
      'L:email',
      'L:departmentIds',
    ]);
    const firstPlain = changes.findIndex((change) => change.access !== true);
    expect(changes.slice(firstPlain).every((change) => change.access !== true)).toBe(true);
  });

  it('create → "Role: Warehouse Supervisor, 23 permissions" with every code as an Added line, and nothing for the typed profile', () => {
    const codes = Array.from({ length: 23 }, (_, i) => `m.r${String(i).padStart(2, '0')}.view`);
    const after: StaffMemberFormValues = {
      ...EMPTY_STAFF_MEMBER_FORM,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.invalid',
      password: 'a-secret-password',
      roleId: '5',
      permissions: [...codes].reverse(),
    };
    const changes = diffMemberForSummary(
      null,
      after,
      {
        firstName: true,
        lastName: true,
        email: true,
        password: true,
        roleId: true,
        permissions: true,
      },
      { ...ctx, mode: 'create' },
    );
    expect(changes).toEqual([
      {
        type: 'permissions',
        text: 'Role: Warehouse Supervisor, 23 permissions',
        access: true,
        added: codes.map((code) => `line:${code}`),
        removed: [],
      },
    ]);
    expect(allText(changes)).not.toContain('a-secret-password');
  });

  it('create with nothing granted lists nothing at all', () => {
    const changes = diffMemberForSummary(
      null,
      { ...EMPTY_STAFF_MEMBER_FORM, firstName: 'Jane', password: 'a-secret-password' },
      { firstName: true, password: true },
      { ...ctx, mode: 'create' },
    );
    expect(changes).toEqual([]);
  });
});

// --- the role save summary (plan 03.2-18) --------------------------------------------------------

const roleCtx: RoleSummaryContext = {
  mode: 'edit',
  label: (field) => (field === 'name' ? 'Role Name' : `L:${field}`),
  permissionLine: (code) => `line:${code}`,
  t: {
    applyToMembers: 'Update all staff members permissions that are using this role',
    permissionSummary: (added, removed) => `+${String(added)}/−${String(removed)}`,
    createRole: (name, count) => `Role: ${name}, ${String(count)} permissions`,
  },
};

const ROLE_BEFORE: RoleFormValues = {
  ...EMPTY_ROLE_FORM,
  name: 'Warehouse Supervisor',
  permissions: ['sales.invoices.view', 'staff.members.view'],
};

const roleSummary = (after: Partial<RoleFormValues>, dirty: readonly (keyof RoleFormValues)[]) =>
  diffRoleForSummary(
    ROLE_BEFORE,
    { ...ROLE_BEFORE, ...after },
    Object.fromEntries(dirty.map((name) => [name, true])),
    roleCtx,
  );

describe('diffRoleForSummary (D-25.4: a role save names what changes, as the audit records it)', () => {
  it('edit, dirty {name} → one "Role Name updated" line, and the name itself never appears', () => {
    const changes = roleSummary({ name: 'Stock Lead' }, ['name']);
    expect(changes).toEqual([{ type: 'updated', label: 'Role Name' }]);
    expect(JSON.stringify(changes)).not.toContain('Stock Lead');
    expect(JSON.stringify(changes)).not.toContain('Warehouse Supervisor');
  });

  it('edit, dirty {permissions +2 −1} → ONE permissions change from the one diff: the sentence, the removal, the two additions sorted; an access change', () => {
    const changes = roleSummary(
      { permissions: ['staff.members.view', 'sales.estimates.view', 'crm.leads.view'] },
      ['permissions'],
    );
    expect(changes).toEqual([
      {
        type: 'permissions',
        text: '+2/−1',
        access: true,
        added: ['line:crm.leads.view', 'line:sales.estimates.view'],
        removed: ['line:sales.invoices.view'],
      },
    ]);
  });

  it('applyToMembers ticked → the FIRST line, an access change reading role_update_staff_permissions', () => {
    const changes = roleSummary(
      { name: 'Stock Lead', permissions: ['sales.invoices.view'], applyToMembers: true },
      ['name', 'permissions', 'applyToMembers'],
    );
    expect(changes[0]).toEqual({
      type: 'text',
      text: 'Update all staff members permissions that are using this role',
      access: true,
    });
    expect(changes.map((change) => change.type)).toEqual(['text', 'permissions', 'updated']);
  });

  it('a permission set that is dirty but unchanged, or a name typed back, lists nothing', () => {
    expect(
      roleSummary({ permissions: [...ROLE_BEFORE.permissions].reverse() }, ['permissions']),
    ).toEqual([]);
    expect(roleSummary({ name: 'Warehouse Supervisor' }, ['name'])).toEqual([]);
  });

  it('create → one line naming the role and its count, with every code as an added line', () => {
    const changes = diffRoleForSummary(
      null,
      {
        ...EMPTY_ROLE_FORM,
        name: 'Stock Lead',
        permissions: ['staff.members.view', 'crm.leads.view'],
      },
      { name: true, permissions: true },
      { ...roleCtx, mode: 'create' },
    );
    expect(changes).toEqual([
      {
        type: 'permissions',
        text: 'Role: Stock Lead, 2 permissions',
        added: ['line:crm.leads.view', 'line:staff.members.view'],
        removed: [],
      },
    ]);
  });
});
