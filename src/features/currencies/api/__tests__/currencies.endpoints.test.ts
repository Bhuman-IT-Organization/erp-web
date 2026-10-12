import { describe, expect, it } from 'vitest';
import {
  BASE_CODE,
  BASE_LOCKED_CODE,
  CODE_LOCKED_CODE,
  CURRENCIES_ENDPOINTS,
  CURRENCIES_ERRORS,
  CURRENCIES_EXPORT_COLUMNS,
  CURRENCIES_EXPORT_PATH,
  CURRENCIES_PATH,
  currenciesHooks,
  currenciesPath,
  currencyBasePath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  OTHER_MODULE_CODE,
  VALIDATION_CODE,
} from '../currencies.endpoints';

describe('currencies endpoints', () => {
  it('declares exactly the seven calls the api module serves, method and path, make-base and the DELETE included', () => {
    expect(CURRENCIES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/currencies' },
      export: { method: 'GET', path: '/api/v1/currencies/export' },
      detail: { method: 'GET', path: '/api/v1/currencies/:id' },
      create: { method: 'POST', path: '/api/v1/currencies' },
      update: { method: 'PATCH', path: '/api/v1/currencies/:id' },
      makeBase: { method: 'PATCH', path: '/api/v1/currencies/:id/base' },
      remove: { method: 'DELETE', path: '/api/v1/currencies/:id' },
    });
  });

  it('derives the list, the export, a record path and its make-base path from the table, the id encoded', () => {
    expect(CURRENCIES_PATH).toBe(CURRENCIES_ENDPOINTS.list.path);
    expect(CURRENCIES_EXPORT_PATH).toBe(CURRENCIES_ENDPOINTS.export.path);
    expect(currenciesPath('7')).toBe('/api/v1/currencies/7');
    expect(currenciesPath('a b')).toBe('/api/v1/currencies/a%20b');
    expect(currenciesPath('a/1')).toBe('/api/v1/currencies/a%2F1');
    expect(currencyBasePath('7')).toBe('/api/v1/currencies/7/base');
    expect(currencyBasePath('a/1')).toBe('/api/v1/currencies/a%2F1/base');
  });

  it("lists Perfex's code and symbol, then whether it is the base, as the export columns in the api order, never the usage (D-42)", () => {
    expect(CURRENCIES_EXPORT_COLUMNS).toEqual(['name', 'symbol', 'isBase']);
  });

  it("names the feature's six codes: a record that is not there (D-32) and the api's five refusals (D-39 to D-42)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-CURRENCIES-0001');
    expect(BASE_CODE).toBe('ERP-CURRENCIES-0002');
    expect(OTHER_MODULE_CODE).toBe('ERP-CURRENCIES-0003');
    expect(BASE_LOCKED_CODE).toBe('ERP-CURRENCIES-0004');
    expect(CODE_LOCKED_CODE).toBe('ERP-CURRENCIES-0005');
    expect(CURRENCIES_ERRORS).toEqual({
      namespace: 'currencies',
      codes: [
        'ERP-CORE-0004',
        'ERP-CURRENCIES-0001',
        'ERP-CURRENCIES-0002',
        'ERP-CURRENCIES-0003',
        'ERP-CURRENCIES-0004',
        'ERP-CURRENCIES-0005',
      ],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(currenciesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
