import { useEffect, type RefObject } from 'react';

/**
 * A click that landed on one of these is its own action, never "open the row": a control, a
 * label, or anything inside `[data-row-ignore]` (the row-actions wrapper, the selection cell). The
 * listener is native, so it runs BEFORE React's root listener: a React `stopPropagation` in
 * `RowActions` cannot stop it, which is why the wrapper is skipped here by attribute.
 */
const NOT_THE_ROW =
  'a, button, input, select, textarea, label, [role="menuitem"], [data-row-ignore]';

/**
 * The whole list row opens its record (UI-SPEC § Table, choice 16) while the `<tr>` stays a plain,
 * non-interactive element (jsx-a11y): a click anywhere in a row that did not land on a control
 * clicks that row's primary link, `a[data-row-link]`. The link is the keyboard path and owns the
 * navigation, the return record (D-28) and the row seed (D-35), so the row click adds nothing.
 */
export function useRowClick(tbody: RefObject<HTMLTableSectionElement | null>): void {
  // effect: subscribe: one click listener on the table body while the list is mounted (UI-SPEC § Table)
  useEffect(() => {
    const body = tbody.current;
    if (body === null) return undefined;
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(NOT_THE_ROW) !== null) return;
      target.closest('tr')?.querySelector<HTMLAnchorElement>('a[data-row-link]')?.click();
    };
    body.addEventListener('click', onClick);
    return () => {
      body.removeEventListener('click', onClick);
    };
  }, [tbody]);
}
