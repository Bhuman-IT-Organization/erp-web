import { z } from 'zod';

/** Zod messages are message KEYS under the `services` namespace, not text (FE-12). */
export const SERVICES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/** Perfex's `tblservices.name` is VARCHAR(50). Must equal erp-api's limit. */
export const SERVICES_NAME_MAX = 50;

/** One service: the id as text, the name as stored. Mirrors erp-api's response schema. */
export const servicesSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Services = z.infer<typeof servicesSchema>;

/** One list row: the record itself. */
export const servicesRowSchema = servicesSchema.extend({});
export type ServicesRow = z.infer<typeof servicesRowSchema>;

/** The form's values for create (POST) and edit (PATCH): trimmed, 1 to 50 characters. */
export const servicesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, SERVICES_MESSAGE_KEYS.name)
    .max(SERVICES_NAME_MAX, SERVICES_MESSAGE_KEYS.nameTooLong),
});
export type ServicesFormValues = z.infer<typeof servicesFormSchema>;

export const EMPTY_SERVICES_FORM: ServicesFormValues = { name: '' };

export function toServicesForm(item: Services): ServicesFormValues {
  return { name: item.name };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at. */
export const SERVICES_FIELDS = ['name'] as const;
export type ServicesField = (typeof SERVICES_FIELDS)[number];

export function isServicesField(value: unknown): value is ServicesField {
  return (SERVICES_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);
export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
