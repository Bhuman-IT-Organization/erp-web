import { useEffect, useRef } from 'react';

/** The browser's print dialog; the default seam, never reached by a story or a test (FE-25). */
function printWindow(): void {
  window.print();
}

/**
 * Opens the print dialog once the print table is on screen (4.1.1 D-08), then reports back.
 *
 * While `active`, an `afterprint` listener is added (it fires whether the user printed or
 * cancelled) and `print()` is called once. A ref guards the call, so StrictMode's double effect
 * still opens one dialog; the listener is added again on the second run and removed on cleanup.
 * `print` is injectable so a story passes a no-op and a test a spy (FE-25).
 */
export function usePrint(
  active: boolean,
  onDone: () => void,
  print: () => void = printWindow,
): void {
  const printed = useRef(false);
  // effect: dom: open the print dialog once the print table is on screen
  useEffect(() => {
    if (!active) {
      printed.current = false;
      return undefined;
    }
    const onAfterPrint = (): void => {
      onDone();
    };
    window.addEventListener('afterprint', onAfterPrint);
    if (!printed.current) {
      printed.current = true;
      print();
    }
    return () => {
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [active, onDone, print]);
}
