import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `knowledge-base` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 */
export const KNOWLEDGE_BASE_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/**
 * The longest name the api's body takes: erp-api `KNOWLEDGE_BASE_NAME_MAX`, Perfex's `VARCHAR(255)`
 * column.
 */
export const KNOWLEDGE_BASE_NAME_MAX = 255;

/**
 * What uses a knowledge base, one count per group, in the api's order (erp-api `knowledgeBaseUsageSchema`):
 * purchase requests, purchase orders and purchase quotations (`knowledge_base`, by id), shipping
 * charges and expenses (`knowledge_base`, by id, counted once the column exists, D-28) and assets
 * (`knowledge_base`, by the exact name). A delete is refused while any is non-zero (D-07).
 */
export const knowledgeBaseUsageSchema = z.object({
  purchaseRequests: z.number().int().nonnegative(),
  purchaseOrders: z.number().int().nonnegative(),
  purchaseQuotations: z.number().int().nonnegative(),
  shippingCharges: z.number().int().nonnegative(),
  expenses: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
});
export type KnowledgeBaseUsage = z.infer<typeof knowledgeBaseUsageSchema>;
export type KnowledgeBaseUsageGroup = keyof KnowledgeBaseUsage;

/** The six groups in the order the delete dialog names them. */
const USAGE_GROUPS: readonly KnowledgeBaseUsageGroup[] = Object.keys(
  knowledgeBaseUsageSchema.shape,
) as KnowledgeBaseUsageGroup[];

// Mirrors erp-api `knowledgeBaseResponseSchema` (one knowledge base: the id as text, the name as stored,
// Date Created as the ISO instant of Perfex's wall clock in the company zone or `null` when Perfex
// stored none, D-31, and its usage); moves to @erp/contracts (ADR-0010).
export const knowledgeBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  dateCreated: z.iso.datetime().nullable(),
  usage: knowledgeBaseUsageSchema,
});
export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;

/**
 * One list row: the record itself (the api answers the same shape on both reads), so the list can
 * refuse a delete up front from the row's usage. The list reads it, the form seeds with it, and an
 * edit swaps `{ ...seed, ...saved }` into the list (plan 04.1-05).
 */
export const knowledgeBaseRowSchema = knowledgeBaseSchema.extend({});
export type KnowledgeBaseRow = z.infer<typeof knowledgeBaseRowSchema>;

/** The groups that still use the knowledge base, in the api's order: one dialog line each (D-07). */
export function inUseGroups(usage: KnowledgeBaseUsage): readonly KnowledgeBaseUsageGroup[] {
  return USAGE_GROUPS.filter((group) => usage[group] > 0);
}

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes. Perfex's
 * one field, Knowledge Base Name: trimmed, 1 to 255 characters, every character accepted (markup
 * included: it is shown as text), and a name another knowledge base holds is accepted, as in Perfex
 * (D-29).
 */
export const knowledgeBaseFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, KNOWLEDGE_BASE_MESSAGE_KEYS.name)
    .max(KNOWLEDGE_BASE_NAME_MAX, KNOWLEDGE_BASE_MESSAGE_KEYS.nameTooLong),
});
export type KnowledgeBaseFormValues = z.infer<typeof knowledgeBaseFormSchema>;

export const EMPTY_KNOWLEDGE_BASE_FORM: KnowledgeBaseFormValues = { name: '' };

/** A loaded (or seeded) record as form values. */
export function toKnowledgeBaseForm(item: KnowledgeBase): KnowledgeBaseFormValues {
  return { name: item.name };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const KNOWLEDGE_BASE_FIELDS = ['name'] as const;
export type KnowledgeBaseField = (typeof KNOWLEDGE_BASE_FIELDS)[number];

export function isKnowledgeBaseField(value: unknown): value is KnowledgeBaseField {
  return (KNOWLEDGE_BASE_FIELDS as readonly unknown[]).includes(value);
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

export const knowledgeBaseGroupRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupSlug: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  active: z.boolean().default(true),
  // eslint-disable-next-line no-restricted-syntax -- Perfex tblknowledge_base_groups default color in legacy view
  color: z.string().nullable().default('#28B8DA'),
  groupOrder: z.number().int().default(0),
  totalArticles: z.number().int().nonnegative().default(0),
});
export type KnowledgeBaseGroupRow = z.infer<typeof knowledgeBaseGroupRowSchema>;

export const knowledgeBaseGroupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'enter_group_name')
    .max(KNOWLEDGE_BASE_NAME_MAX, 'group_name_too_long'),
  groupSlug: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  groupOrder: z.coerce.number().int().default(1),
  disabled: z.boolean().default(false),
});
export type KnowledgeBaseGroupFormValues = z.infer<typeof knowledgeBaseGroupFormSchema>;
