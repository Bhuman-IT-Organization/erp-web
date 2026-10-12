// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import {
  filterParams,
  useListQueryState,
  useQueryParam,
  type ListFilterDef,
} from '../use-query-state';

/**
 * FE-15's door: the list's `q`, `sort`, `cursor` and `limit` live in the URL. What matters is the
 * URL each action produces and whether it pushes (Back steps through pages and sorts) or replaces
 * (Back does not step through keystrokes) — both read from the testing adapter's `onUrlUpdate`.
 */
function setup(searchParams: string, defs?: readonly ListFilterDef[]) {
  const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
      {children}
    </NuqsTestingAdapter>
  );
  const { result } = renderHook(() => useListQueryState(defs), { wrapper });
  return { result, onUrlUpdate };
}

const lastUpdate = (spy: ReturnType<typeof setup>['onUrlUpdate']) => {
  const call = spy.mock.lastCall;
  if (call === undefined) throw new Error('no URL update');
  return call[0];
};

afterEach(() => {
  vi.useRealTimers();
});

describe('useListQueryState', () => {
  it('reads q, sort, cursor and limit from the URL', () => {
    const { result } = setup('?q=abc&sort=-email&cursor=Zm9v&limit=50');
    expect(result.current[0]).toEqual({
      q: 'abc',
      search: 'abc',
      sort: '-email',
      cursor: 'Zm9v',
      limit: 50,
      filters: {},
    });
  });

  it('search is q trimmed once here for every list; q keeps what was typed (UAT 4.6)', () => {
    const { result } = setup('?q=+ZZ+Test+');
    expect(result.current[0].q).toBe(' ZZ Test ');
    expect(result.current[0].search).toBe('ZZ Test');
  });

  it('reads a limit outside 25/50/100 as null, and an absent q as the empty string', () => {
    expect(setup('?limit=37').result.current[0].limit).toBeNull();
    expect(setup('?limit=abc').result.current[0].limit).toBeNull();
    expect(setup('').result.current[0]).toEqual({
      q: '',
      search: '',
      sort: null,
      cursor: null,
      limit: null,
      filters: {},
    });
  });

  it('setSort pushes the sort and drops the cursor in one update', async () => {
    const { result, onUrlUpdate } = setup('?q=abc&cursor=Zm9v&limit=50');
    act(() => {
      result.current[1].setSort('email');
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('push');
    expect(update.searchParams.get('sort')).toBe('email');
    expect(update.searchParams.has('cursor')).toBe(false);
    expect(update.searchParams.get('q')).toBe('abc');
    expect(update.searchParams.get('limit')).toBe('50');
  });

  it('setSearch replaces q after the debounce and drops the cursor in one update', async () => {
    vi.useFakeTimers();
    const { result, onUrlUpdate } = setup('?sort=-email&cursor=Zm9v');
    act(() => {
      result.current[1].setSearch('j');
      result.current[1].setSearch('ja');
      result.current[1].setSearch('jan');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.list.searchDebounceMs - 1);
    });
    expect(onUrlUpdate).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      // nuqs writes the debounced batch on its next tick (a `setTimeout(0)`), not inside the timer.
      await vi.runOnlyPendingTimersAsync();
    });
    expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('replace');
    expect(update.searchParams.get('q')).toBe('jan');
    expect(update.searchParams.has('cursor')).toBe(false);
    expect(update.searchParams.get('sort')).toBe('-email');
  });

  it('flushSearch (Enter) replaces q at once, without the debounce', async () => {
    vi.useFakeTimers();
    const { result, onUrlUpdate } = setup('?cursor=Zm9v');
    act(() => {
      result.current[1].flushSearch('jan');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('replace');
    expect(update.queryString).toBe('?q=jan');
  });

  it('setLimit pushes the page size and drops the cursor', async () => {
    const { result, onUrlUpdate } = setup('?cursor=Zm9v&limit=25');
    act(() => {
      result.current[1].setLimit(100);
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('push');
    expect(update.queryString).toBe('?limit=100');
  });

  it('setCursor pushes the cursor and keeps everything else', async () => {
    const { result, onUrlUpdate } = setup('?q=abc&sort=email&limit=50');
    act(() => {
      result.current[1].setCursor('YmFy');
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('push');
    expect(update.searchParams.get('cursor')).toBe('YmFy');
    expect(update.searchParams.get('q')).toBe('abc');
  });

  it('clearSearch removes q and the cursor and keeps sort and limit', async () => {
    const { result, onUrlUpdate } = setup('?q=abc&sort=-email&cursor=Zm9v&limit=50');
    act(() => {
      result.current[1].clearSearch();
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.searchParams.has('q')).toBe(false);
    expect(update.searchParams.has('cursor')).toBe(false);
    expect(update.searchParams.get('sort')).toBe('-email');
    expect(update.searchParams.get('limit')).toBe('50');
  });
});

/**
 * K1 (UI-SPEC § Filter bar, BE-19): a list's filters live in the URL as `filter[<field>][<op>]`, an
 * `in` value comma-joined. Only the keys a list declares are read (T-4.2-37); a filter at its
 * default is absent from the URL, so the default view has a clean link.
 */
const DEFS: readonly ListFilterDef[] = [
  { key: 'currency[in]' },
  { key: 'active[eq]', defaultValue: '1' },
  { key: 'type[in]', defaultValue: ['standard'] },
];

describe('useListQueryState filters (K1)', () => {
  it('reads the declared filters from the URL, else their defaults; an undeclared filter is never read', () => {
    const { result } = setup('?filter[currency][in]=3,4&cursor=abc&filter[evil][eq]=x', DEFS);
    expect(result.current[0].filters).toEqual({
      'currency[in]': ['3', '4'],
      'active[eq]': '1',
      'type[in]': ['standard'],
    });
    expect(result.current[0].cursor).toBe('abc');
  });

  it('a filter with no default and no URL value is absent from filters', () => {
    expect(setup('', [{ key: 'currency[in]' }]).result.current[0].filters).toEqual({});
  });

  it('setFilter pushes ONE history entry with the filter and drops the cursor in the same update', async () => {
    const { result, onUrlUpdate } = setup('?q=abc&cursor=Zm9v&limit=50', DEFS);
    act(() => {
      result.current[1].setFilter('currency[in]', ['5', '6']);
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('push');
    expect(update.searchParams.get('filter[currency][in]')).toBe('5,6');
    expect(update.searchParams.has('cursor')).toBe(false);
    expect(update.searchParams.get('q')).toBe('abc');
    expect(update.searchParams.get('limit')).toBe('50');
  });

  it('a value equal to its default, or null, leaves no filter in the URL', async () => {
    const { result, onUrlUpdate } = setup('?filter[active][eq]=0&filter[currency][in]=3', DEFS);
    act(() => {
      result.current[1].setFilter('active[eq]', '1');
      result.current[1].setFilter('currency[in]', null);
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.searchParams.has('filter[active][eq]')).toBe(false);
    expect(update.searchParams.has('filter[currency][in]')).toBe(false);
  });

  it('an array default compares element by element: the default is absent, an emptied one is written', async () => {
    const { result, onUrlUpdate } = setup('', DEFS);
    act(() => {
      result.current[1].setFilter('type[in]', ['standard']);
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdate(onUrlUpdate).searchParams.has('filter[type][in]')).toBe(false);
    act(() => {
      result.current[1].setFilter('type[in]', []);
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(2);
    });
    expect(lastUpdate(onUrlUpdate).searchParams.get('filter[type][in]')).toBe('');
  });

  it('an emptied filter with no default is removed, not written empty', async () => {
    const { result, onUrlUpdate } = setup('?filter[currency][in]=3', DEFS);
    act(() => {
      result.current[1].setFilter('currency[in]', []);
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdate(onUrlUpdate).searchParams.has('filter[currency][in]')).toBe(false);
  });

  it('clearFilters restores every default, pushes, drops the cursor and keeps q, sort and limit', async () => {
    const { result, onUrlUpdate } = setup(
      '?q=abc&sort=-name&limit=50&cursor=Zm9v&filter[currency][in]=3&filter[active][eq]=0',
      DEFS,
    );
    act(() => {
      result.current[1].clearFilters();
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('push');
    expect([...update.searchParams.keys()].filter((k) => k.startsWith('filter['))).toEqual([]);
    expect(update.searchParams.has('cursor')).toBe(false);
    expect(update.searchParams.get('q')).toBe('abc');
    expect(update.searchParams.get('sort')).toBe('-name');
    expect(update.searchParams.get('limit')).toBe('50');
  });
});

describe('filterParams (K1, BE-19 grammar)', () => {
  it('names each filter filter[<field>][<op>], joins an array with commas and omits an empty one', () => {
    expect(
      filterParams({
        'currency[in]': ['3', '4'],
        'active[eq]': '1',
        'tag[in]': [],
        'q[like]': '',
      }),
    ).toEqual({ 'filter[currency][in]': '3,4', 'filter[active][eq]': '1' });
  });

  it('no filters: no params', () => {
    expect(filterParams({})).toEqual({});
  });
});

/** One scalar parameter (the editor's `?preview=<locale>`): read, replaced, removed at its default. */
function setupParam(searchParams: string, history: 'push' | 'replace' = 'replace') {
  const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate} hasMemory>
      {children}
    </NuqsTestingAdapter>
  );
  const { result } = renderHook(() => useQueryParam('preview', { defaultValue: 'en', history }), {
    wrapper,
  });
  return { result, onUrlUpdate };
}

describe('useQueryParam', () => {
  it('reads the parameter, and its default when the URL holds none', () => {
    expect(setupParam('?preview=ar').result.current[0]).toBe('ar');
    expect(setupParam('').result.current[0]).toBe('en');
  });

  it('writes a value with history replace, so the choice adds no Back step', async () => {
    const { result, onUrlUpdate } = setupParam('');
    act(() => {
      result.current[1]('ar');
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = lastUpdate(onUrlUpdate);
    expect(update.options.history).toBe('replace');
    expect(update.searchParams.get('preview')).toBe('ar');
  });

  it('the default value and null remove it from the URL', async () => {
    const { result, onUrlUpdate } = setupParam('?preview=ar&q=abc');
    act(() => {
      result.current[1]('en');
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdate(onUrlUpdate).searchParams.has('preview')).toBe(false);
    expect(lastUpdate(onUrlUpdate).searchParams.get('q')).toBe('abc');
    const other = setupParam('?preview=ar');
    act(() => {
      other.result.current[1](null);
    });
    await waitFor(() => {
      expect(other.onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdate(other.onUrlUpdate).searchParams.has('preview')).toBe(false);
  });

  it('history push adds an entry', async () => {
    const { result, onUrlUpdate } = setupParam('', 'push');
    act(() => {
      result.current[1]('ar');
    });
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    expect(lastUpdate(onUrlUpdate).options.history).toBe('push');
  });
});
