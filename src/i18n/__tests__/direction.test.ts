import { describe, expect, it } from 'vitest';
import { RTL_LOCALES, direction } from '../direction';
import { SUPPORTED_LOCALES } from '../locales';

describe('direction', () => {
  it('en reads left to right', () => {
    expect(direction('en')).toBe('ltr');
  });

  it('ar reads right to left', () => {
    expect(direction('ar')).toBe('rtl');
  });

  it('every RTL locale is a supported locale', () => {
    for (const locale of RTL_LOCALES) expect(SUPPORTED_LOCALES).toContain(locale);
  });
});
