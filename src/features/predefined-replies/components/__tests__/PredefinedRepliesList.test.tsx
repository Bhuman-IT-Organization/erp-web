// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PredefinedReplies } from '@/features/predefined-replies/schemas/predefined-replies.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, within } from '@/test/render';
import en from '../../messages/en.json';
import { PredefinedRepliesList, GuardedPredefinedRepliesList } from '../PredefinedRepliesList';

const EN = en['predefined-replies'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const SERVICE_UNAVAILABLE = 503;
const LIST = '/api/v1/predefined-replies';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/predefined-replies',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const ROWS: readonly PredefinedReplies[] = [
  { id: 'a1', name: 'Alpha', message: 'First reply' },
  { id: 'b2', name: 'Beta', message: 'Second reply' },
];

const page = (rows: readonly PredefinedReplies[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: 10_000,
  },
});

const me = (isAdmin: boolean) => ({
  staffId: 1,
  email: 'someone@example.invalid',
  firstName: 'Some',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions: [],
  locale: null,
});

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

let api: { me: Reply; list: Reply };
let requests: URL[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push(url);

  const reply = url.pathname === '/api/v1/auth/me' ? api.me : api.list;

  if (reply === 'pending') return new Promise<never>(() => undefined);

  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(),
    config,
  };

  if (reply.status < 300) return Promise.resolve(response);

  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

function show(ui: ReactElement, locale?: 'ar') {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];

  api = {
    me: { status: HTTP_OK, body: me(true) },
    list: { status: HTTP_OK, body: page(ROWS) },
  };

  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/predefined-replies');
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

describe('PredefinedRepliesList: the four states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no message while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<PredefinedRepliesList />);

    const skeleton = await screen.findByTestId('list-loading');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');

    for (const id of ['list-empty', 'list-no-results', 'list-error', 'list-table']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
  });

  it('Empty: shows the empty state and links to create a predefined reply', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<PredefinedRepliesList />);

    const empty = await screen.findByTestId('list-empty');
    expect(empty.textContent).toContain(EN.empty_heading);

    const create = within(empty).getByRole('link', { name: EN.new_predefined_reply });
    expect(create.getAttribute('href')).toBe('/setup/predefined-replies/new');
  });

  it('Error: a 503 shows a plain-language error and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };

    show(<PredefinedRepliesList />);

    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_predefined_replies),
    );
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it('Loaded: Name links to the record and is the only sortable column', async () => {
    show(<PredefinedRepliesList />);

    const table = await screen.findByTestId('list-table');

    expect(screen.getByRole('link', { name: 'Alpha' }).getAttribute('href')).toBe(
      '/setup/predefined-replies/a1',
    );

    expect(within(table).queryByText('First reply')).toBeNull();
    expect(within(table).queryByText('Second reply')).toBeNull();

    const sortable = within(table).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((button) => button.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.predefined_replies_dt_name}`,
    ]);
  });
});

describe('GuardedPredefinedRepliesList: the generated gate is ADMIN_GATE (fail closed)', () => {
  it('an administrator sees the list', async () => {
    api.me = { status: HTTP_OK, body: me(true) };

    show(<GuardedPredefinedRepliesList />);

    expect(await screen.findByTestId('list-table')).toBeTruthy();
    expect(requests.some((url) => url.pathname === LIST)).toBe(true);
  });

  it('anyone else is refused and the list is never requested', async () => {
    api.me = { status: HTTP_OK, body: me(false) };

    show(<GuardedPredefinedRepliesList />);

    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(requests.some((url) => url.pathname === LIST)).toBe(false);
  });
});

describe('PredefinedRepliesList: Arabic (FE-20)', () => {
  it('renders under ar with no physical-direction class', async () => {
    const { container } = show(<PredefinedRepliesList />, 'ar');

    await screen.findByTestId('list-table');

    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
