import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  toSupportedLocale,
} from '../locales';

describe('locales', () => {
  it('ships en and ar, with en as the default', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'ar']);
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALE_COOKIE).toBe('erp_locale');
  });

  it.each(['en', 'ar'])('%s is supported and resolves to itself', (locale) => {
    expect(isSupportedLocale(locale)).toBe(true);
    expect(toSupportedLocale(locale)).toBe(locale);
  });

  it.each([
    ['unknown', 'fr'],
    ['tampered', '<script>'],
    ['upper case', 'AR'],
    ['empty', ''],
    ['undefined', undefined],
    ['null', null],
    ['number', 1],
  ])('an %s value (%s) is unsupported and falls back to en (T-3-01)', (_label, value) => {
    expect(isSupportedLocale(value)).toBe(false);
    expect(toSupportedLocale(value)).toBe('en');
  });
});
