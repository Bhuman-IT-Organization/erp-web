import { useSyncExternalStore } from 'react';
import { usePermissions } from '@/lib/auth/use-permissions';
import { LIST_PAGE_SIZES, useListQueryState, type ListPageSize } from '@/lib/url/use-query-state';

/**
 * The list's page size (D-20, UI-SPEC choice 23): a `?limit=` in the URL wins, so a shared link
 * reproduces the view; else the size this user last chose, remembered in `localStorage` under
 * `erp.list.pageSize.<staffId>` for every list; else 25. The stored value is user-editable, so it is
 * accepted only when it is exactly one of 25 / 50 / 100 (T-3.2-51; the api re-validates `limit`).
 * While `/me` is unknown there is no user and so no key: 25.
 *
 * The setter writes the memory and pushes `limit` with the cursor dropped (`setLimit`).
 */
const DEFAULT_PAGE_SIZE: ListPageSize = LIST_PAGE_SIZES[0];
const storageKey = (staffId: number): string => `erp.list.pageSize.${String(staffId)}`;

function toPageSize(raw: string | null): ListPageSize | null {
  return LIST_PAGE_SIZES.find((size) => String(size) === raw) ?? null;
}

// `storage` fires for writes in OTHER tabs; this tab's own write is read on the render its
// `setLimit` causes (the URL value wins then anyway).
function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
  };
}

export function usePageSize(): readonly [ListPageSize, (size: ListPageSize) => void] {
  const staffId = usePermissions().me?.staffId;
  const [{ limit }, actions] = useListQueryState();
  const stored = useSyncExternalStore(
    subscribe,
    () => (staffId === undefined ? null : localStorage.getItem(storageKey(staffId))),
    () => null,
  );
  const size = limit ?? toPageSize(stored) ?? DEFAULT_PAGE_SIZE;
  const setSize = (next: ListPageSize): void => {
    if (staffId !== undefined) localStorage.setItem(storageKey(staffId), String(next));
    actions.setLimit(next);
  };
  return [size, setSize] as const;
}
