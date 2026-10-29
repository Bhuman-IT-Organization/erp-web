import { describe, expect, it } from 'vitest';
import {
  CONTRACT_TYPES_ENDPOINTS,
  CONTRACT_TYPES_ERRORS,
  CONTRACT_TYPES_EXPORT_COLUMNS,
  CONTRACT_TYPES_EXPORT_PATH,
  CONTRACT_TYPES_PATH,
  contractTypesHooks,
  contractTypesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../contract-types.endpoints';

describe('contract-types endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path, the DELETE included', () => {
    expect(CONTRACT_TYPES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/contract-types' },
      export: { method: 'GET', path: '/api/v1/contract-types/export' },
      detail: { method: 'GET', path: '/api/v1/contract-types/:id' },
      create: { method: 'POST', path: '/api/v1/contract-types' },
      update: { method: 'PATCH', path: '/api/v1/contract-types/:id' },
      remove: { method: 'DELETE', path: '/api/v1/contract-types/:id' },
    });
  });

  it('derives the list, the export and a record path from the table, the id encoded', () => {
    expect(CONTRACT_TYPES_PATH).toBe(CONTRACT_TYPES_ENDPOINTS.list.path);
    expect(CONTRACT_TYPES_EXPORT_PATH).toBe(CONTRACT_TYPES_ENDPOINTS.export.path);
    expect(contractTypesPath('7')).toBe('/api/v1/contract-types/7');
    expect(contractTypesPath('a b')).toBe('/api/v1/contract-types/a%20b');
    expect(contractTypesPath('a/1')).toBe('/api/v1/contract-types/a%2F1');
  });

  it("lists the export columns in the api order, one label each, and never the usage (D-42)", () => {
    expect(CONTRACT_TYPES_EXPORT_COLUMNS).toEqual(['name', 'contracts']);
  });

  it("names the feature's own codes: a record that is not there (D-32), and the delete refused while in use (D-07)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-CONTRACTTYPES-0001');
    expect(CONTRACT_TYPES_ERRORS).toEqual({
      namespace: 'contract-types',
      codes: ['ERP-CORE-0004', 'ERP-CONTRACTTYPES-0001'],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(contractTypesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
