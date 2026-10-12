// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import type { ApiAdapter } from '../call-api';
import { http } from '../http';
import { useCommonApi, useList } from '../use-common-api';
import { useCommonMutation, type MutationCallOptions } from '../use-common-mutation';

const item = z.object({ id: z.number() });
const PAGE = { data: [{ id: 1 }], meta: { nextCursor: null } };

/** One fake per method: GETs answer the list, everything else answers the write. */
function network(write: FakeAdapter): { readonly reads: FakeAdapter; readonly write: FakeAdapter } {
  const reads = fakeAdapter(200, PAGE);
  const adapter: ApiAdapter = (config) =>
    (config.method ?? 'get').toUpperCase() === 'GET'
      ? reads.adapter(config)
      : write.adapter(config);
  http.defaults.adapter = adapter;
  return { reads, write };
}

const urlCount = (fake: FakeAdapter, url: string) => fake.calls.filter((c) => c.url === url).length;

function Probe() {
  const { trigger, isMutating, result, reset } = useCommonMutation<
    { name: string },
    { id: number }
  >('/api/v1/item', { method: 'POST', schema: item, invalidate: ['/api/v1/item'] });
  return (
    <div>
      <button type="button" onClick={() => void trigger({ name: 'n' })}>
        go
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
      <output
        data-testid="mutation"
        data-mutating={String(isMutating)}
        data-ok={result === undefined ? '' : String(result.ok)}
        data-status={result?.status ?? ''}
        data-issues={
          result !== undefined && !result.ok && result.issues !== undefined ? 'yes' : 'no'
        }
      >
        {result?.ok === true ? String(result.data.id) : ''}
      </output>
    </div>
  );
}

/** A save naming its version and a keyed POST: the two per-call options of `trigger` (M4). */
function KeyedProbe({ options }: { readonly options?: MutationCallOptions }) {
  const { trigger } = useCommonMutation<{ name: string }, { id: number }>('/api/v1/item', {
    method: 'PUT',
    schema: item,
    invalidate: [],
  });
  return (
    <button type="button" onClick={() => void trigger({ name: 'n' }, options)}>
      save
    </button>
  );
}

function Readers() {
  const list = useList('/api/v1/item', item, { limit: 1 });
  const other = useCommonApi('/api/v1/other', item);
  return (
    <output
      data-testid="readers"
      data-list={list.data === undefined ? '' : 'ready'}
      data-other={other.error?.status ?? ''}
    />
  );
}

function isolated(ui: React.ReactElement) {
  return renderWithProviders(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);
}

describe('useCommonMutation (writes over callApi, never retried — ADR-0031 §5)', () => {
  beforeEach(() => {
    resetApiStatus();
    vi.spyOn(Math, 'random').mockReturnValue(0.005);
  });
  afterEach(() => {
    delete http.defaults.adapter;
    vi.restoreAllMocks();
  });

  it('trigger POSTs the body to the path and exposes the ok result; isMutating toggles; reset clears', async () => {
    const { write } = network(fakeAdapter(201, { id: 9 }));
    isolated(<Probe />);
    const user = userEvent.setup();
    expect(screen.getByTestId('mutation').dataset.mutating).toBe('false');
    await user.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(screen.getByTestId('mutation').dataset.ok).toBe('true');
    });
    expect(screen.getByTestId('mutation').textContent).toBe('9');
    expect(screen.getByTestId('mutation').dataset.status).toBe('201');
    expect(screen.getByTestId('mutation').dataset.mutating).toBe('false');
    expect(write.calls).toEqual([
      expect.objectContaining({ url: '/api/v1/item', method: 'POST', data: { name: 'n' } }),
    ]);
    await user.click(screen.getByRole('button', { name: 'reset' }));
    await waitFor(() => {
      expect(screen.getByTestId('mutation').dataset.ok).toBe('');
    });
  });

  it('a successful write revalidates every key under the invalidate prefixes and no other', async () => {
    const { reads } = network(fakeAdapter(200, { id: 2 }));
    isolated(
      <>
        <Readers />
        <Probe />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('readers').dataset.list).toBe('ready');
    });
    expect(urlCount(reads, '/api/v1/item?limit=1')).toBe(1);
    expect(urlCount(reads, '/api/v1/other')).toBe(1);

    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(urlCount(reads, '/api/v1/item?limit=1')).toBe(2);
    });
    // The unrelated key is untouched by the prefix invalidation.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(urlCount(reads, '/api/v1/other')).toBe(1);
  });

  it('a 500 on the write is a failed result after exactly one request — never retried', async () => {
    const { write, reads } = network(fakeAdapter(500, problem(500, 'ERP-HTTP-500')));
    isolated(
      <>
        <Readers />
        <Probe />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('readers').dataset.list).toBe('ready');
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(screen.getByTestId('mutation').dataset.ok).toBe('false');
    });
    expect(screen.getByTestId('mutation').dataset.status).toBe('500');
    // Longer than any read retry delay under the pinned random: a mutation retry would show here.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(write.spy).toHaveBeenCalledTimes(1);
    // A failed write invalidates nothing.
    expect(urlCount(reads, '/api/v1/item?limit=1')).toBe(1);
  });

  it('a 503 on the write is likewise sent once (the read policy would have retried it)', async () => {
    const { write } = network(
      fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'), { 'retry-after': '1' }),
    );
    isolated(<Probe />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(screen.getByTestId('mutation').dataset.status).toBe('503');
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(write.spy).toHaveBeenCalledTimes(1);
  });

  it('a 400 ERP-VALIDATION-0001 surfaces its issues on the result', async () => {
    const { write } = network(
      fakeAdapter(400, {
        ...problem(400, 'ERP-VALIDATION-0001'),
        issues: [{ path: ['name'], message: 'Required' }],
      }),
    );
    isolated(<Probe />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(screen.getByTestId('mutation').dataset.issues).toBe('yes');
    });
    expect(screen.getByTestId('mutation').dataset.status).toBe('400');
    expect(write.spy).toHaveBeenCalledTimes(1);
  });

  it('trigger(body, { ifMatch, idempotencyKey }) reaches the adapter with If-Match and Idempotency-Key', async () => {
    const { write } = network(fakeAdapter(200, { id: 3 }));
    isolated(<KeyedProbe options={{ ifMatch: '"v1"', idempotencyKey: 'key-0001' }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(write.calls).toHaveLength(1);
    });
    expect(write.calls[0]?.headers['if-match']).toBe('"v1"');
    expect(write.calls[0]?.headers['idempotency-key']).toBe('key-0001');
    expect(write.calls[0]?.data).toEqual({ name: 'n' });
  });

  it('trigger(body) sends neither header', async () => {
    const { write } = network(fakeAdapter(200, { id: 3 }));
    isolated(<KeyedProbe />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(write.calls).toHaveLength(1);
    });
    expect(write.calls[0]?.headers).not.toHaveProperty('if-match');
    expect(write.calls[0]?.headers).not.toHaveProperty('idempotency-key');
  });
});
