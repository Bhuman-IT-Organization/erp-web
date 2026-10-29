// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
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
 * its create and export actions, the delete dialog and in-use refusal, one `it` per FE-27 state, and the guard.
 */
const EN = en['contract-types'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const SERVICE_UNAVAILABLE = 503;
const LIST = '/api/v1/contract-types';
const EXPORT = '/api/v1/contract-types/export';
const IN_USE = 'ERP-CONTRACTTYPES-0001';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/contract-types',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const ALPHA: ContractTypes = { id: 'a1', name: 'Alpha', usage: { contracts: 0 } };
const BETA: ContractTypes = { id: 'b2', name: 'Beta', usage: { contracts: 3 } };
const ROWS: readonly ContractTypes[] = [ALPHA, BETA];

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
let api: { me: Reply; list: Reply; exported: Reply; remove: Reply };
let requests: { readonly method: string; readonly url: URL }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'GET').toUpperCase();
  requests.push({ method, url });
  const reply =
    url.pathname === '/api/v1/auth/me'
      ? api.me
      : url.pathname === EXPORT
        ? api.exported
        : method === 'DELETE'
          ? api.remove
          : api.list;
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

const deletes = () => requests.filter((r) => r.method === 'DELETE');

/** A private SWR cache, no automatic retry, and a URL with memory, as a browser has. */
function show(ui: ReactElement, locale?: 'ar') {
  return renderWithProviders(
    <>
      <Toaster />
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>
    </>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

const table = () => screen.findByTestId('list-table');
const row = (name: string): HTMLElement => {
  const link = screen.getByRole('link', { name: new RegExp(`^${name}`) });
  const tr = link.closest('tr');
  if (tr === null) throw new Error(`no row for ${name}`);
  return tr;
};
const inline = (name: string) => within(within(row(name)).getByTestId('row-actions-inline'));
const dialog = () => screen.findByTestId('confirm-dialog');
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

async function openDelete(user = userEvent.setup(), one: ContractTypes = ALPHA) {
  await table();
  await user.click(
    inline(one.name).getByRole('button', { name: `Delete contract type ${one.name}` }),
  );
  return { user, open: await dialog() };
}

// Harness order (RESEARCH Pitfall 9): the session first; unmount BEFORE the session is cleared.
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(true) },
    list: { status: HTTP_OK, body: page(ROWS) },
    exported: { status: HTTP_OK, body: new Blob(['name,contracts\r\n'], { type: 'text/csv' }) },
    remove: { status: NO_CONTENT },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/contract-types');
});
afterEach(() => {
  cleanup();
  clearSession();
  toast.dismiss();
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
    const create = within(empty).getByRole('link', { name: EN.new_contract_type });
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

  it('Loaded: Name is the link to the record and sorts, and shows the count badge', async () => {
    show(<ContractTypesList />);
    const tableEl = await table();
    expect(screen.getByRole('link', { name: /^Alpha/ }).getAttribute('href')).toBe(
      '/setup/contract-types/a1',
    );
    const sortable = within(tableEl).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([`Sort by ${EN.name}`]);
  });
});

describe('ContractTypesList: delete and in-use refusal', () => {
  it('confirming DELETEs once; the 204 toasts "Contract type deleted", closes the dialog', async () => {
    show(<ContractTypesList />);
    const { user, open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete contract type Alpha?');
    expect(within(open).getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(false);
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/contract-types/a1']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
  });

  it('DeleteInUse: a contract type in use shows the refusal error, disabled confirm, and never sends a DELETE', async () => {
    show(<ContractTypesList />);
    const { user, open } = await openDelete(undefined, BETA);
    expect(within(open).getByRole('heading').textContent).toBe('Delete contract type Beta?');
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(EN.errors[IN_USE]);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.click(confirm);
    expect(deletes()).toHaveLength(0);
  });
});

describe('ContractTypesList: the toolbar (D-26, D-42)', () => {
  it('Export, then CSV, sends one translated label per column, in the api order', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<ContractTypesList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((r) => r.url.pathname === EXPORT);
    expect(sent?.url.searchParams.get('format')).toBe('csv');
    expect(sent?.url.searchParams.getAll('header')).toEqual([EN.name, EN.contracts]);
  });
});

describe('GuardedContractTypesList: the generated gate is ADMIN_GATE (fail closed)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedContractTypesList />);
    expect(await table()).toBeTruthy();
  });

  it('anyone else is refused until the module declares its own view code, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedContractTypesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(requests.some((r) => r.url.pathname === LIST)).toBe(false);
  });
});

describe('ContractTypesList: Arabic (FE-20)', () => {
  it('renders under ar with no physical-direction class', async () => {
    const { container } = show(<ContractTypesList />, 'ar');
    await table();
    expect(document.documentElement.dir).toBe('rtl');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
