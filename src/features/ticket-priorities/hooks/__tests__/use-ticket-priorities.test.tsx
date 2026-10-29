// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useDeleteTicketPriority, useTicketPriorities } from '../use-ticket-priorities';

const ITEM = { id: 'a 1', name: 'Alpha' };
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;

function Probe({ id }: { readonly id: string | null }) {
  const { data, error } = useTicketPriorities(id);
  return (
    <output data-testid="item" data-code={error?.code ?? ''}>
      {data?.name ?? ''}
    </output>
  );
}

const show = (id: string | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <Probe id={id} />
    </SWRConfig>,
  );

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteTicketPriority(id);
  return (
    <div>
      <button type="button" onClick={() => void trigger(undefined)}>
        delete
      </button>
      <output
        data-testid="delete"
        data-ok={result === undefined ? '' : String(result.ok)}
        data-code={result?.ok === false ? result.code : ''}
      />
    </div>
  );
}

const showDelete = (id: string) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <DeleteProbe id={id} />
    </SWRConfig>,
  );
const outcome = () => screen.getByTestId('delete');

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useTicketPriorities', () => {
  it('reads GET /api/v1/ticket-priorities/:id, the id encoded, and parses the record', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show('a 1');
    expect(await screen.findByText('Alpha')).toBeTruthy();
    expect(reads.calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/v1/ticket-priorities/a%201'],
    ]);
  });

  it('a null id (the create screen) asks nothing', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show(null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.calls).toEqual([]);
  });

  it('a 404 ERP-CORE-0004 is the error, never data', async () => {
    http.defaults.adapter = fakeAdapter(NOT_FOUND, problem(NOT_FOUND, 'ERP-CORE-0004')).adapter;
    show('a 1');
    const out = await screen.findByTestId('item');
    await screen.findByText('', { selector: '[data-code="ERP-CORE-0004"]' });
    expect(out.textContent).toBe('');
  });
});

describe('useDeleteTicketPriority', () => {
  it('DELETEs /api/v1/ticket-priorities/:id with no body and a 204 is success', async () => {
    const writes = fakeAdapter(NO_CONTENT);
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['DELETE', '/api/v1/ticket-priorities/7', undefined],
    ]);
  });

  it.each(['ERP-TICKETPRIORITIES-0001', 'ERP-TICKETPRIORITIES-0002'])(
    'a 409 %s is a resolved failure carrying the code, sent once',
    async (code) => {
      const writes = fakeAdapter(CONFLICT, problem(CONFLICT, code));
      http.defaults.adapter = writes.adapter;
      showDelete('7');
      await userEvent.click(screen.getByRole('button', { name: 'delete' }));
      await waitFor(() => {
        expect(outcome().getAttribute('data-code')).toBe(code);
      });
      expect(outcome().getAttribute('data-ok')).toBe('false');
      expect(writes.calls).toHaveLength(1);
    },
  );

  it('is NEVER retried: a 503 answers once (ADR-0031 §5)', async () => {
    const writes = fakeAdapter(
      SERVICE_UNAVAILABLE,
      problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    );
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes.calls).toHaveLength(1);
  });
});
