import { useCallback, useEffect, useRef, useState } from 'react';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';

/**
 * Auto-dismiss timer for floating notifications (TS-13, FE-04).
 * Holds an ephemeral value for the configured duration before clearing it.
 */
export function useAutoDismiss<T = string>(
  durationMs: number = CLIENT_TIMINGS.toast.durationMs,
): readonly [T | null, (val: T) => void, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setValue(null);
  }, []);

  const trigger = useCallback(
    (val: T): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      setValue(val);
      timerRef.current = setTimeout(() => {
        setValue(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  // effect: subscribe: timer cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return [value, trigger, clear] as const;
}
