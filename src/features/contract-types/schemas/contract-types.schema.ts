import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `contract-types` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 */
export const CONTRACT_TYPES_MESSAGE_KEYS = {
  name: 'enter_name',
} as const;

/**
 * What uses a contract type: contracts (tblcontracts) and goals (tblgoals).
 * A delete is refused while non-zero (D-07).
 */
export const contractTypeUsageSchema = z.object({
  contracts: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
});
export type ContractTypeUsage = z.infer<typeof contractTypeUsageSchema>;
export type ContractTypeUsageGroup = keyof ContractTypeUsage;

/** The groups in the order the delete dialog names them. */
const USAGE_GROUPS: readonly ContractTypeUsageGroup[] = ['contracts', 'goals'];

// Mirrors erp-api `contractTypesResponseSchema` (one contract type: the id as text, the name as stored,
// and its usage); moves to @erp/contracts (ADR-0010).
export const contractTypesSchema = z.object({
  id: z.string(),
  name: z.string(),
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

/** The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes (LONGTEXT in MySQL, no length limit). */
export const contractTypesFormSchema = z.object({
  name: z.string().trim().min(1, CONTRACT_TYPES_MESSAGE_KEYS.name),
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
