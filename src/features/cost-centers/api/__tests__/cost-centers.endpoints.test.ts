import { describe, expect, it } from 'vitest';
import {
  COST_CENTERS_ENDPOINTS,
  COST_CENTERS_ERRORS,
  COST_CENTERS_EXPORT_COLUMNS,
  COST_CENTERS_EXPORT_PATH,
  COST_CENTERS_PATH,
  costCentersHooks,
  costCentersPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../cost-centers.endpoints';

describe('cost-centers endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path, the DELETE included', () => {
    expect(COST_CENTERS_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/cost-centers' },
      export: { method: 'GET', path: '/api/v1/cost-centers/export' },
      detail: { method: 'GET', path: '/api/v1/cost-centers/:id' },
      create: { method: 'POST', path: '/api/v1/cost-centers' },
      update: { method: 'PATCH', path: '/api/v1/cost-centers/:id' },
      remove: { method: 'DELETE', path: '/api/v1/cost-centers/:id' },
    });
  });

  it('derives the list, the export and a record path from the table, the id encoded', () => {
    expect(COST_CENTERS_PATH).toBe(COST_CENTERS_ENDPOINTS.list.path);
    expect(COST_CENTERS_EXPORT_PATH).toBe(COST_CENTERS_ENDPOINTS.export.path);
    expect(costCentersPath('7')).toBe('/api/v1/cost-centers/7');
    expect(costCentersPath('a b')).toBe('/api/v1/cost-centers/a%20b');
    expect(costCentersPath('a/1')).toBe('/api/v1/cost-centers/a%2F1');
  });

  it("lists Perfex's three export columns in the api order, one label each, and never the usage (D-42)", () => {
    expect(COST_CENTERS_EXPORT_COLUMNS).toEqual(['id', 'name', 'dateCreated']);
  });

  it("names the feature's own codes: a record that is not there (D-32), and the delete refused while in use (D-07)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-COSTCENTERS-0001');
    expect(COST_CENTERS_ERRORS).toEqual({
      namespace: 'cost-centers',
      codes: ['ERP-CORE-0004', 'ERP-COSTCENTERS-0001'],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(costCentersHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
