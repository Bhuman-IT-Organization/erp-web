import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `taxes` namespace, not text (FE-12): this module stays
 * free of React and of any locale, and SchemaForm's `translateError` resolves them. The keys of
 * `name` and `rate` are also what a 400 on that field shows (`issues[].path[0]`): the form has
 * already refused everything the api refuses, so a 400 there is a mismatch, said in general words.
 */
export const TAXES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  rate: 'rate_invalid',
  rateRequired: 'enter_rate',
  rateTooLarge: 'rate_too_large',
} as const;

/** The longest name the api's body takes: erp-api `TAXES_NAME_MAX`, Perfex's `VARCHAR(100)` column. */
export const TAXES_NAME_MAX = 100;

/**
 * A rate as the api reads it (erp-api `RATE_PATTERN`): an optional minus, then digits with an
 * optional fraction, or a bare fraction. No exponent, no thousands separator, no plus.
 */
const RATE_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** The most integer digits a rate may have once rounded to two places: `DECIMAL(15,2)` keeps 13. */
const RATE_INTEGER_DIGITS = 13;
/** Hundredths in one: the scale of `DECIMAL(15,2)`. */
const SCALE = 100n;
/** The decimal places kept, and the one read to round them. */
const KEPT_PLACES = 2;
/** The digit at or above which the third decimal rounds the second up (half away from zero). */
const HALF = 5;
/** One hundredth added when the third decimal rounds up, none otherwise. */
const ONE_HUNDREDTH = 1n;
const NO_HUNDREDTHS = 0n;

/** The character Perfex joins a tax's name and rate with (`default_tax`, item taxes); never in a name. */
const NAME_RATE_SEPARATOR = /\|/g;

/** Two or more spaces in a row. */
const SPACE_RUN = / {2,}/g;

/**
 * True when `text` (which matches `RATE_PATTERN`) still fits the column once rounded half away from
 * zero to two places, the api's `roundRate` rule: `9999999999999.994` fits, `.995` does not.
 */
function rateFits(text: string): boolean {
  if (!RATE_PATTERN.test(text)) return true;
  const unsigned = text.startsWith('-') ? text.slice(1) : text;
  const [whole = '', fraction = ''] = unsigned.split('.');
  const kept = fraction.padEnd(KEPT_PLACES, '0').slice(0, KEPT_PLACES);
  const roundUp = Number(fraction.charAt(KEPT_PLACES) || '0') >= HALF;
  const hundredths =
    BigInt(whole || '0') * SCALE + BigInt(kept) + (roundUp ? ONE_HUNDREDTH : NO_HUNDREDTHS);
  return (hundredths / SCALE).toString().length <= RATE_INTEGER_DIGITS;
}

/**
 * The name as typed, cleaned the way Perfex's modal cleans it on change (`views/admin/taxes/manage.php`
 * :89-99): the `|` separator removed and runs of spaces collapsed. Perfex removed only the FIRST `|`;
 * every one is removed here (a recorded fix: the api refuses any `|`).
 */
export function cleanTaxesName(text: string): string {
  return text.replace(NAME_RATE_SEPARATOR, '').replace(SPACE_RUN, ' ');
}

/**
 * What uses a tax, one count per group, in the api's order (erp-api `TaxUsage`): items (`tax`,
 * `tax2`), expenses, subscriptions, vendor items, purchase lines, warehouse lines, fixed equipment
 * lines, sales return lines and accounting rows. A delete is refused while any is non-zero (D-07);
 * an edit while expenses or subscriptions are (Perfex's rule).
 */
export const taxesUsageSchema = z.object({
  items: z.number().int().nonnegative(),
  expenses: z.number().int().nonnegative(),
  subscriptions: z.number().int().nonnegative(),
  vendorItems: z.number().int().nonnegative(),
  purchaseLines: z.number().int().nonnegative(),
  warehouseLines: z.number().int().nonnegative(),
  fixedEquipmentLines: z.number().int().nonnegative(),
  salesReturnLines: z.number().int().nonnegative(),
  accounting: z.number().int().nonnegative(),
});
export type TaxesUsage = z.infer<typeof taxesUsageSchema>;
export type TaxesUsageGroup = keyof TaxesUsage;

/** The nine groups in the order the delete dialog names them. */
const USAGE_GROUPS: readonly TaxesUsageGroup[] = Object.keys(
  taxesUsageSchema.shape,
) as TaxesUsageGroup[];

// Mirrors erp-api `taxesResponseSchema` (one tax: the id as text, the rate as stored with two
// decimals, its usage and whether Perfex's `default_tax` names it, D-21); moves to @erp/contracts
// (ADR-0010).
export const taxesSchema = z.object({
  id: z.string(),
  name: z.string(),
  rate: z.string(),
  usage: taxesUsageSchema,
  isDefault: z.boolean(),
});
export type Taxes = z.infer<typeof taxesSchema>;

/**
 * One list row: the record itself (the api answers the same shape on both reads), so the list can
 * refuse a delete up front and the form can open a locked tax read-only from the row it was opened
 * from. The list reads it, the form seeds with it, and an edit swaps `{ ...seed, ...saved }` into the
 * list (plan 04.1-05).
 */
export const taxesRowSchema = taxesSchema.extend({});
export type TaxesRow = z.infer<typeof taxesRowSchema>;

/**
 * True when the tax opens read-only (Perfex's modal disables its fields): expenses or subscriptions
 * use it (`ERP-TAXES-0002`), or Perfex's `default_tax` setting names it (`ERP-TAXES-0004`, D-21).
 */
export function isLocked(record: Taxes): boolean {
  return record.usage.expenses > 0 || record.usage.subscriptions > 0 || record.isDefault;
}

/** The groups that still use the tax, in the api's order: one dialog line each (D-07). */
export function inUseGroups(usage: TaxesUsage): readonly TaxesUsageGroup[] {
  return USAGE_GROUPS.filter((group) => usage[group] > 0);
}

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes, both
 * strings. D-19: the name is trimmed and 1 to 100 characters with `<` and `>` accepted (safety is
 * rendering it as text); every `|` is removed BEFORE it is validated, so no `|` error is ever shown.
 * The rate is decimal text the api rounds to two places; the form refuses what the api would.
 */
export const taxesFormSchema = z.object({
  name: z
    .string()
    .transform((text) => text.replace(NAME_RATE_SEPARATOR, ''))
    .pipe(
      z
        .string()
        .trim()
        .min(1, TAXES_MESSAGE_KEYS.name)
        .max(TAXES_NAME_MAX, TAXES_MESSAGE_KEYS.nameTooLong),
    ),
  rate: z
    .string()
    .trim()
    .min(1, TAXES_MESSAGE_KEYS.rateRequired)
    .regex(RATE_PATTERN, TAXES_MESSAGE_KEYS.rate)
    .refine(rateFits, TAXES_MESSAGE_KEYS.rateTooLarge),
});
export type TaxesFormValues = z.infer<typeof taxesFormSchema>;

export const EMPTY_TAXES_FORM: TaxesFormValues = { name: '', rate: '' };

/** A loaded (or seeded) record as form values. */
export function toTaxesForm(item: Taxes): TaxesFormValues {
  return { name: item.name, rate: item.rate };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const TAXES_FIELDS = ['name', 'rate'] as const;
export type TaxesField = (typeof TAXES_FIELDS)[number];

export function isTaxesField(value: unknown): value is TaxesField {
  return (TAXES_FIELDS as readonly unknown[]).includes(value);
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
