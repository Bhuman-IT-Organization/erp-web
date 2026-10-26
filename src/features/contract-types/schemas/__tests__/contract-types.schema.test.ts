import { describe, expect, it } from 'vitest';
import {
  CONTRACT_TYPES_MESSAGE_KEYS,
  contractTypesFormSchema,
  contractTypesSchema,
  inUseGroups,
  isContractTypesField,
  toContractTypesForm,
  validationIssuesSchema,
} from '../contract-types.schema';
import en from '../../messages/en.json';

const NO_USE = {
  purchaseRequests: 0,
  purchaseOrders: 0,
  purchaseQuotations: 0,
  shippingCharges: 0,
  expenses: 0,
  assets: 0,
};
const ITEM = { id: 'a1', name: 'Alpha', dateCreated: '2026-01-02T20:30:00.000Z', usage: NO_USE };

describe('contract-types schemas', () => {
  it('parses a wire item and rejects a missing field', () => {
    expect(contractTypesSchema.parse(ITEM)).toEqual(ITEM);
    expect(contractTypesSchema.safeParse({ id: 'a1', name: 'Alpha' }).success).toBe(false);
  });

  it('reports inUseGroups accurately based on non-zero usage', () => {
    expect(inUseGroups(NO_USE)).toEqual([]);
    expect(inUseGroups({ ...NO_USE, expenses: 2 })).toEqual(['expenses']);
  });

  it('the form schema trims the name and reports the message KEY, which exists in en.json', () => {
    expect(contractTypesFormSchema.parse({ name: '  Alpha ' })).toEqual({ name: 'Alpha' });
    const result = contractTypesFormSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(CONTRACT_TYPES_MESSAGE_KEYS.name);
    }
    expect(en['contract-types']).toHaveProperty(CONTRACT_TYPES_MESSAGE_KEYS.name);
  });

  it('a record becomes form values; only the form fields are api issue targets', () => {
    expect(toContractTypesForm(ITEM)).toEqual({ name: 'Alpha' });
    expect(isContractTypesField('name')).toBe(true);
    expect(isContractTypesField('id')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too short', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Too short' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
