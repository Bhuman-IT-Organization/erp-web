// @vitest-environment happy-dom
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { http } from '@/lib/api/http';
import { resetApiStatus } from '@/lib/api/api-status';
import { clearSession, setSession } from '@/lib/auth/session';
import { EstimateRequestStatusesList } from '@/features/estimate-request-statuses/components/EstimateRequestStatusesList';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
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
    flag: 'completed',
    total_request: 0,
  },
];

function adapter(): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) => {
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

    return Promise.resolve({
      data: responseBody,
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    });
  };
}

describe('Estimate Request Statuses list', () => {
  beforeEach(() => {
    setSession({ accessToken: 'test-only', csrfToken: 'test-only' });
    resetApiStatus();
    http.defaults.adapter = adapter();
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
    expect(screen.queryByRole('button', { name: 'Delete Cancelled' })).toBeNull();
    expect(screen.getByRole('link', { name: 'New Status' }).getAttribute('href')).toBe(
      '/setup/estimate_request-statuses/new',
    );
    expect(container.querySelector('a[href="/setup/estimate_request-statuses/2"]')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Actions for Processing' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit Processing' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Delete Processing' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit Processing' }));
    expect(push).toHaveBeenCalledWith('/setup/estimate_request-statuses/2');
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen } from '@/test/render';
import { EstimateRequestStatusesList } from '../EstimateRequestStatusesList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const LIST = {
  data: [
    {
      id: '7',
      name: 'Approved',
      color: '#008000',
      statusorder: 2,
      flag: null,
      total_request: 3,
    },
  ],
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: 1,
    rangeStart: 1,
    exportLimit: 10_000,
    printLimit: 1_000,
  },
};

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('EstimateRequestStatusesList', () => {
  it('renders estimate request statuses and their request totals', async () => {
    http.defaults.adapter = fakeAdapter(200, LIST).adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
    );

    expect(await screen.findByText('Approved')).toBeTruthy();
    expect(screen.getByText('Total 3')).toBeTruthy();
  });
});
