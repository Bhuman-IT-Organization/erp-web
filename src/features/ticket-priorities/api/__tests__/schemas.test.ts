import { describe, it, expect } from 'vitest'; // remove this line if you use Jest
import { ticketPrioritySchema } from '../schemas';

describe('ticketPrioritySchema', () => {
  it('accepts a valid name', () => {
    expect(ticketPrioritySchema.safeParse({ name: 'High' }).success).toBe(true);
  });

  it('trims whitespace', () => {
    const r = ticketPrioritySchema.safeParse({ name: '  High  ' });
    expect(r.success && r.data.name).toBe('High');
  });

  it.each([
    ['', 'Priority name is required'],
    ['   ', 'Priority name is required'],
    ['a', 'Name must be at least 2 characters'],
    ['x'.repeat(51), 'Name must be 50 characters or less'],
    ['hi!', 'Only letters, numbers, spaces, - and _ allowed'],
  ])('rejects %j', (name, message) => {
    const r = ticketPrioritySchema.safeParse({ name });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(message);
  });
});
