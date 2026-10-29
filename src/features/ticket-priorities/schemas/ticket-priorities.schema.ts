import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `ticket-priorities` namespace, not text (FE-12): this
 * module stays free of React and of any locale, and SchemaForm's `translateError` resolves them.
 */
export const TICKET_PRIORITIES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
} as const;

/** Perfex accepts any name up to 50 characters (`tickets_priorities.name`): no other rule. */
export const TICKET_PRIORITIES_NAME_MAX = 50;

/**
 * One ticket priority as the api answers it (the id as text, the name as stored). The list row is
 * the same record, so the list, the form seed and the detail read share one schema.
 */
export const ticketPrioritiesSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
});
export type TicketPriorities = z.infer<typeof ticketPrioritiesSchema>;

export const ticketPrioritiesRowSchema = ticketPrioritiesSchema;
export type TicketPrioritiesRow = z.infer<typeof ticketPrioritiesRowSchema>;

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): Perfex's one field, the priority
 * name. Required, trimmed, at most 50 characters; every character is accepted (Arabic included) and
 * a name another priority holds is accepted, as in Perfex.
 */
export const ticketPrioritiesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, TICKET_PRIORITIES_MESSAGE_KEYS.name)
    .max(TICKET_PRIORITIES_NAME_MAX, TICKET_PRIORITIES_MESSAGE_KEYS.nameTooLong),
});
export type TicketPrioritiesFormValues = z.infer<typeof ticketPrioritiesFormSchema>;

export const EMPTY_TICKET_PRIORITIES_FORM: TicketPrioritiesFormValues = { name: '' };

/** A loaded (or seeded) record as form values. */
export function toTicketPrioritiesForm(item: TicketPriorities): TicketPrioritiesFormValues {
  return { name: item.name };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const TICKET_PRIORITIES_FIELDS = ['name'] as const;
export type TicketPrioritiesField = (typeof TICKET_PRIORITIES_FIELDS)[number];

export function isTicketPrioritiesField(value: unknown): value is TicketPrioritiesField {
  return (TICKET_PRIORITIES_FIELDS as readonly unknown[]).includes(value);
}

/**
 * The `issues` array a 400 `ERP-VALIDATION-0001` problem body carries. It is parsed with this
 * schema BEFORE any field error is set (T-3-26); a body that does not parse yields no field
 * errors. `message` is never rendered.
 */
export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);
export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
