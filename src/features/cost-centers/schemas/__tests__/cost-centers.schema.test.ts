import { describe, expect, it } from 'vitest';
import {
  COST_CENTERS_FIELDS,
  COST_CENTERS_MESSAGE_KEYS,
  COST_CENTERS_NAME_MAX,
  costCentersFormSchema,
  costCentersRowSchema,
  costCentersSchema,
  costCentersUsageSchema,
  inUseGroups,
  isCostCentersField,
  toCostCentersForm,
  validationIssuesSchema,
  type CostCenters,
  type CostCentersUsage,
} from '../cost-centers.schema';
import en from '../../messages/en.json';

const NO_USE: CostCentersUsage = {
  purchaseRequests: 0,
  purchaseOrders: 0,
  purchaseQuotations: 0,
  shippingCharges: 0,
  expenses: 0,
  assets: 0,
};

const ITEM: CostCenters = {
  id: '7',
  name: 'Head office',
  dateCreated: '2026-10-02T20:30:15.000Z',
  usage: NO_USE,
};

/** The first issue's message key for `name`, or `null` when the form schema accepts it. */
function firstKey(name: string): string | null {
  const result = costCentersFormSchema.safeParse({ name });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('cost-centers schemas', () => {
  it('parses a wire record with its six usage groups and a Date Created instant, and rejects a missing field', () => {
    expect(costCentersSchema.parse(ITEM)).toEqual(ITEM);
    expect(costCentersSchema.safeParse({ id: '7', name: 'Head office' }).success).toBe(false);
    expect(costCentersSchema.safeParse({ ...ITEM, usage: undefined }).success).toBe(false);
    expect(Object.keys(costCentersUsageSchema.shape)).toEqual([
      'purchaseRequests',
      'purchaseOrders',
      'purchaseQuotations',
      'shippingCharges',
      'expenses',
      'assets',
    ]);
    expect(costCentersUsageSchema.safeParse({ ...NO_USE, assets: -1 }).success).toBe(false);
    expect(costCentersUsageSchema.safeParse({ ...NO_USE, assets: 1.5 }).success).toBe(false);
  });

  it('parses a record whose Date Created is null (a Perfex row with no date) and refuses one that is not an instant', () => {
    expect(costCentersSchema.parse({ ...ITEM, dateCreated: null }).dateCreated).toBeNull();
    expect(costCentersSchema.safeParse({ ...ITEM, dateCreated: 'yesterday' }).success).toBe(false);
    expect(costCentersSchema.safeParse({ ...ITEM, dateCreated: undefined }).success).toBe(false);
  });

  it('the list row equals the record: the row carries the usage the delete reads', () => {
    expect(costCentersRowSchema.parse(ITEM)).toEqual(costCentersSchema.parse(ITEM));
    expect(Object.keys(costCentersRowSchema.shape)).toEqual(Object.keys(costCentersSchema.shape));
  });

  it('refuses an empty name, an all-space name and one over 255 characters; accepts 255', () => {
    expect(COST_CENTERS_NAME_MAX).toBe(255);
    expect(firstKey('')).toBe('enter_name');
    expect(firstKey('   ')).toBe('enter_name');
    expect(firstKey('x'.repeat(256))).toBe('name_too_long');
    expect(firstKey('x'.repeat(255))).toBeNull();
  });

  it('trims the name and accepts every character unchanged, markup included (shown as text, D-29)', () => {
    expect(costCentersFormSchema.parse({ name: '  Head office ' })).toEqual({
      name: 'Head office',
    });
    expect(costCentersFormSchema.parse({ name: 'Fuel < 50 km' }).name).toBe('Fuel < 50 km');
    expect(costCentersFormSchema.parse({ name: '<script>alert(1)</script>' }).name).toBe(
      '<script>alert(1)</script>',
    );
    expect(costCentersFormSchema.parse({ name: 'A | B  C' }).name).toBe('A | B  C');
  });

  it('every message key the schema reports exists in en.json', () => {
    for (const key of Object.values(COST_CENTERS_MESSAGE_KEYS)) {
      expect(en['cost-centers']).toHaveProperty(key);
    }
  });

  it('inUseGroups lists the non-zero groups in the order purchase requests, orders, quotations, shipping charges, expenses, assets', () => {
    expect(inUseGroups(NO_USE)).toEqual([]);
    expect(inUseGroups({ ...NO_USE, assets: 1, purchaseOrders: 2 })).toEqual([
      'purchaseOrders',
      'assets',
    ]);
    expect(
      inUseGroups({
        purchaseRequests: 1,
        purchaseOrders: 1,
        purchaseQuotations: 1,
        shippingCharges: 1,
        expenses: 1,
        assets: 1,
      }),
    ).toEqual([
      'purchaseRequests',
      'purchaseOrders',
      'purchaseQuotations',
      'shippingCharges',
      'expenses',
      'assets',
    ]);
  });

  it('a record becomes form values; only the name is an api issue target', () => {
    expect(toCostCentersForm(ITEM)).toEqual({ name: 'Head office' });
    expect(COST_CENTERS_FIELDS).toEqual(['name']);
    expect(isCostCentersField('name')).toBe(true);
    expect(isCostCentersField('id')).toBe(false);
    expect(isCostCentersField('dateCreated')).toBe(false);
    expect(isCostCentersField('usage')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too short', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Too short' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
