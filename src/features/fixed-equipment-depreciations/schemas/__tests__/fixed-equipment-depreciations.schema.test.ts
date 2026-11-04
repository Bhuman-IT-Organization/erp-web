import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import {
  FIXED_EQUIPMENT_DEPRECIATIONS_FIELDS,
  FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS,
  FIXED_EQUIPMENT_DEPRECIATIONS_NAME_MAX,
  fixedEquipmentDepreciationsFormSchema,
  fixedEquipmentDepreciationsRowSchema,
  fixedEquipmentDepreciationsSchema,
  isFixedEquipmentDepreciationsField,
  toFixedEquipmentDepreciationsBody,
  toFixedEquipmentDepreciationsForm,
  validationIssuesSchema,
  type FixedEquipmentDepreciations,
} from '../fixed-equipment-depreciations.schema';

const ITEM: FixedEquipmentDepreciations = { id: '3', name: 'Straight line', term: 60 };
const LEGACY: FixedEquipmentDepreciations = { id: '4', name: 'Legacy', term: null };

/** The first issue's message key for `name` (with a valid term), or `null` when accepted. */
function nameKey(name: string): string | null {
  const result = fixedEquipmentDepreciationsFormSchema.safeParse({ name, term: '12' });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

/** The first issue's message key for `term` (with a valid name), or `null` when accepted. */
function termKey(term: string): string | null {
  const result = fixedEquipmentDepreciationsFormSchema.safeParse({ name: 'Straight line', term });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('fixed-equipment-depreciations schemas', () => {
  it('parses a wire record, a term or null, and rejects a missing field', () => {
    expect(fixedEquipmentDepreciationsSchema.parse(ITEM)).toEqual(ITEM);
    expect(fixedEquipmentDepreciationsSchema.parse(LEGACY)).toEqual(LEGACY);
    expect(fixedEquipmentDepreciationsSchema.safeParse({ id: '3', term: 12 }).success).toBe(false);
    expect(fixedEquipmentDepreciationsSchema.safeParse({ name: 'X', term: 12 }).success).toBe(
      false,
    );
    expect(fixedEquipmentDepreciationsSchema.safeParse({ id: '3', name: 'X' }).success).toBe(false);
  });

  it('takes the id as text only: the api always sends text', () => {
    expect(
      fixedEquipmentDepreciationsSchema.safeParse({ id: 3, name: 'X', term: 12 }).success,
    ).toBe(false);
  });

  it('the list row is the record', () => {
    expect(fixedEquipmentDepreciationsRowSchema.parse(ITEM)).toEqual(
      fixedEquipmentDepreciationsSchema.parse(ITEM),
    );
  });

  it('refuses an empty name, an all-space name and one over 200 characters; accepts exactly 200', () => {
    expect(FIXED_EQUIPMENT_DEPRECIATIONS_NAME_MAX).toBe(200);
    expect(nameKey('')).toBe('enter_name');
    expect(nameKey('   ')).toBe('enter_name');
    expect(nameKey('x'.repeat(201))).toBe('name_too_long');
    expect(nameKey('x'.repeat(200))).toBeNull();
  });

  it('has no minimum beyond one character: a one-letter name is accepted (Perfex has none)', () => {
    expect(nameKey('A')).toBeNull();
  });

  it('accepts any character: Arabic, punctuation and markup', () => {
    for (const name of ['إهلاك ثابت', 'Five years!', '36 / 60', '<b>x</b>', 'Amortización ñ']) {
      expect(nameKey(name), name).toBeNull();
    }
  });

  it('counts characters, not bytes: 200 Arabic letters pass, 201 do not', () => {
    expect(nameKey('ع'.repeat(200))).toBeNull();
    expect(nameKey('ع'.repeat(201))).toBe('name_too_long');
  });

  it('requires the number of months, as a whole number greater than 0', () => {
    expect(termKey('')).toBe('enter_months');
    expect(termKey('   ')).toBe('enter_months');
    expect(termKey('0')).toBe('months_whole');
    expect(termKey('-6')).toBe('months_whole');
    expect(termKey('1.5')).toBe('months_whole');
    expect(termKey('twelve')).toBe('months_whole');
    expect(termKey('1')).toBeNull();
    expect(termKey('60')).toBeNull();
  });

  it('refuses a number of months the api cannot store: 21 digits is months_too_large', () => {
    expect(termKey('1'.repeat(21))).toBe('months_too_large');
    expect(termKey(String(Number.MAX_SAFE_INTEGER))).toBeNull();
    expect(termKey(String(Number.MAX_SAFE_INTEGER + 2))).toBe('months_too_large');
  });

  it('trims the name, keeps inner spaces, and normalises the number of months (007 is 7)', () => {
    expect(
      fixedEquipmentDepreciationsFormSchema.parse({ name: '  Five  years ', term: ' 060 ' }),
    ).toEqual({ name: 'Five  years', term: '60' });
    expect(fixedEquipmentDepreciationsFormSchema.parse({ name: 'X', term: '007' }).term).toBe('7');
  });

  it('every message key the schema reports exists in en.json', () => {
    for (const key of Object.values(FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS)) {
      expect(en['fixed-equipment-depreciations']).toHaveProperty(key);
    }
  });

  it('a record becomes form values (the term as text, empty for none); name and term are the api issue targets', () => {
    expect(toFixedEquipmentDepreciationsForm(ITEM)).toEqual({ name: 'Straight line', term: '60' });
    expect(toFixedEquipmentDepreciationsForm(LEGACY)).toEqual({ name: 'Legacy', term: '' });
    expect(FIXED_EQUIPMENT_DEPRECIATIONS_FIELDS).toEqual(['name', 'term']);
    expect(isFixedEquipmentDepreciationsField('name')).toBe(true);
    expect(isFixedEquipmentDepreciationsField('term')).toBe(true);
    expect(isFixedEquipmentDepreciationsField('id')).toBe(false);
  });

  it('parsed form values become the api body: the number of months as a number', () => {
    const values = fixedEquipmentDepreciationsFormSchema.parse({
      name: ' Five years ',
      term: '060',
    });
    expect(toFixedEquipmentDepreciationsBody(values)).toEqual({ name: 'Five years', term: 60 });
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too long', code: 'too_big' }]),
    ).toEqual([{ path: ['name'], message: 'Too long' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
