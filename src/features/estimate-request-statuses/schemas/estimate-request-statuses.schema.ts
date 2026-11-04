import { z } from 'zod';

export const ESTIMATE_REQUEST_STATUS_NAME_MAX = 50;
export const ESTIMATE_REQUEST_STATUS_COLOR_MAX = 10;

export const ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  color: 'enter_colour',
  statusorder: 'enter_order',
} as const;

export const estimateRequestStatusSchema = z
  .strictObject({
    id: z.string(),
    name: z.string().max(ESTIMATE_REQUEST_STATUS_NAME_MAX),
    color: z.string().max(ESTIMATE_REQUEST_STATUS_COLOR_MAX).nullable(),
    statusorder: z.number().int().nullable(),
    flag: z.string().nullable(),
    total_request: z.number().int().nonnegative(),
  })
  .transform(({ color, ...status }) => ({ ...status, color: color ?? '' }));

export const estimateRequestStatusRowSchema = estimateRequestStatusSchema;
export type EstimateRequestStatus = z.infer<typeof estimateRequestStatusSchema>;
export type EstimateRequestStatusRow = z.infer<typeof estimateRequestStatusRowSchema>;

export const estimateRequestStatusFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS.name)
    .max(ESTIMATE_REQUEST_STATUS_NAME_MAX, ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS.nameTooLong),
  color: z
    .string()
    .max(ESTIMATE_REQUEST_STATUS_COLOR_MAX, ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS.color),
  statusorder: z.union([
    z.literal(''),
    z.number().int(ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS.statusorder),
    z.string().regex(/^-?\d+$/, ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS.statusorder),
  ]),
});

export type EstimateRequestStatusFormInput = z.input<typeof estimateRequestStatusFormSchema>;
export type EstimateRequestStatusFormValues = z.output<typeof estimateRequestStatusFormSchema>;
export type EstimateRequestStatusWriteValues = Omit<
  EstimateRequestStatusFormValues,
  'statusorder'
> & { readonly statusorder: number | null };

export function toEstimateRequestStatusWriteValues(
  values: EstimateRequestStatusFormValues,
): EstimateRequestStatusWriteValues {
  return {
    ...values,
    statusorder: values.statusorder === '' ? null : Number(values.statusorder),
  };
}

export const EMPTY_ESTIMATE_REQUEST_STATUS_FORM: EstimateRequestStatusFormInput = {
  name: '',
  color: '',
  statusorder: '',
};

export function toEstimateRequestStatusForm(
  status: EstimateRequestStatus,
): EstimateRequestStatusFormInput {
  return {
    name: status.name,
    color: status.color,
    statusorder: status.statusorder ?? '',
  };
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);

export type EstimateRequestStatusField = 'name' | 'color' | 'statusorder';

export function isEstimateRequestStatusField(value: unknown): value is EstimateRequestStatusField {
  return value === 'name' || value === 'color' || value === 'statusorder';
}
