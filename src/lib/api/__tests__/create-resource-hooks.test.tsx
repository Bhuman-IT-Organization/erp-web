// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import type { ApiAdapter } from '../call-api';
import { createResourceHooks } from '../create-resource-hooks';
import { http } from '../http';

const thing = z.object({ id: z.string(), name: z.string() });
type Thing = z.infer<typeof thing>;
const things = createResourceHooks<Thing, { name: string }, { name: string }>(
  '/api/v1/thing',
  thing,
);

const ONE = { id: 'a', name: 'A' };
const PAGE = { data: [ONE], meta: { nextCursor: null } };

function network(): { readonly reads: FakeAdapter; readonly writes: FakeAdapter } {
  const reads = fakeAdapter(200, PAGE);
  const writes = fakeAdapter(200, ONE);
  const adapter: ApiAdapter = (config) =>
    (config.method ?? 'get').toUpperCase() === 'GET'
      ? reads.adapter(config)
      : writes.adapter(config);
  http.defaults.adapter = adapter;
  return { reads, writes };
}

const urls = (fake: FakeAdapter) => fake.calls.map((c) => `${c.method} ${c.url}`);

function ListProbe() {
  const { data } = things.useList({ limit: 3, q: 'x' });
  return <output data-testid="list">{data?.data.map((t) => t.id).join(',') ?? ''}</output>;
}

function OneProbe({ id }: { readonly id: string | null }) {
  const { data, isLoading } = things.useOne(id);
  return (
    <output data-testid="one" data-loading={String(isLoading)}>
      {data?.name ?? ''}
    </output>
  );
}

function WriteProbe() {
  const create = things.useCreate();
  const update = things.useUpdate('a');
  const remove = things.useRemove('a');
  return (
    <div>
      <button type="button" onClick={() => void create.trigger({ name: 'new' })}>
        create
      </button>
      <button type="button" onClick={() => void update.trigger({ name: 'upd' })}>
        update
      </button>
      <button type="button" onClick={() => void remove.trigger(undefined)}>
        remove
      </button>
      <output
        data-testid="remove"
        data-ok={remove.result === undefined ? '' : String(remove.result.ok)}
        data-null={remove.result?.ok === true ? String(remove.result.data) : 'no'}
      />
    </div>
  );
}

function isolated(ui: React.ReactElement) {
  return renderWithProviders(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);
}

describe('createResourceHooks', () => {
  beforeEach(() => {
    resetApiStatus();
    vi.spyOn(Math, 'random').mockReturnValue(0.005);
  });
  afterEach(() => {
    delete http.defaults.adapter;
    vi.restoreAllMocks();
  });

  it('useList fetches the base path with the canonical query', async () => {
    const { reads } = network();
    isolated(<ListProbe />);
    await waitFor(() => {
      expect(screen.getByTestId('list').textContent).toBe('a');
    });
    expect(urls(reads)).toEqual(['GET /api/v1/thing?limit=3&q=x']);
  });

  it('useOne(null) makes no request; useOne(id) fetches base/id (encoded)', async () => {
    const { reads } = network();
    isolated(<OneProbe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(reads.spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('one').dataset.loading).toBe('false');

    const single = fakeAdapter(200, ONE);
    http.defaults.adapter = single.adapter;
    isolated(<OneProbe id="a b" />);
    await waitFor(() => {
      expect(screen.getAllByTestId('one').at(-1)?.textContent).toBe('A');
    });
    expect(urls(single)).toEqual(['GET /api/v1/thing/a%20b']);
  });

  it('useCreate POSTs to base and revalidates the list; useUpdate PATCHes base/id', async () => {
    const { reads, writes } = network();
    isolated(
      <>
        <ListProbe />
        <WriteProbe />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('list').textContent).toBe('a');
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'create' }));
    await waitFor(() => {
      expect(urls(reads)).toHaveLength(2);
    });
    expect(urls(writes)).toEqual(['POST /api/v1/thing']);
    expect(writes.calls[0]?.data).toEqual({ name: 'new' });

    await user.click(screen.getByRole('button', { name: 'update' }));
    await waitFor(() => {
      expect(urls(writes)).toEqual(['POST /api/v1/thing', 'PATCH /api/v1/thing/a']);
    });
    expect(writes.calls[1]?.data).toEqual({ name: 'upd' });
  });

  it('useRemove DELETEs base/id with expectNoContent: a 204 is ok with data null', async () => {
    const reads = fakeAdapter(200, PAGE);
    const deletes = fakeAdapter(204);
    http.defaults.adapter = (config) =>
      (config.method ?? 'get').toUpperCase() === 'GET'
        ? reads.adapter(config)
        : deletes.adapter(config);
    isolated(<WriteProbe />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'remove' }));
    await waitFor(() => {
      expect(screen.getByTestId('remove').dataset.ok).toBe('true');
    });
    expect(screen.getByTestId('remove').dataset.null).toBe('null');
    expect(urls(deletes)).toEqual(['DELETE /api/v1/thing/a']);
  });
});
