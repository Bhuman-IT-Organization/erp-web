import { z } from 'zod';

export const CUSTOMER_GROUPS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/** The longest name the api's body takes (the `VARCHAR(191)` column). */
export const CUSTOMER_GROUPS_NAME_MAX = 191;

/** One customer group: the id as text and the name as stored. */
export const customerGroupsSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type CustomerGroups = z.infer<typeof customerGroupsSchema>;

export const customerGroupsRowSchema = customerGroupsSchema.extend({});
export type CustomerGroupsRow = z.infer<typeof customerGroupsRowSchema>;

export const customerGroupsFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, CUSTOMER_GROUPS_MESSAGE_KEYS.name)
    .max(CUSTOMER_GROUPS_NAME_MAX, CUSTOMER_GROUPS_MESSAGE_KEYS.nameTooLong),
});
export type CustomerGroupsFormValues = z.infer<typeof customerGroupsFormSchema>;

export const EMPTY_CUSTOMER_GROUPS_FORM: CustomerGroupsFormValues = { name: '' };

export function toCustomerGroupsForm(item: CustomerGroups): CustomerGroupsFormValues {
  return { name: item.name };
}

export const CUSTOMER_GROUPS_FIELDS = ['name'] as const;
export type CustomerGroupsField = (typeof CUSTOMER_GROUPS_FIELDS)[number];

export function isCustomerGroupsField(value: unknown): value is CustomerGroupsField {
  return (CUSTOMER_GROUPS_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);
export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
