import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENTS_ENDPOINTS,
  ANNOUNCEMENTS_ERRORS,
  ANNOUNCEMENTS_EXPORT_COLUMNS,
  ANNOUNCEMENTS_EXPORT_PATH,
  ANNOUNCEMENTS_PATH,
  announcementsHooks,
  announcementsPath,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../announcements.endpoints';

describe('announcements endpoints', () => {
  it('declares the list, export, detail and write calls', () => {
    expect(ANNOUNCEMENTS_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/announcements' },
      detail: { method: 'GET', path: '/api/v1/announcements/:id' },
      create: { method: 'POST', path: '/api/v1/announcements' },
      update: { method: 'PATCH', path: '/api/v1/announcements/:id' },
      remove: { method: 'DELETE', path: '/api/v1/announcements/:id' },
      export: { method: 'GET', path: '/api/v1/announcements/export' },
    });
  });

  it('derives encoded resource paths and the id/name/date export', () => {
    expect(ANNOUNCEMENTS_PATH).toBe('/api/v1/announcements');
    expect(ANNOUNCEMENTS_EXPORT_PATH).toBe('/api/v1/announcements/export');
    expect(ANNOUNCEMENTS_EXPORT_COLUMNS).toEqual(['id', 'name', 'dateadded']);
    expect(announcementsPath('a b/c')).toBe('/api/v1/announcements/a%20b%2Fc');
  });

  it('registers validation and not-found errors and all resource hooks', () => {
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(ANNOUNCEMENTS_ERRORS).toEqual({
      namespace: 'announcements',
      codes: [NOT_FOUND_CODE],
    });
    expect(Object.keys(announcementsHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
  });
});
