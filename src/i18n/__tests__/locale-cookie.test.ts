import { describe, expect, it } from 'vitest';
import {
  LOCALE_COOKIE_MAX_AGE_S,
  clearLocaleCookie,
  localeCookieString,
  writeLocaleCookie,
} from '../locale-cookie';

describe('locale cookie', () => {
  it('is one year long', () => {
    expect(LOCALE_COOKIE_MAX_AGE_S).toBe(365 * 24 * 60 * 60);
  });

  it('names erp_locale, Path=/, Max-Age one year, SameSite=Lax — and no Secure/HttpOnly (a preference, not a secret)', () => {
    const s = localeCookieString('ar');
    expect(s.split('; ')).toEqual(['erp_locale=ar', 'Path=/', 'Max-Age=31536000', 'SameSite=Lax']);
    expect(s).not.toMatch(/Secure/i);
    expect(s).not.toMatch(/HttpOnly/i);
  });

  it('writeLocaleCookie writes that string to the document it is given', () => {
    const doc = { cookie: '' };
    writeLocaleCookie('en', doc);
    expect(doc.cookie).toBe(localeCookieString('en'));
  });

  it('clearLocaleCookie expires erp_locale on the same path, so request.ts falls back to the deployment default', () => {
    const doc = { cookie: '' };
    clearLocaleCookie(doc);
    expect(doc.cookie.split('; ')).toEqual(['erp_locale=', 'Path=/', 'Max-Age=0', 'SameSite=Lax']);
  });
});
