// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { CustomerGroupsList } from '../CustomerGroupsList';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/setup/customer-groups',
}));
const ROW = { id: '7', name: 'Retail' };
const page = {
  data: [ROW],
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: 1,
    rangeStart: 1,
    exportLimit: 10000,
    printLimit: 1000,
  },
};
const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});
interface Reply {
  status: number;
  body?: unknown;
}
type ListReply = Reply | 'pending';
let remove: Reply = { status: 204 };
let list: ListReply = { status: 200, body: page };
let requests: { method: string; url: string }[] = [];
function adapter(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toUpperCase();
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push({ method, url: url.pathname });
  if (url.pathname === '/api/v1/auth/me') {
    const body = {
      staffId: 1,
      email: 'a@b.invalid',
      firstName: 'A',
      lastName: 'B',
      isAdmin: true,
      roleId: null,
      permissions: [],
      locale: null,
    };
    return Promise.resolve({
      data: body,
      status: 200,
      statusText: '200',
      headers: new AxiosHeaders(),
      config,
    });
  }
  let reply: Reply;
  if (method === 'DELETE') {
    reply = remove;
  } else {
    if (list === 'pending') return new Promise<never>(() => undefined);
    reply = list;
  }
  const status = reply.status;
  const response: AxiosResponse<unknown> = {
    data: status === 204 ? undefined : reply.body,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
  };
  return status < 300
    ? Promise.resolve(response)
    : Promise.reject(
        new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
          ...response,
          data: reply.body,
        }),
      );
}
const show = (searchParams = '') =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <CustomerGroupsList />
      <Toaster />
    </SWRConfig>,
    { hasMemory: true, searchParams },
  );
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  remove = { status: 204 };
  list = { status: 200, body: page };
  requests = [];
  push.mockClear();
  http.defaults.adapter = adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('CustomerGroupsList', () => {
  it('shows the loading state while the first list response is pending', async () => {
    list = 'pending';
    show();
    expect((await screen.findByTestId('list-loading')).getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('list-table')).toBeNull();
  });
  it('shows the empty state and its create link', async () => {
    list = {
      status: 200,
      body: { ...page, data: [], meta: { ...page.meta, total: 0, rangeStart: 0 } },
    };
    show();
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe('No customer groups yet');
    expect(
      within(empty).getByRole('link', { name: 'New Customer Group' }).getAttribute('href'),
    ).toBe('/setup/customer-groups/new');
  });
  it('shows the no-results state for a search with no matches', async () => {
    list = {
      status: 200,
      body: { ...page, data: [], meta: { ...page.meta, total: 0, rangeStart: 0 } },
    };
    show('?q=zz');
    const noResults = await screen.findByTestId('list-no-results');
    expect(noResults.textContent).toContain('No customer groups match');
    expect(within(noResults).getByRole('button', { name: /clear search/i })).toBeTruthy();
  });
  it('shows a plain-language error and retry action when the list fails', async () => {
    list = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show();
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain("couldn't load customer group");
    expect(error.textContent).not.toContain('ERP-UPSTREAM-0001');
    expect(within(error).getByRole('button', { name: /retry/i })).toBeTruthy();
  });
  it('shows Name only and provides the export action', async () => {
    show();
    const table = await screen.findByTestId('list-table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Actions']);
    expect(within(table).queryByText('7')).toBeNull();
    expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Retail' }).getAttribute('href')).toBe(
      '/setup/customer-groups/7',
    );
  });
  it('deletes a group after confirmation', async () => {
    show();
    const row = await screen.findByRole('link', { name: 'Retail' });
    const tr = row.closest('tr') as HTMLElement;
    await userEvent.click(within(tr).getByRole('button', { name: 'Delete customer group Retail' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(requests).toContainEqual({ method: 'DELETE', url: '/api/v1/customer-groups/7' });
    });
  });
  it('shows the API in-use refusal for a 409 instead of a generic error', async () => {
    remove = { status: 409, body: problem(409, 'ERP-CUSTOMERGROUPS-0001') };
    show();
    const row = await screen.findByRole('link', { name: 'Retail' });
    await userEvent.click(
      within(row.closest('tr') as HTMLElement).getByRole('button', {
        name: 'Delete customer group Retail',
      }),
    );
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(within(dialog).getByTestId('confirm-dialog-error').textContent).toContain(
        'still has customers',
      );
    });
    expect(within(dialog).getByTestId('confirm-dialog-error').textContent).not.toContain(
      'Something went wrong',
    );
  });
});
