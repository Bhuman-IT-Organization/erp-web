import { useMemo, useSyncExternalStore } from 'react';
import { usePermissions } from '@/lib/auth/use-permissions';

/** What `useColumnVisibility` returns: the hidden ids, a setter and a reset to the defaults. */
export interface ColumnVisibility {
  readonly hidden: ReadonlySet<string>;
  readonly setHidden: (id: string, hidden: boolean) => void;
  readonly reset: () => void;
}

/** `fixed`: ids that can never be hidden; `defaultHidden`: hidden while nothing is stored. */
export interface ColumnVisibilityOptions {
  readonly fixed: readonly string[];
  readonly defaultHidden?: readonly string[];
}

const NONE: readonly string[] = [];

const keyOf = (storageKey: string, staffId: number): string =>
  `erp.list.columns.${storageKey}.${String(staffId)}`;

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
  };
}

/** The stored ids, or `null` when nothing usable is stored. */
function parseIds(raw: string | null): readonly string[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed : null;
}

/**
 * A list's hidden columns (K4, UI-SPEC § Item list, Columns; Perfex's `customizable-table`): the
 * choice is remembered per user in `localStorage` under `erp.list.columns.<storageKey>.<staffId>`
 * as a JSON array of hidden column ids, and is never part of the URL. Nothing stored: the list's
 * `defaultHidden`. The stored value is user-editable, so only an array of strings is read, and a
 * `fixed` id (Code, Name) is never hidden, whatever is stored (T-4.2-40: column ids only, per staff
 * member). While `/me` is unknown there is no user and so no key: the defaults, and a change is
 * not kept.
 *
 * Read with `useSyncExternalStore` as `use-page-size.ts` reads the page size; this tab's own write
 * announces itself with a `storage` event, because the browser fires one only in OTHER tabs.
 */
export function useColumnVisibility(
  storageKey: string,
  { fixed, defaultHidden = NONE }: ColumnVisibilityOptions,
): ColumnVisibility {
  const staffId = usePermissions().me?.staffId;
  const key = staffId === undefined ? null : keyOf(storageKey, staffId);
  const raw = useSyncExternalStore(
    subscribe,
    () => (key === null ? null : localStorage.getItem(key)),
    () => null,
  );
  const hidden = useMemo(
    () => new Set((parseIds(raw) ?? defaultHidden).filter((id) => !fixed.includes(id))),
    [raw, fixed, defaultHidden],
  );
  const announce = (): void => {
    window.dispatchEvent(new StorageEvent('storage', { key }));
  };
  return {
    hidden,
    setHidden: (id, hide) => {
      if (key === null || fixed.includes(id)) return;
      const next = new Set(hidden);
      if (hide) next.add(id);
      else next.delete(id);
      localStorage.setItem(key, JSON.stringify([...next]));
      announce();
    },
    reset: () => {
      if (key === null) return;
      localStorage.removeItem(key);
      announce();
    },
  };
}
