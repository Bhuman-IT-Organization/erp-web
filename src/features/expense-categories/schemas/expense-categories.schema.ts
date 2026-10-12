import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `expense-categories` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 * D-19: the form accepts exactly what Perfex's modal accepts, so the name has two keys (required,
 * too long) and the description none.
 */
export const EXPENSE_CATEGORIES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/**
 * The longest name the api's body takes: erp-api `EXPENSE_CATEGORIES_NAME_MAX`, Perfex's
 * `VARCHAR(191)` column. The description has no bound on either side (D-19: `MEDIUMTEXT`).
 */
export const EXPENSE_CATEGORIES_NAME_MAX = 191;

// Mirrors erp-api `expenseCategoriesResponseSchema` (one category, the description in its read form:
// `<br />` removed and trimmed, `''` when none); moves to @erp/contracts (ADR-0010).
export const expenseCategoriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});
export type ExpenseCategories = z.infer<typeof expenseCategoriesSchema>;

/**
 * One list row (erp-api `expenseCategoriesListRowSchema`): the category plus what refers to it, so
 * the list can refuse a delete up front (D-07, D-15). The counts are never shown as columns nor
 * exported.
 */
export const expenseCategoriesRowSchema = expenseCategoriesSchema.extend({
  expenseCount: z.number().int().nonnegative(),
  mappingCount: z.number().int().nonnegative(),
  pettyCashCount: z.number().int().nonnegative(),
});
export type ExpenseCategoriesRow = z.infer<typeof expenseCategoriesRowSchema>;

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes. D-19: the
 * name is required, trimmed and at most 191 characters, with no character refused (`<` and `>`
 * included: safety is rendering it as text); the description is optional with no cap.
 */
export const expenseCategoriesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, EXPENSE_CATEGORIES_MESSAGE_KEYS.name)
    .max(EXPENSE_CATEGORIES_NAME_MAX, EXPENSE_CATEGORIES_MESSAGE_KEYS.nameTooLong),
  description: z.string().optional(),
});
export type ExpenseCategoriesFormValues = z.infer<typeof expenseCategoriesFormSchema>;

export const EMPTY_EXPENSE_CATEGORIES_FORM: ExpenseCategoriesFormValues = {
  name: '',
  description: '',
};

/** A loaded (or seeded) record as form values. */
export function toExpenseCategoriesForm(item: ExpenseCategories): ExpenseCategoriesFormValues {
  return { name: item.name, description: item.description };
}

/**
 * The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`): the name only. The api
 * refuses no description the form can send (a string, no cap, D-19), so it has no field message.
 */
export const EXPENSE_CATEGORIES_FIELDS = ['name'] as const;
export type ExpenseCategoriesField = (typeof EXPENSE_CATEGORIES_FIELDS)[number];

export function isExpenseCategoriesField(value: unknown): value is ExpenseCategoriesField {
  return (EXPENSE_CATEGORIES_FIELDS as readonly unknown[]).includes(value);
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
