import { z } from 'zod';

export const ANNOUNCEMENTS_MESSAGE_KEYS = {
  name: 'enter_name',
  nameTooLong: 'name_too_long',
  message: 'message_too_long',
  messageTooLong: 'message_too_long',
} as const;

/** The longest name the api's body takes (the `VARCHAR(191)` column). */
export const ANNOUNCEMENTS_NAME_MAX = 191;
/** The longest message the api's body takes. */
export const ANNOUNCEMENTS_MESSAGE_MAX = 65_535;

/** One announcement: the id as text, the stored fields, the switches as Perfex's 0/1. */
export const announcementsSchema = z.object({
  id: z.string(),
  name: z.string(),
  message: z.string().nullable(),
  dateadded: z.string(),
  showtousers: z.number().int(),
  showtostaff: z.number().int(),
  showname: z.number().int(),
});
export type Announcements = z.infer<typeof announcementsSchema>;

export const announcementsRowSchema = announcementsSchema.extend({});
export type AnnouncementsRow = z.infer<typeof announcementsRowSchema>;

export const announcementsFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, ANNOUNCEMENTS_MESSAGE_KEYS.name)
    .max(ANNOUNCEMENTS_NAME_MAX, ANNOUNCEMENTS_MESSAGE_KEYS.nameTooLong),
  message: z
    .string()
    .trim()
    .max(ANNOUNCEMENTS_MESSAGE_MAX, ANNOUNCEMENTS_MESSAGE_KEYS.messageTooLong),
  showtousers: z.boolean(),
  showtostaff: z.boolean(),
  showname: z.boolean(),
});
export type AnnouncementsFormValues = z.infer<typeof announcementsFormSchema>;

export const EMPTY_ANNOUNCEMENTS_FORM: AnnouncementsFormValues = {
  name: '',
  message: '',
  showtousers: false,
  showtostaff: true,
  showname: false,
};

/** The record's values for the form: a NULL message is an empty field, 0/1 a switch's state. */
export function toAnnouncementsForm(item: Announcements): AnnouncementsFormValues {
  return {
    name: item.name,
    message: item.message ?? '',
    showtousers: item.showtousers !== 0,
    showtostaff: item.showtostaff !== 0,
    showname: item.showname !== 0,
  };
}

export const ANNOUNCEMENTS_FIELDS = ['name', 'message'] as const;
export type AnnouncementsField = (typeof ANNOUNCEMENTS_FIELDS)[number];

export function isAnnouncementsField(value: unknown): value is AnnouncementsField {
  return (ANNOUNCEMENTS_FIELDS as readonly unknown[]).includes(value);
}

export const validationIssuesSchema = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
);
export type ValidationIssue = z.infer<typeof validationIssuesSchema>[number];
