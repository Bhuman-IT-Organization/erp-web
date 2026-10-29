import { describe, expect, it } from 'vitest';
import {
  LEAD_SOURCES_ENDPOINTS,
  LEAD_SOURCES_ERRORS,
  LEAD_SOURCES_EXPORT_COLUMNS,
  LEAD_SOURCES_EXPORT_PATH,
  LEAD_SOURCES_PATH,
  leadSourcesHooks,
  leadSourcesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../lead-sources.endpoints';

describe('lead-sources endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path, the DELETE included', () => {
    expect(LEAD_SOURCES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/lead-sources' },
      export: { method: 'GET', path: '/api/v1/lead-sources/export' },
      detail: { method: 'GET', path: '/api/v1/lead-sources/:id' },
      create: { method: 'POST', path: '/api/v1/lead-sources' },
      update: { method: 'PATCH', path: '/api/v1/lead-sources/:id' },
      remove: { method: 'DELETE', path: '/api/v1/lead-sources/:id' },
    });
  });

  it('derives the list, the export and a record path from the table, the id encoded', () => {
    expect(LEAD_SOURCES_PATH).toBe(LEAD_SOURCES_ENDPOINTS.list.path);
    expect(LEAD_SOURCES_EXPORT_PATH).toBe(LEAD_SOURCES_ENDPOINTS.export.path);
    expect(leadSourcesPath('7')).toBe('/api/v1/lead-sources/7');
    expect(leadSourcesPath('a b')).toBe('/api/v1/lead-sources/a%20b');
    expect(leadSourcesPath('a/1')).toBe('/api/v1/lead-sources/a%2F1');
  });

  it('lists export columns in the api order, one label each, and never the usage', () => {
    expect(LEAD_SOURCES_EXPORT_COLUMNS).toEqual(['id', 'name', 'totalLeads']);
  });

  it("names the feature's own codes: a record that is not there, and the delete refused while in use", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-LEADSOURCES-0001');
    expect(LEAD_SOURCES_ERRORS).toEqual({
      namespace: 'lead-sources',
      codes: ['ERP-CORE-0004', 'ERP-LEADSOURCES-0001', 'ERP-LEADSOURCES-0002'],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(leadSourcesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
