import { describe, expect, it } from 'vitest';
import {
  IN_USE_CODE,
  NOT_FOUND_CODE,
  SERVICES_ENDPOINTS,
  SERVICES_ERRORS,
  SERVICES_EXPORT_COLUMNS,
  SERVICES_EXPORT_PATH,
  SERVICES_PATH,
  servicesHooks,
  servicesPath,
  VALIDATION_CODE,
} from '../services.endpoints';

describe('services endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path, the DELETE included', () => {
    expect(SERVICES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/services' },
      export: { method: 'GET', path: '/api/v1/services/export' },
      detail: { method: 'GET', path: '/api/v1/services/:id' },
      create: { method: 'POST', path: '/api/v1/services' },
      update: { method: 'PATCH', path: '/api/v1/services/:id' },
      remove: { method: 'DELETE', path: '/api/v1/services/:id' },
    });
  });

  it('derives the list, the export and a record path from the table, the id encoded', () => {
    expect(SERVICES_PATH).toBe(SERVICES_ENDPOINTS.list.path);
    expect(SERVICES_EXPORT_PATH).toBe(SERVICES_ENDPOINTS.export.path);
    expect(servicesPath('7')).toBe('/api/v1/services/7');
    expect(servicesPath('a b')).toBe('/api/v1/services/a%20b');
    expect(servicesPath('a/1')).toBe('/api/v1/services/a%2F1');
  });

  it('lists the two export columns in the api order, one label each', () => {
    expect(SERVICES_EXPORT_COLUMNS).toEqual(['id', 'name']);
  });

  it("names the feature's own codes: a record that is not there, and the delete refused while a ticket uses it", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-SERVICES-0001');
    expect(SERVICES_ERRORS).toEqual({
      namespace: 'services',
      codes: ['ERP-CORE-0004', 'ERP-SERVICES-0001'],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(servicesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
