import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `contract-types` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 */
export const CONTRACT_TYPES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/**
 * The longest name the api's body takes: erp-api `CONTRACT_TYPES_NAME_MAX`, Perfex's `VARCHAR(255)`
 * `tblcontracts_types.name` column.
 */
export const CONTRACT_TYPES_NAME_MAX = 255;

/**
 * What uses a contract type, one count per group, in the api's order (erp-api `contractTypeUsageSchema`):
 * purchase requests, purchase orders, purchase quotations, shipping charges, expenses and assets.
 * A delete is refused while any is non-zero (D-07).
 */
export const contractTypeUsageSchema = z.object({
  purchaseRequests: z.number().int().nonnegative(),
  purchaseOrders: z.number().int().nonnegative(),
  purchaseQuotations: z.number().int().nonnegative(),
  shippingCharges: z.number().int().nonnegative(),
  expenses: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
});
export type ContractTypeUsage = z.infer<typeof contractTypeUsageSchema>;
export type ContractTypeUsageGroup = keyof ContractTypeUsage;

/** The six groups in the order the delete dialog names them. */
const USAGE_GROUPS: readonly ContractTypeUsageGroup[] = Object.keys(
  contractTypeUsageSchema.shape,
) as ContractTypeUsageGroup[];

// Mirrors erp-api `contractTypesResponseSchema` (one contract type: the id as text, the name as stored,
// Date Created as the ISO instant of Perfex's wall clock in the company zone or `null` when Perfex
// stored none, D-31, and its usage); moves to @erp/contracts (ADR-0010).
export const contractTypesSchema = z.object({
  id: z.string(),
  name: z.string(),
  dateCreated: z.iso.datetime().nullable(),
  usage: contractTypeUsageSchema,
});
export type ContractTypes = z.infer<typeof contractTypesSchema>;

/**
 * One list row: the record itself (the api answers the same shape on both reads), so the list can
 * refuse a delete up front from the row's usage. The list reads it, the form seeds with it, and an
 * edit swaps `{ ...seed, ...saved }` into the list (plan 04.1-05).
 */
export const contractTypesRowSchema = contractTypesSchema.extend({});
export type ContractTypesRow = z.infer<typeof contractTypesRowSchema>;

/** The groups that still use the contract type, in the api's order: one dialog line each (D-07). */
export function inUseGroups(usage: ContractTypeUsage): readonly ContractTypeUsageGroup[] {
  return USAGE_GROUPS.filter((group) => usage[group] > 0);
}

/** The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes. */
export const contractTypesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, CONTRACT_TYPES_MESSAGE_KEYS.name)
    .max(CONTRACT_TYPES_NAME_MAX, CONTRACT_TYPES_MESSAGE_KEYS.nameTooLong),
});
export type ContractTypesFormValues = z.infer<typeof contractTypesFormSchema>;

export const EMPTY_CONTRACT_TYPES_FORM: ContractTypesFormValues = { name: '' };

/** A loaded (or seeded) record as form values. */
export function toContractTypesForm(item: ContractTypes): ContractTypesFormValues {
  return { name: item.name };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const CONTRACT_TYPES_FIELDS = ['name'] as const;
export type ContractTypesField = (typeof CONTRACT_TYPES_FIELDS)[number];

export function isContractTypesField(value: unknown): value is ContractTypesField {
  return (CONTRACT_TYPES_FIELDS as readonly unknown[]).includes(value);
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
