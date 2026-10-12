import { describe, expect, it } from 'vitest';
import { DEFAULT_NEXT, safeNext } from '../safe-next';

describe('safeNext (open-redirect guard, T-1.3-19)', () => {
  it('keeps a same-origin absolute path', () => {
    expect(safeNext('/admin/staff')).toBe('/admin/staff');
    expect(safeNext('/admin/staff?page=2#top')).toBe('/admin/staff?page=2#top');
  });

  it.each([
    ['protocol-relative', '//evil.com'],
    ['absolute URL', 'http://evil.com'],
    ['backslash', '/\\evil'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative path', 'admin'],
    ['empty', ''],
    ['control character', '/admin\n'],
  ])('rejects %s', (_label, value) => {
    expect(safeNext(value)).toBe(DEFAULT_NEXT);
  });

  it('rejects null and undefined', () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT);
  });

  it('defaults to the legacy admin home', () => {
    expect(DEFAULT_NEXT).toBe('/admin/');
  });
});
