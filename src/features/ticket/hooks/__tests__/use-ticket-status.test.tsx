// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useDeleteTicketStatus, useTicketStatuses } from '../use-ticket-status';

const STATUS = {
  ticketstatusid: 'a 1',
  name: 'Waiting',
  isdefault: 0,
  statuscolor: '#a1b2c3',
  statusorder: 2,
};

function ReadProbe({ id }: { readonly id: string | null }) {
  const { data, error } = useTicketStatuses(id);
  return (
    <output data-testid="status" data-code={error?.code ?? ''}>
      {data?.name ?? ''}
    </output>
  );
}

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteTicketStatus(id);
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

const show = (child: React.ReactNode) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{child}</SWRConfig>,
  );

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useTicketStatuses', () => {
  it('reads and parses GET /api/v1/ticket-statuses/:id with the id encoded', async () => {
    const reads = fakeAdapter(200, STATUS);
    http.defaults.adapter = reads.adapter;
    show(<ReadProbe id="a 1" />);
    expect(await screen.findByText('Waiting')).toBeTruthy();
    expect(reads.calls.map(({ method, url }) => [method, url])).toEqual([
      ['GET', '/api/v1/ticket-statuses/a%201'],
    ]);
  });

  it('does not make a request for the create screen and exposes read failures', async () => {
    const reads = fakeAdapter(404, problem(404, 'ERP-CORE-0004'));
    http.defaults.adapter = reads.adapter;
    show(<ReadProbe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.calls).toEqual([]);

    cleanup();
    show(<ReadProbe id="7" />);
    expect((await screen.findByTestId('status')).getAttribute('data-code')).toBe('ERP-CORE-0004');
  });
});

describe('useDeleteTicketStatus', () => {
  it('sends a bodyless DELETE and reports a successful 204', async () => {
    const writes = fakeAdapter(204);
    http.defaults.adapter = writes.adapter;
    show(<DeleteProbe id="7" />);
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map(({ method, url, data }) => [method, url, data])).toEqual([
      ['DELETE', '/api/v1/ticket-statuses/7', undefined],
    ]);
  });

  it('keeps backend deletion refusals as failures', async () => {
    const writes = fakeAdapter(409, problem(409, 'ERP-TICKETSTATUSES-0002'));
    http.defaults.adapter = writes.adapter;
    show(<DeleteProbe id="7" />);
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-code')).toBe(
        'ERP-TICKETSTATUSES-0002',
      );
    });
    expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('false');
    expect(writes.calls).toHaveLength(1);
  });
});
