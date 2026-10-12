import { describe, expect, it } from 'vitest';
import {
  IN_USE_CODE,
  NOT_FOUND_CODE,
  TAXES_ENDPOINTS,
  TAXES_ERRORS,
  TAXES_EXPORT_COLUMNS,
  TAXES_EXPORT_PATH,
  TAXES_PATH,
  taxesHooks,
  taxesPath,
  VALIDATION_CODE,
} from '../taxes.endpoints';

describe('taxes endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path, the DELETE included', () => {
    expect(TAXES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/taxes' },
      export: { method: 'GET', path: '/api/v1/taxes/export' },
      detail: { method: 'GET', path: '/api/v1/taxes/:id' },
      create: { method: 'POST', path: '/api/v1/taxes' },
      update: { method: 'PATCH', path: '/api/v1/taxes/:id' },
      remove: { method: 'DELETE', path: '/api/v1/taxes/:id' },
    });
  });

  it('derives the list, the export and a record path from the table, the id encoded', () => {
    expect(TAXES_PATH).toBe(TAXES_ENDPOINTS.list.path);
    expect(TAXES_EXPORT_PATH).toBe(TAXES_ENDPOINTS.export.path);
    expect(taxesPath('7')).toBe('/api/v1/taxes/7');
    expect(taxesPath('a b')).toBe('/api/v1/taxes/a%20b');
    expect(taxesPath('a/1')).toBe('/api/v1/taxes/a%2F1');
  });

  it('lists the export columns in the api order, one label each, and never the usage or the default flag (D-42)', () => {
    expect(TAXES_EXPORT_COLUMNS).toEqual(['id', 'name', 'rate']);
  });

  it("names the feature's own codes: a record that is not there (D-32), and the four taxes refusals (D-07, D-21)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-TAXES-0001');
    expect(TAXES_ERRORS).toEqual({
      namespace: 'taxes',
      codes: [
        'ERP-CORE-0004',
        'ERP-TAXES-0001',
        'ERP-TAXES-0002',
        'ERP-TAXES-0003',
        'ERP-TAXES-0004',
      ],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(taxesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
