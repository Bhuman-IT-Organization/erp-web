import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_BASE_FIELDS,
  KNOWLEDGE_BASE_MESSAGE_KEYS,
  KNOWLEDGE_BASE_NAME_MAX,
  knowledgeBaseFormSchema,
  knowledgeBaseGroupFormSchema,
  knowledgeBaseGroupRowSchema,
  knowledgeBaseRowSchema,
  knowledgeBaseSchema,
  knowledgeBaseUsageSchema,
  inUseGroups,
  isKnowledgeBaseField,
  toKnowledgeBaseForm,
  validationIssuesSchema,
  type KnowledgeBase,
  type KnowledgeBaseUsage,
} from '../knowledge-base.schema';
import en from '../../messages/en.json';

const NO_USE: KnowledgeBaseUsage = {
  purchaseRequests: 0,
  purchaseOrders: 0,
  purchaseQuotations: 0,
  shippingCharges: 0,
  expenses: 0,
  assets: 0,
};

const ITEM: KnowledgeBase = {
  id: '7',
  name: 'Head office',
  dateCreated: '2026-10-02T20:30:15.000Z',
  usage: NO_USE,
};

/** The first issue's message key for `name`, or `null` when the form schema accepts it. */
function firstKey(name: string): string | null {
  const result = knowledgeBaseFormSchema.safeParse({ name });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('knowledge-base schemas', () => {
  it('parses a wire record with its six usage groups and a Date Created instant, and rejects a missing field', () => {
    expect(knowledgeBaseSchema.parse(ITEM)).toEqual(ITEM);
    expect(knowledgeBaseSchema.safeParse({ id: '7', name: 'Head office' }).success).toBe(false);
    expect(knowledgeBaseSchema.safeParse({ ...ITEM, usage: undefined }).success).toBe(false);
    expect(Object.keys(knowledgeBaseUsageSchema.shape)).toEqual([
      'purchaseRequests',
      'purchaseOrders',
      'purchaseQuotations',
      'shippingCharges',
      'expenses',
      'assets',
    ]);
    expect(knowledgeBaseUsageSchema.safeParse({ ...NO_USE, assets: -1 }).success).toBe(false);
    expect(knowledgeBaseUsageSchema.safeParse({ ...NO_USE, assets: 1.5 }).success).toBe(false);
  });

  it('parses a record whose Date Created is null (a Perfex row with no date) and refuses one that is not an instant', () => {
    expect(knowledgeBaseSchema.parse({ ...ITEM, dateCreated: null }).dateCreated).toBeNull();
    expect(knowledgeBaseSchema.safeParse({ ...ITEM, dateCreated: 'yesterday' }).success).toBe(
      false,
    );
    expect(knowledgeBaseSchema.safeParse({ ...ITEM, dateCreated: undefined }).success).toBe(false);
  });

  it('the list row equals the record: the row carries the usage the delete reads', () => {
    expect(knowledgeBaseRowSchema.parse(ITEM)).toEqual(knowledgeBaseSchema.parse(ITEM));
    expect(Object.keys(knowledgeBaseRowSchema.shape)).toEqual(
      Object.keys(knowledgeBaseSchema.shape),
    );
  });

  it('refuses an empty name, an all-space name and one over 255 characters; accepts 255', () => {
    expect(KNOWLEDGE_BASE_NAME_MAX).toBe(255);
    expect(firstKey('')).toBe('enter_name');
    expect(firstKey('   ')).toBe('enter_name');
    expect(firstKey('x'.repeat(256))).toBe('name_too_long');
    expect(firstKey('x'.repeat(255))).toBeNull();
  });

  it('trims the name and accepts every character unchanged, markup included (shown as text, D-29)', () => {
    expect(knowledgeBaseFormSchema.parse({ name: '  Head office ' })).toEqual({
      name: 'Head office',
    });
    expect(knowledgeBaseFormSchema.parse({ name: 'Fuel < 50 km' }).name).toBe('Fuel < 50 km');
    expect(knowledgeBaseFormSchema.parse({ name: '<script>alert(1)</script>' }).name).toBe(
      '<script>alert(1)</script>',
    );
    expect(knowledgeBaseFormSchema.parse({ name: 'A | B  C' }).name).toBe('A | B  C');
  });

  it('every message key the schema reports exists in en.json', () => {
    for (const key of Object.values(KNOWLEDGE_BASE_MESSAGE_KEYS)) {
      expect(en['knowledge-base']).toHaveProperty(key);
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
    expect(toKnowledgeBaseForm(ITEM)).toEqual({ name: 'Head office' });
    expect(KNOWLEDGE_BASE_FIELDS).toEqual(['name']);
    expect(isKnowledgeBaseField('name')).toBe(true);
    expect(isKnowledgeBaseField('id')).toBe(false);
    expect(isKnowledgeBaseField('dateCreated')).toBe(false);
    expect(isKnowledgeBaseField('usage')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too short', code: 'too_small' }]),
    ).toEqual([{ path: ['name'], message: 'Too short' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });

  it('knowledgeBaseGroupRowSchema parses valid group row with defaults', () => {
    const row = knowledgeBaseGroupRowSchema.parse({
      id: '1',
      name: 'General',
    });
    expect(row.id).toBe('1');
    expect(row.name).toBe('General');
    expect(row.active).toBe(true);
    expect(row.totalArticles).toBe(0);
    expect(row.color).toBe('#28B8DA');
  });

  it('knowledgeBaseGroupFormSchema validates group form input', () => {
    const valid = knowledgeBaseGroupFormSchema.parse({
      name: '  Billing  ',
      color: '#ff0000',
      description: 'Billing help',
      groupOrder: '2',
      disabled: true,
    });
    expect(valid.name).toBe('Billing');
    expect(valid.groupOrder).toBe(2);
    expect(valid.disabled).toBe(true);

    const blank = knowledgeBaseGroupFormSchema.safeParse({ name: '   ' });
    expect(blank.success).toBe(false);
  });
});
