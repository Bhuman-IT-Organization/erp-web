// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAfterFocusReturn } from '../use-after-focus-return';

describe('useAfterFocusReturn', () => {
  it('runs after a task already queued (a popover focus return), never at once', async () => {
    const order: string[] = [];
    const { result } = renderHook(() => useAfterFocusReturn());
    setTimeout(() => order.push('focus return'), 0);
    result.current(() => order.push('move'));
    expect(order).toEqual([]);
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(order).toEqual(['focus return', 'move']);
  });

  it('is the same function across renders', () => {
    const { result, rerender } = renderHook(() => useAfterFocusReturn());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
