import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `payment-modes` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 */
export const PAYMENT_MODES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/**
 * The longest name the api's body takes: erp-api `PAYMENT_MODES_NAME_MAX`, Perfex's `VARCHAR(100)`
 * `tblpayment_modes.name` column.
 */
export const PAYMENT_MODES_NAME_MAX = 100;

/** The api's refusal of a delete while any of the eight transactional columns uses the mode (D-33). */
export const IN_USE_CODE = 'ERP-PAYMENTMODES-0001';

/** The api's refusal of a delete of the mode Perfex's `expense_credit_payment_mode` names (D-37). */
export const CREDIT_MODE_CODE = 'ERP-PAYMENTMODES-0002';

/** Why a delete is refused before it is asked: one of the two codes above. */
export type PaymentModesRefusal = typeof IN_USE_CODE | typeof CREDIT_MODE_CODE;

/**
 * What uses a payment mode, one count per group, in the api's order (erp-api
 * `paymentModeUsageSchema`, the eight transactional columns of D-33, each compared as exact text):
 * invoice payments, expenses, credit note refunds, purchase invoice payments, purchase order
 * payments, debit note refunds, fixed equipment refunds and order return refunds. A delete is
 * refused while any is non-zero; the accounting mappings and the allowed lists are configuration and
 * never counted, as in Perfex.
 */
export const paymentModesUsageSchema = z.object({
  invoicePayments: z.number().int().nonnegative(),
  expenses: z.number().int().nonnegative(),
  creditNoteRefunds: z.number().int().nonnegative(),
  purchaseInvoicePayments: z.number().int().nonnegative(),
  purchaseOrderPayments: z.number().int().nonnegative(),
  debitNoteRefunds: z.number().int().nonnegative(),
  fixedEquipmentRefunds: z.number().int().nonnegative(),
  orderReturnRefunds: z.number().int().nonnegative(),
});
export type PaymentModesUsage = z.infer<typeof paymentModesUsageSchema>;
export type PaymentModesUsageGroup = keyof PaymentModesUsage;

/** The eight groups in the order the delete dialog names them. */
const USAGE_GROUPS: readonly PaymentModesUsageGroup[] = Object.keys(
  paymentModesUsageSchema.shape,
) as PaymentModesUsageGroup[];

// Mirrors erp-api `paymentModesResponseSchema` (one payment mode: the id as text, the name as stored,
// the description in its read form (`''` for NULL), the five boxes of Perfex's form as booleans, its
// usage, and whether Perfex's `expense_credit_payment_mode` names it, D-37; the option's value is
// never answered); moves to @erp/contracts (ADR-0010).
export const paymentModesSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  active: z.boolean(),
  showOnPdf: z.boolean(),
  selectedByDefault: z.boolean(),
  invoicesOnly: z.boolean(),
  expensesOnly: z.boolean(),
  usage: paymentModesUsageSchema,
  isCreditExpenseMode: z.boolean(),
});
export type PaymentModes = z.infer<typeof paymentModesSchema>;

/**
 * One list row: the record itself (the api answers the same shape on both reads), so the list can
 * refuse a delete up front from the row's usage and its credit-expense flag. The list reads it, the
 * form seeds with it, and an edit swaps `{ ...seed, ...saved }` into the list (plan 04.1-05).
 */
export const paymentModesRowSchema = paymentModesSchema.extend({});
export type PaymentModesRow = z.infer<typeof paymentModesRowSchema>;

/** The switch's answer, `PATCH /api/v1/payment-modes/:id/active`: the id as text and the flag now stored. */
export const paymentModesActiveSchema = z.object({ id: z.string(), active: z.boolean() });
export type PaymentModesActive = z.infer<typeof paymentModesActiveSchema>;

/** The groups that still use the payment mode, in the api's order: one dialog line each (D-33). */
export function inUseGroups(usage: PaymentModesUsage): readonly PaymentModesUsageGroup[] {
  return USAGE_GROUPS.filter((group) => usage[group] > 0);
}

/**
 * Why the row's delete is refused up front, in the api's order (it checks the credit expense mode
 * first): `CREDIT_MODE_CODE` when Perfex's `expense_credit_payment_mode` names it (D-37), else
 * `IN_USE_CODE` when anything uses it (D-33), else `undefined` (the delete may be asked).
 */
export function refusalOf(row: PaymentModesRow | undefined): PaymentModesRefusal | undefined {
  if (row === undefined) return undefined;
  if (row.isCreditExpenseMode) return CREDIT_MODE_CODE;
  return inUseGroups(row.usage).length > 0 ? IN_USE_CODE : undefined;
}

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes, the seven
 * fields of Perfex's form (D-34). The name is trimmed, 1 to 100 characters, every character accepted
 * (markup included: it is shown as text), and a name another mode holds is accepted, as in Perfex;
 * the description is any text, sent exactly as typed (the api stores it as Perfex does); every box is
 * sent, so an unticked one saves 0. Invoices only and Expenses only may both be true here: Perfex's
 * server accepts it, and only its form disables one while the other is ticked (D-29).
 */
export const paymentModesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, PAYMENT_MODES_MESSAGE_KEYS.name)
    .max(PAYMENT_MODES_NAME_MAX, PAYMENT_MODES_MESSAGE_KEYS.nameTooLong),
  description: z.string(),
  active: z.boolean(),
  showOnPdf: z.boolean(),
  selectedByDefault: z.boolean(),
  invoicesOnly: z.boolean(),
  expensesOnly: z.boolean(),
});
export type PaymentModesFormValues = z.infer<typeof paymentModesFormSchema>;

/** A new payment mode: Active ticked, the other boxes unticked (`paymentmode.php` :93). */
export const EMPTY_PAYMENT_MODES_FORM: PaymentModesFormValues = {
  name: '',
  description: '',
  active: true,
  showOnPdf: false,
  selectedByDefault: false,
  invoicesOnly: false,
  expensesOnly: false,
};

/** A loaded (or seeded) record as form values. */
export function toPaymentModesForm(item: PaymentModes): PaymentModesFormValues {
  return {
    name: item.name,
    description: item.description,
    active: item.active,
    showOnPdf: item.showOnPdf,
    selectedByDefault: item.selectedByDefault,
    invoicesOnly: item.invoicesOnly,
    expensesOnly: item.expensesOnly,
  };
}

/**
 * The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). Only the name: the
 * description takes any text and a box any boolean, so a 400 on either is not something the form
 * can get wrong (plan 04.1-05's row 67).
 */
export const PAYMENT_MODES_FIELDS = ['name'] as const;
export type PaymentModesField = (typeof PAYMENT_MODES_FIELDS)[number];

export function isPaymentModesField(value: unknown): value is PaymentModesField {
  return (PAYMENT_MODES_FIELDS as readonly unknown[]).includes(value);
}

/**
 * The `issues` array a 400 `ERP-VALIDATION-0001` problem body carries (zod issues from the api's
 * validator). It is parsed with this schema BEFORE any field error is set (T-3-26); a body that
 * does not parse yields no field errors. `message` is never rendered.
 */
export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);
export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
