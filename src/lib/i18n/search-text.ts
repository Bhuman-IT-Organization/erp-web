/**
 * The one diacritic-insensitive matcher for local, client-side filtering of translated labels:
 * the sidebar search (D-38) today, pickers later.
 *
 * Matching is `String.prototype.includes` over normalised text and NEVER a `RegExp` built from
 * the input: a pattern from a search box is a ReDoS vector (T-3.2-29), and a user typing `(` must
 * find the character `(`, not crash the menu.
 */

/** Latin combining marks (U+0300–U+036F), Arabic harakat (U+064B–U+065F) and the superscript alef (U+0670). */
const DIACRITICS = /[̀-ًͯ-ٰٟ]/g;

/** NFD, strip Latin combining marks and Arabic harakat, then `toLocaleLowerCase`. */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS, '').toLocaleLowerCase();
}

/** `normalizeSearchText(label).includes(normalizeSearchText(query))`; an empty query matches everything. */
export function matchesSearch(label: string, query: string): boolean {
  return normalizeSearchText(label).includes(normalizeSearchText(query));
}
