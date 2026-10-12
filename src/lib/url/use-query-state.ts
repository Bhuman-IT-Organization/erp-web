import {
  debounce,
  parseAsArrayOf,
  parseAsNumberLiteral,
  parseAsString,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import { useCallback, useMemo } from 'react';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import type { Params } from '@/lib/api/keys';

/** The page sizes a list offers (UI-SPEC § Paging, D-17); any other `?limit=` reads as `null`. */
// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- these literals ARE the definition of the page sizes (D-17), not durations (S13)
export const LIST_PAGE_SIZES = [25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];

/** A filter's value: one string (`[eq]`, `[like]`, ...) or the list of an `[in]` filter. */
export type FilterValue = string | readonly string[];

/** One filter a list declares: `'<field>[<op>]'` (BE-19), e.g. `'currency[in]'`, `'active[eq]'`. */
export interface ListFilterDef {
  /** `/^[a-zA-Z][a-zA-Z0-9]*[(?:eq|ne|gt|gte|lt|lte|in|like)]$/`; the URL key is `filter[<field>][<op>]`. */
  readonly key: string;
  /** The value while the URL holds none; a value equal to it is never written to the URL. */
  readonly defaultValue?: FilterValue;
}

export interface ListQueryState {
  /** `''` when absent. As typed: the search box shows it, spaces and all. */
  readonly q: string;
  /**
   * `q` trimmed: what a request and an export send, so `?q=+ZZ+Test` finds `ZZ Test` (UAT 4.6,
   * 2026-10-07). Trimmed here once for every list, never per screen; `''` means no search.
   */
  readonly search: string;
  /** BE-19: `'field'` or `'-field'`. */
  readonly sort: string | null;
  readonly cursor: string | null;
  /** `null` when absent or not one of 25/50/100 (the page-size memory then decides). */
  readonly limit: ListPageSize | null;
  /** The effective value per declared filter: the URL's, else its default; absent when neither. */
  readonly filters: Readonly<Record<string, FilterValue>>;
}

export interface ListQueryActions {
  /** History `replace`, debounced `CLIENT_TIMINGS.list.searchDebounceMs`; cursor → null in the same update. */
  setSearch(q: string): void;
  /** Enter: the same as `setSearch`, without the debounce. */
  flushSearch(q: string): void;
  /** `q` → `''` and cursor → null; keeps sort and limit. */
  clearSearch(): void;
  /** History `push`; cursor → null. */
  setSort(sort: string | null): void;
  /** History `push`. */
  setCursor(cursor: string | null): void;
  /** History `push`; cursor → null. */
  setLimit(limit: ListPageSize): void;
  /** History `push`; cursor → null. `null`, or a value equal to the default, removes it from the URL. */
  setFilter(key: string, value: FilterValue | null): void;
  /** Every declared filter back to its default; history `push`; cursor → null; keeps q, sort, limit. */
  clearFilters(): void;
}

const PARSERS = {
  q: parseAsString.withDefault(''),
  sort: parseAsString,
  cursor: parseAsString,
  limit: parseAsNumberLiteral(LIST_PAGE_SIZES),
};

// `shallow: true` everywhere: the list is a client SWR fetch keyed on this state, so the server
// component has nothing to re-render.
const PUSH = { history: 'push', shallow: true } as const;
const REPLACE = { history: 'replace', shallow: true } as const;
const SEARCH = { ...REPLACE, limitUrlUpdates: debounce(CLIENT_TIMINGS.list.searchDebounceMs) };

const NO_DEFS: readonly ListFilterDef[] = [];

/** `'currency[in]'` → `'filter[currency][in]'`, the api's query key (BE-19). */
const urlKeyOf = (key: string): string => `filter[${key.replace('[', '][')}`;

const isBlank = (value: FilterValue): boolean =>
  typeof value === 'string' ? value === '' : value.length === 0;

const sameValue = (a: FilterValue | undefined, b: FilterValue | undefined): boolean => {
  if (a === undefined || b === undefined) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.length === b.length && a.every((item, index) => item === b[index]);
};

/**
 * True when `value` is what the filter shows with nothing in the URL: its default, or (with no
 * default) nothing or an empty value. "Clear filters" and the filter counts read this.
 */
export function isDefaultFilter(def: ListFilterDef, value: FilterValue | undefined): boolean {
  if (def.defaultValue !== undefined) return sameValue(value, def.defaultValue);
  return value === undefined || isBlank(value);
}

/**
 * The api's query for a list's effective filters: `filter[<field>][<op>]`, an array joined by
 * `,`; an empty array or `''` is omitted (no filter). Merged into the list request and the export.
 */
export function filterParams(filters: Readonly<Record<string, FilterValue>>): Params {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (isBlank(value)) continue;
    params[urlKeyOf(key)] = typeof value === 'string' ? value : value.join(',');
  }
  return params;
}

/** nuqs writes a mutable array; a single value stays a string. */
const toWritable = (value: FilterValue): string | string[] =>
  typeof value === 'string' ? value : [...value];

/** One nuqs parser per declared filter, under its URL key: an `[in]` filter is a comma list. */
function filterParsers(keys: readonly string[]) {
  const parsers: Record<string, typeof parseAsString | ReturnType<typeof parseAsArrayOf<string>>> =
    {};
  for (const key of keys) {
    parsers[urlKeyOf(key)] = key.endsWith('[in]')
      ? parseAsArrayOf(parseAsString, ',')
      : parseAsString;
  }
  return parsers;
}

/**
 * The FE-15 door: a list's search, sort, page and page size live in the URL, so a refresh, Back
 * and a shared link land on the same view (D-20), and Save can return to exactly where the user
 * was (D-28). This is the ONLY file that imports `nuqs` hooks or parsers (`P_NUQS`).
 *
 * `q` REPLACES the history entry while paging, sorting and the page size PUSH: Back steps through
 * pages and sorts, never through keystrokes. Changing `q`, `sort` or `limit` drops the `cursor` in
 * the same update, because a keyset cursor belongs to one ordering of one result set (BE-19).
 *
 * Filters (K1, UI-SPEC § Filter bar): a list passes its `defs` (a module constant) and each one
 * lives in the URL in the api's grammar, `filter[<field>][<op>]=` with an `in` value comma-joined
 * (BE-19), so a filtered view is a permalink (D-21). Only declared keys are read (T-4.2-37). A
 * change PUSHES and drops the cursor in the same update; a filter at its default is absent from the
 * URL, so the default view has a clean link; `filters` is the effective value of each.
 */
export function useListQueryState(
  defs: readonly ListFilterDef[] = NO_DEFS,
): readonly [ListQueryState, ListQueryActions] {
  const [state, setState] = useQueryStates(PARSERS);
  // The parsers depend on the keys only, so a caller's new array with the same keys keeps them.
  const keyList = defs.map((def) => def.key).join(' ');
  const parsers = useMemo(() => filterParsers(keyList === '' ? [] : keyList.split(' ')), [keyList]);
  const [inUrl, setInUrl] = useQueryStates(parsers);
  const filters: Record<string, FilterValue> = {};
  for (const def of defs) {
    const value = inUrl[urlKeyOf(def.key)] ?? def.defaultValue;
    if (value !== undefined) filters[def.key] = value;
  }
  const actions = useMemo<ListQueryActions>(
    () => ({
      setSearch: (q) => void setState({ q, cursor: null }, SEARCH),
      flushSearch: (q) => void setState({ q, cursor: null }, REPLACE),
      clearSearch: () => void setState({ q: '', cursor: null }, REPLACE),
      setSort: (sort) => void setState({ sort, cursor: null }, PUSH),
      setCursor: (cursor) => void setState({ cursor }, PUSH),
      setLimit: (limit) => void setState({ limit, cursor: null }, PUSH),
      // Two setters, one URL write: nuqs merges the updates queued in one tick into one history entry.
      setFilter: (key, value) => {
        const def = defs.find((candidate) => candidate.key === key);
        if (def === undefined) return;
        const keep = value !== null && !isDefaultFilter(def, value);
        void setInUrl({ [urlKeyOf(key)]: keep ? toWritable(value) : null }, PUSH);
        void setState({ cursor: null }, PUSH);
      },
      clearFilters: () => {
        void setInUrl(Object.fromEntries(defs.map((def) => [urlKeyOf(def.key), null])), PUSH);
        void setState({ cursor: null }, PUSH);
      },
    }),
    [setState, setInUrl, defs],
  );
  return [{ ...state, search: state.q.trim(), filters }, actions] as const;
}

/** How a scalar parameter is read and written: its value while the URL holds none, and the history mode. */
export interface QueryParamOptions {
  readonly defaultValue: string;
  readonly history: 'push' | 'replace';
}

/**
 * One scalar URL parameter outside a list (the editor's `?preview=<locale>`, 04.3 UI-SPEC § Access,
 * routing and routes): the URL's value, else `defaultValue`; the setter writes with the given
 * history mode (`replace` adds no Back step), and `null` or the default removes the parameter, so
 * the default view keeps a clean link. Shallow, as every write here: the reader is a client
 * component. The same door as `useListQueryState` (FE-15, `P_NUQS`).
 */
export function useQueryParam(
  key: string,
  options: QueryParamOptions,
): readonly [string, (next: string | null) => void] {
  const { defaultValue, history } = options;
  const [value, setValue] = useQueryState(
    key,
    parseAsString.withDefault(defaultValue).withOptions({ history, shallow: true }),
  );
  const set = useCallback(
    (next: string | null) => {
      void setValue(next === defaultValue ? null : next);
    },
    [setValue, defaultValue],
  );
  return [value, set] as const;
}
