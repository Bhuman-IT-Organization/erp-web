import { z } from 'zod';

export const LEAD_STATUSES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  invalidColor: 'invalid_color',
  invalidOrder: 'invalid_order',
} as const;

const MAX_COLOR_LENGTH = 10;
export const LEAD_STATUSES_NAME_MAX = 50;

// eslint-disable-next-line no-restricted-syntax -- Perfex Lead Statuses uses this legacy database default color, not a UI theme token.
export const DEFAULT_LEAD_STATUS_COLOR = '#28B8DA';

export const leadStatusesUsageSchema = z.object({
  leads: z.number().int().nonnegative(),
  lastLeadStatus: z.number().int().nonnegative(),
  emailIntegration: z.number().int().nonnegative(),
  webToLead: z.number().int().nonnegative(),
});

export type LeadStatusesUsage = z.infer<typeof leadStatusesUsageSchema>;

export const leadStatusesSchema = z.object({
  id: z.string(),
  name: z.string(),
  statusorder: z.number().int().nullable(),
  color: z.string().nullable(),
  isdefault: z.number().int(),
  isConfiguredDefault: z.boolean(),
  usage: leadStatusesUsageSchema,
});

export type LeadStatuses = z.infer<typeof leadStatusesSchema>;

export const leadStatusesRowSchema = leadStatusesSchema.extend({});

export type LeadStatusesRow = z.infer<typeof leadStatusesRowSchema>;

export const leadStatusesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, LEAD_STATUSES_MESSAGE_KEYS.name)
    .max(LEAD_STATUSES_NAME_MAX, LEAD_STATUSES_MESSAGE_KEYS.nameTooLong),

  color: z.string().max(MAX_COLOR_LENGTH, LEAD_STATUSES_MESSAGE_KEYS.invalidColor),
  statusorder: z
    .number()
    .int(LEAD_STATUSES_MESSAGE_KEYS.invalidOrder)
    .min(1, LEAD_STATUSES_MESSAGE_KEYS.invalidOrder)
    .optional(),
});

export type LeadStatusesFormValues = z.infer<typeof leadStatusesFormSchema>;

export const EMPTY_LEAD_STATUSES_FORM: LeadStatusesFormValues = {
  name: '',
  color: DEFAULT_LEAD_STATUS_COLOR,
};

export function toLeadStatusesForm(item: LeadStatuses): LeadStatusesFormValues {
  return {
    name: item.name,
    color: item.color ?? '',
    ...(item.statusorder !== null ? { statusorder: item.statusorder } : {}),
  };
}

export function isLeadStatusProtected(item: LeadStatuses): boolean {
  return (
    item.isdefault === 1 ||
    item.isConfiguredDefault ||
    item.usage.leads > 0 ||
    item.usage.lastLeadStatus > 0 ||
    item.usage.emailIntegration > 0 ||
    item.usage.webToLead > 0
  );
}

export const LEAD_STATUSES_FIELDS = ['name', 'color', 'statusorder'] as const;

export type LeadStatusesField = (typeof LEAD_STATUSES_FIELDS)[number];

export function isLeadStatusesField(value: unknown): value is LeadStatusesField {
  return (LEAD_STATUSES_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);

export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
