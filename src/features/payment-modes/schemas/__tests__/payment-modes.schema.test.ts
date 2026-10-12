import { describe, expect, it } from 'vitest';
import {
  EMPTY_PAYMENT_MODES_FORM,
  inUseGroups,
  isPaymentModesField,
  PAYMENT_MODES_FIELDS,
  PAYMENT_MODES_MESSAGE_KEYS,
  PAYMENT_MODES_NAME_MAX,
  paymentModesFormSchema,
  paymentModesRowSchema,
  paymentModesSchema,
  paymentModesUsageSchema,
  refusalOf,
  toPaymentModesForm,
  validationIssuesSchema,
  type PaymentModes,
  type PaymentModesFormValues,
  type PaymentModesUsage,
} from '../payment-modes.schema';
import en from '../../messages/en.json';

const NO_USE: PaymentModesUsage = {
  invoicePayments: 0,
  expenses: 0,
  creditNoteRefunds: 0,
  purchaseInvoicePayments: 0,
  purchaseOrderPayments: 0,
  debitNoteRefunds: 0,
  fixedEquipmentRefunds: 0,
  orderReturnRefunds: 0,
};

const ITEM: PaymentModes = {
  id: '7',
  name: 'Bank transfer',
  description: 'Bank: First Bank\nIBAN: AE00 0000',
  active: true,
  showOnPdf: true,
  selectedByDefault: false,
  invoicesOnly: false,
  expensesOnly: true,
  usage: NO_USE,
  isCreditExpenseMode: false,
};

/** A full form body with the given name. */
const body = (name: string, extra: Partial<PaymentModesFormValues> = {}) => ({
  ...EMPTY_PAYMENT_MODES_FORM,
  name,
  ...extra,
});

/** The first issue's message key for `name`, or `null` when the form schema accepts it. */
function firstKey(name: string): string | null {
  const result = paymentModesFormSchema.safeParse(body(name));
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('payment-modes schemas', () => {
  it('parses a wire record with its five boxes, eight usage groups and the credit-expense flag, and rejects a missing field', () => {
    expect(paymentModesSchema.parse(ITEM)).toEqual(ITEM);
    expect(paymentModesSchema.safeParse({ id: '7', name: 'Cash' }).success).toBe(false);
    expect(paymentModesSchema.safeParse({ ...ITEM, usage: undefined }).success).toBe(false);
    expect(paymentModesSchema.safeParse({ ...ITEM, isCreditExpenseMode: undefined }).success).toBe(
      false,
    );
    expect(paymentModesSchema.safeParse({ ...ITEM, active: 1 }).success).toBe(false);
    expect(Object.keys(paymentModesUsageSchema.shape)).toEqual([
      'invoicePayments',
      'expenses',
      'creditNoteRefunds',
      'purchaseInvoicePayments',
      'purchaseOrderPayments',
      'debitNoteRefunds',
      'fixedEquipmentRefunds',
      'orderReturnRefunds',
    ]);
    expect(paymentModesUsageSchema.safeParse({ ...NO_USE, expenses: -1 }).success).toBe(false);
    expect(paymentModesUsageSchema.safeParse({ ...NO_USE, expenses: 1.5 }).success).toBe(false);
  });

  it('parses a record whose description is empty (Perfex stored NULL or nothing)', () => {
    expect(paymentModesSchema.parse({ ...ITEM, description: '' }).description).toBe('');
  });

  it('the list row equals the record: the row carries the usage and the lock the delete reads', () => {
    expect(paymentModesRowSchema.parse(ITEM)).toEqual(paymentModesSchema.parse(ITEM));
    expect(Object.keys(paymentModesRowSchema.shape)).toEqual(Object.keys(paymentModesSchema.shape));
  });

  it('refuses an empty name, an all-space name and one over 100 characters; accepts 100', () => {
    expect(PAYMENT_MODES_NAME_MAX).toBe(100);
    expect(firstKey('')).toBe('enter_name');
    expect(firstKey('   ')).toBe('enter_name');
    expect(firstKey('x'.repeat(101))).toBe('name_too_long');
    expect(firstKey('x'.repeat(100))).toBeNull();
  });

  it('trims the name and accepts every character unchanged, markup included (shown as text, D-34)', () => {
    expect(paymentModesFormSchema.parse(body('  Cash ')).name).toBe('Cash');
    expect(paymentModesFormSchema.parse(body('Cash < 50')).name).toBe('Cash < 50');
    expect(paymentModesFormSchema.parse(body('<script>alert(1)</script>')).name).toBe(
      '<script>alert(1)</script>',
    );
  });

  it('keeps a two-line description and a description with markup exactly as typed (no trim, no cap)', () => {
    const twoLines = 'Bank: First Bank\nIBAN: AE00 0000';
    expect(paymentModesFormSchema.parse(body('Bank', { description: twoLines })).description).toBe(
      twoLines,
    );
    expect(
      paymentModesFormSchema.parse(body('Bank', { description: ' <b>x</b> ' })).description,
    ).toBe(' <b>x</b> ');
    expect(
      paymentModesFormSchema.parse(body('Bank', { description: 'y'.repeat(5000) })).description,
    ).toHaveLength(5000);
  });

  it('takes the five boxes as booleans, Invoices only and Expenses only both ticked included (Perfex accepts it, D-29)', () => {
    const both = paymentModesFormSchema.parse(
      body('Cash', { invoicesOnly: true, expensesOnly: true }),
    );
    expect(both.invoicesOnly).toBe(true);
    expect(both.expensesOnly).toBe(true);
    expect(paymentModesFormSchema.safeParse({ ...body('Cash'), active: 'yes' }).success).toBe(
      false,
    );
    const withoutActive: Record<string, unknown> = { ...body('Cash') };
    delete withoutActive.active;
    expect(paymentModesFormSchema.safeParse(withoutActive).success).toBe(false);
  });

  it('a new mode starts with Active ticked and the four other boxes unticked (paymentmode.php :93)', () => {
    expect(EMPTY_PAYMENT_MODES_FORM).toEqual({
      name: '',
      description: '',
      active: true,
      showOnPdf: false,
      selectedByDefault: false,
      invoicesOnly: false,
      expensesOnly: false,
    });
  });

  it('every message key the schema reports exists in en.json', () => {
    for (const key of Object.values(PAYMENT_MODES_MESSAGE_KEYS)) {
      expect(en['payment-modes']).toHaveProperty(key);
    }
  });

  it('inUseGroups lists the non-zero groups in the api order', () => {
    expect(inUseGroups(NO_USE)).toEqual([]);
    expect(inUseGroups({ ...NO_USE, orderReturnRefunds: 1, invoicePayments: 2 })).toEqual([
      'invoicePayments',
      'orderReturnRefunds',
    ]);
    const all: PaymentModesUsage = {
      invoicePayments: 1,
      expenses: 1,
      creditNoteRefunds: 1,
      purchaseInvoicePayments: 1,
      purchaseOrderPayments: 1,
      debitNoteRefunds: 1,
      fixedEquipmentRefunds: 1,
      orderReturnRefunds: 1,
    };
    expect(inUseGroups(all)).toEqual([
      'invoicePayments',
      'expenses',
      'creditNoteRefunds',
      'purchaseInvoicePayments',
      'purchaseOrderPayments',
      'debitNoteRefunds',
      'fixedEquipmentRefunds',
      'orderReturnRefunds',
    ]);
  });

  it('refusalOf answers 0002 for the credit expense mode even when it is also in use, 0001 for a mode in use, undefined otherwise', () => {
    expect(refusalOf({ ...ITEM, isCreditExpenseMode: true })).toBe('ERP-PAYMENTMODES-0002');
    expect(
      refusalOf({ ...ITEM, isCreditExpenseMode: true, usage: { ...NO_USE, expenses: 3 } }),
    ).toBe('ERP-PAYMENTMODES-0002');
    expect(refusalOf({ ...ITEM, usage: { ...NO_USE, debitNoteRefunds: 1 } })).toBe(
      'ERP-PAYMENTMODES-0001',
    );
    expect(refusalOf(ITEM)).toBeUndefined();
    expect(refusalOf(undefined)).toBeUndefined();
  });

  it('a record becomes the seven form values; only the name is an api issue target', () => {
    expect(toPaymentModesForm(ITEM)).toEqual({
      name: 'Bank transfer',
      description: 'Bank: First Bank\nIBAN: AE00 0000',
      active: true,
      showOnPdf: true,
      selectedByDefault: false,
      invoicesOnly: false,
      expensesOnly: true,
    });
    expect(PAYMENT_MODES_FIELDS).toEqual(['name']);
    expect(isPaymentModesField('name')).toBe(true);
    expect(isPaymentModesField('description')).toBe(false);
    expect(isPaymentModesField('active')).toBe(false);
    expect(isPaymentModesField('usage')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too short', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Too short' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
