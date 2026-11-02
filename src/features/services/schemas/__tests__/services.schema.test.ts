// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  SERVICES_FIELDS,
  SERVICES_MESSAGE_KEYS,
  SERVICES_NAME_MAX,
  servicesFormSchema,
  servicesRowSchema,
  servicesSchema,
  isServicesField,
  toServicesForm,
  validationIssuesSchema,
} from '../services.schema';
import en from '../../messages/en.json';

const ITEM = {
  id: '7',
  name: 'Technical Support',
};

function firstKey(name: string): string | null {
  const result = servicesFormSchema.safeParse({ name });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('services schemas', () => {
  it('parses a valid service record and rejects missing fields', () => {
    expect(servicesSchema.parse(ITEM)).toEqual(ITEM);

    expect(servicesSchema.safeParse({ id: '7' }).success).toBe(false);

    expect(servicesSchema.safeParse({ name: 'Technical Support' }).success).toBe(false);
  });

  it('the list row matches the service record', () => {
    expect(servicesRowSchema.parse(ITEM)).toEqual(servicesSchema.parse(ITEM));
  });

  it('rejects empty names and names containing only spaces', () => {
    expect(firstKey('')).toBe('enter_name');
    expect(firstKey('   ')).toBe('enter_name');
  });

  it('trims the service name', () => {
    expect(servicesFormSchema.parse({ name: '  Technical Support  ' })).toEqual({
      name: 'Technical Support',
    });
  });

  it('accepts a service name within the maximum length', () => {
    expect(
      servicesFormSchema.safeParse({
        name: 'Support',
      }).success,
    ).toBe(true);

    expect(SERVICES_NAME_MAX).toBe(50);
    expect(firstKey('x'.repeat(51))).not.toBeNull();
    expect(firstKey('x'.repeat(50))).toBeNull();
  });

  it('allows special characters in the service name', () => {
    expect(servicesFormSchema.parse({ name: 'Support & Services' }).name).toBe(
      'Support & Services',
    );

    expect(servicesFormSchema.parse({ name: 'Service < 50' }).name).toBe('Service < 50');
  });

  it('every schema message key exists in en.json', () => {
    for (const key of Object.values(SERVICES_MESSAGE_KEYS)) {
      expect(en.services).toHaveProperty(key);
    }
  });

  it('converts a service record into form values', () => {
    expect(toServicesForm(ITEM)).toEqual({
      name: 'Technical Support',
    });

    expect(SERVICES_FIELDS).toEqual(['name']);
    expect(isServicesField('name')).toBe(true);
    expect(isServicesField('id')).toBe(false);
  });

  it('accepts valid API validation issues and rejects invalid input', () => {
    expect(
      validationIssuesSchema.parse([
        {
          path: ['name'],
          message: 'Invalid name',
          code: 'too_small',
        },
      ]),
    ).toEqual([
      {
        path: ['name'],
        message: 'Invalid name',
      },
    ]);

    expect(validationIssuesSchema.safeParse('invalid').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
