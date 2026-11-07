import { z } from 'zod';

export const KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS = {
  name: 'enter_group_name',
  nameTooLong: 'group_name_too_long',
  groupSlug: 'enter_slug',
  color: 'enter_color',
  description: 'enter_description',
  groupOrder: 'enter_order',
  orderOutOfRange: 'order_out_of_range',
  disabled: 'enter_disabled',
} as const;

export const KNOWLEDGE_BASE_NAME_MAX = 191;
export const KNOWLEDGE_BASE_COLOR_MAX = 10;
export const KNOWLEDGE_BASE_GROUP_ORDER_MIN = -2_147_483_648;
export const KNOWLEDGE_BASE_GROUP_ORDER_MAX = 2_147_483_647;

// eslint-disable-next-line no-restricted-syntax -- 1:1 legacy colour: default group color in manage_groups.php
const DEFAULT_GROUP_COLOR = '#28B8DA';

export const knowledgeBaseGroupRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupSlug: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  active: z.boolean().default(true),
  color: z.string().nullable().default(DEFAULT_GROUP_COLOR),
  groupOrder: z.number().int().default(1),
  totalArticles: z.number().int().nonnegative().default(0),
});
export type KnowledgeBaseGroupRow = z.infer<typeof knowledgeBaseGroupRowSchema>;
export type KnowledgeBaseGroup = KnowledgeBaseGroupRow;

export const createKnowledgeBaseGroupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.name)
    .max(KNOWLEDGE_BASE_NAME_MAX, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.nameTooLong),
  groupSlug: z.string().nullable().optional(),
  color: z
    .string()
    .max(KNOWLEDGE_BASE_COLOR_MAX, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.color)
    .nullable()
    .optional(),
  description: z.string().nullable().optional(),
  groupOrder: z
    .union(
      [
        z.literal(''),
        z
          .number()
          .int(KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.groupOrder)
          .min(KNOWLEDGE_BASE_GROUP_ORDER_MIN, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.orderOutOfRange)
          .max(KNOWLEDGE_BASE_GROUP_ORDER_MAX, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.orderOutOfRange),
        z
          .string()
          .regex(/^-?\d+$/, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.groupOrder)
          .refine((val) => {
            const n = Number(val);
            return n >= KNOWLEDGE_BASE_GROUP_ORDER_MIN && n <= KNOWLEDGE_BASE_GROUP_ORDER_MAX;
          }, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.orderOutOfRange),
      ],
      { error: KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.groupOrder },
    )
    .optional(),
  disabled: z.boolean().default(false),
});

export const updateKnowledgeBaseGroupFormSchema = createKnowledgeBaseGroupFormSchema.extend({
  groupSlug: z.string().trim().min(1, KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.groupSlug),
});

export const knowledgeBaseGroupFormSchema = createKnowledgeBaseGroupFormSchema;

export type KnowledgeBaseGroupFormInput = z.input<typeof createKnowledgeBaseGroupFormSchema>;
export type KnowledgeBaseGroupFormValues = z.output<typeof createKnowledgeBaseGroupFormSchema>;

export interface KnowledgeBaseGroupWriteValues {
  readonly name: string;
  readonly groupSlug?: string | null;
  readonly color?: string | null;
  readonly description?: string | null;
  readonly groupOrder?: number | null;
  readonly disabled?: boolean;
}

/** Return trimmed string or null when blank/undefined. */
function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return null;
}

export function toKnowledgeBaseGroupWriteValues(
  values: KnowledgeBaseGroupFormInput,
  isEdit = false,
  initialSlug?: string | null,
): KnowledgeBaseGroupWriteValues {
  const currentSlug = trimOrNull(values.groupSlug);
  const origSlug = trimOrNull(initialSlug);
  // Send groupSlug on edit only when it actually changed
  const slugChanged =
    isEdit && (initialSlug !== undefined ? currentSlug !== origSlug : Boolean(currentSlug));
  const slug = slugChanged ? { groupSlug: currentSlug } : {};

  return {
    name: values.name.trim(),
    ...slug,
    color: trimOrNull(values.color),
    description: trimOrNull(values.description),
    groupOrder:
      values.groupOrder === '' || values.groupOrder === undefined
        ? null
        : Number(values.groupOrder),
    disabled: values.disabled === true,
  };
}

export const EMPTY_KNOWLEDGE_BASE_GROUP_FORM: KnowledgeBaseGroupFormInput = {
  name: '',
  groupSlug: '',
  color: DEFAULT_GROUP_COLOR,
  description: '',
  groupOrder: '',
  disabled: false,
};

export function toKnowledgeBaseGroupForm(item: KnowledgeBaseGroupRow): KnowledgeBaseGroupFormInput {
  return {
    name: item.name,
    groupSlug: item.groupSlug ?? '',
    color: item.color ?? DEFAULT_GROUP_COLOR,
    description: item.description ?? '',
    groupOrder: item.groupOrder,
    disabled: !item.active,
  };
}

export const KNOWLEDGE_BASE_GROUP_FIELDS = [
  'name',
  'groupSlug',
  'color',
  'description',
  'groupOrder',
  'disabled',
] as const;
export type KnowledgeBaseGroupField = (typeof KNOWLEDGE_BASE_GROUP_FIELDS)[number];

export function isKnowledgeBaseGroupField(field: unknown): field is KnowledgeBaseGroupField {
  return (
    typeof field === 'string' && (KNOWLEDGE_BASE_GROUP_FIELDS as readonly string[]).includes(field)
  );
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.string()),
    message: z.string().optional(),
  }),
);
