// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import { http } from '../http';
import { useListPages } from '../use-list-pages';

/**
 * The paged server read under the item picker (K7): `useSWRInfinite` over a BE-19 keyset list. The
 * network is a fake adapter on the shared instance answering per cursor, with a private SWR cache
 * and no automatic retry, so every request in a case is one the case caused.
 */
const PATH = '/api/v1/things';
const row = z.object({ id: z.number() });

const pageOf = (ids: readonly number[], nextCursor: string | null) => ({
  data: ids.map((id) => ({ id })),
  meta: { nextCursor, prevCursor: null },
});

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

const urls: string[] = [];

/** Answers by the `cursor` query value: none is page one; anything else is looked up in `byCursor`. */
function api(byCursor: Readonly<Record<string, Answer | Answer[]>>): AxiosAdapter {
  const served: Record<string, number> = {};
  return (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    urls.push(url);
    const cursor = new URL(url, 'http://x').searchParams.get('cursor') ?? '';
    const entry = byCursor[cursor];
    const n = served[cursor] ?? 0;
    served[cursor] = n + 1;
    const answer = Array.isArray(entry)
      ? (entry[Math.min(n, entry.length - 1)] ?? entry[0])
      : entry;
    if (answer === undefined) throw new Error(`no answer for cursor "${cursor}"`);
    const response = {
      data: answer.body,
      status: answer.status,
      statusText: String(answer.status),
      headers: new AxiosHeaders(),
      config,
    };
    if (answer.status < 300) return Promise.resolve(response);
    return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
  };
}

function Probe({
  path = PATH,
  params = {},
}: {
  readonly path?: typeof PATH | null;
  readonly params?: Readonly<Record<string, string>>;
}) {
  const pages = useListPages(path, row, params, 25);
  return (
    <>
      <output
        data-testid="probe"
        data-loading={String(pages.isLoading)}
        data-more={String(pages.hasMore)}
        data-loading-more={String(pages.isLoadingMore)}
        data-error={pages.error?.code ?? ''}
      >
        {pages.rows.map((r) => r.id).join(',')}
      </output>
      <button type="button" onClick={pages.loadMore}>
        more
      </button>
      <button type="button" onClick={pages.retry}>
        retry
      </button>
    </>
  );
}

const probe = () => screen.getByTestId('probe');

function isolated(ui: React.ReactElement) {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>,
  );
}

describe('useListPages (useSWRInfinite over a BE-19 keyset list)', () => {
  beforeEach(() => {
    resetApiStatus();
    urls.length = 0;
  });
  afterEach(() => {
    delete http.defaults.adapter;
  });

  it('the first page asks limit=25 with no cursor, with the fixed params, and is loading until it answers', async () => {
    http.defaults.adapter = api({ '': { status: 200, body: pageOf([1, 2], 'c2') } });
    isolated(<Probe params={{ q: 'bolt' }} />);
    expect(probe().dataset.loading).toBe('true');
    await waitFor(() => {
      expect(probe().textContent).toBe('1,2');
    });
    expect(probe().dataset.loading).toBe('false');
    expect(urls).toEqual(['/api/v1/things?limit=25&q=bolt']);
    expect(probe().dataset.more).toBe('true');
  });

  it("loadMore asks the previous page's meta.nextCursor and appends its rows; hasMore turns false on a null cursor", async () => {
    http.defaults.adapter = api({
      '': { status: 200, body: pageOf([1, 2], 'c2') },
      c2: { status: 200, body: pageOf([3], null) },
    });
    isolated(<Probe />);
    await waitFor(() => {
      expect(probe().textContent).toBe('1,2');
    });
    await userEvent.click(screen.getByRole('button', { name: 'more' }));
    await waitFor(() => {
      expect(probe().textContent).toBe('1,2,3');
    });
    expect(urls).toEqual(['/api/v1/things?limit=25', '/api/v1/things?cursor=c2&limit=25']);
    expect(probe().dataset.more).toBe('false');
    expect(probe().dataset.loadingMore).toBe('false');
  });

  it('a null path requests nothing', async () => {
    http.defaults.adapter = api({ '': { status: 200, body: pageOf([1], null) } });
    isolated(<Probe path={null} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(urls).toEqual([]);
    expect(probe().dataset.loading).toBe('false');
    expect(probe().dataset.more).toBe('false');
  });

  it('a failure exposes error (and is not loading); retry asks again and shows the rows', async () => {
    http.defaults.adapter = api({
      '': [
        { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') },
        { status: 200, body: pageOf([9], null) },
      ],
    });
    isolated(<Probe />);
    await waitFor(() => {
      expect(probe().dataset.error).toBe('ERP-UPSTREAM-0001');
    });
    expect(probe().dataset.loading).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => {
      expect(probe().textContent).toBe('9');
    });
    expect(probe().dataset.error).toBe('');
    expect(urls).toEqual(['/api/v1/things?limit=25', '/api/v1/things?limit=25']);
  });
});
