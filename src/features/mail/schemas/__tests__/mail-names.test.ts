import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import {
  MERGE_FIELD_NAME_KEYS,
  TEMPLATE_NAME_KEYS,
  mergeFieldNameKey,
  templateNameKey,
} from '../mail-names';

const MAIL: unknown = en.mail;
const at = (path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      MAIL,
    );

describe('template and merge-field names (UI-SPEC § Template names and merge fields)', () => {
  it('names the four timesheets templates and six merge fields, each with an English message', () => {
    expect(Object.keys(TEMPLATE_NAME_KEYS)).toHaveLength(4);
    expect(Object.keys(MERGE_FIELD_NAME_KEYS)).toHaveLength(6);
    for (const key of [
      ...Object.values(TEMPLATE_NAME_KEYS),
      ...Object.values(MERGE_FIELD_NAME_KEYS),
    ]) {
      expect(typeof at(key), key).toBe('string');
    }
  });

  it('answers the key of a known template, null for any other (the caller shows the raw key)', () => {
    expect(templateNameKey('attendance_notice')).toBe('template_names.attendance_notice');
    expect(templateNameKey('zz_mod_a_unknown')).toBeNull();
    expect(templateNameKey('toString')).toBeNull();
    expect(templateNameKey('__proto__')).toBeNull();
  });

  it('answers the key of a merge field by its token, with or without the braces', () => {
    expect(mergeFieldNameKey('{staff_name}')).toBe('merge_fields.staff_name');
    expect(mergeFieldNameKey('staff_id')).toBe('merge_fields.staff_id');
    expect(mergeFieldNameKey('{unknown}')).toBeNull();
    expect(mergeFieldNameKey('constructor')).toBeNull();
  });
});
