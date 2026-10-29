import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEAD_SOURCES_FORM,
  LEAD_SOURCES_FIELDS,
  LEAD_SOURCES_MESSAGE_KEYS,
  LEAD_SOURCES_NAME_MAX,
  inUseGroups,
  isLeadSourcesField,
  leadSourcesFormSchema,
  leadSourcesRowSchema,
  leadSourcesSchema,
  leadSourcesUsageSchema,
  toLeadSourcesForm,
  validationIssuesSchema,
  type LeadSources,
  type LeadSourcesUsage,
} from '../lead-sources.schema';
import en from '../../messages/en.json';

const NO_USE: LeadSourcesUsage = { leads: 0, emailIntegrations: 0, webToLeadForms: 0 };
const ITEM: LeadSources = { id: '7', name: 'Web site', usage: NO_USE };

function firstKey(name: string): string | null {
  const result = leadSourcesFormSchema.safeParse({ name });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('lead-sources schemas', () => {
  it('parses a wire record with usage and rejects missing or invalid usage', () => {
    expect(leadSourcesSchema.parse(ITEM)).toEqual(ITEM);
    expect(leadSourcesSchema.safeParse({ id: '7', name: 'Web site' }).success).toBe(false);
    expect(leadSourcesUsageSchema.safeParse({ leads: -1 }).success).toBe(false);
    expect(leadSourcesUsageSchema.safeParse({ leads: 1.5 }).success).toBe(false);
  });

  it('the list row has the record shape, including usage needed by the delete dialog', () => {
    expect(leadSourcesRowSchema.parse(ITEM)).toEqual(leadSourcesSchema.parse(ITEM));
    expect(Object.keys(leadSourcesRowSchema.shape)).toEqual(Object.keys(leadSourcesSchema.shape));
  });

  it('refuses an empty name, an all-space name, and names over 150 characters', () => {
    expect(LEAD_SOURCES_NAME_MAX).toBe(150);
    expect(firstKey('')).toBe(LEAD_SOURCES_MESSAGE_KEYS.name);
    expect(firstKey('   ')).toBe(LEAD_SOURCES_MESSAGE_KEYS.name);
    expect(firstKey('x'.repeat(151))).toBe(LEAD_SOURCES_MESSAGE_KEYS.nameTooLong);
    expect(firstKey('x'.repeat(150))).toBeNull();
  });

  it('trims names and accepts all characters, including markup', () => {
    expect(leadSourcesFormSchema.parse({ name: '  Web site  ' })).toEqual({ name: 'Web site' });
    expect(leadSourcesFormSchema.parse({ name: 'Fuel < 50 km' }).name).toBe('Fuel < 50 km');
    expect(leadSourcesFormSchema.parse({ name: '<script>alert(1)</script>' }).name).toBe(
      '<script>alert(1)</script>',
    );
  });

  it('every validation message key has an English translation', () => {
    for (const key of Object.values(LEAD_SOURCES_MESSAGE_KEYS)) {
      expect(en['lead-sources']).toHaveProperty(key);
    }
  });

  it('returns usage groups in schema order and handles missing usage', () => {
    expect(inUseGroups(NO_USE)).toEqual([]);
    expect(inUseGroups({ ...NO_USE, leads: 2 })).toEqual(['leads']);
    expect(inUseGroups({ ...NO_USE, emailIntegrations: 2, webToLeadForms: 1 })).toEqual([
      'emailIntegrations',
      'webToLeadForms',
    ]);
    expect(inUseGroups(undefined)).toEqual([]);
  });

  it('maps a record to form values and allows only name as a validation target', () => {
    expect(toLeadSourcesForm(ITEM)).toEqual({ name: 'Web site' });
    expect(EMPTY_LEAD_SOURCES_FORM).toEqual({ name: '' });
    expect(LEAD_SOURCES_FIELDS).toEqual(['name']);
    expect(isLeadSourcesField('name')).toBe(true);
    expect(isLeadSourcesField('id')).toBe(false);
    expect(isLeadSourcesField('usage')).toBe(false);
  });

  it('accepts valid API issues and rejects malformed issue payloads', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Required', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Required' }]);
    expect(validationIssuesSchema.safeParse('invalid').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
