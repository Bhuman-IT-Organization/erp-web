import { describe, expect, it } from 'vitest';
import { isPermissionCode, PERMISSION_CODES, PERMISSIONS } from '../permissions';

/**
 * The mirror's own shape. The mirror is kept in sync with erp-api's `packages/contracts` by hand;
 * this file asserts what can be checked without erp-api: the grammar, the ordering and that no
 * Perfex code slipped in (D-12).
 */

/** ADR-0033's clean-name grammar: `module.resource.action`, three camelCase segments. */
const CLEAN_NAME = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){2}$/;
/** What a Perfex code looks like: snake_case, and the module prefixes ADR-0033 strips. */
const PERFEX_SHAPED = /_|^(wh|hrp|hrm|staffmanage|fixed_equipment)\b/;

const leaves = (node: unknown, path: string[] = []): { path: string; value: unknown }[] =>
  typeof node === 'object' && node !== null
    ? Object.entries(node).flatMap(([k, v]) => leaves(v, [...path, k]))
    : [{ path: path.join('.'), value: node }];

describe('the clean-catalogue mirror', () => {
  it('every leaf is a string on the ADR-0033 grammar', () => {
    const offenders = leaves(PERMISSIONS).filter(
      (leaf) => typeof leaf.value !== 'string' || !CLEAN_NAME.test(leaf.value),
    );
    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it('every leaf equals its own path in the tree, so a name can be read off the tree', () => {
    const mismatched = leaves(PERMISSIONS).filter((leaf) => leaf.value !== leaf.path);
    expect(mismatched.map((o) => `${o.path} → ${String(o.value)}`)).toEqual([]);
  });

  it('carries no Perfex code: no snake_case and none of the stripped module prefixes (D-12)', () => {
    const perfexShaped = leaves(PERMISSIONS)
      .map((leaf) => String(leaf.value))
      .filter((code) => PERFEX_SHAPED.test(code));
    expect(perfexShaped).toEqual([]);
  });

  it('PERMISSION_CODES is every leaf, sorted and de-duplicated', () => {
    const all = leaves(PERMISSIONS).map((leaf) => String(leaf.value));
    expect([...PERMISSION_CODES]).toEqual([...new Set(all)].sort());
    expect(PERMISSION_CODES.length).toBe(new Set(PERMISSION_CODES).size);
    expect([...PERMISSION_CODES]).toEqual([...PERMISSION_CODES].sort());
  });

  it('covers the 507 active declared Perfex codes the naming pass produced (plan 03.1-10)', () => {
    expect(PERMISSION_CODES.length).toBe(507);
  });

  it('carries the eight identity codes the brief names, so the shell can gate on them', () => {
    expect(Object.values(PERMISSIONS.staff.members)).toEqual([
      'staff.members.create',
      'staff.members.delete',
      'staff.members.edit',
      'staff.members.view',
    ]);
    expect(Object.values(PERMISSIONS.staff.roles)).toEqual([
      'staff.roles.create',
      'staff.roles.delete',
      'staff.roles.edit',
      'staff.roles.view',
    ]);
  });

  it('isPermissionCode narrows a declared name and refuses anything else', () => {
    expect(isPermissionCode(PERMISSIONS.staff.members.view)).toBe(true);
    expect(isPermissionCode('invoices.view')).toBe(false);
    expect(isPermissionCode('staff.members.teleport')).toBe(false);
    expect(isPermissionCode(42)).toBe(false);
    expect(isPermissionCode(undefined)).toBe(false);
  });
});
