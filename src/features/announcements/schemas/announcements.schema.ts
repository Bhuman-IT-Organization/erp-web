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
export const ANNOUNCEMENTS_MESSAGE_MAX = 16_777_215;

/** One announcement on the wire: camelCase fields and boolean visibility switches. */
export const announcementsSchema = z.object({
  hasOtherFormatting: z.boolean().default(false),
  id: z.string(),
  name: z.string(),
  message: z.string().nullable(),
  dateAdded: z.string(),
  showToUsers: z.boolean(),
  showToStaff: z.boolean(),
  showName: z.boolean(),
});
export type Announcements = z.infer<typeof announcementsSchema>;

export const announcementsRowSchema = announcementsSchema.extend({});
export type AnnouncementsRow = z.infer<typeof announcementsRowSchema>;

export const announcementsFormSchema = z.object({
  hasOtherFormatting: z.boolean().optional(),
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

/** The record's values for the form: a NULL message is empty; boolean wire switches remain boolean. */
export function toAnnouncementsForm(item: Announcements): AnnouncementsFormValues {
  return {
    hasOtherFormatting: item.hasOtherFormatting,
    name: item.name,
    message: item.message ?? '',
    showtousers: item.showToUsers,
    showtostaff: item.showToStaff,
    showname: item.showName,
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
