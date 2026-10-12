// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type {
  CurrenciesLockUsage,
  CurrenciesRow,
  CurrenciesUsage,
} from '@/features/currencies/schemas/currencies.schema';
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
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import { CurrenciesList, GuardedCurrenciesList } from '../CurrenciesList';

/**
 * The list screen on `ListPageTemplate` (UIK-06). The template's own tests cover the URL state, the
 * search, the pager and the export mechanics; these cover what the SCREEN decides: Perfex's two
 * columns (Currency Code with the base label under the base row's code, Symbol), the labelled Edit,
 * Make base currency (a non-base row only) and Delete, the delete refused up front from the row's
 * 24 delete groups (D-40), the base flag (D-38) or another module's registered use (D-41), the
 * make-base refused up front when the row says it cannot be the base (D-39), the live refusals of
 * both (the list asked again), one `it` per state of the UI-SPEC, codes and symbols rendered as text
 * (T-4.1-159), and the administrator-only guard. The transport is a fake axios adapter on the
 * shared instance, so the real read and write paths run.
 */
const EN = en.currencies;
const AR = ar.currencies;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/currencies';
const EXPORT = '/api/v1/currencies/export';
const IN_USE = 'ERP-CURRENCIES-0001';
const BASE = 'ERP-CURRENCIES-0002';
const OTHER_MODULE = 'ERP-CURRENCIES-0003';
const BASE_LOCKED = 'ERP-CURRENCIES-0004';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/currencies',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const NO_USE: CurrenciesUsage = {
  invoices: 0,
  expenses: 0,
  proposals: 0,
  estimates: 0,
  customers: 0,
  creditNotes: 0,
  subscriptions: 0,
  purchaseOrders: 0,
  purchaseRequests: 0,
  purchaseQuotations: 0,
  purchaseInvoices: 0,
  debitNotes: 0,
  fafRequests: 0,
  vendors: 0,
  goodsReceipts: 0,
  goodsDeliveries: 0,
  packingLists: 0,
  orderReturns: 0,
  fixedEquipmentCarts: 0,
  payslipsFrom: 0,
  payslipsTo: 0,
  purchaseConvertedFrom: 0,
  purchaseConvertedTo: 0,
  fixedEquipmentLocations: 0,
};
const NO_LOCK: CurrenciesLockUsage = { exchangeRates: 0, exchangeRateLogs: 0, payslipCodes: 0 };
const currency = (
  id: string,
  name: string,
  symbol: string,
  {
    isBase = false,
    usage = {},
    lockUsage = {},
    registeredUsage = {},
    canMakeBase = !isBase,
  }: {
    isBase?: boolean;
    usage?: Partial<CurrenciesUsage>;
    lockUsage?: Partial<CurrenciesLockUsage>;
    registeredUsage?: Record<string, number>;
    canMakeBase?: boolean;
  } = {},
): CurrenciesRow => ({
  id,
  name,
  symbol,
  decimalSeparator: '.',
  thousandSeparator: ',',
  placement: 'before',
  isBase,
  usage: { ...NO_USE, ...usage },
  lockUsage: { ...NO_LOCK, ...lockUsage },
  registeredUsage,
  canMakeBase,
});
const USD = currency('1', 'USD', '$', { isBase: true });
const EUR = currency('2', 'EUR', '€', { usage: { invoices: 2, payslipsTo: 1 } });
const GBP = currency('3', 'GBP', '£');
const JPY = currency('4', 'JPY', 'JP¥', { registeredUsage: { samples: 3 } });
const CHF = currency('5', 'CHF', 'Fr.', { lockUsage: { exchangeRates: 4 } });
const SAR = currency('6', 'SAR', 'SR', { canMakeBase: false });
const BOLD = currency('7', '<b>', '<b>x</b>');
const OTHER = currency('8', 'OMR', 'OMR', { registeredUsage: { rentals: 2 } });
const EVERY = currency('9', 'ALL', 'L', {
  usage: Object.fromEntries(Object.keys(NO_USE).map((group) => [group, 1])),
});

const page = (rows: readonly CurrenciesRow[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: 10_000,
    printLimit: 1_000,
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
let api: { me: Reply; list: Reply; remove: Reply; base: Reply; exported: Reply };
let requests: { readonly method: string; readonly url: URL; readonly data: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  const data: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  requests.push({ method, url, data });
  const reply =
    url.pathname === '/api/v1/auth/me'
      ? api.me
      : url.pathname === EXPORT
        ? api.exported
        : method === 'DELETE'
          ? api.remove
          : method === 'PATCH'
            ? api.base
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

const listReads = () => requests.filter((r) => r.method === 'GET' && r.url.pathname === LIST);
const deletes = () => requests.filter((r) => r.method === 'DELETE');
const makeBases = () => requests.filter((r) => r.method === 'PATCH');

const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };
/**
 * The app's ONE cache: `revalidateLists` (the G8 refresh after a 404 or 409) writes through the
 * global cache, as the app's `SwrProvider` has it, so a test of it renders here with a `q` no other
 * test uses.
 */
const GLOBAL: SWRConfiguration = { shouldRetryOnError: false, dedupingInterval: 0 };

/** A private SWR cache by default, no automatic retry, and a URL with memory, as a browser has. */
function show(
  ui: ReactElement,
  {
    searchParams = '',
    locale,
    swr = ISOLATED,
  }: { searchParams?: string; locale?: 'ar'; swr?: SWRConfiguration } = {},
) {
  return renderWithProviders(
    <SWRConfig value={swr}>
      {ui}
      <Toaster />
    </SWRConfig>,
    { searchParams, hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

// Harness order (RESEARCH Pitfall 9): the session first; unmount BEFORE the session is cleared.
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(true) },
    list: { status: HTTP_OK, body: page([USD, EUR, GBP, JPY, CHF, SAR]) },
    remove: { status: NO_CONTENT },
    base: { status: HTTP_OK, body: { id: '3', isBase: true } },
    exported: { status: HTTP_OK, body: new Blob(['name\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/currencies');
});
afterEach(() => {
  // sonner keeps its toasts in a module store: one test's toast must not show in the next.
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

const table = () => screen.findByTestId('list-table');
/** The code link of a row: the base row's link also reads Perfex's base label. */
const linkOf = (code: string): HTMLElement =>
  screen.getByRole('link', {
    name: (accessible) =>
      accessible === code || accessible === `${code} ${EN.base_currency_string}`,
  });
const row = (code: string): HTMLElement => {
  const tr = linkOf(code).closest('tr');
  if (tr === null) throw new Error(`no row for ${code}`);
  return tr;
};
const inline = (code: string) => within(within(row(code)).getByTestId('row-actions-inline'));
const dialog = () => screen.findByTestId('confirm-dialog');
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
/** Opens the delete of one currency; by default GBP, which nothing uses. */
async function openDelete(user = userEvent.setup(), one: CurrenciesRow = GBP) {
  await table();
  await user.click(inline(one.name).getByRole('button', { name: `Delete currency ${one.name}` }));
  return { user, open: await dialog() };
}
/** Opens the make-base of one currency; by default GBP, which can become the base. */
async function openMakeBase(user = userEvent.setup(), one: CurrenciesRow = GBP) {
  await table();
  await user.click(
    inline(one.name).getByRole('button', { name: `Make ${one.name} the base currency` }),
  );
  return { user, open: await dialog() };
}
/** The dialog's usage lines, one block span each. */
const linesOf = (open: HTMLElement): (string | null)[] =>
  [...open.querySelectorAll('[data-slot="alert-dialog-description"] > span')].map(
    (span) => span.textContent,
  );
/** The dialog's body (its description). */
const bodyOf = (open: HTMLElement): string | null | undefined =>
  open.querySelector('[data-slot="alert-dialog-description"]')?.textContent;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('CurrenciesList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<CurrenciesList />);
    const skeleton = await screen.findByTestId('list-loading');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    for (const id of ['list-empty', 'list-no-results', 'list-error', 'list-table']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(document.body.textContent).not.toContain(EN.empty_heading);
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Loading behind the guards: the skeleton while /me is unknown, never "no access"', async () => {
    api.me = 'pending';
    show(<GuardedCurrenciesList />);
    await settle();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('list-empty')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });

  it('Empty: "No currencies yet" and New Currency to /setup/currencies/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<CurrenciesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.empty_heading);
    expect(empty.textContent).toContain(EN.empty_body);
    const create = within(empty).getByRole('link', { name: EN.new_currency });
    expect(create.getAttribute('href')).toBe('/setup/currencies/new');
  });

  it('NoResults: no rows for "zz": "No currencies match “zz”" with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<CurrenciesList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe('No currencies match “zz”');
    expect(empty.textContent).toContain(EN.no_match_body);
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });

  it('Error: a 503 says the list could not load, in plain language with the plural noun, and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<CurrenciesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_currencies),
    );
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it("Loaded: the title, then Perfex's Currency Code and Symbol columns and the row actions; the code is the link; both sort; no checkbox column", async () => {
    show(<CurrenciesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.currencies);
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      EN.currency_list_name,
      EN.currency_list_symbol,
      COMMON.actions,
    ]);
    expect(linkOf('EUR').getAttribute('href')).toBe('/setup/currencies/2');
    expect(within(row('EUR')).getByText('€')).toBeTruthy();
    const sortable = within(list).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.currency_list_name}`,
      `Sort by ${EN.currency_list_symbol}`,
    ]);
    // No bulk actions (D-16): no checkbox anywhere, no selection bar.
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
    // The usage is never a column.
    expect(list.textContent).not.toContain('use this currency');
  });

  it("BaseRow: the base row's code shows Perfex's base label under it, as small muted text; no other row does", async () => {
    show(<CurrenciesList />);
    await table();
    const labels = screen.getAllByTestId('currency-base');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe(EN.base_currency_string);
    expect(labels[0]?.className).toContain('text-xs');
    expect(labels[0]?.className).toContain('text-muted-foreground');
    expect(row('USD').contains(labels[0] ?? null)).toBe(true);
    expect(within(row('EUR')).queryByTestId('currency-base')).toBeNull();
  });

  it("the default order is the api's (the code descending): the first read carries no sort and no header shows an arrow (G6)", async () => {
    show(<CurrenciesList />);
    const list = await table();
    expect(listReads()[0]?.url.searchParams.get('sort')).toBeNull();
    const sorts = within(list)
      .getAllByRole('columnheader')
      .map((th) => th.getAttribute('aria-sort'));
    expect(sorts).not.toContain('ascending');
    expect(sorts).not.toContain('descending');
  });

  it('two currencies with the same code are both listed, as Perfex allows', async () => {
    api.list = {
      status: HTTP_OK,
      body: page([currency('21', 'AED', 'AED'), currency('20', 'AED', 'Dh')]),
    };
    show(<CurrenciesList />);
    await table();
    const links = screen.getAllByRole('link', { name: 'AED' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/setup/currencies/21',
      '/setup/currencies/20',
    ]);
  });
});

describe('CurrenciesList: codes and symbols are text only (T-4.1-159)', () => {
  it('the code "<b>" and the symbol "<b>x</b>" show as typed in the list and the dialogs, and no element is created from them', async () => {
    api.list = { status: HTTP_OK, body: page([BOLD]) };
    const scriptsBefore = document.querySelectorAll('script').length;
    const user = userEvent.setup();
    show(<CurrenciesList />);
    const list = await table();
    expect(linkOf('<b>')).toBeTruthy();
    expect(within(row('<b>')).getByText('<b>x</b>')).toBeTruthy();
    const { open } = await openDelete(user, BOLD);
    expect(within(open).getByRole('heading').textContent).toBe('Delete currency <b>?');
    await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    const base = await openMakeBase(user, BOLD);
    expect(within(base.open).getByRole('heading').textContent).toBe('Make <b> the base currency?');
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    expect(document.querySelector('b')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
  });
});

describe('CurrenciesList: labelled row actions (UI-SPEC List)', () => {
  it('Edit is a filled button "Edit EUR"; Make base currency is a quiet button "Make EUR the base currency"; Delete is a red ghost button with the trash icon after a separator, "Delete currency EUR"', async () => {
    show(<CurrenciesList />);
    await table();
    const actions = inline('EUR');
    const edit = actions.getByRole('button', { name: 'Edit EUR' });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const makeBase = actions.getByRole('button', { name: 'Make EUR the base currency' });
    expect(makeBase.textContent).toBe(EN.make_base_currency);
    expect(makeBase.getAttribute('data-variant')).toBe('ghost');
    expect(makeBase.className).not.toContain('text-destructive');
    const remove = actions.getByRole('button', { name: 'Delete currency EUR' });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.getAttribute('data-variant')).toBe('ghost');
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.previousElementSibling?.getAttribute('data-slot')).toBe('separator');
  });

  it('the base row offers no Make base currency (as Perfex shows no star on it)', async () => {
    show(<CurrenciesList />);
    await table();
    const names = inline('USD')
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['Edit USD', 'Delete currency USD']);
  });

  it('Mobile: below md the three are in the kebab "Actions for EUR": Edit, Make base currency, then Delete in the destructive variant after a separator', async () => {
    const user = userEvent.setup();
    show(<CurrenciesList />);
    await table();
    await user.click(within(row('EUR')).getByRole('button', { name: 'Actions for EUR' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit EUR',
      'Make EUR the base currency',
      'Delete currency EUR',
    ]);
    expect(items[2]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[2]?.previousElementSibling?.getAttribute('role')).toBe('separator');
  });

  it('the code link opens the record and records the list URL for the way back (D-28, D-35)', async () => {
    window.history.replaceState(null, '', '/setup/currencies?q=gb');
    show(<CurrenciesList />, { searchParams: '?q=gb' });
    await table();
    const link = linkOf('GBP');
    expect(link.getAttribute('href')).toBe('/setup/currencies/3');
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(sessionStorage.getItem('erp.list.return:/setup/currencies')).toContain(
      '/setup/currencies?q=gb',
    );
  });

  it('Edit records the list URL, seeds the form from the row and opens /setup/currencies/2', async () => {
    window.history.replaceState(null, '', '/setup/currencies?q=eu');
    show(<CurrenciesList />, { searchParams: '?q=eu' });
    await table();
    await userEvent.click(inline('EUR').getByRole('button', { name: 'Edit EUR' }));
    expect(push).toHaveBeenCalledWith('/setup/currencies/2');
    expect(sessionStorage.getItem('erp.list.return:/setup/currencies')).toContain(
      '/setup/currencies?q=eu',
    );
  });
});

describe('CurrenciesList: Make base currency (D-39)', () => {
  it('MakeBaseConfirm: "Make GBP the base currency?" with what it changes, Keep the current base / Make base currency (enabled, never red), focus on Keep, and nothing sent yet', async () => {
    show(<CurrenciesList />);
    const { open } = await openMakeBase();
    expect(within(open).getByRole('heading').textContent).toBe('Make GBP the base currency?');
    expect(bodyOf(open)).toBe(EN.make_base_body);
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe(EN.make_base_keep);
    expect(confirm.textContent).toBe(EN.make_base_currency);
    expect(confirm.getAttribute('data-variant')).not.toBe('destructive');
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(makeBases()).toHaveLength(0);
  });

  it("confirming PATCHes {} once to /api/v1/currencies/3/base; the 200 toasts Perfex's base_currency_set, closes the dialog and the list pages ask again (two rows change)", async () => {
    show(<CurrenciesList />);
    const { user, open } = await openMakeBase();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(makeBases().map((r) => [r.url.pathname, r.data])).toEqual([
      ['/api/v1/currencies/3/base', {}],
    ]);
    expect(await screen.findByText(EN.base_currency_set)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('MakeBaseRefused: a row that cannot be the base (the current base has transactions) shows the ERP-CURRENCIES-0004 refusal from the start, a disabled confirm, and NEVER sends a PATCH', async () => {
    show(<CurrenciesList />);
    const { user, open } = await openMakeBase(undefined, SAR);
    const refusal = within(open).getByTestId('confirm-dialog-error');
    expect(refusal.textContent).toBe(EN.errors[BASE_LOCKED]);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.click(confirm);
    await settle();
    expect(makeBases()).toHaveLength(0);
  });

  it.each([
    ['a live 409 ERP-CURRENCIES-0004', CONFLICT, BASE_LOCKED, 'base-409'],
    ['a 404 (deleted meanwhile)', NOT_FOUND, 'ERP-CORE-0004', 'base-404'],
  ])(
    '%s stays inside the dialog in the feature words, the confirm disabled, never retried, and the list pages ask again (G8)',
    async (_name, status, code, q) => {
      api.base = { status, body: problem(status, code) };
      window.history.replaceState(null, '', `/setup/currencies?q=${q}`);
      show(<CurrenciesList />, { searchParams: `?q=${q}`, swr: GLOBAL });
      const { user, open } = await openMakeBase();
      await settle();
      const before = listReads().length;
      await user.click(within(open).getByTestId('confirm-dialog-confirm'));
      const error = await screen.findByTestId('confirm-dialog-error');
      expect(error.textContent).toBe(EN.errors[code as keyof typeof EN.errors]);
      const confirm = screen.getByTestId('confirm-dialog-confirm');
      expect(confirm.hasAttribute('disabled')).toBe(true);
      await user.click(confirm);
      expect(makeBases()).toHaveLength(1);
      await waitFor(() => {
        expect(listReads().length).toBeGreaterThan(before);
      });
    },
  );
});

describe('CurrenciesList: Delete (D-38, D-40, D-41, D-28, D-25.1, UI-SPEC G8)', () => {
  it('DeleteConfirm: a currency nothing uses: "Delete currency GBP?", "This cannot be undone.", Keep / Delete (destructive, trash icon, enabled), focus on Keep', async () => {
    show(<CurrenciesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete currency GBP?');
    expect(bodyOf(open)).toBe(EN.delete_body);
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe('Keep currency');
    expect(confirm.textContent).toBe('Delete currency');
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; the 204 toasts "Currency deleted", closes the dialog and the list pages ask again', async () => {
    show(<CurrenciesList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/currencies/3']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('DeleteInUse: a currency 2 invoices and 1 payslip paid in it use shows exactly those two lines in group order, the ERP-CURRENCIES-0001 refusal from the start, a disabled Delete, and NEVER sends a DELETE', async () => {
    show(<CurrenciesList />);
    const { user, open } = await openDelete(undefined, EUR);
    expect(within(open).getByRole('heading').textContent).toBe('Delete currency EUR?');
    expect(linesOf(open)).toEqual([
      '2 invoices use this currency.',
      '1 payslip is paid in this currency.',
    ]);
    expect(bodyOf(open)).not.toContain(EN.delete_body);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(EN.errors[IN_USE]);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(within(open).getByTestId('confirm-dialog-dismiss'));
    await user.click(confirm);
    await settle();
    expect(deletes()).toHaveLength(0);
  });

  it('DeleteBase: the base currency nothing uses shows the ERP-CURRENCIES-0002 refusal from the start, no "cannot be undone" line, a disabled Delete, and NEVER sends a DELETE', async () => {
    show(<CurrenciesList />);
    const { user, open } = await openDelete(undefined, USD);
    expect(linesOf(open)).toEqual([]);
    expect(bodyOf(open) ?? '').not.toContain(EN.delete_body);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(EN.errors[BASE]);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.click(confirm);
    await settle();
    expect(deletes()).toHaveLength(0);
  });

  it('DeleteRegisteredUse: a non-base currency another module registered 3 uses for shows the line and the ERP-CURRENCIES-0003 refusal, and NEVER sends a DELETE (D-41)', async () => {
    show(<CurrenciesList />);
    const { user, open } = await openDelete(undefined, JPY);
    expect(linesOf(open)).toEqual(['3 records elsewhere in the application use this currency.']);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(
      EN.errors[OTHER_MODULE],
    );
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await settle();
    expect(deletes()).toHaveLength(0);
  });

  it('a registered use under a key this screen does not know reads in general words, and refuses with ERP-CURRENCIES-0003', async () => {
    api.list = { status: HTTP_OK, body: page([OTHER]) };
    show(<CurrenciesList />);
    const { open } = await openDelete(undefined, OTHER);
    expect(linesOf(open)).toEqual(['2 records elsewhere in the application use this currency.']);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(
      EN.errors[OTHER_MODULE],
    );
  });

  it('exchange rates never block a delete (D-40): a currency only 4 exchange rates name deletes', async () => {
    show(<CurrenciesList />);
    const { user, open } = await openDelete(undefined, CHF);
    expect(bodyOf(open)).toBe(EN.delete_body);
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/currencies/5']);
  });

  it('every one of the 24 delete groups has its line, in the api order', async () => {
    api.list = { status: HTTP_OK, body: page([EVERY]) };
    show(<CurrenciesList />);
    const { open } = await openDelete(undefined, EVERY);
    expect(linesOf(open)).toEqual([
      '1 invoice uses this currency.',
      '1 expense uses this currency.',
      '1 proposal uses this currency.',
      '1 estimate uses this currency.',
      '1 customer uses this currency.',
      '1 credit note uses this currency.',
      '1 subscription uses this currency.',
      '1 purchase order uses this currency.',
      '1 purchase request uses this currency.',
      '1 purchase quotation uses this currency.',
      '1 purchase invoice uses this currency.',
      '1 debit note uses this currency.',
      '1 FAF request uses this currency.',
      '1 vendor uses this currency.',
      '1 goods receipt uses this currency.',
      '1 goods delivery note uses this currency.',
      '1 packing list uses this currency.',
      '1 order return uses this currency.',
      '1 fixed equipment cart uses this currency.',
      '1 payslip is converted from this currency.',
      '1 payslip is paid in this currency.',
      '1 purchase document is converted from this currency.',
      '1 purchase document is converted to this currency.',
      '1 fixed equipment location uses this currency.',
    ]);
    expect(deletes()).toHaveLength(0);
  });

  it('under ar the counts keep Western digits', async () => {
    show(<CurrenciesList />, { locale: 'ar' });
    await table();
    const remove = within(within(row('EUR')).getByTestId('row-actions-inline'))
      .getAllByRole('button')
      .at(-1);
    if (remove === undefined) throw new Error('no delete button');
    await userEvent.click(remove);
    const body = (await dialog()).querySelector('[data-slot="alert-dialog-description"]');
    expect(body?.textContent).toContain('2');
    expect(body?.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('every use message is an ICU plural on count whose number is the formatted countN, never #, in both packs', () => {
    for (const pack of [EN, AR]) {
      const messages = Object.entries(pack)
        .filter(([key]) => key.startsWith('in_use_') || key.startsWith('code_used_by_'))
        .map(([, value]) => value);
      expect(messages).toHaveLength(28);
      for (const message of messages) {
        expect(message).toMatch(/^\{count, plural, /);
        expect(message).toContain('{countN}');
        expect(message).toContain('other {');
        expect(message).not.toContain('#');
      }
    }
  });

  it.each([
    ['DeleteRefused: the race, a live 409 ERP-CURRENCIES-0001', CONFLICT, IN_USE, 'race-0001'],
    ['a live 409 ERP-CURRENCIES-0002 (made the base meanwhile)', CONFLICT, BASE, 'race-0002'],
    [
      'a live 409 ERP-CURRENCIES-0003 (a registered use added meanwhile)',
      CONFLICT,
      OTHER_MODULE,
      'race-0003',
    ],
    ['a 404 (deleted by someone else)', NOT_FOUND, 'ERP-CORE-0004', 'gone-404'],
  ])(
    '%s: the text inside the dialog, Delete disabled, a second click sends nothing, and the list pages ask again (G8)',
    async (_name, status, code, q) => {
      api.remove = { status, body: problem(status, code) };
      window.history.replaceState(null, '', `/setup/currencies?q=${q}`);
      show(<CurrenciesList />, { searchParams: `?q=${q}`, swr: GLOBAL });
      const { user, open } = await openDelete();
      await settle();
      const before = listReads().length;
      await user.click(within(open).getByTestId('confirm-dialog-confirm'));
      const error = await screen.findByTestId('confirm-dialog-error');
      expect(error.textContent).toBe(EN.errors[code as keyof typeof EN.errors]);
      const confirm = screen.getByTestId('confirm-dialog-confirm');
      expect(confirm.hasAttribute('disabled')).toBe(true);
      await user.click(confirm);
      expect(deletes()).toHaveLength(1);
      await waitFor(() => {
        expect(listReads().length).toBeGreaterThan(before);
      });
      await user.click(screen.getByTestId('confirm-dialog-dismiss'));
      await closed();
    },
  );

  it('DeleteRetryable: a network failure: the common network text, Delete still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    show(<CurrenciesList />);
    const { user, open } = await openDelete();
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(COMMON.errors['ERP-NETWORK-0001']);
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(false);
    api.remove = { status: NO_CONTENT };
    await user.click(confirm);
    await closed();
    expect(deletes()).toHaveLength(2);
  });

  it('no bare Confirm, Cancel, Save or Close label renders', async () => {
    show(<CurrenciesList />);
    await openDelete();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    for (const bare of ['Confirm', 'Cancel', 'Save', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('CurrenciesList: the toolbar (D-12, D-26, D-42, ADR-0043)', () => {
  it('typing "eu" searches the api (q=eu), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<CurrenciesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'eu');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('eu');
    });
    expect(listReads().map((r) => r.url.searchParams.get('q'))).not.toContain('e');
  });

  it('the Export menu offers CSV, Excel, PDF and Print; CSV sends the code, the symbol and the base flag with their translated labels, in the api order', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<CurrenciesList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    for (const format of [
      COMMON.dt_button_csv,
      COMMON.dt_button_excel,
      COMMON.dt_button_pdf,
      COMMON.dt_button_print,
    ]) {
      expect(await screen.findByRole('menuitem', { name: format })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((r) => r.url.pathname === EXPORT);
    expect(sent?.url.searchParams.get('format')).toBe('csv');
    expect(sent?.url.searchParams.getAll('column')).toEqual(['name', 'symbol', 'isBase']);
    expect(sent?.url.searchParams.getAll('header')).toEqual([
      EN.currency_list_name,
      EN.currency_list_symbol,
      EN.base_currency_string,
    ]);
  });

  it('New Currency links to /setup/currencies/new', async () => {
    show(<CurrenciesList />);
    await table();
    expect(screen.getByRole('link', { name: EN.new_currency }).getAttribute('href')).toBe(
      '/setup/currencies/new',
    );
  });
});

describe('GuardedCurrenciesList: the gate is ADMIN_GATE (D-06, D-38)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedCurrenciesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('anyone else is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedCurrenciesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });
});

describe('CurrenciesList: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack title and no physical-direction class', async () => {
    const { container } = show(<CurrenciesList />, { locale: 'ar' });
    await table();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(AR.currencies);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
