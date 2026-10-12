import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearchText } from '../search-text';

describe('normalizeSearchText', () => {
  it('strips Latin accents and lower-cases', () => {
    expect(normalizeSearchText('Éléments')).toBe('elements');
  });

  it('strips Arabic harakat and the superscript alef', () => {
    expect(normalizeSearchText('المُوظَّفين')).toBe('الموظفين');
    expect(normalizeSearchText('هٰذا')).toBe('هذا');
  });
});

describe('matchesSearch', () => {
  it('ignores Arabic diacritics on either side (D-38)', () => {
    expect(matchesSearch('المُوظفين', 'الموظفين')).toBe(true);
    expect(matchesSearch('الموظفين', 'المُوظفين')).toBe(true);
  });

  it('matches a substring, ignoring case', () => {
    expect(matchesSearch('Staff', 'TAF')).toBe(true);
    expect(matchesSearch('Staff', 'roles')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesSearch('Staff', '')).toBe(true);
  });

  it('treats regex metacharacters as text and never throws (no RegExp from input, D-38)', () => {
    expect(() => matchesSearch('Staff', '(')).not.toThrow();
    expect(matchesSearch('Staff', '(')).toBe(false);
    expect(matchesSearch('Q&A (old)', '(old')).toBe(true);
    expect(matchesSearch('Staff', '.*')).toBe(false);
  });
});
