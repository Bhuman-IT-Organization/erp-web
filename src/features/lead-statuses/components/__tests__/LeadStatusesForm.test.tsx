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
import { LeadStatusesForm } from '../LeadStatusesForm';

const EN = en['lead-statuses'];

const RECORD = {
  id: '7',
  name: 'Interested',
  statusorder: 2,
  color: '#28B8DA',
  isdefault: 0,
  isConfiguredDefault: false,
  usage: {
    leads: 0,
    lastLeadStatus: 0,
    emailIntegration: 0,
    webToLead: 0,
  },
};

const push = vi.fn<(href: string) => void>();

vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/lead-statuses/new',
  useRouter: () => ({
    push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

let record: Reply;
let save: Reply;

let requests: {
  method: string;
  path: string;
  data: unknown;
}[];

function respond(config: InternalAxiosRequestConfig) {
  const path = new URL(http.getUri(config), 'http://erp.invalid').pathname;

  const method = (config.method ?? 'get').toUpperCase();

  const data: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;

  requests.push({ method, path, data });

  const answer = method === 'GET' ? record : save;

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

function show(id: string | null) {
  return renderWithProviders(
    <SWRConfig
      value={{
        provider: () => new Map(),
        shouldRetryOnError: false,
      }}
    >
      <LeadStatusesForm id={id} />
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

  record = {
    status: 200,
    body: RECORD,
  };

  save = {
    status: 201,
    body: { ...RECORD, name: 'New status' },
  };

  requests = [];
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

const inputName = () =>
  screen.findByRole('textbox', {
    name: EN.status_name,
  });

describe('LeadStatusesForm', () => {
  it('shows the create form without fetching a record', async () => {
    show(null);

    const input = await inputName();

    expect(input.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText(EN.order)).toBeTruthy();

    expect(requests.filter((request) => request.method === 'GET')).toEqual([]);
  });

  it('rejects a whitespace-only name', async () => {
    show(null);

    const user = userEvent.setup();
    const input = await inputName();

    await user.type(input, '   ');

    await user.click(
      screen.getByRole('button', {
        name: 'Create lead status',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });

    expect(requests.filter((request) => request.method === 'POST')).toEqual([]);
  });

  it('creates a status after confirmation', async () => {
    show(null);

    const user = userEvent.setup();

    await user.type(await inputName(), 'New status');

    await user.click(
      screen.getByRole('button', {
        name: 'Create lead status',
      }),
    );

    const dialog = await screen.findByTestId('confirm-dialog');

    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.path === '/api/v1/lead-statuses')).toBe(
        true,
      );
    });

    const post = requests.find((r) => r.method === 'POST');

    expect(post?.data).toEqual({
      name: 'New status',
      color: '#28B8DA',
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/lead-statuses', { scroll: false });
    });
  });

  it('loads existing status data for editing', async () => {
    show('7');

    await waitFor(() => {
      const input = screen.getByRole('textbox', {
        name: EN.status_name,
      });

      expect(input).toHaveProperty('value', 'Interested');
    });

    expect(
      requests.filter((request) => request.method === 'GET').map((request) => request.path),
    ).toEqual(['/api/v1/lead-statuses/7']);
  });

  it('shows the loading state while fetching a status', () => {
    record = 'pending';

    show('7');

    expect(
      screen.queryByRole('textbox', {
        name: EN.status_name,
      }),
    ).toBeNull();
  });
});
