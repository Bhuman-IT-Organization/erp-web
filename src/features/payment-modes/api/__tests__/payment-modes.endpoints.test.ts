import { describe, expect, it } from 'vitest';
import {
  CREDIT_MODE_CODE,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  PAYMENT_MODES_ENDPOINTS,
  PAYMENT_MODES_ERRORS,
  PAYMENT_MODES_EXPORT_COLUMNS,
  PAYMENT_MODES_EXPORT_PATH,
  PAYMENT_MODES_PATH,
  paymentModeActivePath,
  paymentModesHooks,
  paymentModesPath,
  VALIDATION_CODE,
} from '../payment-modes.endpoints';

describe('payment-modes endpoints', () => {
  it('declares exactly the seven calls the api module serves, method and path, the switch and the DELETE included', () => {
    expect(PAYMENT_MODES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/payment-modes' },
      export: { method: 'GET', path: '/api/v1/payment-modes/export' },
      detail: { method: 'GET', path: '/api/v1/payment-modes/:id' },
      create: { method: 'POST', path: '/api/v1/payment-modes' },
      update: { method: 'PATCH', path: '/api/v1/payment-modes/:id' },
      active: { method: 'PATCH', path: '/api/v1/payment-modes/:id/active' },
      remove: { method: 'DELETE', path: '/api/v1/payment-modes/:id' },
    });
  });

  it('derives the list, the export, a record path and its switch path from the table, the id encoded', () => {
    expect(PAYMENT_MODES_PATH).toBe(PAYMENT_MODES_ENDPOINTS.list.path);
    expect(PAYMENT_MODES_EXPORT_PATH).toBe(PAYMENT_MODES_ENDPOINTS.export.path);
    expect(paymentModesPath('7')).toBe('/api/v1/payment-modes/7');
    expect(paymentModesPath('a b')).toBe('/api/v1/payment-modes/a%20b');
    expect(paymentModesPath('a/1')).toBe('/api/v1/payment-modes/a%2F1');
    expect(paymentModeActivePath('7')).toBe('/api/v1/payment-modes/7/active');
    expect(paymentModeActivePath('a/1')).toBe('/api/v1/payment-modes/a%2F1/active');
  });

  it("lists Perfex's four export columns in the api order, no date column, and never the usage (D-42)", () => {
    expect(PAYMENT_MODES_EXPORT_COLUMNS).toEqual(['id', 'name', 'description', 'active']);
  });

  it("names the feature's own codes: a record that is not there (D-32), the delete refused in use (D-33) and for the credit expense mode (D-37)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-PAYMENTMODES-0001');
    expect(CREDIT_MODE_CODE).toBe('ERP-PAYMENTMODES-0002');
    expect(PAYMENT_MODES_ERRORS).toEqual({
      namespace: 'payment-modes',
      codes: ['ERP-CORE-0004', 'ERP-PAYMENTMODES-0001', 'ERP-PAYMENTMODES-0002'],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(paymentModesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
