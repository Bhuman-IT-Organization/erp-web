// @vitest-environment happy-dom
import { act } from '@testing-library/react';
import type { InternalAxiosRequestConfig } from 'axios';
import { useSWRConfig, type Cache } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import { http } from '../http';
import { replaceRowInLists, revalidateLists, rowSeedKey, seedRow, useRowSeed } from '../row-seed';
import { useCommonApi, useList, type ListPage } from '../use-common-api';

/**
 * D-35 (a detail opened from its list renders at once from the row) and D-36 (a save updates the
 * cached list instead of refetching it). Both write the app's ONE SWR cache — the default cache the
 * root `SwrProvider` uses — so these tests read that cache back through `useSWRConfig()` and clear
 * it after each test. The network is a fake adapter whose spy proves "no request".
 */
const MEMBERS = '/api/v1/identity/members';
const DETAIL = `${MEMBERS}/7` as const;
const ROLES = '/api/v1/identity/roles';
const ROLE_DETAIL = `${ROLES}/7` as const;
const SIBLING = `${MEMBERS}-archive` as const;
const row = z.object({ staffId: z.number(), name: z.string() });
type Row = z.infer<typeof row>;

let cache: Cache | undefined;
function GrabCache({ onCache }: { readonly onCache: (cache: Cache) => void }) {
  onCache(useSWRConfig().cache);
  return null;
}
const cached = (key: string): unknown => (cache?.get(key) as { data?: unknown } | undefined)?.data;
const page = (rows: readonly Row[]): ListPage<Row> => ({
  data: rows,
  meta: { nextCursor: null, prevCursor: null },
});

let fake: FakeAdapter;
beforeEach(() => {
  resetApiStatus();
  fake = fakeAdapter(200, page([{ staffId: 1, name: 'Fetched' }]));
  http.defaults.adapter = fake.adapter;
  renderWithProviders(
    <GrabCache
      onCache={(c) => {
        cache = c;
      }}
    />,
  );
});
afterEach(() => {
  delete http.defaults.adapter;
  for (const key of [...(cache?.keys() ?? [])]) cache?.delete(key);
});

function SeedProbe({ path }: { readonly path: `/api/v1/${string}` | null }) {
  const seed = useRowSeed(path, row);
  return <output data-testid="seed">{seed === undefined ? 'none' : seed.name}</output>;
}

describe('row-seed (D-35, D-36)', () => {
  it('rowSeedKey is the detail path plus #row — never the detail key itself', () => {
    expect(rowSeedKey(DETAIL)).toBe(`${DETAIL}#row`);
  });

  it('seedRow then useRowSeed on the same path returns the row with no request made', async () => {
    seedRow(DETAIL, { staffId: 7, name: 'Jane Doe' });
    renderWithProviders(<SeedProbe path={DETAIL} />);
    await waitFor(() => {
      expect(screen.getByTestId('seed').textContent).toBe('Jane Doe');
    });
    expect(cached(DETAIL)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.spy).toHaveBeenCalledTimes(0);
  });

  it('useRowSeed with nothing seeded (a permalink), with a null path, or with a row that fails the schema is undefined, and asks nothing', async () => {
    seedRow(`${MEMBERS}/8`, { staffId: 'eight' });
    renderWithProviders(
      <>
        <SeedProbe path={`${MEMBERS}/9`} />
        <SeedProbe path={null} />
        <SeedProbe path={`${MEMBERS}/8`} />
      </>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getAllByTestId('seed').map((n) => n.textContent)).toEqual([
      'none',
      'none',
      'none',
    ]);
    expect(fake.spy).toHaveBeenCalledTimes(0);
  });

  it('replaceRowInLists replaces the row in every cached page of the list, leaves the detail and a sibling list untouched, and asks nothing', async () => {
    const jane = { staffId: 7, name: 'Jane' };
    const other = { staffId: 3, name: 'Other' };
    const answers: Record<string, unknown> = {
      [`${MEMBERS}?limit=25`]: page([other, jane]),
      [`${MEMBERS}?cursor=x&limit=25`]: page([jane]),
      [DETAIL]: { staffId: 7, name: 'Jane (detail)' },
      [`${SIBLING}?limit=25`]: page([jane]),
    };
    const routed = vi.fn((config: InternalAxiosRequestConfig) =>
      fakeAdapter(200, answers[config.url ?? '']).adapter(config),
    );
    http.defaults.adapter = routed;
    // The pages the user visited: SWR's filter mutate sees only keys a hook has read.
    function Visited() {
      const first = useList(MEMBERS, row, { limit: 25 });
      const second = useList(MEMBERS, row, { cursor: 'x', limit: 25 });
      const detail = useCommonApi(DETAIL, row);
      const sibling = useList(SIBLING, row, { limit: 25 });
      const done = [first.data, second.data, detail.data, sibling.data].every(
        (d) => d !== undefined,
      );
      return <output data-testid="visited">{String(done)}</output>;
    }
    const { unmount } = renderWithProviders(<Visited />);
    await waitFor(() => {
      expect(screen.getByTestId('visited').textContent).toBe('true');
    });
    unmount();
    expect(routed).toHaveBeenCalledTimes(4);

    await replaceRowInLists<Row>(
      MEMBERS,
      { staffId: 7, name: 'Jane Saved' },
      (r) => r.staffId === 7,
    );

    expect(cached(`${MEMBERS}?limit=25`)).toEqual(
      page([other, { staffId: 7, name: 'Jane Saved' }]),
    );
    expect(cached(`${MEMBERS}?cursor=x&limit=25`)).toEqual(
      page([{ staffId: 7, name: 'Jane Saved' }]),
    );
    expect(cached(DETAIL)).toEqual({ staffId: 7, name: 'Jane (detail)' });
    expect(cached(`${SIBLING}?limit=25`)).toEqual(page([jane]));
    expect(routed).toHaveBeenCalledTimes(4);
  });

  // Other keys than the tests above: SWR dedupes a key fetched in the last 2 s across tests.
  it('revalidateLists asks again for every mounted page of the list (totals moved), never the detail', async () => {
    function ListProbe() {
      const { data } = useList(ROLES, row, { limit: 25 });
      const detail = useCommonApi(ROLE_DETAIL, row);
      const name = data === undefined ? '' : (data.data[0]?.name ?? '');
      return <output data-testid="list">{detail.error === undefined ? '' : name}</output>;
    }
    renderWithProviders(<ListProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('list').textContent).toBe('Fetched');
    });
    const urls = () => fake.calls.map((c) => c.url).sort();
    expect(urls()).toEqual([ROLE_DETAIL, `${ROLES}?limit=25`]);

    await act(async () => {
      await revalidateLists(ROLES);
    });
    expect(urls()).toEqual([ROLE_DETAIL, `${ROLES}?limit=25`, `${ROLES}?limit=25`]);
  });
});
