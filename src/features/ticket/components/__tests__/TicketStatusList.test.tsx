// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { resetApiStatus } from '@/lib/api/api-status';
import { clearSession, setSession } from '@/lib/auth/session';
import { http } from '@/lib/api/http';
import { TicketStatusList } from '@/features/ticket/components/TicketStatusList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const ticketStatuses = [
  {
    ticketstatusid: '11',
    name: 'Open',
    isdefault: 1,
    statuscolor: '#03a9f4',
    statusorder: 1,
  },
  {
    ticketstatusid: '12',
    name: 'Waiting',
    isdefault: 0,
    statuscolor: null,
    statusorder: null,
  },
  ...Array.from({ length: 28 }, (_, index) => {
    const id = String(index + 13);
    return {
      ticketstatusid: id,
      name: `Status ${id}`,
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
        ? new Blob(['id,name\r\n11,Open\r\n'], { type: 'text/csv' })
        : { data: ticketStatuses };
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

  it('paginates locally and exports the visible list columns without rendering Delete', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ticket-statuses/test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <TicketStatusList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const table = await screen.findByTestId('list-table');
    expect(screen.getByRole('link', { name: 'Waiting' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open' })).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
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
    expect(screen.getByRole('link', { name: 'Status 40' })).toBeTruthy();
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
    expect(exported?.url.searchParams.getAll('column')).toEqual(['id', 'name']);
    expect(exported?.url.searchParams.getAll('header')).toEqual(['ID', 'Ticket Status Name']);
    expect(
      requests.filter(
        ({ url }) =>
          url.pathname.startsWith('/api/v1/ticket-statuses') &&
          url.pathname !== '/api/v1/ticket-statuses/export',
      ),
    ).toHaveLength(1);
  });
});
