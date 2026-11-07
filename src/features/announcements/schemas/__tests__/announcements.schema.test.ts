import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENTS_FIELDS,
  ANNOUNCEMENTS_MESSAGE_KEYS,
  ANNOUNCEMENTS_MESSAGE_MAX,
  ANNOUNCEMENTS_NAME_MAX,
  announcementsFormSchema,
  announcementsSchema,
  toAnnouncementsForm,
  isAnnouncementsField,
  validationIssuesSchema,
} from '@/features/announcements/schemas/announcements.schema';
import en from '../../messages/en.json';

describe('announcements.schema', () => {
  it('validates the announcement entity schema', () => {
    const valid = {
      hasOtherFormatting: false,
      id: '1',
      name: 'Downtime',
      message: 'The system is down tonight.',
      dateAdded: '2026-10-31T09:00:00.000Z',
      showToUsers: true,
      showToStaff: false,
      showName: true,
    };
    expect(announcementsSchema.parse(valid)).toEqual(valid);
  });

  it('parses a valid form with an empty message', () => {
    expect(
      announcementsFormSchema.safeParse({
        name: 'Downtime',
        message: '',
        showtousers: false,
        showtostaff: true,
        showname: false,
      }).success,
    ).toBe(true);
  });

  it('trims and validates valid form values (wire switches remain booleans)', () => {
    const input = {
      name: '  Downtime  ',
      message: '  The system is down tonight.  ',
      showtousers: true,
      showtostaff: false,
      showname: true,
    };
    const parsed = announcementsFormSchema.parse(input);
    expect(parsed).toEqual({
      name: 'Downtime',
      message: 'The system is down tonight.',
      showtousers: true,
      showtostaff: false,
      showname: true,
    });
  });

  it('accepts an old long message, over the former 65,535 characters', () => {
    const FORMER_LIMIT = 65_535;
    const switches = { showtousers: false, showtostaff: true, showname: false };
    expect(
      announcementsFormSchema.safeParse({
        name: 'ok',
        message: 'b'.repeat(FORMER_LIMIT + 1),
        ...switches,
      }).success,
    ).toBe(true);
  });
  it('rejects an empty name and maps a null wire message to an empty form field', () => {
    expect(announcementsFormSchema.safeParse({ name: '', message: '' }).success).toBe(false);
    const valid = {
      name: 'ok',
      message: '',
      showtousers: false,
      showtostaff: true,
      showname: false,
    };
    expect(announcementsFormSchema.safeParse(valid).success).toBe(true);
    expect(
      toAnnouncementsForm({
        id: '1',
        hasOtherFormatting: false,
        name: 'ok',
        message: null,
        dateAdded: '2026-01-15T09:00:00.000Z',
        showToUsers: false,
        showToStaff: true,
        showName: false,
      }).message,
    ).toBe('');
  });

  it('rejects names and messages over the API limits and accepts the limits', () => {
    expect(ANNOUNCEMENTS_NAME_MAX).toBe(191);
    expect(ANNOUNCEMENTS_MESSAGE_MAX).toBe(16_777_215);
    const switches = { showtousers: false, showtostaff: true, showname: false };
    expect(
      announcementsFormSchema.safeParse({
        name: 'a'.repeat(ANNOUNCEMENTS_NAME_MAX + 1),
        message: '',
        ...switches,
      }).success,
    ).toBe(false);
    expect(
      announcementsFormSchema.safeParse({ name: 'a'.repeat(191), message: '', ...switches })
        .success,
    ).toBe(true);
    expect(
      announcementsFormSchema.safeParse({
        name: 'ok',
        message: 'b'.repeat(ANNOUNCEMENTS_MESSAGE_MAX + 1),
        ...switches,
      }).success,
    ).toBe(false);
  });

  it('converts the record to form values: NULL message to empty, boolean switches stay boolean', () => {
    const record = {
      hasOtherFormatting: false,
      id: '5',
      name: 'Maintenance',
      message: null,
      dateAdded: '2026-10-31T09:00:00.000Z',
      showToUsers: true,
      showToStaff: false,
      showName: true,
    };
    expect(toAnnouncementsForm(record)).toEqual({
      hasOtherFormatting: false,
      name: 'Maintenance',
      message: '',
      showtousers: true,
      showtostaff: false,
      showname: true,
    });
  });

  it('correctly identifies valid announcement fields', () => {
    expect(isAnnouncementsField('name')).toBe(true);
    expect(isAnnouncementsField('message')).toBe(true);
    expect(isAnnouncementsField('showtousers')).toBe(false);
    expect(isAnnouncementsField('invalid_field')).toBe(false);
  });

  it('keeps the schema contract to name and message and uses locale-backed validation keys', () => {
    expect(ANNOUNCEMENTS_FIELDS).toEqual(['name', 'message']);
    for (const key of Object.values(ANNOUNCEMENTS_MESSAGE_KEYS)) {
      expect(en.announcements).toHaveProperty(key);
    }
    expect(validationIssuesSchema.safeParse([{ path: ['name'], message: 'raw' }]).success).toBe(
      true,
    );
    expect(validationIssuesSchema.safeParse('raw').success).toBe(false);
  });
});
