// @vitest-environment happy-dom

import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';

import en from '../../messages/en.json';
import { LeadStatusesList } from '../LeadStatusesList';

const EN = en['lead-statuses'];

const push = vi.fn<(href: string) => void>();

vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/lead-statuses',
  useRouter: () => ({
    push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

function status(id: string, name: string, extra = {}) {
  return {
    id,
    name,
    statusorder: Number(id),
    color: '#28B8DA',
    isdefault: 0,
    isConfiguredDefault: false,
    usage: {
      leads: 0,
      emailIntegration: 0,
    },
    ...extra,
  };
}

const UNUSED = status('7', 'Interested');
const BUILT_IN = status('8', 'Customer', { isdefault: 1 });
const DEFAULT = status('9', 'Default', {
  isConfiguredDefault: true,
});
const USED = status('10', 'Working', {
  usage: { leads: 2, emailIntegration: 1 },
});

function page(rows: unknown[]) {
  return {
    data: rows,
    meta: {
      nextCursor: null,
      prevCursor: null,
      total: rows.length,
      rangeStart: rows.length ? 1 : 0,
      exportLimit: 10000,
      printLimit: 1000,
    },
  };
}

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

let list: Reply;
let deletion: Reply;
let requests: { method: string; path: string }[];

function respond(config: InternalAxiosRequestConfig) {
  const path = new URL(http.getUri(config), 'http://erp.invalid').pathname;

  const method = (config.method ?? 'get').toUpperCase();

  requests.push({ method, path });

  const answer = method === 'DELETE' ? deletion : list;

  if (answer === 'pending') {
    return new Promise<never>(() => undefined);
  }

  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(),
    config,
  };

  return answer.status < 300
    ? Promise.resolve(response)
    : Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

function show() {
  return renderWithProviders(
    <SWRConfig
      value={{
        provider: () => new Map(),
        shouldRetryOnError: false,
      }}
    >
      <LeadStatusesList />
    </SWRConfig>,
    { hasMemory: true },
  );
}

beforeEach(() => {
  setSession({
    accessToken: 'test',
    csrfToken: 'test',
  });

  resetApiStatus();

  list = {
    status: 200,
    body: page([UNUSED, BUILT_IN, DEFAULT, USED]),
  };

  deletion = { status: 204 };
  requests = [];

  http.defaults.adapter = respond;
  push.mockClear();

  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/lead-statuses');
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('LeadStatusesList', () => {
  it('shows loading while fetching statuses', async () => {
    list = 'pending';

    show();

    expect(await screen.findByTestId('list-loading')).toBeTruthy();
    expect(screen.queryByTestId('list-table')).toBeNull();
  });

  it('shows an empty state when no statuses exist', async () => {
    list = {
      status: 200,
      body: page([]),
    };

    show();

    const empty = await screen.findByTestId('list-empty');

    expect(empty.textContent).toContain(EN.empty_heading);

    const add = within(empty).getByRole('link', {
      name: EN.add_lead_status,
    });

    expect(add.getAttribute('href')).toBe('/setup/lead-statuses/new');
  });

  it('shows statuses and protects built-in and default statuses', async () => {
    show();

    await screen.findByTestId('list-table');

    expect(screen.getByRole('link', { name: 'Interested' })).toBeTruthy();

    expect(
      screen.getByRole('button', {
        name: 'Delete Interested',
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole('button', {
        name: 'Delete Customer',
      }),
    ).toBeNull();

    expect(
      screen.queryByRole('button', {
        name: 'Delete Default',
      }),
    ).toBeNull();
  });

  it('prevents deletion of a status currently in use', async () => {
    show();

    await screen.findByTestId('list-table');

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Delete Working',
      }),
    );

    const dialog = await screen.findByTestId('confirm-dialog');

    await waitFor(() => {
      expect(within(dialog).getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(
        true,
      );
    });

    expect(dialog.textContent).toContain('2');
    expect(dialog.textContent).toContain('1');

    expect(requests.filter((request) => request.method === 'DELETE')).toEqual([]);
  });
});
