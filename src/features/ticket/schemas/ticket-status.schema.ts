import { z } from 'zod';

export const TICKET_STATUS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  statuscolor: 'enter_colour',
  statusorder: 'enter_order',
} as const;

export const TICKET_STATUS_NAME_MAX = 50;
const TICKET_STATUS_COLOR = /^#[\da-f]{6}$/i;

export const ticketStatusSchema = z
  .strictObject({
    ticketstatusid: z.string(),
    name: z.string().max(TICKET_STATUS_NAME_MAX),
    isdefault: z.number().int(),
    statuscolor: z.string().nullable(),
    statusorder: z.number().int().nullable(),
  })
  .transform(({ ticketstatusid, statuscolor, statusorder, ...status }) => ({
    ...status,
    id: ticketstatusid,
    statuscolor: statuscolor ?? '',
    statusorder: statusorder ?? 0,
  }));

/** The backend list response has no pagination metadata: `GET /ticket-statuses` returns `{ data }`. */
export const ticketStatusesListResponseSchema = z
  .strictObject({ data: z.array(ticketStatusSchema).readonly() })
  .readonly();

export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketStatusRowSchema = ticketStatusSchema;
export type TicketStatusRow = z.infer<typeof ticketStatusRowSchema>;

export const ticketStatusFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, TICKET_STATUS_MESSAGE_KEYS.name)
    .max(TICKET_STATUS_NAME_MAX, TICKET_STATUS_MESSAGE_KEYS.nameTooLong),
  statuscolor: z.union([
    z.literal(''),
    z.string().regex(TICKET_STATUS_COLOR, TICKET_STATUS_MESSAGE_KEYS.statuscolor),
  ]),
  statusorder: z.coerce.number().int().min(0, TICKET_STATUS_MESSAGE_KEYS.statusorder),
});

export type TicketStatusFormValues = z.infer<typeof ticketStatusFormSchema>;

export const EMPTY_TICKET_STATUS_FORM: TicketStatusFormValues = {
  name: '',
  // eslint-disable-next-line no-restricted-syntax -- Perfex's color input requires a concrete initial color value.
  statuscolor: '#777777',
  statusorder: 0,
};

export function toTicketStatusForm(item: TicketStatus): TicketStatusFormValues {
  return {
    name: item.name,
    statuscolor: item.statuscolor,
    statusorder: item.statusorder,
  };
}

export const TICKET_STATUS_FIELDS = ['name', 'statuscolor', 'statusorder'] as const;

export type TicketStatusField = (typeof TICKET_STATUS_FIELDS)[number];

export function isTicketStatusField(value: unknown): value is TicketStatusField {
  return (TICKET_STATUS_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);

export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
