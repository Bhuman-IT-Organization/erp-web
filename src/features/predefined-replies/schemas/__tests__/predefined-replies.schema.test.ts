import { describe, expect, it } from 'vitest';
import {
  PREDEFINED_REPLIES_MESSAGE_KEYS,
  predefinedRepliesFormSchema,
  predefinedRepliesSchema,
  isPredefinedRepliesField,
  toPredefinedRepliesForm,
  validationIssuesSchema,
} from '../predefined-replies.schema';
import en from '../../messages/en.json';

const ITEM = { id: 'a1', name: 'Alpha', message: 'Hello there' };

describe('predefined-replies schemas', () => {
  it('parses a wire item and rejects a missing field', () => {
    expect(predefinedRepliesSchema.parse(ITEM)).toEqual(ITEM);
    expect(predefinedRepliesSchema.safeParse({ id: 'a1', name: 'Alpha' }).success).toBe(false);
  });

  it('the form schema trims the name and reports the message KEY, which exists in en.json', () => {
    expect(
      predefinedRepliesFormSchema.parse({ name: '  Alpha ', message: ' Hello there ' }),
    ).toEqual({ name: 'Alpha', message: ' Hello there ' });
    const result = predefinedRepliesFormSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(PREDEFINED_REPLIES_MESSAGE_KEYS.name);
    }
    expect(en['predefined-replies']).toHaveProperty(PREDEFINED_REPLIES_MESSAGE_KEYS.name);
  });

  it('a record becomes form values; only the form fields are api issue targets', () => {
    expect(toPredefinedRepliesForm(ITEM)).toEqual({ name: 'Alpha', message: 'Hello there' });
    expect(isPredefinedRepliesField('name')).toBe(true);
    expect(isPredefinedRepliesField('id')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too short', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Too short' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
