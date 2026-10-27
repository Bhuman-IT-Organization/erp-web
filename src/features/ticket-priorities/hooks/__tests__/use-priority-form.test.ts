import { describe, expect, it } from 'vitest';
import { usePriorityForm } from '../use-priority-form';

describe('usePriorityForm', () => {
  it('is exported as a function', () => {
    expect(typeof usePriorityForm).toBe('function');
  });
});