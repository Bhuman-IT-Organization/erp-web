import { describe, expect, it } from 'vitest';
import {
  createKnowledgeBaseGroupFormSchema,
  EMPTY_KNOWLEDGE_BASE_GROUP_FORM,
  isKnowledgeBaseGroupField,
  KNOWLEDGE_BASE_COLOR_MAX,
  KNOWLEDGE_BASE_GROUP_FIELDS,
  KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS,
  KNOWLEDGE_BASE_NAME_MAX,
  knowledgeBaseGroupFormSchema,
  knowledgeBaseGroupRowSchema,
  toKnowledgeBaseGroupForm,
  toKnowledgeBaseGroupWriteValues,
  updateKnowledgeBaseGroupFormSchema,
  validationIssuesSchema,
} from '../knowledge-base-groups.schema';

const sampleGroup = {
  id: '1',
  name: 'General',
  groupSlug: 'general',
  description: 'General knowledge base articles',
  active: true,
  color: '#28B8DA',
  groupOrder: 1,
  totalArticles: 5,
};

describe('Knowledge Base Groups schema', () => {
  it('parses valid row record and applies defaults', () => {
    expect(EMPTY_KNOWLEDGE_BASE_GROUP_FORM.name).toBe('');
    expect(EMPTY_KNOWLEDGE_BASE_GROUP_FORM.groupOrder).toBe('');
    expect(KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.name).toBe('enter_group_name');
    expect(KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.groupOrder).toBe('enter_order');
    expect(knowledgeBaseGroupRowSchema.parse(sampleGroup)).toEqual(sampleGroup);

    const minimal = { id: '2', name: 'Minimal' };
    const parsed = knowledgeBaseGroupRowSchema.parse(minimal);
    expect(parsed.id).toBe('2');
    expect(parsed.name).toBe('Minimal');
    expect(parsed.active).toBe(true);
    expect(parsed.color).toBe('#28B8DA');
    expect(parsed.groupOrder).toBe(1);
    expect(parsed.totalArticles).toBe(0);
  });

  it('validates form fields: required name, length limit, color max, integer order', () => {
    expect(knowledgeBaseGroupFormSchema.safeParse({ name: 'General' }).success).toBe(true);
    expect(knowledgeBaseGroupFormSchema.safeParse({ name: '' }).success).toBe(false);
    expect(knowledgeBaseGroupFormSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      knowledgeBaseGroupFormSchema.safeParse({ name: 'a'.repeat(KNOWLEDGE_BASE_NAME_MAX + 1) })
        .success,
    ).toBe(false);

    // Color max length
    expect(
      createKnowledgeBaseGroupFormSchema.safeParse({
        name: 'General',
        color: 'x'.repeat(KNOWLEDGE_BASE_COLOR_MAX + 1),
      }).success,
    ).toBe(false);
    expect(
      createKnowledgeBaseGroupFormSchema.safeParse({
        name: 'General',
        color: 'x'.repeat(KNOWLEDGE_BASE_COLOR_MAX),
      }).success,
    ).toBe(true);

    // Decimal order produces enter_order key
    const decimalOrder = createKnowledgeBaseGroupFormSchema.safeParse({
      name: 'General',
      groupOrder: 1.5,
    });
    expect(decimalOrder.success).toBe(false);
    if (!decimalOrder.success) {
      expect(decimalOrder.error.issues[0]?.message).toBe(
        KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.groupOrder,
      );
    }

    const decimalStringOrder = createKnowledgeBaseGroupFormSchema.safeParse({
      name: 'General',
      groupOrder: '1.5',
    });
    expect(decimalStringOrder.success).toBe(false);
    if (!decimalStringOrder.success) {
      expect(decimalStringOrder.error.issues[0]?.message).toBe(
        KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.groupOrder,
      );
    }

    const outOfRangeStringOrder = createKnowledgeBaseGroupFormSchema.safeParse({
      name: 'General',
      groupOrder: '3000000000',
    });
    expect(outOfRangeStringOrder.success).toBe(false);
    if (!outOfRangeStringOrder.success) {
      expect(outOfRangeStringOrder.error.issues[0]?.message).toBe(
        KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.orderOutOfRange,
      );
    }

    const outOfRangeNumberOrder = createKnowledgeBaseGroupFormSchema.safeParse({
      name: 'General',
      groupOrder: 3000000000,
    });
    expect(outOfRangeNumberOrder.success).toBe(false);
    if (!outOfRangeNumberOrder.success) {
      expect(outOfRangeNumberOrder.error.issues[0]?.message).toBe(
        KNOWLEDGE_BASE_GROUP_MESSAGE_KEYS.orderOutOfRange,
      );
    }
  });

  it('requires groupSlug on edit', () => {
    expect(
      updateKnowledgeBaseGroupFormSchema.safeParse({
        name: 'General',
        groupSlug: '',
      }).success,
    ).toBe(false);
    expect(
      updateKnowledgeBaseGroupFormSchema.safeParse({
        name: 'General',
        groupSlug: '   ',
      }).success,
    ).toBe(false);
    expect(
      updateKnowledgeBaseGroupFormSchema.safeParse({
        name: 'General',
        groupSlug: 'general',
      }).success,
    ).toBe(true);
  });

  it('converts record to form input and form input to write values', () => {
    const formInput = toKnowledgeBaseGroupForm(sampleGroup);
    expect(formInput).toEqual({
      name: 'General',
      groupSlug: 'general',
      color: '#28B8DA',
      description: 'General knowledge base articles',
      groupOrder: 1,
      disabled: false,
    });

    const createValues = toKnowledgeBaseGroupWriteValues(formInput, false);
    expect(createValues).toEqual({
      name: 'General',
      color: '#28B8DA',
      description: 'General knowledge base articles',
      groupOrder: 1,
      disabled: false,
    });

    // When empty on create (/new), groupOrder is null
    const newEmptyValues = toKnowledgeBaseGroupWriteValues(EMPTY_KNOWLEDGE_BASE_GROUP_FORM, false);
    expect(newEmptyValues.groupOrder).toBeNull();
    expect(newEmptyValues.groupSlug).toBeUndefined();

    // Edit without changing groupSlug: groupSlug is omitted
    const editUnchanged = toKnowledgeBaseGroupWriteValues(
      { ...formInput, disabled: true },
      true,
      sampleGroup.groupSlug,
    );
    expect(editUnchanged).toEqual({
      name: 'General',
      color: '#28B8DA',
      description: 'General knowledge base articles',
      groupOrder: 1,
      disabled: true,
    });

    // Edit with changed groupSlug: groupSlug is included
    const editChanged = toKnowledgeBaseGroupWriteValues(
      { ...formInput, groupSlug: 'general-new' },
      true,
      sampleGroup.groupSlug,
    );
    expect(editChanged).toEqual({
      name: 'General',
      groupSlug: 'general-new',
      color: '#28B8DA',
      description: 'General knowledge base articles',
      groupOrder: 1,
      disabled: false,
    });
  });

  it('verifies field list and validation issues parser', () => {
    for (const field of KNOWLEDGE_BASE_GROUP_FIELDS) {
      expect(isKnowledgeBaseGroupField(field)).toBe(true);
    }
    expect(isKnowledgeBaseGroupField('unknownField')).toBe(false);

    const issues = [{ path: ['name'], message: 'Required' }];
    expect(validationIssuesSchema.parse(issues)).toEqual(issues);
  });
});
