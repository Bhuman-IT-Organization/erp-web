import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_GROUPS_FIELDS,
  CUSTOMER_GROUPS_MESSAGE_KEYS,
  CUSTOMER_GROUPS_NAME_MAX,
  customerGroupsFormSchema,
  customerGroupsSchema,
  toCustomerGroupsForm,
  isCustomerGroupsField,
  validationIssuesSchema,
} from '@/features/customer-groups/schemas/customer-groups.schema';
import en from '../../messages/en.json';

describe('customer-groups.schema', () => {
  it('validates customer group entity schema', () => {
    const valid = { id: '1', name: 'Retail' };
    expect(customerGroupsSchema.parse(valid)).toEqual(valid);
  });

  it('trims and validates valid form values', () => {
    const input = { name: '  VIP Group  ' };
    const parsed = customerGroupsFormSchema.parse(input);
    expect(parsed.name).toBe('VIP Group');
  });

  it('rejects empty name in form schema', () => {
    const input = { name: '' };
    const result = customerGroupsFormSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects names over the API limit and accepts the limit', () => {
    expect(CUSTOMER_GROUPS_NAME_MAX).toBe(191);
    const input = { name: 'a'.repeat(CUSTOMER_GROUPS_NAME_MAX + 1) };
    const result = customerGroupsFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(customerGroupsFormSchema.safeParse({ name: 'a'.repeat(191) }).success).toBe(true);
  });

  it('converts record to form values correctly', () => {
    const record = { id: '5', name: 'Corporate' };
    expect(toCustomerGroupsForm(record)).toEqual({ name: 'Corporate' });
  });

  it('correctly identifies valid customer group fields', () => {
    expect(isCustomerGroupsField('name')).toBe(true);
    expect(isCustomerGroupsField('invalid_field')).toBe(false);
  });

  it('keeps the schema contract to name and uses locale-backed validation keys', () => {
    expect(CUSTOMER_GROUPS_FIELDS).toEqual(['name']);
    for (const key of Object.values(CUSTOMER_GROUPS_MESSAGE_KEYS)) {
      expect(en['customer-groups']).toHaveProperty(key);
    }
    expect(validationIssuesSchema.safeParse([{ path: ['name'], message: 'raw' }]).success).toBe(
      true,
    );
    expect(validationIssuesSchema.safeParse('raw').success).toBe(false);
  });
});
