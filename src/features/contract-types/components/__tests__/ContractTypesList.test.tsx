// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractTypes } from '@/features/contract-types/schemas/contract-types.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import en from '../../messages/en.json';
import { ContractTypesList, GuardedContractTypesList } from '../ContractTypesList';

/**
 * The list screen on `ListPageTemplate` (UIK-06). The template's own tests cover the URL state, the
 * search, the pager and the export mechanics; these cover what the SCREEN decides: its columns,
 * its create and export actions, one `it` per FE-27 state, and the guard, whose gate is the
 * generated `ADMIN_GATE`. The transport is a fake axios adapter on the shared instance.
 */
const EN = en['contract-types'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const SERVICE_UNAVAILABLE = 503;
const LIST = '/api/v1/contract-types';
const EXPORT = '/api/v1/contract-types/export';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/contract-types',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const NO_USE = {
  purchaseRequests: 0,
  purchaseOrders: 0,
  purchaseQuotations: 0,
  shippingCharges: 0,
  expenses: 0,
  assets: 0,
};

const ROWS: readonly ContractTypes[] = [
  { id: 'a1', name: 'Alpha', dateCreated: '2026-01-02T20:30:00.000Z', usage: NO_USE },
  { id: 'b2', name: 'Beta', dateCreated: '2026-02-03T08:00:00.000Z', usage: NO_USE },
];
const page = (rows: readonly ContractTypes[]) => ({
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
let api: { me: Reply; list: Reply; exported: Reply };
let requests: URL[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push(url);
  const reply =
    url.pathname === '/api/v1/auth/me' ? api.me : url.pathname === EXPORT ? api.exported : api.list;
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

/** A private SWR cache, no automatic retry, and a URL with memory, as a browser has. */
function show(ui: ReactElement, locale?: 'ar') {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

// Harness order (RESEARCH Pitfall 9): the session first; unmount BEFORE the session is cleared.
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(true) },
    list: { status: HTTP_OK, body: page(ROWS) },
    exported: { status: HTTP_OK, body: new Blob(['id\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/contract-types');
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

describe('ContractTypesList: the four states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no message while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<ContractTypesList />);
    const skeleton = await screen.findByTestId('list-loading');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    for (const id of ['list-empty', 'list-no-results', 'list-error', 'list-table']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
  });

  it('Empty: "No contract types yet" and the create button to /contract-types/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<ContractTypesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(empty.textContent).toContain(EN.empty_heading);
    const create = within(empty).getByRole('link', { name: EN.new_title });
    expect(create.getAttribute('href')).toBe('/setup/contract-types/new');
  });

  it('Error: a 503 says the list could not load, in plain language with the plural noun, and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<ContractTypesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_contract_types),
    );
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it('Loaded: Name is the link to the record and sorts; Created goes through the format door and does not sort', async () => {
    show(<ContractTypesList />);
    const table = await screen.findByTestId('list-table');
    expect(screen.getByRole('link', { name: 'Alpha' }).getAttribute('href')).toBe(
      '/setup/contract-types/a1',
    );
    // The Perfex default `Y-m-d`, the day in the deployment's zone (FE-26).
    expect(within(table).getByText('2026-01-03').tagName).toBe('TIME');
    const sortable = within(table).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.id}`,
      `Sort by ${EN.name}`,
    ]);
  });
});

describe('ContractTypesList: the toolbar (D-26, D-42)', () => {
  it('Export, then CSV, sends one translated label per column, in the api order', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<ContractTypesList />);
    await screen.findByTestId('list-table');
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(requests.some((url) => url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((url) => url.pathname === EXPORT);
    expect(sent?.searchParams.get('format')).toBe('csv');
    expect(sent?.searchParams.getAll('header')).toEqual([
      EN.id,
      EN.contract_type_name,
      EN.date_created,
    ]);
  });
});

describe('GuardedContractTypesList: the generated gate is ADMIN_GATE (fail closed)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedContractTypesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('anyone else is refused until the module declares its own view code, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedContractTypesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(requests.some((url) => url.pathname === LIST)).toBe(false);
  });
});

describe('ContractTypesList: Arabic (FE-20)', () => {
  it('renders under ar with no physical-direction class', async () => {
    const { container } = show(<ContractTypesList />, 'ar');
    await screen.findByTestId('list-table');
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
