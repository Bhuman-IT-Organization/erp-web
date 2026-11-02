// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { http } from '@/lib/api/http';
import { resetApiStatus } from '@/lib/api/api-status';
import { clearSession, setSession } from '@/lib/auth/session';
import { EstimateRequestStatusForm } from '@/features/estimate-request-statuses/components/EstimateRequestStatusForm';

const push = vi.fn<(href: string, options?: { readonly scroll: boolean }) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/estimate_request-statuses/new',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const processing = {
  id: '2',
  name: 'Processing',
  color: '#007bff',
  statusorder: 2,
  flag: 'processing',
  total_request: 1,
};

const requests: { method: string; path: string; body: unknown }[] = [];

function adapter(): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const url = new URL(http.getUri(config), 'http://erp.invalid');
    const method = (config.method ?? 'get').toUpperCase();
    const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    requests.push({ method, path: url.pathname, body });

    const responseBody =
      method === 'POST' || method === 'PATCH'
        ? {
            ...processing,
            ...(typeof body === 'object' && body !== null ? body : {}),
            id: method === 'POST' ? '4' : processing.id,
            flag: null,
            total_request: 0,
          }
        : url.pathname === '/api/v1/estimate-request-statuses/2'
          ? processing
          : {
              data: [processing],
              meta: {
                nextCursor: null,
                prevCursor: null,
                total: 3,
                rangeStart: 1,
                exportLimit: 500,
                printLimit: 250,
              },
            };

    return Promise.resolve({
      data: responseBody,
      status: method === 'POST' ? 201 : 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    });
  };
}

function show(id: string | null) {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <EstimateRequestStatusForm id={id} />
    </SWRConfig>,
    { hasMemory: true },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test-only', csrfToken: 'test-only' });
  resetApiStatus();
  requests.length = 0;
  push.mockClear();
  http.defaults.adapter = adapter();
});

afterEach(() => {
  delete http.defaults.adapter;
  clearSession();
  localStorage.clear();
});

describe('Estimate Request Status form', () => {
  it('creates a status on the standard form page with the next order', async () => {
    const user = userEvent.setup();
    show(null);

    expect(await screen.findByRole('heading', { name: 'New Status' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Status Order').value).toBe('4');
    await user.type(screen.getByRole('textbox', { name: 'Status Name' }), 'Ready');
    await user.click(screen.getByRole('button', { name: 'Create status' }));
    const confirmation = await screen.findByTestId('confirm-dialog');
    await user.click(within(confirmation).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === 'POST' && request.path === '/api/v1/estimate-request-statuses',
        ),
      ).toBe(true);
    });
    expect(requests.find((request) => request.method === 'POST')?.body).toMatchObject({
      name: 'Ready',
      statusorder: 4,
    });
    expect(push).toHaveBeenCalledWith('/setup/estimate_request-statuses', { scroll: false });
  });

  it('loads the existing values on the edit page and saves changes', async () => {
    const user = userEvent.setup();
    show('2');

    expect(await screen.findByRole('heading', { name: 'Processing' })).toBeTruthy();
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Status Name' });
    expect(name.value).toBe('Processing');
    expect(screen.getByLabelText<HTMLInputElement>('Status Order').value).toBe('2');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.clear(name);
    await user.type(name, 'In progress');
    await user.click(screen.getByRole('button', { name: 'Save status' }));
    const confirmation = await screen.findByTestId('confirm-dialog');
    await user.click(within(confirmation).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === 'PATCH' && request.path === '/api/v1/estimate-request-statuses/2',
        ),
      ).toBe(true);
    });
    expect(requests.find((request) => request.method === 'PATCH')?.body).toMatchObject({
      name: 'In progress',
      statusorder: 2,
    });
  });
});
