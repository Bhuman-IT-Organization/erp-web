// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { TaxesRow, TaxesUsage } from '@/features/taxes/schemas/taxes.schema';
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
import { GuardedTaxesList, TaxesList } from '../TaxesList';

/**
 * The list screen on `ListPageTemplate` (UIK-06). The template's own tests cover the URL state, the
 * search, the pager and the export mechanics; these cover what the SCREEN decides: Perfex's three
 * columns, the labelled Edit and Delete, the delete refused up front from the row's nine usage
 * groups or live from the api (and the list asked again), one `it` per state of the UI-SPEC, the
 * names rendered as text (D-19, T-4.1-48), and the administrator-only guard. The transport is a fake
 * axios adapter on the shared instance, so the real read and write paths run.
 */
const EN = en.taxes;
const AR = ar.taxes;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/taxes';
const EXPORT = '/api/v1/taxes/export';
const IN_USE = 'ERP-TAXES-0001';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/taxes',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const NO_USE: TaxesUsage = {
  items: 0,
  expenses: 0,
  subscriptions: 0,
  vendorItems: 0,
  purchaseLines: 0,
  warehouseLines: 0,
  fixedEquipmentLines: 0,
  salesReturnLines: 0,
  accounting: 0,
};
const tax = (
  id: string,
  name: string,
  rate: string,
  usage: Partial<TaxesUsage> = {},
): TaxesRow => ({
  id,
  name,
  rate,
  usage: { ...NO_USE, ...usage },
  isDefault: false,
});
const ZERO = tax('8', 'Zero', '0.00');
const VAT = tax('7', 'VAT', '5.00', { items: 2, purchaseLines: 1 });
const REDUCED = tax('9', 'Reduced', '10.00', { expenses: 1 });
const FUEL = tax('11', 'Fuel < 50 km', '2.50');
const BOLD = tax('12', '<b>x</b>', '1.00');
const EVERY = tax('13', 'Every', '3.00', {
  items: 1,
  expenses: 1,
  subscriptions: 1,
  vendorItems: 1,
  purchaseLines: 1,
  warehouseLines: 1,
  fixedEquipmentLines: 1,
  salesReturnLines: 1,
  accounting: 1,
});
const MANY = tax('14', 'Many', '7.50', {
  items: 2,
  expenses: 3,
  subscriptions: 4,
  vendorItems: 5,
  purchaseLines: 6,
  warehouseLines: 7,
  fixedEquipmentLines: 8,
  salesReturnLines: 9,
  accounting: 10,
});

const page = (rows: readonly TaxesRow[]) => ({
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
let api: { me: Reply; list: Reply; remove: Reply; exported: Reply };
let requests: { readonly method: string; readonly url: URL }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
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

const listReads = () => requests.filter((r) => r.method === 'GET' && r.url.pathname === LIST);
const deletes = () => requests.filter((r) => r.method === 'DELETE');

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
    list: { status: HTTP_OK, body: page([ZERO, VAT, REDUCED]) },
    remove: { status: NO_CONTENT },
    exported: { status: HTTP_OK, body: new Blob(['id\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/taxes');
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
const row = (name: string): HTMLElement => {
  const link = screen.getByRole('link', { name });
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
/** Opens the delete of one tax; by default Zero, which nothing uses. */
async function openDelete(user = userEvent.setup(), one: TaxesRow = ZERO) {
  await table();
  await user.click(inline(one.name).getByRole('button', { name: `Delete tax ${one.name}` }));
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

describe('TaxesList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<TaxesList />);
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
    show(<GuardedTaxesList />);
    await settle();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('list-empty')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });

  it('Empty: "No taxes yet" and New Tax to /setup/taxes/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<TaxesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.empty_heading);
    expect(empty.textContent).toContain(EN.empty_body);
    const create = within(empty).getByRole('link', { name: EN.new_tax });
    expect(create.getAttribute('href')).toBe('/setup/taxes/new');
  });

  it('NoResults: no rows for "zz": "No taxes match “zz”" with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<TaxesList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe('No taxes match “zz”');
    expect(empty.textContent).toContain(EN.no_match_body);
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });

  it('Error: a 503 says the list could not load, in plain language with the plural noun, and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<TaxesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(COMMON.list_failed.replace('{records}', EN.noun_taxes));
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it("Loaded: the title, then Perfex's ID, Tax Name and Rate (percent); Tax Name is the link; all three sort; no checkbox column", async () => {
    show(<TaxesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.taxes);
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      EN.id,
      EN.tax_dt_name,
      EN.tax_dt_rate,
      COMMON.actions,
    ]);
    expect(screen.getByRole('link', { name: 'VAT' }).getAttribute('href')).toBe('/setup/taxes/7');
    const sortable = within(list).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.id}`,
      `Sort by ${EN.tax_dt_name}`,
      `Sort by ${EN.tax_dt_rate}`,
    ]);
    // No bulk actions (D-16): no checkbox anywhere, no selection bar.
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
    // The usage is never a column.
    expect(list.textContent).not.toContain('2 items');
  });

  it('the ID and the rate are digits in <bdi> with tabular numbers; the rate is the two-decimal string as answered', async () => {
    show(<TaxesList />);
    await table();
    const id = within(row('VAT')).getByText('7');
    expect(id.tagName).toBe('BDI');
    expect(id.className).toContain('tabular-nums');
    const rate = within(row('VAT')).getByText('5.00');
    expect(rate.tagName).toBe('BDI');
    expect(rate.className).toContain('tabular-nums');
    expect(within(row('Zero')).getByText('0.00')).toBeTruthy();
  });

  it('the default order is the api default: the first read carries no sort (the rate ascending, no arrow, G6)', async () => {
    show(<TaxesList />);
    await table();
    expect(listReads()[0]?.url.searchParams.get('sort')).toBeNull();
    const sorts = within(await table())
      .getAllByRole('columnheader')
      .map((th) => th.getAttribute('aria-sort'));
    expect(sorts).not.toContain('ascending');
    expect(sorts).not.toContain('descending');
  });

  it('Mobile: no column is hidden below md (ID, Tax Name and Rate stay)', async () => {
    show(<TaxesList />);
    const list = await table();
    const hidden = within(list)
      .getAllByRole('columnheader')
      .filter((th) => th.className.split(' ').includes('hidden'));
    expect(hidden).toEqual([]);
  });
});

describe('TaxesList: names are text only (D-19, T-4.1-48)', () => {
  it('"Fuel < 50 km" and "<b>x</b>" show as typed in the list cell and the delete dialog, and no element is created from them', async () => {
    api.list = { status: HTTP_OK, body: page([FUEL, BOLD]) };
    const scriptsBefore = document.querySelectorAll('script').length;
    const user = userEvent.setup();
    show(<TaxesList />);
    await table();
    expect(screen.getByRole('link', { name: 'Fuel < 50 km' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '<b>x</b>' })).toBeTruthy();
    for (const one of [FUEL, BOLD]) {
      await user.click(inline(one.name).getByRole('button', { name: `Delete tax ${one.name}` }));
      const open = await dialog();
      expect(within(open).getByRole('heading').textContent).toBe(`Delete tax ${one.name}?`);
      await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
      await closed();
    }
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('TaxesList: labelled row actions (UI-SPEC List)', () => {
  it('Edit is a filled button "Edit VAT"; Delete is a red ghost button with the trash icon after a separator, "Delete tax VAT"', async () => {
    show(<TaxesList />);
    await table();
    const actions = inline(VAT.name);
    const edit = actions.getByRole('button', { name: 'Edit VAT' });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const remove = actions.getByRole('button', { name: 'Delete tax VAT' });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.getAttribute('data-variant')).toBe('ghost');
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.previousElementSibling?.getAttribute('data-slot')).toBe('separator');
  });

  it('Mobile: below md both are in the kebab "Actions for VAT": Edit, then Delete in the destructive variant after a separator', async () => {
    const user = userEvent.setup();
    show(<TaxesList />);
    await table();
    await user.click(within(row(VAT.name)).getByRole('button', { name: 'Actions for VAT' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit VAT',
      'Delete tax VAT',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[1]?.previousElementSibling?.getAttribute('role')).toBe('separator');
  });

  it('the Tax Name link opens the record and records the list URL for the way back (D-28, D-35)', async () => {
    window.history.replaceState(null, '', '/setup/taxes?q=ze');
    show(<TaxesList />, { searchParams: '?q=ze' });
    await table();
    const link = screen.getByRole('link', { name: 'Zero' });
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(sessionStorage.getItem('erp.list.return:/setup/taxes')).toContain('/setup/taxes?q=ze');
  });

  it('Edit records the list URL, seeds the form from the row and opens /setup/taxes/7', async () => {
    window.history.replaceState(null, '', '/setup/taxes?q=va');
    show(<TaxesList />, { searchParams: '?q=va' });
    await table();
    await userEvent.click(inline(VAT.name).getByRole('button', { name: 'Edit VAT' }));
    expect(push).toHaveBeenCalledWith('/setup/taxes/7');
    expect(sessionStorage.getItem('erp.list.return:/setup/taxes')).toContain('/setup/taxes?q=va');
  });
});

describe('TaxesList: Delete (D-07, D-25.1, UI-SPEC G8)', () => {
  it('DeleteConfirm: a tax nothing uses: "Delete tax Zero?", "This cannot be undone.", Keep / Delete (destructive, trash icon, enabled), focus on Keep', async () => {
    show(<TaxesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete tax Zero?');
    expect(bodyOf(open)).toBe(EN.delete_body);
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe('Keep tax');
    expect(confirm.textContent).toBe('Delete tax');
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; the 204 toasts "Tax deleted", closes the dialog and the list pages ask again', async () => {
    show(<TaxesList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/taxes/8']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('DeleteInUse: a tax 2 items and 1 purchase line use shows exactly those two lines in group order, the ERP-TAXES-0001 refusal from the start, a disabled Delete, and NEVER sends a DELETE', async () => {
    show(<TaxesList />);
    const { user, open } = await openDelete(undefined, VAT);
    expect(within(open).getByRole('heading').textContent).toBe('Delete tax VAT?');
    expect(linesOf(open)).toEqual(['2 items use this tax.', '1 purchase line uses this tax.']);
    expect(bodyOf(open)).not.toContain(EN.delete_body);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(EN.errors[IN_USE]);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(within(open).getByTestId('confirm-dialog-dismiss'));
    await user.click(confirm);
    await settle();
    expect(deletes()).toHaveLength(0);
  });

  it('every one of the nine groups has its line, in the order items, expenses, subscriptions, vendor items, purchase, warehouse, fixed equipment and sales return lines, accounting', async () => {
    api.list = { status: HTTP_OK, body: page([EVERY, MANY]) };
    const user = userEvent.setup();
    show(<TaxesList />);
    const first = await openDelete(user, EVERY);
    expect(linesOf(first.open)).toEqual([
      '1 item uses this tax.',
      '1 expense uses this tax.',
      '1 subscription uses this tax.',
      '1 vendor item uses this tax.',
      '1 purchase line uses this tax.',
      '1 warehouse line uses this tax.',
      '1 fixed equipment line uses this tax.',
      '1 sales return line uses this tax.',
      '1 accounting row uses this tax.',
    ]);
    await user.click(within(first.open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    const second = await openDelete(user, MANY);
    expect(linesOf(second.open)).toEqual([
      '2 items use this tax.',
      '3 expenses use this tax.',
      '4 subscriptions use this tax.',
      '5 vendor items use this tax.',
      '6 purchase lines use this tax.',
      '7 warehouse lines use this tax.',
      '8 fixed equipment lines use this tax.',
      '9 sales return lines use this tax.',
      '10 accounting rows use this tax.',
    ]);
    expect(deletes()).toHaveLength(0);
  });

  it('a tax only expenses use is refused the same way: one line, the refusal, no request', async () => {
    const user = userEvent.setup();
    show(<TaxesList />);
    const { open } = await openDelete(user, REDUCED);
    expect(bodyOf(open)).toBe('1 expense uses this tax.');
    expect(within(open).getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
  });

  it('under ar the counts keep Western digits (D-34)', async () => {
    show(<TaxesList />, { locale: 'ar' });
    await table();
    const [, remove] = within(within(row(VAT.name)).getByTestId('row-actions-inline')).getAllByRole(
      'button',
    );
    if (remove === undefined) throw new Error('no delete button');
    await userEvent.click(remove);
    const body = (await dialog()).querySelector('[data-slot="alert-dialog-description"]');
    expect(body?.textContent).toContain('2');
    expect(body?.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('the nine in_use_* messages are ICU plurals on count whose number is the formatted countN, never # (D-34), in both packs', () => {
    for (const pack of [EN, AR]) {
      for (const message of [
        pack.in_use_items,
        pack.in_use_expenses,
        pack.in_use_subscriptions,
        pack.in_use_vendor_items,
        pack.in_use_purchase_lines,
        pack.in_use_warehouse_lines,
        pack.in_use_fixed_equipment_lines,
        pack.in_use_sales_return_lines,
        pack.in_use_accounting,
      ]) {
        expect(message).toMatch(/^\{count, plural, /);
        expect(message).toContain('{countN}');
        expect(message).toContain('other {');
        expect(message).not.toContain('#');
      }
    }
  });

  it('DeleteRefused: the race: the list said nothing used it, the api answers 409: the in-use text inside the dialog, Delete disabled, a second click sends nothing, and the list pages ask again (G8)', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, IN_USE) };
    window.history.replaceState(null, '', '/setup/taxes?q=race-409');
    show(<TaxesList />, { searchParams: '?q=race-409', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors[IN_USE]);
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.click(confirm);
    expect(deletes()).toHaveLength(1);
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
    await user.click(screen.getByTestId('confirm-dialog-dismiss'));
    await closed();
  });

  it('a 404 (deleted by someone else): the not-found text inside the dialog, Delete disabled, and the list pages ask again so the row is gone when it closes (G8)', async () => {
    api.remove = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    window.history.replaceState(null, '', '/setup/taxes?q=gone-404');
    show(<TaxesList />, { searchParams: '?q=gone-404', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    api.list = { status: HTTP_OK, body: page([VAT, REDUCED]) };
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-CORE-0004']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
    await user.click(screen.getByTestId('confirm-dialog-dismiss'));
    await closed();
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: ZERO.name })).toBeNull();
    });
  });

  it('DeleteRetryable: a network failure: the common network text, Delete still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    show(<TaxesList />);
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
    show(<TaxesList />);
    await openDelete();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    for (const bare of ['Confirm', 'Cancel', 'Save', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('TaxesList: the toolbar (D-19, D-26, D-42, ADR-0043)', () => {
  it('typing "va" searches the api (q=va), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<TaxesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'va');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('va');
    });
    expect(listReads().map((r) => r.url.searchParams.get('q'))).not.toContain('v');
  });

  it('the Export menu offers CSV, Excel, PDF and Print; CSV sends the three translated labels in the api order: ID, Tax Name, Rate (percent)', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<TaxesList />);
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
    expect(sent?.url.searchParams.getAll('header')).toEqual([
      EN.id,
      EN.tax_dt_name,
      EN.tax_dt_rate,
    ]);
  });

  it('New Tax links to /setup/taxes/new', async () => {
    show(<TaxesList />);
    await table();
    expect(screen.getByRole('link', { name: EN.new_tax }).getAttribute('href')).toBe(
      '/setup/taxes/new',
    );
  });
});

describe('GuardedTaxesList: the gate is ADMIN_GATE (D-06)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedTaxesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('anyone else is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedTaxesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });
});

describe('TaxesList: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack title and no physical-direction class', async () => {
    const { container } = show(<TaxesList />, { locale: 'ar' });
    await table();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(AR.taxes);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
