import { useEffect } from 'react';
import { z } from 'zod';
import { safeNext } from '@/lib/auth/safe-next';

/**
 * Return to the list exactly where the user left it (D-28): same cursor, sort, search, page size
 * AND scroll position, never page 1. D-20 put the list state in the URL; this records that URL and
 * `scrollY` in `sessionStorage` when a row opens, and gives them back to Save and "Back to list".
 *
 * `sessionStorage` is writable by any script on the origin, so the stored URL is accepted only when
 * `safeNext` keeps it unchanged (a same-origin path: no `//`, no scheme, no backslash) AND its
 * pathname is exactly the list base — never a sibling (`/staffers`), a record (`/staff/12`) or
 * another origin (T-3.2-50). Anything else, and a permalink with nothing recorded, gives the base.
 */
const keyFor = (listBase: string): string => `erp.list.return:${listBase}`;

const recordSchema = z.object({ url: z.string(), y: z.number().optional() });
type ListReturn = z.infer<typeof recordSchema>;

function read(listBase: string): ListReturn | null {
  try {
    const parsed = recordSchema.safeParse(
      JSON.parse(sessionStorage.getItem(keyFor(listBase)) ?? ''),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Event handler (the row-open click): records the list's URL and scroll, only on the list itself. */
export function recordListReturn(listBase: string): void {
  const { pathname, search } = window.location;
  if (pathname !== listBase) return;
  const record: ListReturn = { url: pathname + search, y: window.scrollY };
  sessionStorage.setItem(keyFor(listBase), JSON.stringify(record));
}

/** The recorded list URL when it is the list's own path, else the list base (no open redirect). */
export function readListReturn(listBase: string): string {
  const url = read(listBase)?.url;
  if (url === undefined || safeNext(url) !== url) return listBase;
  return new URL(url, window.location.origin).pathname === listBase ? url : listBase;
}

/**
 * Once the list's rows are on screen (`ready`), scrolls back to the recorded position — only when
 * the page IS the recorded URL (a new search starts at the top) — then forgets the position, so it
 * happens once. The URL stays recorded for the next "Back to list".
 */
export function useRestoreListScroll(listBase: string, ready: boolean): void {
  // effect: dom: restore the list's scroll once its rows are on screen (D-28)
  useEffect(() => {
    if (!ready) return;
    const record = read(listBase);
    if (record?.y === undefined) return;
    const { pathname, search } = window.location;
    if (record.url !== pathname + search) return;
    window.scrollTo(0, record.y);
    sessionStorage.setItem(keyFor(listBase), JSON.stringify({ url: record.url }));
  }, [listBase, ready]);
}
