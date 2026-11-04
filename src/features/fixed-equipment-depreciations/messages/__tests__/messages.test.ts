import { describe, expect, it } from 'vitest';
import ar from '../ar.json';
import en from '../en.json';

/** Every key, `errors.<code>` included, as a dotted path. */
function paths(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, one]) =>
    typeof one === 'object' && one !== null
      ? paths(one as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/**
 * Perfex's own keys and English text: the core's `id` and `add`, and the Fixed Equipment module's
 * (`modules/fixed_equipment/language/english/fixed_equipment_lang.php`).
 */
const PERFEX_TEXT = {
  id: 'ID',
  add: 'Add',
  fe_depreciations: 'Depreciations',
  fe_add_depreciations: 'Add Depreciations',
  fe_edit_depreciations: 'Edit Depreciations',
  fe_name: 'Name',
  fe_term: 'Term',
  fe_depreciation_name: 'Depreciation Name',
  fe_number_of_months: 'Number of Months',
} as const;

/** Arabic's six plural categories: a count message names every one of them. */
const ARABIC_FORMS = ['zero {', 'one {', 'two {', 'few {', 'many {', 'other {'] as const;

describe('fixed-equipment-depreciations messages', () => {
  it('registers one namespace named after the feature folder, in both locales', () => {
    expect(Object.keys(en)).toEqual(['fixed-equipment-depreciations']);
    expect(Object.keys(ar)).toEqual(['fixed-equipment-depreciations']);
  });

  it("uses Perfex's exact English for every key Perfex has", () => {
    for (const [key, text] of Object.entries(PERFEX_TEXT)) {
      expect(
        en['fixed-equipment-depreciations'][key as keyof typeof PERFEX_TEXT],
        `en.${key}`,
      ).toBe(text);
    }
  });

  it('every Perfex key has an Arabic text (the module ships none, so these are ours)', () => {
    for (const key of Object.keys(PERFEX_TEXT)) {
      expect(
        ar['fixed-equipment-depreciations'][key as keyof typeof PERFEX_TEXT].length,
        `ar.${key}`,
      ).toBeGreaterThan(0);
    }
  });

  it('English and Arabic hold the same key set', () => {
    expect(paths(ar).sort()).toEqual(paths(en).sort());
  });

  it('the Term cell is one plural message: English one and other; Arabic all six forms', () => {
    const english = en['fixed-equipment-depreciations'].term_months;
    expect(english).toContain('{count, plural,');
    expect(english).toContain('one {');
    expect(english).toContain('other {');
    const arabic = ar['fixed-equipment-depreciations'].term_months;
    expect(arabic).toContain('{count, plural,');
    for (const form of ARABIC_FORMS) expect(arabic, form).toContain(form);
  });

  it('the Arabic name limit is a plural on {max} with all six forms ("{max} حرفًا" is wrong for 200)', () => {
    const arabic = ar['fixed-equipment-depreciations'].name_too_long;
    expect(arabic).toContain('{max, plural,');
    for (const form of ARABIC_FORMS) expect(arabic, form).toContain(form);
  });

  it('keeps the placeholders the screens fill: {name}, {query}, {maxN} and {countN}', () => {
    for (const pack of [en, ar]) {
      const p = pack['fixed-equipment-depreciations'];
      expect(p.edit_action_named).toContain('{name}');
      expect(p.delete_action_named).toContain('{name}');
      expect(p.delete_title).toContain('{name}');
      expect(p.no_match_heading).toContain('{query}');
      expect(p.name_too_long).toContain('{maxN}');
      expect(p.term_months).toContain('{countN}');
    }
  });
});
