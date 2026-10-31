import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import {
  isTicketPrioritiesField,
  TICKET_PRIORITIES_FIELDS,
  TICKET_PRIORITIES_MESSAGE_KEYS,
  TICKET_PRIORITIES_NAME_MAX,
  ticketPrioritiesFormSchema,
  ticketPrioritiesRowSchema,
  ticketPrioritiesSchema,
  toTicketPrioritiesForm,
  validationIssuesSchema,
  type TicketPriorities,
} from '../ticket-priorities.schema';

const ITEM: TicketPriorities = { id: '3', name: 'High' };

/** The first issue's message key for `name`, or `null` when the form schema accepts it. */
function firstKey(name: string): string | null {
  const result = ticketPrioritiesFormSchema.safeParse({ name });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('ticket-priorities schemas', () => {
  it('parses a wire record and rejects a missing field', () => {
    expect(ticketPrioritiesSchema.parse(ITEM)).toEqual(ITEM);
    expect(ticketPrioritiesSchema.safeParse({ id: '3' }).success).toBe(false);
    expect(ticketPrioritiesSchema.safeParse({ name: 'High' }).success).toBe(false);
  });

  it('the list row is the record', () => {
    expect(ticketPrioritiesRowSchema.parse(ITEM)).toEqual(ticketPrioritiesSchema.parse(ITEM));
  });

  it('refuses an empty name, an all-space name and one over 50 characters; accepts exactly 50', () => {
    expect(TICKET_PRIORITIES_NAME_MAX).toBe(50);
    expect(firstKey('')).toBe('enter_name');
    expect(firstKey('   ')).toBe('enter_name');
    expect(firstKey('x'.repeat(51))).toBe('name_too_long');
    expect(firstKey('x'.repeat(50))).toBeNull();
  });

  it('has no minimum beyond one character: a one-letter name is accepted (Perfex has none)', () => {
    expect(firstKey('A')).toBeNull();
  });

  it('accepts any character: Arabic, punctuation and markup (the old [A-Za-z0-9 _-] rule is gone)', () => {
    for (const name of ['عاجل', 'High!', 'P1 / urgent', '<b>x</b>', 'Prioridad alta ñ']) {
      expect(firstKey(name), name).toBeNull();
    }
  });

  it('counts characters, not bytes: 50 Arabic letters pass, 51 do not', () => {
    expect(firstKey('ع'.repeat(50))).toBeNull();
    expect(firstKey('ع'.repeat(51))).toBe('name_too_long');
  });

  it('trims the name and keeps inner spaces', () => {
    expect(ticketPrioritiesFormSchema.parse({ name: '  Very  High ' })).toEqual({
      name: 'Very  High',
    });
  });

  it('every message key the schema reports exists in en.json', () => {
    for (const key of Object.values(TICKET_PRIORITIES_MESSAGE_KEYS)) {
      expect(en['ticket-priorities']).toHaveProperty(key);
    }
  });

  it('a record becomes form values; only the name is an api issue target', () => {
    expect(toTicketPrioritiesForm(ITEM)).toEqual({ name: 'High' });
    expect(TICKET_PRIORITIES_FIELDS).toEqual(['name']);
    expect(isTicketPrioritiesField('name')).toBe(true);
    expect(isTicketPrioritiesField('id')).toBe(false);
  });

  it('validationIssuesSchema accepts the api issue shape and rejects anything else (T-3-26)', () => {
    expect(
      validationIssuesSchema.parse([{ path: ['name'], message: 'Too long', code: 'too_big' }]),
    ).toEqual([{ path: ['name'], message: 'Too long' }]);
    expect(validationIssuesSchema.safeParse('garbage').success).toBe(false);
    expect(validationIssuesSchema.safeParse([{ path: 'name' }]).success).toBe(false);
  });
});
