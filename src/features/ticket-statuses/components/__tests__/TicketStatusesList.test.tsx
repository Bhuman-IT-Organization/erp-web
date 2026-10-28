// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { resetApiStatus } from '@/lib/api/api-status';
import { clearSession, setSession } from '@/lib/auth/session';
import { http } from '@/lib/api/http';
import { TicketStatusesList } from '@/features/ticket-statuses/components/TicketStatusesList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const ticketStatuses = [
  {
    ticketstatusid: '11',
    name: 'Open',
    ticket_count: 7,
    isdefault: 1,
    statuscolor: '#03a9f4',
    statusorder: 1,
  },
  {
    ticketstatusid: '12',
    name: 'Waiting',
    ticket_count: 2,
    isdefault: 0,
    statuscolor: null,
    statusorder: null,
  },
  ...Array.from({ length: 28 }, (_, index) => {
    const id = String(index + 13);
    return {
      ticketstatusid: id,
      name: `Status ${id}`,
      ticket_count: index,
      isdefault: 0,
      statuscolor: null,
      statusorder: index + 3,
    };
  }),
];

const requests: { readonly method: string; readonly url: URL }[] = [];

function listAdapter(): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const url = new URL(http.getUri(config), 'http://erp.invalid');
    const method = (config.method ?? 'get').toUpperCase();
    requests.push({ method, url });
    const isMe = url.pathname === '/api/v1/auth/me';
    const isExport = url.pathname === '/api/v1/ticket-statuses/export';
    const cursor = url.searchParams.get('cursor');
    const isPage2 = cursor === 'cursor-2';
    const pageRows = isPage2 ? ticketStatuses.slice(25) : ticketStatuses.slice(0, 25);
    const body = isMe
      ? {
          staffId: 1,
          email: 'admin@example.invalid',
          firstName: 'Admin',
          lastName: 'User',
          isAdmin: true,
          roleId: null,
          permissions: [],
          locale: 'en',
        }
      : isExport
        ? new Blob(['id,name,ticket_count\r\n11,Open,7\r\n'], { type: 'text/csv' })
        : {
            data: pageRows,
            meta: {
              nextCursor: isPage2 ? null : 'cursor-2',
              prevCursor: isPage2 ? 'cursor-1' : null,
              total: ticketStatuses.length,
              rangeStart: isPage2 ? 26 : 1,
              exportLimit: 500,
              printLimit: 250,
            },
          };
    if (method === 'DELETE') {
      const response = {
        data: {
          type: 'about:blank',
          status: 409,
          title: 'Conflict',
          code: 'ERP-TICKETSTATUSES-0001',
          detail: 'is_referenced',
        },
        status: 409,
        statusText: '409',
        headers: new AxiosHeaders(),
        config,
      };
      return Promise.reject(
        new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response),
      );
    }

    return Promise.resolve({
      data: body,
      status: 200,
      statusText: '200',
      headers: new AxiosHeaders(),
      config,
    });
  };
}

describe('Ticket Statuses list integration', () => {
  beforeEach(() => {
    setSession({ accessToken: 'test-only', csrfToken: 'test-only' });
    resetApiStatus();
    requests.length = 0;
    localStorage.setItem('erp.list.pageSize.1', '25');
    http.defaults.adapter = listAdapter();
  });

  afterEach(() => {
    delete http.defaults.adapter;
    clearSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('paginates locally, hides Delete for built-in statuses, and exports the visible list columns', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ticket-statuses/test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <TicketStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const table = await screen.findByTestId('list-table');
    expect(screen.getByRole('link', { name: /Waiting/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open/ })).toBeTruthy();
    expect(screen.getAllByText('Total 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total 7').length).toBeGreaterThan(0);
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(screen.queryByRole('button', { name: 'Delete Open' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete Waiting' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Open' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Waiting' })).toBeTruthy();
    expect(screen.getByTestId('list-pager')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Actions for Open' }));
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Edit Open' })).toBeTruthy();
    await waitFor(() => {
      expect(requests.some(({ url }) => url.pathname === '/api/v1/ticket-statuses')).toBe(true);
    });

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(within(table).getAllByRole('row')).toHaveLength(6);
    });
    expect(screen.getByRole('link', { name: /Status 40/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => {
      expect(requests.some(({ url }) => url.pathname === '/api/v1/ticket-statuses/export')).toBe(
        true,
      );
    });
    const exported = requests.find(({ url }) => url.pathname === '/api/v1/ticket-statuses/export');
    expect(exported?.url.searchParams.get('format')).toBe('csv');
    expect(exported?.url.searchParams.getAll('column')).toEqual(['id', 'name', 'ticket_count']);
    expect(exported?.url.searchParams.getAll('header')).toEqual([
      'ID',
      'Ticket Status Name',
      'Total',
    ]);
  });

  it('keeps the API refusal text visible in the delete dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <TicketStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await screen.findByRole('button', { name: 'Delete Waiting' });
    await user.click(screen.getByRole('button', { name: 'Delete Waiting' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));

    expect(await screen.findByText('The ID of the ticket status is already using.')).toBeTruthy();
  });
});
