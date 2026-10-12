import { afterEach, describe, expect, it } from 'vitest';
import { http } from '@/lib/api/http';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import en from '../../messages/en.json';
import {
  AUTH_ME_PATH,
  fetchRoleTemplate,
  IDENTITY_CATALOGUE_PATH,
  IDENTITY_DEPARTMENTS_PATH,
  IDENTITY_MEMBERS_EXPORT_PATH,
  IDENTITY_MEMBERS_PATH,
  IDENTITY_ROLES_EXPORT_PATH,
  IDENTITY_ROLES_PATH,
  MEMBER_EXPORT_COLUMNS,
  memberPath,
  memberStatusPath,
  ROLE_EXPORT_COLUMNS,
  rolePath,
  STAFF_ERROR_CODES,
} from '../staff.endpoints';

const ERRORS: Record<string, string> = en.staff.errors;
const ROLE = { roleId: 3, name: 'Support', permissions: ['sales.invoices.view'] };

describe('staff endpoints', () => {
  afterEach(() => {
    delete http.defaults.adapter;
  });

  it('names the identity paths of erp-api v1/identity, and no Perfex path', () => {
    expect(IDENTITY_MEMBERS_PATH).toBe('/api/v1/identity/members');
    expect(IDENTITY_ROLES_PATH).toBe('/api/v1/identity/roles');
    expect(IDENTITY_CATALOGUE_PATH).toBe('/api/v1/identity/permissions/catalogue');
    expect(IDENTITY_DEPARTMENTS_PATH).toBe('/api/v1/identity/departments');
    expect(AUTH_ME_PATH).toBe('/api/v1/auth/me');
    expect(memberPath(12)).toBe('/api/v1/identity/members/12');
    expect(memberStatusPath(12)).toBe('/api/v1/identity/members/12/status');
    expect(rolePath(3)).toBe('/api/v1/identity/roles/3');
  });

  it('names the member export and its seven columns in the api order (plan 05, MEMBER_EXPORT_COLUMNS)', () => {
    expect(IDENTITY_MEMBERS_EXPORT_PATH).toBe('/api/v1/identity/members/export');
    expect(MEMBER_EXPORT_COLUMNS).toEqual([
      'staffId',
      'firstName',
      'lastName',
      'email',
      'roleName',
      'active',
      'lastLogin',
    ]);
  });

  it('names the roles export and its three columns in the api order (plan 05, ROLE_EXPORT_COLUMNS)', () => {
    expect(IDENTITY_ROLES_EXPORT_PATH).toBe('/api/v1/identity/roles/export');
    expect(ROLE_EXPORT_COLUMNS).toEqual(['roleId', 'name', 'memberCount']);
  });

  it('STAFF_ERROR_CODES carries ERP-IDENTITY-0006, the role-in-use refusal the delete dialog shows', () => {
    expect(STAFF_ERROR_CODES.codes).toContain('ERP-IDENTITY-0006');
  });

  it('STAFF_ERROR_CODES is the staff namespace and every ERP-IDENTITY code whose message it carries (D-32)', () => {
    expect(STAFF_ERROR_CODES.namespace).toBe('staff');
    const carried = Object.keys(ERRORS)
      .filter((key) => key.startsWith('ERP-IDENTITY-'))
      .sort();
    expect(carried.length).toBeGreaterThan(0);
    expect([...STAFF_ERROR_CODES.codes].sort()).toEqual(carried);
  });

  it('fetchRoleTemplate reads GET identity/roles/:id — never Perfex /admin/staff/role_changed', async () => {
    const fake = fakeAdapter(200, ROLE);
    const result = await fetchRoleTemplate(3, fake.adapter);
    expect(result.ok && result.data.permissions).toEqual(ROLE.permissions);
    expect(fake.calls[0]?.url).toBe('/api/v1/identity/roles/3');
    expect(fake.calls[0]?.method).toBe('GET');
  });

  it('fetchRoleTemplate never throws: a refusal is a result carrying the code', async () => {
    const fake = fakeAdapter(403, problem(403, 'ERP-AUTH-0005'));
    const result = await fetchRoleTemplate(3, fake.adapter);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ERP-AUTH-0005');
  });
});
