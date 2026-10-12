import { describe, expect, it } from 'vitest';
import { CURRENCY_CODE_MAX } from '@/config/currency-code';
import {
  BASE_CODE,
  BASE_LOCKED_CODE,
  CURRENCIES_FIELDS,
  CURRENCIES_MESSAGE_KEYS,
  currenciesFormSchema,
  currenciesLockUsageSchema,
  currenciesRowSchema,
  currenciesSchema,
  currenciesUsageSchema,
  IN_USE_CODE,
  inUseGroups,
  isCodeLocked,
  isCurrenciesField,
  lockGroups,
  makeBaseRefusalOf,
  newCurrenciesForm,
  OTHER_MODULE_CODE,
  refusalOf,
  registeredUses,
  toCurrenciesForm,
  validationIssuesSchema,
  type Currencies,
  type CurrenciesFormValues,
  type CurrenciesLockUsage,
  type CurrenciesUsage,
} from '../currencies.schema';
import en from '../../messages/en.json';

const NO_USE: CurrenciesUsage = {
  invoices: 0,
  expenses: 0,
  proposals: 0,
  estimates: 0,
  customers: 0,
  creditNotes: 0,
  subscriptions: 0,
  purchaseOrders: 0,
  purchaseRequests: 0,
  purchaseQuotations: 0,
  purchaseInvoices: 0,
  debitNotes: 0,
  fafRequests: 0,
  vendors: 0,
  goodsReceipts: 0,
  goodsDeliveries: 0,
  packingLists: 0,
  orderReturns: 0,
  fixedEquipmentCarts: 0,
  payslipsFrom: 0,
  payslipsTo: 0,
  purchaseConvertedFrom: 0,
  purchaseConvertedTo: 0,
  fixedEquipmentLocations: 0,
};
const NO_LOCK: CurrenciesLockUsage = { exchangeRates: 0, exchangeRateLogs: 0, payslipCodes: 0 };

const ITEM: Currencies = {
  id: '2',
  name: 'EUR',
  symbol: '€',
  decimalSeparator: ',',
  thousandSeparator: '.',
  placement: 'after',
  isBase: false,
  usage: NO_USE,
  lockUsage: NO_LOCK,
  registeredUsage: {},
  canMakeBase: true,
};

/** A full form body with the given code and symbol. */
const body = (
  name: string,
  extra: Partial<CurrenciesFormValues> = {},
): Record<string, unknown> => ({
  name,
  symbol: '$',
  decimalSeparator: '.',
  thousandSeparator: ',',
  placement: 'before',
  ...extra,
});

/** The first issue's message key, or `null` when the form schema accepts the body. */
function firstKey(values: Record<string, unknown>): string | null {
  const result = currenciesFormSchema.safeParse(values);
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('currencies schemas', () => {
  it('parses a wire record with every field, the 24 delete groups, the three lock groups and the registered uses, and rejects a missing field', () => {
    expect(currenciesSchema.parse(ITEM)).toEqual(ITEM);
    expect(currenciesSchema.safeParse({ id: '2', name: 'EUR' }).success).toBe(false);
    expect(currenciesSchema.safeParse({ ...ITEM, lockUsage: undefined }).success).toBe(false);
    expect(currenciesSchema.safeParse({ ...ITEM, canMakeBase: undefined }).success).toBe(false);
    expect(currenciesSchema.safeParse({ ...ITEM, registeredUsage: { samples: -1 } }).success).toBe(
      false,
    );
    expect(Object.keys(currenciesUsageSchema.shape)).toEqual([
      'invoices',
      'expenses',
      'proposals',
      'estimates',
      'customers',
      'creditNotes',
      'subscriptions',
      'purchaseOrders',
      'purchaseRequests',
      'purchaseQuotations',
      'purchaseInvoices',
      'debitNotes',
      'fafRequests',
      'vendors',
      'goodsReceipts',
      'goodsDeliveries',
      'packingLists',
      'orderReturns',
      'fixedEquipmentCarts',
      'payslipsFrom',
      'payslipsTo',
      'purchaseConvertedFrom',
      'purchaseConvertedTo',
      'fixedEquipmentLocations',
    ]);
    expect(Object.keys(currenciesLockUsageSchema.shape)).toEqual([
      'exchangeRates',
      'exchangeRateLogs',
      'payslipCodes',
    ]);
  });

  it('parses a record whose separators and placement are NULL (Perfex stored none)', () => {
    const nulls = { ...ITEM, decimalSeparator: null, thousandSeparator: null, placement: null };
    expect(currenciesSchema.parse(nulls)).toEqual(nulls);
  });

  it('the list row equals the record: the row carries every count the dialogs read', () => {
    expect(currenciesRowSchema.parse(ITEM)).toEqual(currenciesSchema.parse(ITEM));
    expect(Object.keys(currenciesRowSchema.shape)).toEqual(Object.keys(currenciesSchema.shape));
  });

  it('refuses an empty and an all-space code (enter_name) and 4 characters (name_too_long), the limit read from the shared code schema', () => {
    expect(CURRENCY_CODE_MAX).toBe(3);
    expect(firstKey(body(''))).toBe('enter_name');
    expect(firstKey(body('   '))).toBe('enter_name');
    expect(firstKey(body('ABCD'))).toBe('name_too_long');
    expect(firstKey(body('x'.repeat(CURRENCY_CODE_MAX + 1)))).toBe('name_too_long');
    expect(firstKey(body('ABC'))).toBeNull();
  });

  it('trims and upper-cases the code as the api does, and accepts usd and three euro signs', () => {
    expect(currenciesFormSchema.parse(body(' usd ')).name).toBe('USD');
    expect(currenciesFormSchema.parse(body('usd')).name).toBe('USD');
    expect(currenciesFormSchema.parse(body('€€€')).name).toBe('€€€');
  });

  it('refuses an empty symbol, an all-space symbol and 11 characters; accepts "$ " and "<b>" as typed', () => {
    expect(firstKey(body('USD', { symbol: '' }))).toBe('enter_symbol');
    expect(firstKey(body('USD', { symbol: '   ' }))).toBe('enter_symbol');
    expect(firstKey(body('USD', { symbol: 'x'.repeat(11) }))).toBe('symbol_too_long');
    expect(currenciesFormSchema.parse(body('USD', { symbol: '$ ' })).symbol).toBe('$ ');
    expect(currenciesFormSchema.parse(body('USD', { symbol: '<b>' })).symbol).toBe('<b>');
    expect(currenciesFormSchema.parse(body('USD', { symbol: 'x'.repeat(10) })).symbol).toHaveLength(
      10,
    );
  });

  it("takes only Perfex's options for the separators and the placement, '' and ' ' included as thousand separators, and refuses no choice", () => {
    expect(firstKey(body('USD', { decimalSeparator: ' ' as never }))).toBe('choose_option');
    expect(firstKey(body('USD', { thousandSeparator: '_' as never }))).toBe('choose_option');
    expect(firstKey(body('USD', { placement: 'middle' as never }))).toBe('choose_option');
    expect(firstKey(body('USD', { decimalSeparator: null }))).toBe('choose_option');
    expect(firstKey(body('USD', { thousandSeparator: null }))).toBe('choose_option');
    expect(firstKey(body('USD', { placement: null }))).toBe('choose_option');
    expect(
      currenciesFormSchema.parse(body('USD', { thousandSeparator: '' })).thousandSeparator,
    ).toBe('');
    expect(
      currenciesFormSchema.parse(body('USD', { thousandSeparator: ' ' })).thousandSeparator,
    ).toBe(' ');
    expect(
      currenciesFormSchema.parse(body('USD', { thousandSeparator: "'" })).thousandSeparator,
    ).toBe("'");
    expect(currenciesFormSchema.parse(body('USD', { placement: 'after' })).placement).toBe('after');
  });

  it('every message key the schema reports exists in en.json', () => {
    for (const key of Object.values(CURRENCIES_MESSAGE_KEYS)) {
      expect(en.currencies).toHaveProperty(key);
    }
  });

  it('a record becomes form values; a NULL separator or placement is no choice made', () => {
    expect(toCurrenciesForm(ITEM)).toEqual({
      name: 'EUR',
      symbol: '€',
      decimalSeparator: ',',
      thousandSeparator: '.',
      placement: 'after',
    });
    expect(
      toCurrenciesForm({
        ...ITEM,
        decimalSeparator: null,
        thousandSeparator: null,
        placement: null,
      }),
    ).toMatchObject({ decimalSeparator: null, thousandSeparator: null, placement: null });
    expect(toCurrenciesForm({ ...ITEM, thousandSeparator: '' }).thousandSeparator).toBe('');
  });

  it("a new currency is placed before the amount with the deployment's separators (Perfex's modal seeds)", () => {
    expect(newCurrenciesForm({ decimalSeparator: ',', thousandSeparator: '.' })).toEqual({
      name: '',
      symbol: '',
      decimalSeparator: ',',
      thousandSeparator: '.',
      placement: 'before',
    });
    expect(newCurrenciesForm({ decimalSeparator: '.', thousandSeparator: ' ' })).toMatchObject({
      decimalSeparator: '.',
      thousandSeparator: ' ',
    });
  });

  it('only the code and the symbol are api issue targets', () => {
    expect(CURRENCIES_FIELDS).toEqual(['name', 'symbol']);
    expect(isCurrenciesField('name')).toBe(true);
    expect(isCurrenciesField('symbol')).toBe(true);
    expect(isCurrenciesField('placement')).toBe(false);
    expect(isCurrenciesField('id')).toBe(false);
  });

  it('inUseGroups and lockGroups answer the non-zero groups in the api order', () => {
    expect(inUseGroups(NO_USE)).toEqual([]);
    expect(inUseGroups({ ...NO_USE, payslipsTo: 1, invoices: 2, vendors: 3 })).toEqual([
      'invoices',
      'vendors',
      'payslipsTo',
    ]);
    expect(lockGroups(NO_LOCK)).toEqual([]);
    expect(lockGroups({ exchangeRates: 0, exchangeRateLogs: 2, payslipCodes: 1 })).toEqual([
      'exchangeRateLogs',
      'payslipCodes',
    ]);
  });

  it('registeredUses answers the registered keys above 0, by key', () => {
    expect(registeredUses(ITEM)).toEqual([]);
    expect(registeredUses({ registeredUsage: { zeta: 1, samples: 3, alpha: 0 } })).toEqual([
      ['samples', 3],
      ['zeta', 1],
    ]);
  });

  it('refusalOf answers 0001 for a row in use (even the base with a registered use), 0002 for an unused base, 0003 for a registered use, else nothing', () => {
    const inUse = {
      ...ITEM,
      isBase: true,
      usage: { ...NO_USE, invoices: 1 },
      registeredUsage: { samples: 3 },
    };
    expect(refusalOf(inUse)).toBe(IN_USE_CODE);
    expect(refusalOf({ ...ITEM, isBase: true })).toBe(BASE_CODE);
    expect(refusalOf({ ...ITEM, registeredUsage: { samples: 3 } })).toBe(OTHER_MODULE_CODE);
    expect(refusalOf(ITEM)).toBeUndefined();
    // Exchange rates never block a delete (D-40).
    expect(refusalOf({ ...ITEM, lockUsage: { ...NO_LOCK, exchangeRates: 4 } })).toBeUndefined();
    expect(refusalOf(undefined)).toBeUndefined();
  });

  it('makeBaseRefusalOf answers 0004 only for a non-base row that cannot be made the base', () => {
    expect(makeBaseRefusalOf({ ...ITEM, canMakeBase: false })).toBe(BASE_LOCKED_CODE);
    expect(makeBaseRefusalOf(ITEM)).toBeUndefined();
    expect(makeBaseRefusalOf({ ...ITEM, isBase: true, canMakeBase: false })).toBeUndefined();
    expect(makeBaseRefusalOf(undefined)).toBeUndefined();
  });

  it('isCodeLocked: any delete group, lock group or registered use above 0 locks the code (answers 2 and 8 c)', () => {
    expect(isCodeLocked({ ...ITEM, usage: { ...NO_USE, invoices: 1 } })).toBe(true);
    expect(isCodeLocked({ ...ITEM, lockUsage: { ...NO_LOCK, exchangeRates: 1 } })).toBe(true);
    expect(isCodeLocked({ ...ITEM, registeredUsage: { samples: 1 } })).toBe(true);
    expect(isCodeLocked(ITEM)).toBe(false);
    expect(isCodeLocked(undefined)).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too short', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Too short' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
