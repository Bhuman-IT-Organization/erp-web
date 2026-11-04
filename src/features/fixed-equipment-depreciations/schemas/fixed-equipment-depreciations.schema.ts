import { z } from 'zod';

/**
 * The zod messages are message KEYS under the `fixed-equipment-depreciations` namespace, not text
 * (FE-12): this module stays free of React and of any locale, and SchemaForm's `translateError`
 * resolves them.
 */
export const FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  term: 'enter_months',
  termWhole: 'months_whole',
  termTooLarge: 'months_too_large',
} as const;

/** `tblfe_depreciations.name` is a VARCHAR(200); Perfex has no other rule on the name. */
export const FIXED_EQUIPMENT_DEPRECIATIONS_NAME_MAX = 200;

/**
 * One depreciation as the api answers it: the id as text (the api always sends text), the name as
 * stored, and the number of months (`null` on an old Perfex row stored without one). The list row is
 * the same record, so the list, the form seed and the detail read share one schema.
 */
export const fixedEquipmentDepreciationsSchema = z.object({
  id: z.string(),
  name: z.string(),
  term: z.number().nullable(),
});
export type FixedEquipmentDepreciations = z.infer<typeof fixedEquipmentDepreciationsSchema>;

export const fixedEquipmentDepreciationsRowSchema = fixedEquipmentDepreciationsSchema;
export type FixedEquipmentDepreciationsRow = z.infer<typeof fixedEquipmentDepreciationsRowSchema>;

/**
 * The form's values, for both create (`POST`) and edit (`PATCH`): Perfex's two fields. The name is
 * required, trimmed, at most 200 characters; every character is accepted (Arabic included) and a name
 * another depreciation holds is accepted, as in Perfex. The number of months is what the input
 * holds, text: required, a whole number greater than 0 that the api can store (a safe integer), and
 * normalised (`007` is `7`), so the save summary compares the value that will be sent.
 */
export const fixedEquipmentDepreciationsFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.name)
    .max(
      FIXED_EQUIPMENT_DEPRECIATIONS_NAME_MAX,
      FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.nameTooLong,
    ),
  term: z
    .string()
    .trim()
    .min(1, FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.term)
    .regex(/^\d+$/, FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.termWhole)
    .refine(
      (value) => Number.isSafeInteger(Number(value)),
      FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.termTooLarge,
    )
    .refine((value) => Number(value) > 0, FIXED_EQUIPMENT_DEPRECIATIONS_MESSAGE_KEYS.termWhole)
    .transform((value) => String(Number(value))),
});
export type FixedEquipmentDepreciationsFormValues = z.infer<
  typeof fixedEquipmentDepreciationsFormSchema
>;

export const EMPTY_FIXED_EQUIPMENT_DEPRECIATIONS_FORM: FixedEquipmentDepreciationsFormValues = {
  name: '',
  term: '',
};

/** A loaded (or seeded) record as form values; a row with no term opens with the field empty. */
export function toFixedEquipmentDepreciationsForm(
  item: FixedEquipmentDepreciations,
): FixedEquipmentDepreciationsFormValues {
  return { name: item.name, term: item.term === null ? '' : String(item.term) };
}

/** The body `POST` and `PATCH` send: the api takes the number of months as a number. */
export interface FixedEquipmentDepreciationsBody {
  readonly name: string;
  readonly term: number;
}

/** Valid form values (already trimmed and normalised by the form schema) as the api's body. */
export function toFixedEquipmentDepreciationsBody(
  values: FixedEquipmentDepreciationsFormValues,
): FixedEquipmentDepreciationsBody {
  return { name: values.name, term: Number(values.term) };
}

/** The fields a 400 `ERP-VALIDATION-0001` may point at (`issues[].path[0]`). */
export const FIXED_EQUIPMENT_DEPRECIATIONS_FIELDS = ['name', 'term'] as const;
export type FixedEquipmentDepreciationsField =
  (typeof FIXED_EQUIPMENT_DEPRECIATIONS_FIELDS)[number];

export function isFixedEquipmentDepreciationsField(
  value: unknown,
): value is FixedEquipmentDepreciationsField {
  return (FIXED_EQUIPMENT_DEPRECIATIONS_FIELDS as readonly unknown[]).includes(value);
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
