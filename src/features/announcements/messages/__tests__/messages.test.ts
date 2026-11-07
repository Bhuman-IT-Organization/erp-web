import { describe, expect, it } from 'vitest';
import ar from '../ar.json';
import en from '../en.json';

/** Every key as a dotted path. */
function paths(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, one]) =>
    typeof one === 'object' && one !== null
      ? paths(one as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const text = (pack: unknown): Record<string, string> =>
  (pack as { announcements: Record<string, string> }).announcements;

const PERFEX_EN = {
  announcement_name: 'Subject',
  date_added: 'Date',
  show_to_staff: 'Show to staff',
  show_to_users: 'Show to clients',
  show_name: 'Show my name',
} as const;

describe('announcements messages', () => {
  it('registers one namespace named after the feature folder, in both locales', () => {
    expect(Object.keys(en)).toEqual(['announcements']);
    expect(Object.keys(ar)).toEqual(['announcements']);
  });

  it("carries Perfex's English text for the five labels", () => {
    for (const [key, value] of Object.entries(PERFEX_EN)) {
      expect(text(en)[key], `en.${key}`).toBe(value);
    }
  });

  it('has the five labels in Arabic, none empty', () => {
    for (const key of Object.keys(PERFEX_EN)) {
      expect(text(ar)[key]?.length, `ar.${key}`).toBeGreaterThan(0);
    }
  });

  it('English and Arabic hold the same key set', () => {
    expect(paths(ar).sort()).toEqual(paths(en).sort());
  });

  it('puts an ICU plural on {max} and shows the number as {maxN}, in both locales', () => {
    for (const pack of [en, ar]) {
      for (const key of ['name_too_long', 'message_too_long']) {
        const message = text(pack)[key] ?? '';
        expect(message, key).toContain('{max, plural,');
        expect(message, key).toContain('{maxN}');
        expect(message, key).toContain('other {');
      }
    }
  });

  it('gives Arabic the one, two, few and many forms as well', () => {
    for (const key of ['name_too_long', 'message_too_long']) {
      const message = text(ar)[key] ?? '';
      for (const form of ['one {', 'two {', 'few {', 'many {']) {
        expect(message, `${key} ${form}`).toContain(form);
      }
    }
  });
});
