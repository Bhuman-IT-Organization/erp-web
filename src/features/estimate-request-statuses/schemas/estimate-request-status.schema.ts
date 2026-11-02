import { z } from 'zod';

export const ESTIMATE_REQUEST_STATUS_NAME_MAX = 50;
export const ESTIMATE_REQUEST_STATUS_COLOR_MAX = 10;
export const ESTIMATE_REQUEST_STATUS_FLAG_MAX = 30;
export const ESTIMATE_REQUEST_STATUS_ID_MAX = 4_294_967_295;
export const ESTIMATE_REQUEST_STATUS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  color: 'enter_color',
  statusorder: 'enter_order',
} as const;

export const estimateRequestStatusSchema = z
  .strictObject({
    id: z.string(),
    name: z.string().max(ESTIMATE_REQUEST_STATUS_NAME_MAX),
    color: z.string().max(ESTIMATE_REQUEST_STATUS_COLOR_MAX).nullable(),
    statusorder: z.number().int().nullable(),
    flag: z.string().max(ESTIMATE_REQUEST_STATUS_FLAG_MAX).nullable(),
    total_request: z.number().int().nonnegative(),
  })
  .readonly();

export type EstimateRequestStatus = z.infer<typeof estimateRequestStatusSchema>;

export const estimateRequestStatusesListResponseSchema = z
  .strictObject({
    data: z.array(estimateRequestStatusSchema),
    meta: z.strictObject({
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable(),
      total: z.number().int().nonnegative(),
      rangeStart: z.number().int().nonnegative(),
      exportLimit: z.number().int().positive(),
      printLimit: z.number().int().positive(),
    }),
  })
  .readonly();

export const estimateRequestStatusFormSchema = z.strictObject({
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

export const estimateRequestStatusWriteSchema = z.strictObject({
  name: z.string().trim().min(1).max(ESTIMATE_REQUEST_STATUS_NAME_MAX),
  color: z.string().max(ESTIMATE_REQUEST_STATUS_COLOR_MAX).nullable(),
  statusorder: z.number().int().nullable(),
});

export type EstimateRequestStatusFormInput = z.input<typeof estimateRequestStatusFormSchema>;
export type EstimateRequestStatusFormValues = z.output<typeof estimateRequestStatusFormSchema>;
export interface EstimateRequestStatusWriteValues {
  readonly name: string;
  readonly color: string;
  readonly statusorder: number | null;
}

export const EMPTY_ESTIMATE_REQUEST_STATUS_FORM: EstimateRequestStatusFormInput = {
  name: '',
  color: '',
  statusorder: '',
};

export const estimateRequestStatusRowSchema = estimateRequestStatusSchema;
export type EstimateRequestStatusRow = EstimateRequestStatus;

export function toEstimateRequestStatusForm(
  status: EstimateRequestStatus,
): EstimateRequestStatusFormInput {
  return {
    name: status.name,
    color: status.color ?? '',
    statusorder: status.statusorder ?? '',
  };
}

export function toEstimateRequestStatusWriteValues(
  values: EstimateRequestStatusFormValues,
): EstimateRequestStatusWriteValues {
  return {
    name: values.name,
    color: values.color,
    statusorder: values.statusorder === '' ? null : Number(values.statusorder),
  };
}

export const ESTIMATE_REQUEST_STATUS_FIELDS = ['name', 'color', 'statusorder'] as const;
export type EstimateRequestStatusField = (typeof ESTIMATE_REQUEST_STATUS_FIELDS)[number];

export function isEstimateRequestStatusField(value: unknown): value is EstimateRequestStatusField {
  return (ESTIMATE_REQUEST_STATUS_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);
