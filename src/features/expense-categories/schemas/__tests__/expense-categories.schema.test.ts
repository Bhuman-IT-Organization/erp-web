import { describe, expect, it } from 'vitest';
import {
  EMPTY_EXPENSE_CATEGORIES_FORM,
  EXPENSE_CATEGORIES_MESSAGE_KEYS,
  EXPENSE_CATEGORIES_NAME_MAX,
  expenseCategoriesFormSchema,
  expenseCategoriesRowSchema,
  expenseCategoriesSchema,
  isExpenseCategoriesField,
  toExpenseCategoriesForm,
  validationIssuesSchema,
} from '../expense-categories.schema';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

const ITEM = { id: '7', name: 'Travel', description: 'Line one\nline two' };
const ROW = { ...ITEM, expenseCount: 3, mappingCount: 0, pettyCashCount: 1 };
const LONG_DESCRIPTION = 100_000;

/** The first issue's message key, or `undefined` when the name parses. */
function nameIssue(name: string): string | undefined {
  const result = expenseCategoriesFormSchema.safeParse({ name });
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('expense-categories schemas', () => {
  it('parses a wire record and rejects a missing field', () => {
    expect(expenseCategoriesSchema.parse(ITEM)).toEqual(ITEM);
    expect(expenseCategoriesSchema.safeParse({ id: '7', name: 'Travel' }).success).toBe(false);
  });

  it('a list row carries the three usage counts, each a non-negative integer (D-07, D-15)', () => {
    expect(expenseCategoriesRowSchema.parse(ROW)).toEqual(ROW);
    expect(expenseCategoriesRowSchema.safeParse(ITEM).success).toBe(false);
    for (const field of ['expenseCount', 'mappingCount', 'pettyCashCount'] as const) {
      expect(expenseCategoriesRowSchema.safeParse({ ...ROW, [field]: -1 }).success, field).toBe(
        false,
      );
      expect(expenseCategoriesRowSchema.safeParse({ ...ROW, [field]: 1.5 }).success, field).toBe(
        false,
      );
    }
  });

  it('the name bound equals the api (191, the VARCHAR(191) column)', () => {
    expect(EXPENSE_CATEGORIES_NAME_MAX).toBe(191);
  });

  it('the form trims the name; an empty one is the enter_name KEY, which exists in both packs', () => {
    expect(expenseCategoriesFormSchema.parse({ name: '  Travel ' })).toEqual({ name: 'Travel' });
    expect(nameIssue('   ')).toBe(EXPENSE_CATEGORIES_MESSAGE_KEYS.name);
    expect(en['expense-categories']).toHaveProperty(EXPENSE_CATEGORIES_MESSAGE_KEYS.name);
    expect(ar['expense-categories']).toHaveProperty(EXPENSE_CATEGORIES_MESSAGE_KEYS.name);
  });

  it('a name of 191 characters is accepted and one of 192 is the name_too_long KEY', () => {
    expect(nameIssue('a'.repeat(EXPENSE_CATEGORIES_NAME_MAX))).toBeUndefined();
    expect(nameIssue('a'.repeat(EXPENSE_CATEGORIES_NAME_MAX + 1))).toBe(
      EXPENSE_CATEGORIES_MESSAGE_KEYS.nameTooLong,
    );
    expect(en['expense-categories']).toHaveProperty(EXPENSE_CATEGORIES_MESSAGE_KEYS.nameTooLong);
  });

  it('refuses no character a Perfex name may hold: < and > are accepted unchanged (D-19)', () => {
    for (const name of ['Fuel < 50 km', '<script>alert(1)</script>', 'A & B "quoted"']) {
      expect(expenseCategoriesFormSchema.parse({ name })).toEqual({ name });
    }
  });

  it('the description is optional and has no cap: 100 000 characters and markup are accepted (D-19)', () => {
    const long = 'x'.repeat(LONG_DESCRIPTION);
    expect(expenseCategoriesFormSchema.parse({ name: 'Travel', description: long })).toEqual({
      name: 'Travel',
      description: long,
    });
    expect(
      expenseCategoriesFormSchema.parse({ name: 'Travel', description: '<b>bold</b>' }).description,
    ).toBe('<b>bold</b>');
    expect(expenseCategoriesFormSchema.parse({ name: 'Travel' })).toEqual({ name: 'Travel' });
  });

  it('neither pack has a key for a refused character or a description cap (D-19)', () => {
    for (const pack of [en['expense-categories'], ar['expense-categories']]) {
      expect(pack).not.toHaveProperty('name_invalid_characters');
      expect(pack).not.toHaveProperty('description_too_long');
    }
  });

  it('a record becomes form values; the empty form has both fields; only the name is an api issue target', () => {
    expect(toExpenseCategoriesForm(ITEM)).toEqual({
      name: 'Travel',
      description: 'Line one\nline two',
    });
    expect(EMPTY_EXPENSE_CATEGORIES_FORM).toEqual({ name: '', description: '' });
    expect(isExpenseCategoriesField('name')).toBe(true);
    expect(isExpenseCategoriesField('description')).toBe(false);
    expect(isExpenseCategoriesField('id')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too short', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Too short' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
