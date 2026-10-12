import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `cost-centers` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 */
export const COST_CENTERS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/**
 * The longest name the api's body takes: erp-api `COST_CENTERS_NAME_MAX`, Perfex's `VARCHAR(255)`
 * `tblcost_centers.name` column.
 */
export const COST_CENTERS_NAME_MAX = 255;

/**
 * What uses a cost center, one count per group, in the api's order (erp-api `costCenterUsageSchema`):
 * purchase requests, purchase orders and purchase quotations (`cost_center`, by id), shipping
 * charges and expenses (`cost_center`, by id, counted once the column exists, D-28) and assets
 * (`cost_centre`, by the exact name). A delete is refused while any is non-zero (D-07).
 */
export const costCentersUsageSchema = z.object({
  purchaseRequests: z.number().int().nonnegative(),
  purchaseOrders: z.number().int().nonnegative(),
  purchaseQuotations: z.number().int().nonnegative(),
  shippingCharges: z.number().int().nonnegative(),
  expenses: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
});
export type CostCentersUsage = z.infer<typeof costCentersUsageSchema>;
export type CostCentersUsageGroup = keyof CostCentersUsage;

/** The six groups in the order the delete dialog names them. */
const USAGE_GROUPS: readonly CostCentersUsageGroup[] = Object.keys(
  costCentersUsageSchema.shape,
) as CostCentersUsageGroup[];

// Mirrors erp-api `costCentersResponseSchema` (one cost center: the id as text, the name as stored,
// Date Created as the ISO instant of Perfex's wall clock in the company zone or `null` when Perfex
// stored none, D-31, and its usage); moves to @erp/contracts (ADR-0010).
export const costCentersSchema = z.object({
  id: z.string(),
  name: z.string(),
  dateCreated: z.iso.datetime().nullable(),
  usage: costCentersUsageSchema,
});
export type CostCenters = z.infer<typeof costCentersSchema>;

/**
 * One list row: the record itself (the api answers the same shape on both reads), so the list can
 * refuse a delete up front from the row's usage. The list reads it, the form seeds with it, and an
 * edit swaps `{ ...seed, ...saved }` into the list (plan 04.1-05).
 */
export const costCentersRowSchema = costCentersSchema.extend({});
export type CostCentersRow = z.infer<typeof costCentersRowSchema>;

/** The groups that still use the cost center, in the api's order: one dialog line each (D-07). */
export function inUseGroups(usage: CostCentersUsage): readonly CostCentersUsageGroup[] {
  return USAGE_GROUPS.filter((group) => usage[group] > 0);
}

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes. Perfex's
 * one field, Cost Center Name: trimmed, 1 to 255 characters, every character accepted (markup
 * included: it is shown as text), and a name another cost center holds is accepted, as in Perfex
 * (D-29).
 */
export const costCentersFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, COST_CENTERS_MESSAGE_KEYS.name)
    .max(COST_CENTERS_NAME_MAX, COST_CENTERS_MESSAGE_KEYS.nameTooLong),
});
export type CostCentersFormValues = z.infer<typeof costCentersFormSchema>;

export const EMPTY_COST_CENTERS_FORM: CostCentersFormValues = { name: '' };

/** A loaded (or seeded) record as form values. */
export function toCostCentersForm(item: CostCenters): CostCentersFormValues {
  return { name: item.name };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const COST_CENTERS_FIELDS = ['name'] as const;
export type CostCentersField = (typeof COST_CENTERS_FIELDS)[number];

export function isCostCentersField(value: unknown): value is CostCentersField {
  return (COST_CENTERS_FIELDS as readonly unknown[]).includes(value);
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
