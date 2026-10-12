import { describe, expect, it } from 'vitest';
import {
  cleanTaxesName,
  inUseGroups,
  isLocked,
  isTaxesField,
  TAXES_FIELDS,
  TAXES_MESSAGE_KEYS,
  TAXES_NAME_MAX,
  taxesFormSchema,
  taxesRowSchema,
  taxesSchema,
  taxesUsageSchema,
  toTaxesForm,
  validationIssuesSchema,
  type Taxes,
  type TaxesUsage,
} from '../taxes.schema';
import en from '../../messages/en.json';

const NO_USE: TaxesUsage = {
  items: 0,
  expenses: 0,
  subscriptions: 0,
  vendorItems: 0,
  purchaseLines: 0,
  warehouseLines: 0,
  fixedEquipmentLines: 0,
  salesReturnLines: 0,
  accounting: 0,
};

const ITEM: Taxes = { id: '7', name: 'VAT', rate: '5.00', usage: NO_USE, isDefault: false };

/** The first issue's message key for `values`, or `null` when the form schema accepts them. */
function firstKey(values: { name: string; rate: string }): string | null {
  const result = taxesFormSchema.safeParse(values);
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('taxes schemas', () => {
  it('parses a wire record with its nine usage groups and the default flag, and rejects a missing field', () => {
    expect(taxesSchema.parse(ITEM)).toEqual(ITEM);
    expect(taxesSchema.safeParse({ id: '7', name: 'VAT', rate: '5.00' }).success).toBe(false);
    expect(taxesSchema.safeParse({ ...ITEM, isDefault: undefined }).success).toBe(false);
    expect(Object.keys(taxesUsageSchema.shape)).toEqual([
      'items',
      'expenses',
      'subscriptions',
      'vendorItems',
      'purchaseLines',
      'warehouseLines',
      'fixedEquipmentLines',
      'salesReturnLines',
      'accounting',
    ]);
    expect(taxesUsageSchema.safeParse({ ...NO_USE, items: -1 }).success).toBe(false);
    expect(taxesUsageSchema.safeParse({ ...NO_USE, items: 1.5 }).success).toBe(false);
  });

  it('the list row equals the record: the row carries the usage and the flag the delete and the lock read', () => {
    expect(taxesRowSchema.parse(ITEM)).toEqual(taxesSchema.parse(ITEM));
    expect(Object.keys(taxesRowSchema.shape)).toEqual(Object.keys(taxesSchema.shape));
  });

  it('refuses an empty name, a name over 100 characters, an empty rate and a rate that is not a number', () => {
    expect(TAXES_NAME_MAX).toBe(100);
    expect(firstKey({ name: '   ', rate: '5' })).toBe('enter_name');
    expect(firstKey({ name: 'x'.repeat(101), rate: '5' })).toBe('name_too_long');
    expect(firstKey({ name: 'x'.repeat(100), rate: '5' })).toBeNull();
    expect(firstKey({ name: 'VAT', rate: '  ' })).toBe('enter_rate');
    expect(firstKey({ name: 'VAT', rate: 'abc' })).toBe('rate_invalid');
    expect(firstKey({ name: 'VAT', rate: '1,000.5' })).toBe('rate_invalid');
    expect(firstKey({ name: 'VAT', rate: '1e3' })).toBe('rate_invalid');
    expect(firstKey({ name: 'VAT', rate: '-' })).toBe('rate_invalid');
  });

  it('accepts what Perfex accepts: 12.5, -1, .5, and a name holding < and > as typed (D-19)', () => {
    expect(taxesFormSchema.parse({ name: ' VAT ', rate: ' 12.5 ' })).toEqual({
      name: 'VAT',
      rate: '12.5',
    });
    expect(firstKey({ name: 'VAT', rate: '-1' })).toBeNull();
    expect(firstKey({ name: 'VAT', rate: '.5' })).toBeNull();
    expect(firstKey({ name: 'VAT', rate: '5.' })).toBeNull();
    expect(taxesFormSchema.parse({ name: 'Fuel < 50 km', rate: '5' }).name).toBe('Fuel < 50 km');
    expect(taxesFormSchema.parse({ name: '<b>x</b>', rate: '5' }).name).toBe('<b>x</b>');
  });

  it('refuses a rate the column cannot hold once rounded to two places (13 integer digits), as the api does', () => {
    expect(firstKey({ name: 'VAT', rate: '9999999999999.99' })).toBeNull();
    expect(firstKey({ name: 'VAT', rate: '9999999999999.995' })).toBe('rate_too_large');
    expect(firstKey({ name: 'VAT', rate: '10000000000000' })).toBe('rate_too_large');
    expect(firstKey({ name: 'VAT', rate: '-10000000000000' })).toBe('rate_too_large');
    expect(firstKey({ name: 'VAT', rate: '0099999999999999' })).toBe('rate_too_large');
    expect(firstKey({ name: 'VAT', rate: '0000000000000001' })).toBeNull();
  });

  it('never shows a | error: every | is removed before the name is validated', () => {
    expect(taxesFormSchema.parse({ name: 'VAT|5', rate: '5' }).name).toBe('VAT5');
    expect(firstKey({ name: '|||', rate: '5' })).toBe('enter_name');
  });

  it('cleanTaxesName removes every | and collapses runs of spaces, as Perfex does on change', () => {
    expect(cleanTaxesName('VAT | 5')).toBe('VAT 5');
    expect(cleanTaxesName('a|b|c')).toBe('abc');
    expect(cleanTaxesName('VAT  5')).toBe('VAT 5');
    expect(cleanTaxesName('Fuel < 50 km')).toBe('Fuel < 50 km');
  });

  it('every message key the schema reports exists in en.json', () => {
    for (const key of Object.values(TAXES_MESSAGE_KEYS)) {
      expect(en.taxes).toHaveProperty(key);
    }
  });

  it('isLocked: expenses or subscriptions use the tax, or a default tax in Settings names it (D-21)', () => {
    expect(isLocked(ITEM)).toBe(false);
    expect(isLocked({ ...ITEM, usage: { ...NO_USE, expenses: 1 } })).toBe(true);
    expect(isLocked({ ...ITEM, usage: { ...NO_USE, subscriptions: 2 } })).toBe(true);
    expect(isLocked({ ...ITEM, isDefault: true })).toBe(true);
    // Items, accounting and the other groups block a delete, never an edit (Perfex's own rule).
    expect(
      isLocked({
        ...ITEM,
        usage: { ...NO_USE, items: 3, accounting: 1, purchaseLines: 4, salesReturnLines: 1 },
      }),
    ).toBe(false);
  });

  it('inUseGroups lists the non-zero groups in the order items, expenses, subscriptions, then the line tables and accounting', () => {
    expect(inUseGroups(NO_USE)).toEqual([]);
    expect(inUseGroups({ ...NO_USE, purchaseLines: 1, items: 2 })).toEqual([
      'items',
      'purchaseLines',
    ]);
    expect(
      inUseGroups({
        items: 1,
        expenses: 1,
        subscriptions: 1,
        vendorItems: 1,
        purchaseLines: 1,
        warehouseLines: 1,
        fixedEquipmentLines: 1,
        salesReturnLines: 1,
        accounting: 1,
      }),
    ).toEqual([
      'items',
      'expenses',
      'subscriptions',
      'vendorItems',
      'purchaseLines',
      'warehouseLines',
      'fixedEquipmentLines',
      'salesReturnLines',
      'accounting',
    ]);
  });

  it('a record becomes form values; only the two form fields are api issue targets', () => {
    expect(toTaxesForm(ITEM)).toEqual({ name: 'VAT', rate: '5.00' });
    expect(TAXES_FIELDS).toEqual(['name', 'rate']);
    expect(isTaxesField('name')).toBe(true);
    expect(isTaxesField('rate')).toBe(true);
    expect(isTaxesField('id')).toBe(false);
    expect(isTaxesField('usage')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([
        { path: ['rate'], message: 'the rate is too large', code: 'x' },
      ]),
    ).toEqual([{ path: ['rate'], message: 'the rate is too large' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
