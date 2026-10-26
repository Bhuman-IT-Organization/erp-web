import { describe, expect, it } from 'vitest';
import {
  PREDEFINED_REPLIES_ENDPOINTS,
  PREDEFINED_REPLIES_ERRORS,
  PREDEFINED_REPLIES_PATH,
  predefinedRepliesHooks,
  predefinedRepliesPath,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../predefined-replies.endpoints';

describe('predefined-replies endpoints', () => {
  it('declares exactly the five calls the api module serves, method and path (05-templates/backend-module)', () => {
    expect(PREDEFINED_REPLIES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/predefined-replies' },
      detail: { method: 'GET', path: '/api/v1/predefined-replies/:id' },
      create: { method: 'POST', path: '/api/v1/predefined-replies' },
      update: { method: 'PATCH', path: '/api/v1/predefined-replies/:id' },
      delete: { method: 'DELETE', path: '/api/v1/predefined-replies/:id' },
    });
  });

  it('derives the list and a record path from the table, with the id encoded', () => {
    expect(PREDEFINED_REPLIES_PATH).toBe(PREDEFINED_REPLIES_ENDPOINTS.list.path);
    expect(predefinedRepliesPath('a b')).toBe('/api/v1/predefined-replies/a%20b');
    expect(predefinedRepliesPath('a/1')).toBe('/api/v1/predefined-replies/a%2F1');
  });

  it("names the feature's own error code: a record that does not exist, or that the caller may not read (D-32)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(PREDEFINED_REPLIES_ERRORS).toEqual({
      namespace: 'predefined-replies',
      codes: [NOT_FOUND_CODE],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(predefinedRepliesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
