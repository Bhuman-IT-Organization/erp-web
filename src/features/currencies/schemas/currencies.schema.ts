import { z } from 'zod';
// The one code schema (Currencies planning answers 7 and 8 b): `src/config/currency-code.ts` is the
// byte mirror of erp-api `packages/contracts/src/currency-code.ts`; its limit is never restated here.
import { currencyCodeProblem, toCurrencyCode } from '@/config/currency-code';

/**
 * The zod messages are message KEYS under the `currencies` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 * `name` and `symbol` are also the keys a 400 `ERP-VALIDATION-0001` issue on that field maps to.
 */
export const CURRENCIES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  symbol: 'enter_symbol',
  symbolTooLong: 'symbol_too_long',
  choice: 'choose_option',
} as const;

/**
 * The longest symbol the api's body takes: erp-api `CURRENCIES_SYMBOL_MAX`, Perfex's `VARCHAR(10)`
 * `tblcurrencies.symbol` column.
 */
export const CURRENCIES_SYMBOL_MAX = 10;

/** Perfex's decimal separator options (`currencies/manage.php` :52-53): comma and period. */
export const DECIMAL_SEPARATORS = [',', '.'] as const;
/** Perfex's thousand separator options (`manage.php` :63-67): comma, period, apostrophe, none and a space. */
export const THOUSAND_SEPARATORS = [',', '.', "'", '', ' '] as const;
/** Perfex's symbol placement options (`manage.php` :78, :83). */
export const PLACEMENTS = ['before', 'after'] as const;

export type DecimalSeparator = (typeof DECIMAL_SEPARATORS)[number];
export type ThousandSeparator = (typeof THOUSAND_SEPARATORS)[number];
export type Placement = (typeof PLACEMENTS)[number];

/** The api's refusal of a delete while anything in the register's delete groups uses it (D-40). */
export const IN_USE_CODE = 'ERP-CURRENCIES-0001';
/** The api's refusal of a delete of the base currency (Perfex's rule, D-38). */
export const BASE_CODE = 'ERP-CURRENCIES-0002';
/** The api's refusal of a delete while another module's registered use counts above 0 (D-41). */
export const OTHER_MODULE_CODE = 'ERP-CURRENCIES-0003';
/** The api's refusal of make-base while the current base has transactions (Perfex's rule, D-39). */
export const BASE_LOCKED_CODE = 'ERP-CURRENCIES-0004';
/** The api's refusal of a code change while anything uses the currency (D-42 widened, answer 8 c). */
export const CODE_LOCKED_CODE = 'ERP-CURRENCIES-0005';

/** Why a delete is refused before it is asked: one of the three delete codes above. */
export type CurrenciesRefusal = typeof IN_USE_CODE | typeof BASE_CODE | typeof OTHER_MODULE_CODE;

const count = () => z.number().int().nonnegative();

/**
 * What uses a currency and counts for a delete, one count per group, in the api's order (erp-api
 * `currencyUsageSchema`, the register's 24 delete groups, D-40): Perfex's seven core columns first
 * (the make-base rule's input), then the module columns. A delete is refused while any is non-zero.
 */
export const currenciesUsageSchema = z.object({
  invoices: count(),
  expenses: count(),
  proposals: count(),
  estimates: count(),
  customers: count(),
  creditNotes: count(),
  subscriptions: count(),
  purchaseOrders: count(),
  purchaseRequests: count(),
  purchaseQuotations: count(),
  purchaseInvoices: count(),
  debitNotes: count(),
  fafRequests: count(),
  vendors: count(),
  goodsReceipts: count(),
  goodsDeliveries: count(),
  packingLists: count(),
  orderReturns: count(),
  fixedEquipmentCarts: count(),
  payslipsFrom: count(),
  payslipsTo: count(),
  purchaseConvertedFrom: count(),
  purchaseConvertedTo: count(),
  fixedEquipmentLocations: count(),
});
export type CurrenciesUsage = z.infer<typeof currenciesUsageSchema>;
export type CurrenciesUsageGroup = keyof CurrenciesUsage;

/**
 * The register groups that never block a delete but lock the code (erp-api
 * `currencyLockUsageSchema`, D-42 widened): exchange rates, their logs, and payslips showing the code.
 */
export const currenciesLockUsageSchema = z.object({
  exchangeRates: count(),
  exchangeRateLogs: count(),
  payslipCodes: count(),
});
export type CurrenciesLockUsage = z.infer<typeof currenciesLockUsageSchema>;
export type CurrenciesLockGroup = keyof CurrenciesLockUsage;

/** The 24 delete groups in the order the dialog and the lock note name them. */
const USAGE_GROUPS = Object.keys(currenciesUsageSchema.shape) as CurrenciesUsageGroup[];
/** The three lock groups in the api's order. */
const LOCK_GROUPS = Object.keys(currenciesLockUsageSchema.shape) as CurrenciesLockGroup[];

// Mirrors erp-api `currenciesResponseSchema` (one currency: the id as text, the code (`name`, Perfex's
// column), the symbol, the separators and the placement as stored (`null` for a NULL column), whether
// it is the base, its usage, its lock usage, what other modules registered (no module registers one in this copy) and
// whether it can be made the base now, D-39); moves to @erp/contracts (ADR-0010).
export const currenciesSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimalSeparator: z.string().nullable(),
  thousandSeparator: z.string().nullable(),
  placement: z.string().nullable(),
  isBase: z.boolean(),
  usage: currenciesUsageSchema,
  lockUsage: currenciesLockUsageSchema,
  registeredUsage: z.record(z.string(), count()),
  canMakeBase: z.boolean(),
});
export type Currencies = z.infer<typeof currenciesSchema>;

/**
 * One list row: the record itself (the api answers the same shape on both reads), so the list can
 * refuse a delete or a make-base up front from the row. The list reads it, the form seeds with it,
 * and an edit swaps `{ ...seed, ...saved }` into the list (plan 04.1-05).
 */
export const currenciesRowSchema = currenciesSchema.extend({});
export type CurrenciesRow = z.infer<typeof currenciesRowSchema>;

/** `PATCH /api/v1/currencies/:id/base`'s answer: the id as text and the flag now stored (D-39). */
export const currenciesBaseSchema = z.object({ id: z.string(), isBase: z.literal(true) });
export type CurrenciesBase = z.infer<typeof currenciesBaseSchema>;

/** The delete groups that still use the currency, in the api's order: one dialog line each (D-40). */
export function inUseGroups(usage: CurrenciesUsage): readonly CurrenciesUsageGroup[] {
  return USAGE_GROUPS.filter((group) => usage[group] > 0);
}

/** The lock groups above 0, in the api's order: one lock-note line each (D-42 widened). */
export function lockGroups(lockUsage: CurrenciesLockUsage): readonly CurrenciesLockGroup[] {
  return LOCK_GROUPS.filter((group) => lockUsage[group] > 0);
}

/** The uses other modules registered that count above 0, by key (D-41). */
export function registeredUses(
  row: Pick<Currencies, 'registeredUsage'>,
): readonly (readonly [string, number])[] {
  return (
    Object.entries(row.registeredUsage)
      .filter(([, value]) => value > 0)
      // Keys are ASCII identifiers (the registry refuses anything else), so code-unit order is stable.
      .sort(([a], [b]) => Number(a > b) - Number(a < b))
  );
}

/** The message key of each delete group's line, in the api's order (D-40). */
export const USAGE_LINE_KEYS = {
  invoices: 'in_use_invoices',
  expenses: 'in_use_expenses',
  proposals: 'in_use_proposals',
  estimates: 'in_use_estimates',
  customers: 'in_use_customers',
  creditNotes: 'in_use_credit_notes',
  subscriptions: 'in_use_subscriptions',
  purchaseOrders: 'in_use_purchase_orders',
  purchaseRequests: 'in_use_purchase_requests',
  purchaseQuotations: 'in_use_purchase_quotations',
  purchaseInvoices: 'in_use_purchase_invoices',
  debitNotes: 'in_use_debit_notes',
  fafRequests: 'in_use_faf_requests',
  vendors: 'in_use_vendors',
  goodsReceipts: 'in_use_goods_receipts',
  goodsDeliveries: 'in_use_goods_deliveries',
  packingLists: 'in_use_packing_lists',
  orderReturns: 'in_use_order_returns',
  fixedEquipmentCarts: 'in_use_fixed_equipment_carts',
  payslipsFrom: 'in_use_payslips_from',
  payslipsTo: 'in_use_payslips_to',
  purchaseConvertedFrom: 'in_use_purchase_converted_from',
  purchaseConvertedTo: 'in_use_purchase_converted_to',
  fixedEquipmentLocations: 'in_use_fixed_equipment_locations',
} as const satisfies Record<CurrenciesUsageGroup, string>;

/** The message key of each lock group's line, in the api's order (D-42 widened). */
export const LOCK_LINE_KEYS = {
  exchangeRates: 'code_used_by_exchange_rates',
  exchangeRateLogs: 'code_used_by_exchange_rate_logs',
  payslipCodes: 'code_used_by_payslips',
} as const satisfies Record<CurrenciesLockGroup, string>;

/** One line naming a use of the currency: a stable id, its message key and its count. */
export interface UseLine {
  readonly id: string;
  readonly messageKey:
    | (typeof USAGE_LINE_KEYS)[CurrenciesUsageGroup]
    | (typeof LOCK_LINE_KEYS)[CurrenciesLockGroup]
    | 'in_use_other';
  readonly count: number;
}

/**
 * Every use of the row, one line each, in the api's order: the delete groups, then (with `lock`,
 * for the code-lock note) the lock groups, then each registered use above 0. The delete dialog
 * names the first and the last; the form's lock note names all three (answer 8 c).
 */
export function linesOfUse(
  row: Pick<Currencies, 'usage' | 'lockUsage' | 'registeredUsage'>,
  { lock }: { readonly lock: boolean },
): readonly UseLine[] {
  const usage = inUseGroups(row.usage).map((group) => ({
    id: group,
    messageKey: USAGE_LINE_KEYS[group],
    count: row.usage[group],
  }));
  const locks = lock
    ? lockGroups(row.lockUsage).map((group) => ({
        id: group,
        messageKey: LOCK_LINE_KEYS[group],
        count: row.lockUsage[group],
      }))
    : [];
  const registered = registeredUses(row).map(([key, value]) => ({
    id: `registered-${key}`,
    // A registered use reads in general words (D-41), whatever its key.
    messageKey: 'in_use_other' as const,
    count: value,
  }));
  return [...usage, ...locks, ...registered];
}

/**
 * True while anything uses the currency: any delete group, any lock group or any registered use
 * above 0 (Currencies planning answers 2 and 8 c: a registered use alone locks the code). The form then
 * opens with the code read-only; the symbol, the separators and the placement stay editable.
 */
export function isCodeLocked(row: Currencies | undefined): boolean {
  if (row === undefined) return false;
  return (
    inUseGroups(row.usage).length > 0 ||
    lockGroups(row.lockUsage).length > 0 ||
    registeredUses(row).length > 0
  );
}

/**
 * Why the row's delete is refused up front, in the api's order: `IN_USE_CODE` while any delete group
 * uses it (D-40), else `BASE_CODE` for the base (D-38), else `OTHER_MODULE_CODE` while another
 * module's registered use counts above 0 (D-41), else `undefined` (the delete may be asked). The
 * exchange rates never block a delete.
 */
export function refusalOf(row: CurrenciesRow | undefined): CurrenciesRefusal | undefined {
  if (row === undefined) return undefined;
  if (inUseGroups(row.usage).length > 0) return IN_USE_CODE;
  if (row.isBase) return BASE_CODE;
  return registeredUses(row).length > 0 ? OTHER_MODULE_CODE : undefined;
}

/**
 * Why the row's make-base is refused up front: `BASE_LOCKED_CODE` when the row is not the base and
 * the api says it cannot become the base now (the current base has transactions, Perfex's rule,
 * D-39), else `undefined`.
 */
export function makeBaseRefusalOf(
  row: CurrenciesRow | undefined,
): typeof BASE_LOCKED_CODE | undefined {
  if (row === undefined) return undefined;
  return !row.isBase && !row.canMakeBase ? BASE_LOCKED_CODE : undefined;
}

/** One of `options`, or `null` (no choice made yet) for a NULL or unknown stored value. */
function optionOf<T extends string>(options: readonly T[], value: string | null): T | null {
  return options.find((option) => option === value) ?? null;
}

/** A choice of `options` the form requires: `null` (no choice made) is refused with `choose_option`. */
function requiredChoice<T extends string>(options: readonly [T, ...T[]]) {
  return (
    z
      .enum(options, { message: CURRENCIES_MESSAGE_KEYS.choice })
      .nullable()
      // Not a type predicate: the form keeps one type for its values, `null` while no choice is made.
      .refine((value): boolean => value !== null, CURRENCIES_MESSAGE_KEYS.choice)
  );
}

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): the five fields of Perfex's form
 * (D-38), the body the api takes. The code goes through the one shared code schema: trimmed, ASCII
 * upper-cased, 1 to `CURRENCY_CODE_MAX` characters (`enter_name`, `name_too_long`); a code another
 * currency holds is accepted, as in Perfex. The symbol is 1 to 10 characters holding a non-space
 * character, sent as typed. The separators and the placement are one of Perfex's options; `null`
 * means no choice made yet (a NULL column, Perfex's required rules, manage.php :104-110), refused.
 */
export const currenciesFormSchema = z.object({
  name: z
    .string()
    .transform(toCurrencyCode)
    .superRefine((code, context) => {
      const problem = currencyCodeProblem(code);
      if (problem === null) return;
      context.addIssue({
        code: 'custom',
        message:
          problem === 'required'
            ? CURRENCIES_MESSAGE_KEYS.name
            : CURRENCIES_MESSAGE_KEYS.nameTooLong,
      });
    }),
  symbol: z
    .string()
    .min(1, CURRENCIES_MESSAGE_KEYS.symbol)
    .max(CURRENCIES_SYMBOL_MAX, CURRENCIES_MESSAGE_KEYS.symbolTooLong)
    .refine((symbol) => symbol.trim() !== '', CURRENCIES_MESSAGE_KEYS.symbol),
  decimalSeparator: requiredChoice(DECIMAL_SEPARATORS),
  thousandSeparator: requiredChoice(THOUSAND_SEPARATORS),
  placement: requiredChoice(PLACEMENTS),
});
export type CurrenciesFormValues = z.infer<typeof currenciesFormSchema>;

/**
 * A new currency as Perfex's modal seeds it (`manage.php` :122-126): the placement `before` and
 * both separators the deployment's number format (Perfex's `get_option` seeds, here the branding
 * formats); a separator outside Perfex's options opens with no choice made.
 */
export function newCurrenciesForm(format: {
  readonly decimalSeparator: string;
  readonly thousandSeparator: string;
}): CurrenciesFormValues {
  return {
    name: '',
    symbol: '',
    decimalSeparator: optionOf(DECIMAL_SEPARATORS, format.decimalSeparator),
    thousandSeparator: optionOf(THOUSAND_SEPARATORS, format.thousandSeparator),
    placement: 'before',
  };
}

/** A loaded (or seeded) record as form values: a NULL separator or placement is no choice made. */
export function toCurrenciesForm(item: Currencies): CurrenciesFormValues {
  return {
    name: item.name,
    symbol: item.symbol,
    decimalSeparator: optionOf(DECIMAL_SEPARATORS, item.decimalSeparator),
    thousandSeparator: optionOf(THOUSAND_SEPARATORS, item.thousandSeparator),
    placement: optionOf(PLACEMENTS, item.placement),
  };
}

/**
 * The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`): the code and the symbol.
 * The separators and the placement are radio buttons holding only Perfex's options, so a 400 on one
 * of them is not something the form can get wrong (plan 04.1-05's row 67).
 */
export const CURRENCIES_FIELDS = ['name', 'symbol'] as const;
export type CurrenciesField = (typeof CURRENCIES_FIELDS)[number];

export function isCurrenciesField(value: unknown): value is CurrenciesField {
  return (CURRENCIES_FIELDS as readonly unknown[]).includes(value);
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
