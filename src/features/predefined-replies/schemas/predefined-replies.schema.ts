import { z } from 'zod';

export const PREDEFINED_REPLIES_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  message: 'enter_message',
} as const;

export const PREDEFINED_REPLIES_NAME_MAX = 191;

export const predefinedRepliesSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  message: z.string(),
  hasOtherFormatting: z.boolean().optional(),
});

export type PredefinedReplies = z.infer<typeof predefinedRepliesSchema>;

export const predefinedRepliesRowSchema = predefinedRepliesSchema;
export type PredefinedRepliesRow = z.infer<typeof predefinedRepliesRowSchema>;

export const predefinedRepliesFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, PREDEFINED_REPLIES_MESSAGE_KEYS.name)
    .max(PREDEFINED_REPLIES_NAME_MAX, PREDEFINED_REPLIES_MESSAGE_KEYS.nameTooLong),
  message: z.string().default(''),
});

export type PredefinedRepliesFormValues = z.infer<typeof predefinedRepliesFormSchema>;

export const EMPTY_PREDEFINED_REPLIES_FORM: PredefinedRepliesFormValues = {
  name: '',
  message: '',
};

export function toPredefinedRepliesForm(item: PredefinedReplies): PredefinedRepliesFormValues {
  return {
    name: item.name,
    message: item.message,
  };
}

export const PREDEFINED_REPLIES_FIELDS = ['name', 'message'] as const;
export type PredefinedRepliesField = (typeof PREDEFINED_REPLIES_FIELDS)[number];

export function isPredefinedRepliesField(value: unknown): value is PredefinedRepliesField {
  return (PREDEFINED_REPLIES_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);

export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
