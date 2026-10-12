import { useEffect, type RefObject } from 'react';

/**
 * Esc in a non-empty text box clears it — and ONLY clears it: a dialog around the box (the sidebar's
 * mobile drawer) must not close on the same press (lead 2026-09-26). Radix dismisses on a `keydown`
 * it hears on the document in the CAPTURE phase, before React's handlers see the key, so the box
 * claims the key earlier still, on the window (capture runs window → document → …), with
 * `preventDefault()`, which Radix honours. An empty box leaves Esc alone: the next press closes the
 * dialog, and outside one it does nothing.
 */
export function useClearOnEscape(ref: RefObject<HTMLInputElement | null>, clear: () => void): void {
  // effect: subscribe: a window capture listener, the one place that runs before Radix's dismiss
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const input = ref.current;
      if (event.key !== 'Escape' || input === null || event.target !== input) return;
      if (input.value === '') return;
      event.preventDefault();
      clear();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [ref, clear]);
}
