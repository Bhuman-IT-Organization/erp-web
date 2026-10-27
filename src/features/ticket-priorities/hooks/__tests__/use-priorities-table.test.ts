import { describe, expect, it } from 'vitest';
import { usePrioritiesTable } from '../use-priorities-table';

describe('usePrioritiesTable', () => {
  it('is exported as a function', () => {
    expect(typeof usePrioritiesTable).toBe('function');
  });
});