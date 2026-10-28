import { z } from 'zod';

export const TICKET_STATUS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  statuscolor: 'enter_colour',
  statusorder: 'enter_order',
} as const;

export const TICKET_STATUS_NAME_MAX = 50;
export const TICKET_STATUS_COLOR_MAX = 7;

export const ticketStatusSchema = z
  .strictObject({
    ticketstatusid: z.string(),
    name: z.string().max(TICKET_STATUS_NAME_MAX),
    ticket_count: z.number().int().nonnegative(),
    isdefault: z.number().int(),
    statuscolor: z.string().nullable(),
    statusorder: z.number().int().nullable(),
  })
  .transform(({ ticketstatusid, statuscolor, ...status }) => ({
    ...status,
    id: ticketstatusid,
    statuscolor: statuscolor ?? '',
  }));

/** The backend list response envelope: `GET /ticket-statuses` returns `{ data, meta }`. */
export const ticketStatusesListResponseSchema = z
  .object({
    data: z.array(ticketStatusSchema),
    meta: z.object({
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable(),
      total: z.number().int().nonnegative(),
      rangeStart: z.number().int().nonnegative(),
      exportLimit: z.number().int().positive().optional(),
      printLimit: z.number().int().positive().optional(),
    }),
  })
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
  statuscolor: z.string().max(TICKET_STATUS_COLOR_MAX, TICKET_STATUS_MESSAGE_KEYS.statuscolor),
  statusorder: z.union([
    z.literal(''),
    z.number().int(TICKET_STATUS_MESSAGE_KEYS.statusorder),
    z.string().regex(/^-?\d+$/, TICKET_STATUS_MESSAGE_KEYS.statusorder),
  ]),
});

export type TicketStatusFormInput = z.input<typeof ticketStatusFormSchema>;
export type TicketStatusFormValues = z.output<typeof ticketStatusFormSchema>;
export type TicketStatusWriteValues = Omit<TicketStatusFormValues, 'statusorder'> & {
  readonly statusorder: number | null;
};

export function toTicketStatusWriteValues(values: TicketStatusFormValues): TicketStatusWriteValues {
  return {
    ...values,
    statusorder: values.statusorder === '' ? null : Number(values.statusorder),
  };
}

export const EMPTY_TICKET_STATUS_FORM: TicketStatusFormInput = {
  name: '',
  statuscolor: '',
  statusorder: '',
};

export function toTicketStatusForm(item: TicketStatus): TicketStatusFormInput {
  return {
    name: item.name,
    statuscolor: item.statuscolor,
    statusorder: item.statusorder ?? '',
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
