import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_GROUPS_ENDPOINTS,
  CUSTOMER_GROUPS_ERRORS,
  CUSTOMER_GROUPS_EXPORT_COLUMNS,
  CUSTOMER_GROUPS_EXPORT_PATH,
  CUSTOMER_GROUPS_PATH,
  customerGroupsHooks,
  customerGroupsPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../customer-groups.endpoints';

describe('customer-groups endpoints', () => {
  it('declares the list, export, detail and write calls', () => {
    expect(CUSTOMER_GROUPS_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/customer-groups' },
      detail: { method: 'GET', path: '/api/v1/customer-groups/:id' },
      create: { method: 'POST', path: '/api/v1/customer-groups' },
      update: { method: 'PATCH', path: '/api/v1/customer-groups/:id' },
      remove: { method: 'DELETE', path: '/api/v1/customer-groups/:id' },
      export: { method: 'GET', path: '/api/v1/customer-groups/export' },
    });
  });

  it('derives encoded resource paths and the name-only export', () => {
    expect(CUSTOMER_GROUPS_PATH).toBe('/api/v1/customer-groups');
    expect(CUSTOMER_GROUPS_EXPORT_PATH).toBe('/api/v1/customer-groups/export');
    expect(CUSTOMER_GROUPS_EXPORT_COLUMNS).toEqual(['name']);
    expect(customerGroupsPath('a b/c')).toBe('/api/v1/customer-groups/a%20b%2Fc');
  });

  it('registers validation, not-found and in-use errors and all resource hooks', () => {
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-CUSTOMERGROUPS-0001');
    expect(CUSTOMER_GROUPS_ERRORS).toEqual({
      namespace: 'customer-groups',
      codes: [NOT_FOUND_CODE, IN_USE_CODE],
    });
    expect(Object.keys(customerGroupsHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
  });
});
