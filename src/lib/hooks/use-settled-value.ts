import { useEffect, useState } from 'react';

/**
 * `value` once it has stayed unchanged for `ms`, and `settle(next)` to adopt a value at once.
 *
 * A list's search reaches the api 300 ms after the last keystroke, and at once on Enter or Clear
 * search (D-19, UI-SPEC § Search). nuqs's `debounce` limits only the URL WRITE: the `q` its hook
 * returns changes on every keystroke, so a request keyed on it would fire per letter. The list
 * keys its request on this settled value instead. The first value is settled from the start, so
 * the first request never waits.
 */
export function useSettledValue<T>(value: T, ms: number): readonly [T, (next: T) => void] {
  const [settled, setSettled] = useState(value);
  // effect: subscribe: a timer that settles the value once it has stopped changing (D-19)
  useEffect(() => {
    if (Object.is(value, settled)) return undefined;
    const timer = setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, settled, ms]);
  return [settled, setSettled] as const;
}
