import { useCallback } from 'react';

/**
 * `run(fn)`: `fn` after the tasks already queued (a 0 ms timer: an order, not a duration). A Radix
 * popover that closes hands focus back to its trigger in such a task (FocusScope), so a picker row
 * that moves focus into the line it just added, or opens that line's list, runs the move here and
 * keeps it (plan 04.8-16). The function is stable across renders.
 */
export function useAfterFocusReturn(): (fn: () => void) => void {
  return useCallback((fn: () => void) => {
    setTimeout(fn, 0);
  }, []);
}
