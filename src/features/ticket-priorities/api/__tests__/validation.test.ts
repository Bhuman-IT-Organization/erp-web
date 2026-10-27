import { describe, it, expect } from 'vitest'; // remove this line if you use Jest
import { validatePriorityName } from '../../validation';
import type { TicketPriority } from '@/lib/hooks/useTicketPriorities';

const list = [
  { id: 1, name: 'High' },
  { id: 2, name: 'Low' },
] as TicketPriority[];

describe('validatePriorityName', () => {
  it('returns null for a new unique name', () => {
    expect(validatePriorityName('Urgent', null, list)).toBeNull();
  });

  it('flags duplicates case-insensitively', () => {
    expect(validatePriorityName('high', null, list)).toBe('This priority name already exists');
  });

  it('allows keeping the same name when editing the same row', () => {
    expect(validatePriorityName('High', 1, list)).toBeNull();
  });

  it('flags a duplicate of another row when editing', () => {
    expect(validatePriorityName('Low', 1, list)).toBe('This priority name already exists');
  });

  it('returns the schema message for invalid format', () => {
    expect(validatePriorityName('a', null, list)).toBe('Name must be at least 2 characters');
  });
});
