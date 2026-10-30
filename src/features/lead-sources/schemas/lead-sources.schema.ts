import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `lead-sources` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 */
export const LEAD_SOURCES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/**
 * The form's maximum accepted source name length.
 */
export const LEAD_SOURCES_NAME_MAX = 150;

/**
 * What uses a lead source, one count per group in the API's order. A delete is refused while any
 * group is non-zero (D-07).
 */
export const leadSourcesUsageSchema = z.object({
  leads: z.number().int().nonnegative(),
  emailIntegrations: z.number().int().nonnegative(),
  webToLeadForms: z.number().int().nonnegative(),
});
export type LeadSourcesUsage = z.infer<typeof leadSourcesUsageSchema>;
export type LeadSourcesUsageGroup = keyof LeadSourcesUsage;

/** The groups in the order the delete dialog names them. */
const USAGE_GROUPS: readonly LeadSourcesUsageGroup[] = Object.keys(
  leadSourcesUsageSchema.shape,
) as LeadSourcesUsageGroup[];

/** Mirrors the API record: a string id, stored name, and lead usage. */
export const leadSourcesSchema = z.object({
  id: z.string(),
  name: z.string(),
  usage: leadSourcesUsageSchema,
});
export type LeadSources = z.infer<typeof leadSourcesSchema>;

/**
 * One list row: the record itself (the api answers the same shape on both reads), so the list can
 * refuse a delete up front from the row's usage. The list reads it, the form seeds with it, and an
 * edit swaps `{ ...seed, ...saved }` into the list (plan 04.1-05).
 */
export const leadSourcesRowSchema = leadSourcesSchema.extend({});
export type LeadSourcesRow = z.infer<typeof leadSourcesRowSchema>;

/** The groups that still use the lead source, in the api's order: one dialog line each (D-07). */
export function inUseGroups(usage: LeadSourcesUsage | undefined): readonly LeadSourcesUsageGroup[] {
  if (!usage) return [];
  return USAGE_GROUPS.filter((group) => usage[group] > 0);
}

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): the body the api takes. Perfex's
 * one field, Source Name: trimmed, 1 to 150 characters, every character accepted (markup
 * included: it is shown as text), and a name another lead source holds is accepted, as in Perfex
 * (D-29).
 */
export const leadSourcesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, LEAD_SOURCES_MESSAGE_KEYS.name)
    .max(LEAD_SOURCES_NAME_MAX, LEAD_SOURCES_MESSAGE_KEYS.nameTooLong),
});
export type LeadSourcesFormValues = z.infer<typeof leadSourcesFormSchema>;

export const EMPTY_LEAD_SOURCES_FORM: LeadSourcesFormValues = { name: '' };

/** A loaded (or seeded) record as form values. */
export function toLeadSourcesForm(item: LeadSources): LeadSourcesFormValues {
  return { name: item.name };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const LEAD_SOURCES_FIELDS = ['name'] as const;
export type LeadSourcesField = (typeof LEAD_SOURCES_FIELDS)[number];

export function isLeadSourcesField(value: unknown): value is LeadSourcesField {
  return (LEAD_SOURCES_FIELDS as readonly unknown[]).includes(value);
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
