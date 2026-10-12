import type { ApiPath } from './call-api';

/**
 * SWR keys are STRINGS, not `[path, params]` arrays (FE-03): the key IS the URL `swrFetcher`
 * fetches, and prefix invalidation is one `startsWith` over the cache. `apiKey` makes the string
 * canonical (query keys sorted, `undefined` omitted, values URL-encoded) so two callers asking for
 * the same page share one cache entry regardless of argument order.
 */
export type ParamValue = string | number | boolean | undefined;
export type Params = Readonly<Record<string, ParamValue>>;

/** `path` + a canonical query: keys sorted, `undefined` omitted, values URL-encoded; no `?` when empty. */
export function apiKey(path: ApiPath, params?: Params): string {
  if (params === undefined) return path;
  const pairs: string[] = [];
  for (const name of Object.keys(params).sort()) {
    const value = params[name];
    if (value === undefined) continue;
    pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length === 0 ? path : `${path}?${pairs.join('&')}`;
}

/** The path without a query (identity; documents that a prefix is a path, never a full key). */
export function keyPrefix(path: ApiPath): string {
  return path;
}

/**
 * True for the exact path and for every key continuing it with `?` (a query) or `/` (a child
 * resource); false for a sibling that merely shares the spelling (`/api/v1/item-x` under `/api/v1/item`).
 */
export function matchesPrefix(prefix: string): (key: unknown) => boolean {
  return (key) =>
    typeof key === 'string' &&
    (key === prefix || key.startsWith(`${prefix}?`) || key.startsWith(`${prefix}/`));
}
