// @vitest-environment happy-dom
import type { AxiosAdapter } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import { CLIENT_TIMINGS } from '../client-timings';
import { http } from '../http';
import { apiKey } from '../keys';
import { listSchema, useCommonApi, useList } from '../use-common-api';

/**
 * Hook tests follow one idiom (the template uses it too):
 * - the network is a fake adapter set on the shared instance (`http.defaults.adapter`) in
 *   `beforeEach` and removed in `afterEach` — the read hooks have no `adapter` option;
 * - every render gets its own SWR cache (`SWRConfig` with `provider: () => new Map()`) so a key
 *   fetched by one test is never a cache hit in the next; the global policy still applies because
 *   `renderWithProviders` mounts `SwrProvider` above it;
 * - the retry delay is `random() * base`, so `Math.random` is pinned near zero and the retry
 *   lands within a few ms of real time — no fake timers, and Testing Library's `waitFor` keeps working.
 */
const item = z.object({ id: z.number() });

function Probe({ params }: { readonly params?: Readonly<Record<string, string | number>> }) {
  const { data, error, isLoading } = useCommonApi('/api/v1/things', item, params);
  return (
    <output
      data-testid="probe"
      data-loading={String(isLoading)}
      data-status={error?.status ?? ''}
      data-retryable={error === undefined ? '' : String(error.retryable)}
    >
      {data === undefined ? '' : String(data.id)}
    </output>
  );
}

/** Every render's `isLoading`, `isValidating` and error status, in order. */
const renders: string[] = [];
function HistoryProbe() {
  const { error, isLoading, isValidating } = useCommonApi('/api/v1/things', item);
  renders.push(`${String(isLoading)}|${String(isValidating)}|${String(error?.status ?? '')}`);
  return (
    <output
      data-testid="history"
      data-loading={String(isLoading)}
      data-validating={String(isValidating)}
      data-status={error?.status ?? ''}
    />
  );
}

function ListProbe() {
  const { data } = useList('/api/v1/things', item, { limit: 2 });
  return (
    <output data-testid="list" data-cursor={data?.meta.nextCursor ?? ''}>
      {data === undefined ? '' : data.data.map((d) => d.id).join(',')}
    </output>
  );
}

function isolated(ui: React.ReactElement) {
  return renderWithProviders(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);
}

const RETRY_RANDOM = 0.005; // delay = random() * 1000 ms → 5 ms

let fake: FakeAdapter | undefined;
const useNetwork = (adapter: FakeAdapter) => {
  fake = adapter;
  http.defaults.adapter = adapter.adapter;
};

describe('useCommonApi (reads over swrFetcher, ADR-0031 §5 retry policy)', () => {
  beforeEach(() => {
    resetApiStatus();
    vi.spyOn(Math, 'random').mockReturnValue(RETRY_RANDOM);
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
    vi.restoreAllMocks();
  });

  it('fetches the canonical key and returns the schema-parsed data', async () => {
    useNetwork(fakeAdapter(200, { id: 7 }));
    isolated(<Probe params={{ q: 'a b', limit: 5 }} />);
    expect(screen.getByTestId('probe').dataset.loading).toBe('true');
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('7');
    });
    expect(screen.getByTestId('probe').dataset.loading).toBe('false');
    expect(fake?.calls[0]?.url).toBe(apiKey('/api/v1/things', { q: 'a b', limit: 5 }));
    expect(fake?.calls[0]?.url).toBe('/api/v1/things?limit=5&q=a%20b');
    expect(fake?.calls[0]?.method).toBe('GET');
  });

  it('with headers (opt-in, 04.7-12): each request carries them, the read keyed per header value', async () => {
    useNetwork(fakeAdapter(200, { id: 4 }));
    function HeaderProbe({ value }: { readonly value: string }) {
      const { data } = useCommonApi('/api/v1/things', item, undefined, undefined, {
        'X-Made-Up': value,
      });
      return (
        <output data-testid={`probe-${value}`}>{data === undefined ? '' : String(data.id)}</output>
      );
    }
    isolated(
      <>
        <HeaderProbe value="a" />
        <HeaderProbe value="b" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-b').textContent).toBe('4');
    });
    expect(fake?.calls.map((call) => call.url)).toEqual(['/api/v1/things', '/api/v1/things']);
    expect(fake?.calls.map((call) => call.headers['x-made-up']).sort()).toEqual(['a', 'b']);
  });

  it('a 500 is retryable and SWR issues a second request after the retry delay', async () => {
    useNetwork(fakeAdapter(500, problem(500, 'ERP-HTTP-500')));
    isolated(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.status).toBe('500');
    });
    expect(screen.getByTestId('probe').dataset.retryable).toBe('true');
    await waitFor(
      () => {
        expect(fake?.spy.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: CLIENT_TIMINGS.swr.errorRetryMaxMs },
    );
  });

  it('a 400 is never retried: exactly one request, error.status 400', async () => {
    useNetwork(fakeAdapter(400, problem(400, 'ERP-VALIDATION-0001')));
    isolated(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.status).toBe('400');
    });
    expect(screen.getByTestId('probe').dataset.retryable).toBe('false');
    // Longer than any first-retry delay under the pinned random; a retry would have landed by now.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake?.spy).toHaveBeenCalledTimes(1);
  });

  it('a body failing the schema is an ERP-CLIENT-0001 error, not data', async () => {
    useNetwork(fakeAdapter(200, { nope: true }));
    isolated(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.status).toBe('200');
    });
    expect(screen.getByTestId('probe').textContent).toBe('');
  });

  it('useList unwraps the { data, meta.nextCursor } envelope', async () => {
    useNetwork(fakeAdapter(200, { data: [{ id: 1 }, { id: 2 }], meta: { nextCursor: 'abc' } }));
    isolated(<ListProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('list').textContent).toBe('1,2');
    });
    expect(screen.getByTestId('list').dataset.cursor).toBe('abc');
    expect(fake?.calls[0]?.url).toBe('/api/v1/things?limit=2');
  });

  describe('listSchema: the envelope is deploy-order safe (03.2 PATTERNS correction 5)', () => {
    it('parses an old api envelope { data: [], meta: { nextCursor: null } }: prevCursor null, total and rangeStart undefined', () => {
      const page = listSchema(item).parse({ data: [], meta: { nextCursor: null } });
      expect(page.meta).toEqual({ nextCursor: null, prevCursor: null });
      expect(page.meta.prevCursor).toBeNull();
      expect(page.meta.total).toBeUndefined();
      expect(page.meta.rangeStart).toBeUndefined();
    });

    it("parses plan 01's full meta { nextCursor, prevCursor, total, rangeStart } unchanged", () => {
      const meta = { nextCursor: 'n', prevCursor: 'p', total: 1240, rangeStart: 26 };
      expect(listSchema(item).parse({ data: [{ id: 1 }], meta }).meta).toEqual(meta);
    });

    it('parses the exportLimit the api sends (03.2 lead decision 2b) and leaves it undefined when not', () => {
      const meta = { nextCursor: null, prevCursor: null, total: 12_500, rangeStart: 1 };
      expect(
        listSchema(item).parse({ data: [], meta: { ...meta, exportLimit: 10_000 } }).meta
          .exportLimit,
      ).toBe(10_000);
      expect(listSchema(item).parse({ data: [], meta }).meta.exportLimit).toBeUndefined();
      for (const bad of [0, -1, 1.5]) {
        expect(
          listSchema(item).safeParse({ data: [], meta: { ...meta, exportLimit: bad } }).success,
        ).toBe(false);
      }
    });

    it('parses the printLimit the api sends (D-06: PDF and Print) and leaves it undefined when not', () => {
      const meta = { nextCursor: null, prevCursor: null, total: 1240, rangeStart: 1 };
      const both = { ...meta, exportLimit: 10_000, printLimit: 1000 };
      expect(listSchema(item).parse({ data: [], meta: both }).meta.printLimit).toBe(1000);
      expect(listSchema(item).parse({ data: [], meta }).meta.printLimit).toBeUndefined();
      for (const bad of [0, -1, 1.5]) {
        expect(
          listSchema(item).safeParse({ data: [], meta: { ...meta, printLimit: bad } }).success,
        ).toBe(false);
      }
    });

    it('refuses a negative or fractional total or rangeStart', () => {
      const base = { nextCursor: null, prevCursor: null };
      for (const bad of [{ total: -1 }, { total: 1.5 }, { rangeStart: -1 }]) {
        expect(listSchema(item).safeParse({ data: [], meta: { ...base, ...bad } }).success).toBe(
          false,
        );
      }
    });
  });

  describe('isLoading means "the first answer is unknown" (D-39: no skeleton after a known failure)', () => {
    it('the very first request, with no error yet, is loading', () => {
      useNetwork(fakeAdapter(200, { id: 7 }));
      isolated(<Probe />);
      expect(screen.getByTestId('probe').dataset.loading).toBe('true');
    });

    it("a retryable 5xx with SWR's retry in flight: not loading, the error still defined", async () => {
      renders.length = 0;
      // The first request fails 503; SWR's automatic retry then stays in flight for the whole test.
      const first = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
      let calls = 0;
      const adapter: AxiosAdapter = (config) => {
        calls += 1;
        return calls === 1 ? first.adapter(config) : new Promise(() => undefined);
      };
      http.defaults.adapter = adapter;
      isolated(<HistoryProbe />);
      await waitFor(() => {
        expect(calls).toBe(2);
      });
      await waitFor(() => {
        expect(screen.getByTestId('history').dataset.validating).toBe('true');
      });
      const probe = screen.getByTestId('history');
      expect(probe.dataset.status).toBe('503');
      expect(probe.dataset.loading).toBe('false');
      // Once the failure was known, no render went back to loading.
      const firstError = renders.findIndex((entry) => entry.endsWith('|503'));
      expect(firstError).toBeGreaterThan(-1);
      expect(renders.slice(firstError).filter((entry) => entry.startsWith('true|'))).toEqual([]);
    });
  });
});
