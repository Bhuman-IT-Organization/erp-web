// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type { AnchorHTMLAttributes, ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { http } from '@/lib/api/http';
import { resetApiStatus } from '@/lib/api/api-status';
import { clearSession, setSession } from '@/lib/auth/session';
import { EstimateRequestStatusesList } from '@/features/estimate-request-statuses/components/EstimateRequestStatusesList';
import { GuardedEstimateRequestStatusesList } from '@/features/estimate-request-statuses/components/EstimateRequestStatusesList';
import { estimateRequestStatusesPath } from '@/features/estimate-request-statuses/api/estimate-request-statuses.endpoints';
import {
  estimateRequestStatusRowSchema,
  type EstimateRequestStatusRow,
} from '@/features/estimate-request-statuses/schemas/estimate-request-statuses.schema';
import { useRowSeed } from '@/lib/api/row-seed';
import en from '@/features/estimate-request-statuses/messages/en.json';
import ar from '@/features/estimate-request-statuses/messages/ar.json';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/estimate-request-statuses',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly href: string }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    />
  ),
}));

const initialStatuses = [
  {
    id: '1',
    name: 'Cancelled',
    color: '#757575',
    statusorder: 1,
    flag: 'cancelled',
    total_request: 0,
  },
  {
    id: '2',
    name: 'Processing',
    color: '#757575',
    statusorder: 2,
    flag: 'processing',
    total_request: 1,
  },
  {
    id: '3',
    name: 'Completed',
    color: '#757575',
    statusorder: 3,
    flag: null,
    total_request: 0,
  },
];
const EN = en['estimate-request-statuses'];
const AR = ar['estimate-request-statuses'];

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

let remove: { readonly status: number; readonly body?: unknown };
let list: { readonly status: number; readonly body?: unknown } | 'pending';
let exported: { readonly status: number; readonly body?: unknown };
let meReply: { readonly status: number; readonly body?: unknown };
let requests: { readonly method: string; readonly url: string }[];
let exportRequests: URL[];

function adapter(): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
    const method = (config.method ?? 'get').toUpperCase();
    const url = new URL(http.getUri(config), 'http://erp.invalid');
    requests.push({ method, url: url.pathname });
    const responseBody = {
      data: initialStatuses,
      meta: {
        nextCursor: null,
        prevCursor: null,
        total: initialStatuses.length,
        rangeStart: 1,
        exportLimit: 500,
        printLimit: 250,
      },
    };
    const reply =
      url.pathname === '/api/v1/auth/me'
        ? meReply
        : method === 'DELETE'
          ? remove
          : url.pathname === '/api/v1/estimate-request-statuses/export'
            ? exported
            : list;
    if (reply === 'pending') return new Promise<never>(() => undefined);
    if (url.pathname === '/api/v1/estimate-request-statuses/export') exportRequests.push(url);
    const response: AxiosResponse<unknown> = {
      data:
        reply.status === 204
          ? undefined
          : method === 'DELETE' ||
              url.pathname === '/api/v1/estimate-request-statuses/export' ||
              reply.body !== undefined
            ? reply.body
            : responseBody,
      status: reply.status,
      statusText: String(reply.status),
      headers: new AxiosHeaders(),
      config,
    };

    return reply.status < 300
      ? Promise.resolve(response)
      : Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
  };
}

function me(isAdmin: boolean) {
  return {
    staffId: 1,
    email: 'someone@example.invalid',
    firstName: 'Some',
    lastName: 'One',
    isAdmin,
    roleId: null,
    permissions: [],
    locale: null,
  };
}

function SeedProbe(): ReactElement {
  const row = useRowSeed<EstimateRequestStatusRow>(
    estimateRequestStatusesPath('2'),
    estimateRequestStatusRowSchema,
  );
  return <output data-testid="seed-probe">{row?.name ?? ''}</output>;
}

describe('Estimate Request Statuses list', () => {
  beforeEach(() => {
    setSession({ accessToken: 'test-only', csrfToken: 'test-only' });
    resetApiStatus();
    http.defaults.adapter = adapter();
    remove = { status: 204 };
    list = { status: 200 };
    exported = { status: 200, body: new Blob(['id,name,total_request\r\n']) };
    meReply = { status: 200, body: me(true) };
    requests = [];
    exportRequests = [];
  });

  afterEach(() => {
    delete http.defaults.adapter;
    clearSession();
    localStorage.clear();
  });

  it('shows request totals and routes create and edit to the standard Setup forms', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    expect(await screen.findByRole('button', { name: 'Edit Processing' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Edit Processing' }).getAttribute('data-variant'),
    ).toBe('default');
    const actionMenus = container.querySelectorAll('[data-testid="row-actions-menu"]');
    expect(actionMenus.length).toBe(initialStatuses.length);
    for (const menu of actionMenus) {
      expect(menu.className).toContain('md:hidden');
      expect(menu.className).not.toContain('md:invisible');
    }
    expect(screen.getByText('Total Request: 1')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Actions for Cancelled' }));
    await screen.findByRole('menuitem', { name: 'Edit Cancelled' });
    expect(screen.queryByRole('menuitem', { name: 'Delete status Cancelled' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Actions for Completed' }));
    expect(await screen.findByRole('menuitem', { name: 'Delete status Completed' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Actions for Completed' }));
    await user.click(screen.getByRole('button', { name: 'Actions for Processing' }));
    expect(screen.getByRole('link', { name: 'New Status' }).getAttribute('href')).toBe(
      '/setup/estimate-request-statuses/new',
    );
    expect(container.querySelector('a[href="/setup/estimate-request-statuses/2"]')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('menuitem', { name: 'Edit Processing' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Delete status Processing' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit Processing' }));
    expect(push).toHaveBeenCalledWith('/setup/estimate-request-statuses/2');
  });

  it('shows loading while the first list response is pending', async () => {
    list = 'pending';
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    expect((await screen.findByTestId('list-loading')).getAttribute('aria-busy')).toBe('true');
    for (const id of ['list-empty', 'list-no-results', 'list-error', 'list-table']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
  });

  it('shows the empty state and create action when no statuses exist', async () => {
    list = {
      status: 200,
      body: {
        data: [],
        meta: {
          nextCursor: null,
          prevCursor: null,
          total: 0,
          rangeStart: 0,
          exportLimit: 500,
          printLimit: 250,
        },
      },
    };
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(
      'No Estimate Request statuses found',
    );
    expect(within(empty).getByRole('link', { name: 'New Status' }).getAttribute('href')).toBe(
      '/setup/estimate-request-statuses/new',
    );
  });

  it('shows the no-results state for an empty search', async () => {
    list = {
      status: 200,
      body: {
        data: [],
        meta: {
          nextCursor: null,
          prevCursor: null,
          total: 0,
          rangeStart: 0,
          exportLimit: 500,
          printLimit: 250,
        },
      },
    };
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true, searchParams: '?q=missing' },
    );

    const noResults = await screen.findByTestId('list-no-results');
    expect(within(noResults).getByRole('heading').textContent).toBe('No statuses match “missing”');
    expect(within(noResults).getByRole('button', { name: /clear search/i })).toBeTruthy();
  });

  it('shows names containing markup as plain text', async () => {
    const name = '<' + 'img src=x onerror=alert(1)>';
    list = {
      status: 200,
      body: {
        data: [{ ...initialStatuses[2], name }],
        meta: {
          nextCursor: null,
          prevCursor: null,
          total: 1,
          rangeStart: 1,
          exportLimit: 500,
          printLimit: 250,
        },
      },
    };
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );
    expect(await screen.findByText(name)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows a retryable error when the list request answers 503', async () => {
    list = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain("couldn't load statuses");
    expect(within(error).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('seeds a row when opened from its list link', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <SWRConfig value={{ shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
        <SeedProbe />
      </SWRConfig>,
      { hasMemory: true },
    );
    await screen.findByRole('button', { name: 'Edit Processing' });
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/setup/estimate-request-statuses/2"]',
    );
    expect(link).not.toBeNull();
    if (link === null) throw new Error('estimate request status row link missing');
    await user.click(link);
    await waitFor(() => {
      expect(screen.getByTestId('seed-probe').textContent).toBe('Processing');
    });
    expect(link.getAttribute('href')).toBe('/setup/estimate-request-statuses/2');
  });

  it('shows an Arabic row in RTL layout', async () => {
    const arabicName = 'قيد المعالجة';
    list = {
      status: 200,
      body: {
        data: [{ ...initialStatuses[2], name: arabicName }],
        meta: {
          nextCursor: null,
          prevCursor: null,
          total: 1,
          rangeStart: 1,
          exportLimit: 500,
          printLimit: 250,
        },
      },
    };
    const { container } = renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true, locale: 'ar' },
    );
    expect(await screen.findByText(arabicName)).toBeTruthy();
    expect(screen.getByText(AR.status_name)).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
    expect(EN.status_name).toBe('Status Name');
  });

  it('shows a plain-language error and retry action when loading fails', async () => {
    list = {
      status: 503,
      body: problem(503, 'ERP-UPSTREAM-0001'),
    };
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain("couldn't load statuses");
    expect(error.textContent).not.toContain('ERP-UPSTREAM-0001');
    expect(within(error).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('exports CSV with the API columns and translated headers', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );
    await screen.findByTestId('list-table');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => {
      expect(exportRequests).toHaveLength(1);
    });
    expect(exportRequests[0]?.searchParams.get('format')).toBe('csv');
    expect(exportRequests[0]?.searchParams.getAll('column')).toEqual([
      'id',
      'name',
      'total_request',
    ]);
    expect(exportRequests[0]?.searchParams.getAll('header')).toEqual([
      'ID',
      'Status Name',
      'Total Request',
    ]);
  });

  it('deletes an unflagged status after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await user.click(await screen.findByRole('button', { name: 'Actions for Completed' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete status Completed' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Delete status Completed?');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(requests).toContainEqual({
        method: 'DELETE',
        url: '/api/v1/estimate-request-statuses/3',
      });
    });
  });

  it('shows the in-use API refusal for a 409 inside the confirmation dialog', async () => {
    remove = {
      status: 409,
      body: problem(409, 'ERP-ESTIMATEREQUESTSTATUSES-0001'),
    };
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );

    await user.click(await screen.findByRole('button', { name: 'Actions for Completed' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete status Completed' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(within(dialog).getByTestId('confirm-dialog-error').textContent).toContain(
        'used by estimate requests, or its use could not be checked',
      );
    });
    expect(within(dialog).getByTestId('confirm-dialog-error').textContent).not.toContain(
      'Something went wrong',
    );
  });

  it('shows the estimate-request-form refusal for a 409 inside the confirmation dialog', async () => {
    remove = { status: 409, body: problem(409, 'ERP-ESTIMATEREQUESTSTATUSES-0003') };
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );
    await user.click(await screen.findByRole('button', { name: 'Actions for Completed' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete status Completed' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(within(dialog).getByTestId('confirm-dialog-error').textContent).toContain(
        "This status is used by an estimate request form, so it can't be deleted.",
      );
    });
  });

  it('shows the built-in refusal for a 409 inside the confirmation dialog', async () => {
    remove = { status: 409, body: problem(409, 'ERP-ESTIMATEREQUESTSTATUSES-0002') };
    const user = userEvent.setup();
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );
    await user.click(await screen.findByRole('button', { name: 'Actions for Completed' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete status Completed' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(within(dialog).getByTestId('confirm-dialog-error').textContent).toContain(
        'Default estimate request statuses cannot be deleted.',
      );
    });
  });

  it('shows the not-found refusal and asks for the list again', async () => {
    remove = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    const user = userEvent.setup();
    renderWithProviders(<EstimateRequestStatusesList />, { hasMemory: true });
    await user.click(await screen.findByRole('button', { name: 'Actions for Completed' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete status Completed' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(within(dialog).getByTestId('confirm-dialog-error').textContent).toContain(
        'This status no longer exists. It may have been removed.',
      );
      expect(
        requests.filter(
          ({ method, url }) => method === 'GET' && url === '/api/v1/estimate-request-statuses',
        ),
      ).toHaveLength(2);
    });
  });

  it('Guarded: an administrator sees the list', async () => {
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <GuardedEstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('Guarded: a non-administrator is refused before the list is requested', async () => {
    meReply = { status: 200, body: me(false) };
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <GuardedEstimateRequestStatusesList />
      </SWRConfig>,
      { hasMemory: true },
    );
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(requests.filter(({ url }) => url === '/api/v1/estimate-request-statuses')).toHaveLength(
      0,
    );
  });
});
