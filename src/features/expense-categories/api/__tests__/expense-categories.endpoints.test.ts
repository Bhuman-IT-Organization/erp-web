import { describe, expect, it } from 'vitest';
import {
  EXPENSE_CATEGORIES_ENDPOINTS,
  EXPENSE_CATEGORIES_ERRORS,
  EXPENSE_CATEGORIES_EXPORT_COLUMNS,
  EXPENSE_CATEGORIES_EXPORT_PATH,
  EXPENSE_CATEGORIES_PATH,
  expenseCategoriesHooks,
  expenseCategoriesPath,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../expense-categories.endpoints';

describe('expense-categories endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path, the DELETE included', () => {
    expect(EXPENSE_CATEGORIES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/expense-categories' },
      export: { method: 'GET', path: '/api/v1/expense-categories/export' },
      detail: { method: 'GET', path: '/api/v1/expense-categories/:id' },
      create: { method: 'POST', path: '/api/v1/expense-categories' },
      update: { method: 'PATCH', path: '/api/v1/expense-categories/:id' },
      remove: { method: 'DELETE', path: '/api/v1/expense-categories/:id' },
    });
  });

  it('derives the list, the export and a record path from the table, the id encoded', () => {
    expect(EXPENSE_CATEGORIES_PATH).toBe(EXPENSE_CATEGORIES_ENDPOINTS.list.path);
    expect(EXPENSE_CATEGORIES_EXPORT_PATH).toBe(EXPENSE_CATEGORIES_ENDPOINTS.export.path);
    expect(expenseCategoriesPath('a b')).toBe('/api/v1/expense-categories/a%20b');
    expect(expenseCategoriesPath('a/1')).toBe('/api/v1/expense-categories/a%2F1');
  });

  it('lists the export columns in the api order, one label each, and never a usage count (D-42)', () => {
    expect(EXPENSE_CATEGORIES_EXPORT_COLUMNS).toEqual(['id', 'name', 'description']);
  });

  it("names the feature's own codes: a record that is not there (D-32), and a category still in use (D-07, D-15)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-EXPENSECATEGORIES-0001');
    expect(EXPENSE_CATEGORIES_ERRORS).toEqual({
      namespace: 'expense-categories',
      codes: [NOT_FOUND_CODE, IN_USE_CODE],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(expenseCategoriesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
