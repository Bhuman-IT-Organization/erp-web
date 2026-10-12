import type { Locale } from './locales';

export type Direction = 'ltr' | 'rtl';

/** Grows with `SUPPORTED_LOCALES` (fa, he, ur when added). */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

/**
 * The text direction of a locale. Set ONCE, on `<html dir>` in `app/layout.tsx` — exactly what
 * the legacy `head.php` does with `is_rtl()`; no component sets `dir` itself.
 */
export function direction(locale: Locale): Direction {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}
