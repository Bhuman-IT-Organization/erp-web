// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
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
let remove: { status: number; body?: unknown } = { status: 204 };
let requests: { method: string; url: string }[] = [];
function adapter(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toUpperCase();
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push({ method, url: url.pathname });
  const body =
    url.pathname === '/api/v1/auth/me'
      ? {
          staffId: 1,
          email: 'a@b.invalid',
          firstName: 'A',
          lastName: 'B',
          isAdmin: true,
          roleId: null,
          permissions: [],
          locale: null,
        }
      : method === 'DELETE'
        ? remove
        : page;
  const status = method === 'DELETE' ? remove.status : 200;
  const response = {
    data: status === 204 ? undefined : body,
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
          data: remove.body,
        }),
      );
}
const show = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <CustomerGroupsList />
      <Toaster />
    </SWRConfig>,
    { hasMemory: true },
  );
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  remove = { status: 204 };
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
