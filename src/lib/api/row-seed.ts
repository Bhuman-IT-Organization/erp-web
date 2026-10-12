import useSWR, { mutate } from 'swr';
import type { z } from 'zod';
import type { ApiPath } from './call-api';
import type { ListPage } from './use-common-api';

/**
 * Reuse what the list already loaded (D-35) and update it in place after a save (D-36), in the app's
 * one SWR cache.
 *
 * - **The seed lives under `${detailPath}#row`, never the detail key.** A list row is NARROWER than
 *   the detail (a staff row has no permissions or departments); written under the detail key it
 *   would hand a partial object, typed as the whole record, to the form — and hide that the detail
 *   is still loading (T-3.2-55). The detail reads the seed for an instant first paint and still
 *   fetches itself; a permalink has no seed and simply fetches.
 * - **A list page is every key equal to the list path or continuing it with `?`.** Not
 *   `matchesPrefix`, which also takes `/members/7` (a detail) for a page of `/members`.
 *
 * Event-handler functions, not effects: `seedRow` runs in the row-open handler, `replaceRowInLists`
 * after the save resolves, `revalidateLists` after a create or a delete (totals and positions move).
 */
export function rowSeedKey(detailPath: ApiPath): string {
  return `${detailPath}#row`;
}

export function seedRow(detailPath: ApiPath, row: unknown): void {
  void mutate(rowSeedKey(detailPath), row, { revalidate: false });
}

/**
 * The seeded row, or `undefined` (nothing seeded, a `null` path, or a value the schema refuses).
 * Cache only: there is no fetcher and the global config sets none, so this never makes a request.
 */
export function useRowSeed<T>(detailPath: ApiPath | null, schema: z.ZodType<T>): T | undefined {
  const { data } = useSWR<unknown>(detailPath === null ? null : rowSeedKey(detailPath));
  if (data === undefined) return undefined;
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

const isListKey =
  (listPath: ApiPath) =>
  (key: unknown): boolean =>
    typeof key === 'string' && (key === listPath || key.startsWith(`${listPath}?`));

/** Swaps the saved record into every cached page of the list that holds it; no request (D-36). */
export async function replaceRowInLists<T>(
  listPath: ApiPath,
  updated: T,
  sameRow: (row: T) => boolean,
): Promise<void> {
  await mutate<ListPage<T>>(
    isListKey(listPath),
    (page) =>
      page === undefined
        ? page
        : { ...page, data: page.data.map((row) => (sameRow(row) ? updated : row)) },
    { revalidate: false },
  );
}

/** Asks again for every mounted page of the list: after a create or a delete, the totals moved. */
export async function revalidateLists(listPath: ApiPath): Promise<void> {
  await mutate(isListKey(listPath));
}
