// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type {
  PaymentModesRow,
  PaymentModesUsage,
} from '@/features/payment-modes/schemas/payment-modes.schema';
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
import { GuardedPaymentModesList, PaymentModesList } from '../PaymentModesList';

/**
 * The list screen on `ListPageTemplate` (UIK-06). The template's own tests cover the URL state, the
 * search, the pager and the export mechanics; these cover what the SCREEN decides: Perfex's
 * announcement and four columns (ID, Payment Mode Name, Bank Accounts / Description, Active), the
 * one-click Active switch (D-34), the labelled Edit and Delete, the delete refused up front from the
 * row's eight usage groups (D-33) or its credit-expense flag (D-37), or live from the api (and the
 * list asked again), one `it` per state of the UI-SPEC, names and descriptions rendered as text
 * (T-4.1-124), and the administrator-only guard. The transport is a fake axios adapter on the shared
 * instance, so the real read and write paths run.
 */
const EN = en['payment-modes'];
const AR = ar['payment-modes'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/payment-modes';
const EXPORT = '/api/v1/payment-modes/export';
const IN_USE = 'ERP-PAYMENTMODES-0001';
const CREDIT_MODE = 'ERP-PAYMENTMODES-0002';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/payment-modes',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const NO_USE: PaymentModesUsage = {
  invoicePayments: 0,
  expenses: 0,
  creditNoteRefunds: 0,
  purchaseInvoicePayments: 0,
  purchaseOrderPayments: 0,
  debitNoteRefunds: 0,
  fixedEquipmentRefunds: 0,
  orderReturnRefunds: 0,
};
const mode = (
  id: string,
  name: string,
  {
    description = '',
    active = true,
    usage = {},
    isCreditExpenseMode = false,
  }: {
    description?: string;
    active?: boolean;
    usage?: Partial<PaymentModesUsage>;
    isCreditExpenseMode?: boolean;
  } = {},
): PaymentModesRow => ({
  id,
  name,
  description,
  active,
  showOnPdf: false,
  selectedByDefault: false,
  invoicesOnly: false,
  expensesOnly: false,
  usage: { ...NO_USE, ...usage },
  isCreditExpenseMode,
});
const BANK = mode('7', 'Bank transfer', {
  description: 'Bank: First Bank\nIBAN: AE00 0000',
  usage: { invoicePayments: 2, orderReturnRefunds: 1 },
});
const CASH = mode('5', 'Cash', { active: false });
const CREDIT = mode('9', 'Credit card', { isCreditExpenseMode: true });
const SPARE = mode('8', 'Spare');
const FUEL = mode('11', 'Cash < 50', { description: 'Up to < 50' });
const BOLD = mode('12', '<b>x</b>', { description: '<b>y</b><br />' });
const EVERY = mode('13', 'Every', {
  usage: {
    invoicePayments: 1,
    expenses: 1,
    creditNoteRefunds: 1,
    purchaseInvoicePayments: 1,
    purchaseOrderPayments: 1,
    debitNoteRefunds: 1,
    fixedEquipmentRefunds: 1,
    orderReturnRefunds: 1,
  },
});
const MANY = mode('14', 'Many', {
  usage: {
    invoicePayments: 2,
    expenses: 3,
    creditNoteRefunds: 4,
    purchaseInvoicePayments: 5,
    purchaseOrderPayments: 6,
    debitNoteRefunds: 7,
    fixedEquipmentRefunds: 8,
    orderReturnRefunds: 9,
  },
});
const CREDIT_IN_USE = mode('15', 'Credit in use', {
  isCreditExpenseMode: true,
  usage: { expenses: 4 },
});

const page = (rows: readonly PaymentModesRow[]) => ({
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
let api: { me: Reply; list: Reply; remove: Reply; active: Reply; exported: Reply };
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
            ? api.active
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
const switches = () => requests.filter((r) => r.method === 'PATCH');

const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };
/**
 * The app's ONE cache: `revalidateLists` (the G8 refresh after a 404 or 409) and `replaceRowInLists`
 * (the switch's swap in place) write through the global cache, as the app's `SwrProvider` has it,
 * so a test of either renders here with a `q` no other test uses.
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
    list: { status: HTTP_OK, body: page([BANK, CASH, CREDIT, SPARE]) },
    remove: { status: NO_CONTENT },
    active: { status: HTTP_OK, body: { id: '7', active: false } },
    exported: { status: HTTP_OK, body: new Blob(['id\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/payment-modes');
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
const switchOf = (name: string) =>
  within(row(name)).getByRole('switch', { name: `Active: ${name}` });
const dialog = () => screen.findByTestId('confirm-dialog');
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
/** Opens the delete of one payment mode; by default Spare, which nothing uses. */
async function openDelete(user = userEvent.setup(), one: PaymentModesRow = SPARE) {
  await table();
  await user.click(
    inline(one.name).getByRole('button', { name: `Delete payment mode ${one.name}` }),
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
/** The cell of a row under the column whose header reads `header`. */
const cellOf = (list: HTMLElement, name: string, header: string): HTMLElement => {
  const index = within(list)
    .getAllByRole('columnheader')
    .findIndex((th) => th.textContent === header);
  const cell = row(name).querySelectorAll('td')[index];
  if (cell === undefined) throw new Error(`no ${header} cell for ${name}`);
  return cell;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('PaymentModesList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<PaymentModesList />);
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
    show(<GuardedPaymentModesList />);
    await settle();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('list-empty')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });

  it('Empty: "No payment modes yet" and New Payment Mode to /setup/payment-modes/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<PaymentModesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.empty_heading);
    expect(empty.textContent).toContain(EN.empty_body);
    const create = within(empty).getByRole('link', { name: EN.new_payment_mode });
    expect(create.getAttribute('href')).toBe('/setup/payment-modes/new');
  });

  it('NoResults: no rows for "zz": "No payment modes match “zz”" with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<PaymentModesList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe('No payment modes match “zz”');
    expect(empty.textContent).toContain(EN.no_match_body);
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });

  it('Error: a 503 says the list could not load, in plain language with the plural noun, and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<PaymentModesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_payment_modes),
    );
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it("Loaded: the title, Perfex's announcement above the table, then ID, Payment Mode Name, Bank Accounts / Description and Active; the name is the link; ID, the name and Active sort, the description does not; no checkbox column", async () => {
    show(<PaymentModesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.payment_modes);
    const note = screen.getByTestId('payment-modes-announcement');
    expect(note.textContent).toBe(EN.payment_modes_add_edit_announcement);
    expect(note.getAttribute('role')).toBe('note');
    expect(note.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      EN.id,
      EN.payment_modes_dt_name,
      EN.payment_modes_dt_description,
      EN.payment_modes_dt_active,
      COMMON.actions,
    ]);
    expect(screen.getByRole('link', { name: 'Bank transfer' }).getAttribute('href')).toBe(
      '/setup/payment-modes/7',
    );
    const sortable = within(list).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.id}`,
      `Sort by ${EN.payment_modes_dt_name}`,
      `Sort by ${EN.payment_modes_dt_active}`,
    ]);
    // The description is a long text column, not a keyset key: no sort button, no aria-sort.
    const descriptionHeader = headers[2];
    expect(descriptionHeader?.querySelector('button')).toBeNull();
    expect(descriptionHeader?.hasAttribute('aria-sort')).toBe(false);
    // No bulk actions (D-16): no checkbox anywhere, no selection bar.
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
    // The usage is never a column.
    expect(list.textContent).not.toContain('invoice payments use');
  });

  it('the ID is digits in <bdi> with tabular numbers', async () => {
    show(<PaymentModesList />);
    await table();
    const id = within(row('Bank transfer')).getByText('7');
    expect(id.tagName).toBe('BDI');
    expect(id.className).toContain('tabular-nums');
  });

  it('the description shows both lines as text with its line breaks kept (whitespace-pre-line), and an empty one says None (the empty-value rule of the kit, lead 2026-10-04)', async () => {
    show(<PaymentModesList />);
    const list = await table();
    const cell = cellOf(list, 'Bank transfer', EN.payment_modes_dt_description);
    const box = cell.querySelector('span');
    expect(box?.textContent).toBe('Bank: First Bank\nIBAN: AE00 0000');
    expect(box?.className).toContain('whitespace-pre-line');
    expect(cell.querySelector('br')).toBeNull();
    expect(cellOf(list, 'Spare', EN.payment_modes_dt_description).textContent).toBe('None');
  });

  it('the default order is the api default: the first read carries no sort (the name ascending, no arrow, G6)', async () => {
    show(<PaymentModesList />);
    await table();
    expect(listReads()[0]?.url.searchParams.get('sort')).toBeNull();
    const sorts = within(await table())
      .getAllByRole('columnheader')
      .map((th) => th.getAttribute('aria-sort'));
    expect(sorts).not.toContain('ascending');
    expect(sorts).not.toContain('descending');
  });

  it('Mobile: only the description is hidden below md (ID, the name, Active and the actions stay)', async () => {
    show(<PaymentModesList />);
    const list = await table();
    const hidden = within(list)
      .getAllByRole('columnheader')
      .filter((th) => th.className.split(' ').includes('hidden'))
      .map((th) => th.textContent);
    expect(hidden).toEqual([EN.payment_modes_dt_description]);
  });

  it('two payment modes with the same name are both listed, as Perfex allows (D-34)', async () => {
    api.list = { status: HTTP_OK, body: page([mode('21', 'Cheque'), mode('20', 'Cheque')]) };
    show(<PaymentModesList />);
    await table();
    const links = screen.getAllByRole('link', { name: 'Cheque' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/setup/payment-modes/21',
      '/setup/payment-modes/20',
    ]);
  });
});

describe('PaymentModesList: names and descriptions are text only (T-4.1-124)', () => {
  it('"Cash < 50", "<b>x</b>" and the description "<b>y</b><br />" show as typed in the list and the delete dialog, and no element is created from them', async () => {
    api.list = { status: HTTP_OK, body: page([FUEL, BOLD]) };
    const scriptsBefore = document.querySelectorAll('script').length;
    const user = userEvent.setup();
    show(<PaymentModesList />);
    const list = await table();
    expect(screen.getByRole('link', { name: 'Cash < 50' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '<b>x</b>' })).toBeTruthy();
    expect(cellOf(list, '<b>x</b>', EN.payment_modes_dt_description).textContent).toBe(
      '<b>y</b><br />',
    );
    for (const one of [FUEL, BOLD]) {
      await user.click(
        inline(one.name).getByRole('button', { name: `Delete payment mode ${one.name}` }),
      );
      const open = await dialog();
      expect(within(open).getByRole('heading').textContent).toBe(
        `Delete payment mode ${one.name}?`,
      );
      await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
      await closed();
    }
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    expect(document.querySelector('b')).toBeNull();
    expect(list.querySelector('br')).toBeNull();
  });
});

describe('PaymentModesList: the Active switch (D-34)', () => {
  it('is a switch per row, labelled "Active: {name}", checked as the row is', async () => {
    show(<PaymentModesList />);
    await table();
    expect(switchOf('Bank transfer').getAttribute('aria-checked')).toBe('true');
    expect(switchOf('Cash').getAttribute('aria-checked')).toBe('false');
  });

  it('SwitchOff: one click on an active row PATCHes { active: false } at once with no dialog, swaps the row in place with no list request, and toasts "Payment mode deactivated"', async () => {
    window.history.replaceState(null, '', '/setup/payment-modes?q=switch-off');
    show(<PaymentModesList />, { searchParams: '?q=switch-off', swr: GLOBAL });
    await table();
    await settle();
    const before = listReads().length;
    await userEvent.click(switchOf('Bank transfer'));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(await screen.findByText(EN.deactivated_toast)).toBeTruthy();
    expect(switches().map((r) => [r.url.pathname, r.data])).toEqual([
      ['/api/v1/payment-modes/7/active', { active: false }],
    ]);
    await waitFor(() => {
      expect(switchOf('Bank transfer').getAttribute('aria-checked')).toBe('false');
    });
    await settle();
    expect(listReads()).toHaveLength(before);
  });

  it('SwitchOn: turning Cash on PATCHes { active: true } and toasts "Payment mode activated"', async () => {
    api.active = { status: HTTP_OK, body: { id: '5', active: true } };
    show(<PaymentModesList />);
    await table();
    await userEvent.click(switchOf('Cash'));
    expect(await screen.findByText(EN.activated_toast)).toBeTruthy();
    expect(switches().map((r) => [r.url.pathname, r.data])).toEqual([
      ['/api/v1/payment-modes/5/active', { active: true }],
    ]);
  });

  it('SwitchFailed: a failed PATCH puts the switch back, says "Not saved. Try again." beside it, toasts nothing and is sent once (never retried)', async () => {
    api.active = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<PaymentModesList />);
    await table();
    await userEvent.click(switchOf('Bank transfer'));
    expect(await within(row('Bank transfer')).findByText(EN.active_not_saved)).toBeTruthy();
    expect(switchOf('Bank transfer').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(EN.deactivated_toast)).toBeNull();
    await settle();
    expect(switches()).toHaveLength(1);
  });

  it('is allowed for the credit expense mode and a mode in use: switching off is how they are retired (D-33, D-37)', async () => {
    api.active = { status: HTTP_OK, body: { id: '9', active: false } };
    show(<PaymentModesList />);
    await table();
    await userEvent.click(switchOf('Credit card'));
    expect(await screen.findByText(EN.deactivated_toast)).toBeTruthy();
    expect(switches()).toHaveLength(1);
  });

  it('a click on the switch never opens the row', async () => {
    show(<PaymentModesList />);
    await table();
    await userEvent.click(switchOf('Bank transfer'));
    await settle();
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('erp.list.return:/setup/payment-modes')).toBeNull();
  });
});

describe('PaymentModesList: labelled row actions (UI-SPEC List)', () => {
  it('Edit is a filled button "Edit Bank transfer"; Delete is a red ghost button with the trash icon after a separator, "Delete payment mode Bank transfer"', async () => {
    show(<PaymentModesList />);
    await table();
    const actions = inline(BANK.name);
    const edit = actions.getByRole('button', { name: 'Edit Bank transfer' });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const remove = actions.getByRole('button', { name: 'Delete payment mode Bank transfer' });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.getAttribute('data-variant')).toBe('ghost');
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.previousElementSibling?.getAttribute('data-slot')).toBe('separator');
  });

  it('Mobile: below md both are in the kebab "Actions for Bank transfer": Edit, then Delete in the destructive variant after a separator', async () => {
    const user = userEvent.setup();
    show(<PaymentModesList />);
    await table();
    await user.click(
      within(row(BANK.name)).getByRole('button', { name: 'Actions for Bank transfer' }),
    );
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit Bank transfer',
      'Delete payment mode Bank transfer',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[1]?.previousElementSibling?.getAttribute('role')).toBe('separator');
  });

  it('the Payment Mode Name link opens the record and records the list URL for the way back (D-28, D-35)', async () => {
    window.history.replaceState(null, '', '/setup/payment-modes?q=sp');
    show(<PaymentModesList />, { searchParams: '?q=sp' });
    await table();
    const link = screen.getByRole('link', { name: 'Spare' });
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(sessionStorage.getItem('erp.list.return:/setup/payment-modes')).toContain(
      '/setup/payment-modes?q=sp',
    );
  });

  it('Edit records the list URL, seeds the form from the row and opens /setup/payment-modes/7', async () => {
    window.history.replaceState(null, '', '/setup/payment-modes?q=ba');
    show(<PaymentModesList />, { searchParams: '?q=ba' });
    await table();
    await userEvent.click(inline(BANK.name).getByRole('button', { name: 'Edit Bank transfer' }));
    expect(push).toHaveBeenCalledWith('/setup/payment-modes/7');
    expect(sessionStorage.getItem('erp.list.return:/setup/payment-modes')).toContain(
      '/setup/payment-modes?q=ba',
    );
  });
});

describe('PaymentModesList: Delete (D-33, D-37, D-28, D-25.1, UI-SPEC G8)', () => {
  it('DeleteConfirm: a payment mode nothing uses: "Delete payment mode Spare?", "This cannot be undone.", Keep / Delete (destructive, trash icon, enabled), focus on Keep', async () => {
    show(<PaymentModesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete payment mode Spare?');
    expect(bodyOf(open)).toBe(EN.delete_body);
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe('Keep payment mode');
    expect(confirm.textContent).toBe('Delete payment mode');
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; the 204 toasts "Payment mode deleted", closes the dialog and the list pages ask again', async () => {
    show(<PaymentModesList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/payment-modes/8']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('DeleteInUse: a mode 2 invoice payments and 1 order return refund use shows exactly those two lines in group order, the ERP-PAYMENTMODES-0001 refusal pointing to the Active switch from the start, a disabled Delete, and NEVER sends a DELETE', async () => {
    show(<PaymentModesList />);
    const { user, open } = await openDelete(undefined, BANK);
    expect(within(open).getByRole('heading').textContent).toBe(
      'Delete payment mode Bank transfer?',
    );
    expect(linesOf(open)).toEqual([
      '2 invoice payments use this payment mode.',
      '1 order return refund uses this payment mode.',
    ]);
    expect(bodyOf(open)).not.toContain(EN.delete_body);
    const refusal = within(open).getByTestId('confirm-dialog-error');
    expect(refusal.textContent).toBe(EN.errors[IN_USE]);
    expect(refusal.textContent).toContain(EN.payment_modes_dt_active);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(within(open).getByTestId('confirm-dialog-dismiss'));
    await user.click(confirm);
    await settle();
    expect(deletes()).toHaveLength(0);
  });

  it('DeleteCreditMode: the credit expense mode with no usage shows the ERP-PAYMENTMODES-0002 refusal from the start, a disabled Delete, and NEVER sends a DELETE (D-37)', async () => {
    show(<PaymentModesList />);
    const { user, open } = await openDelete(undefined, CREDIT);
    expect(within(open).getByRole('heading').textContent).toBe('Delete payment mode Credit card?');
    expect(linesOf(open)).toEqual([]);
    expect(bodyOf(open)).not.toContain(EN.delete_body);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(
      EN.errors[CREDIT_MODE],
    );
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.click(confirm);
    await settle();
    expect(deletes()).toHaveLength(0);
  });

  it('the credit expense mode in use names its uses but refuses with ERP-PAYMENTMODES-0002, as the api checks it first', async () => {
    api.list = { status: HTTP_OK, body: page([CREDIT_IN_USE]) };
    show(<PaymentModesList />);
    const { open } = await openDelete(undefined, CREDIT_IN_USE);
    expect(linesOf(open)).toEqual(['4 expenses use this payment mode.']);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(
      EN.errors[CREDIT_MODE],
    );
    expect(deletes()).toHaveLength(0);
  });

  it('every one of the eight groups has its line, in the api order', async () => {
    api.list = { status: HTTP_OK, body: page([EVERY, MANY]) };
    const user = userEvent.setup();
    show(<PaymentModesList />);
    const first = await openDelete(user, EVERY);
    expect(linesOf(first.open)).toEqual([
      '1 invoice payment uses this payment mode.',
      '1 expense uses this payment mode.',
      '1 credit note refund uses this payment mode.',
      '1 purchase invoice payment uses this payment mode.',
      '1 purchase order payment uses this payment mode.',
      '1 debit note refund uses this payment mode.',
      '1 fixed equipment refund uses this payment mode.',
      '1 order return refund uses this payment mode.',
    ]);
    await user.click(within(first.open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    const second = await openDelete(user, MANY);
    expect(linesOf(second.open)).toEqual([
      '2 invoice payments use this payment mode.',
      '3 expenses use this payment mode.',
      '4 credit note refunds use this payment mode.',
      '5 purchase invoice payments use this payment mode.',
      '6 purchase order payments use this payment mode.',
      '7 debit note refunds use this payment mode.',
      '8 fixed equipment refunds use this payment mode.',
      '9 order return refunds use this payment mode.',
    ]);
    expect(deletes()).toHaveLength(0);
  });

  it('under ar the counts keep Western digits (D-34)', async () => {
    show(<PaymentModesList />, { locale: 'ar' });
    await table();
    const [, remove] = within(
      within(row(BANK.name)).getByTestId('row-actions-inline'),
    ).getAllByRole('button');
    if (remove === undefined) throw new Error('no delete button');
    await userEvent.click(remove);
    const body = (await dialog()).querySelector('[data-slot="alert-dialog-description"]');
    expect(body?.textContent).toContain('2');
    expect(body?.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('the eight in_use_* messages are ICU plurals on count whose number is the formatted countN, never # (D-34), in both packs', () => {
    for (const pack of [EN, AR]) {
      for (const message of [
        pack.in_use_invoice_payments,
        pack.in_use_expenses,
        pack.in_use_credit_note_refunds,
        pack.in_use_purchase_invoice_payments,
        pack.in_use_purchase_order_payments,
        pack.in_use_debit_note_refunds,
        pack.in_use_fixed_equipment_refunds,
        pack.in_use_order_return_refunds,
      ]) {
        expect(message).toMatch(/^\{count, plural, /);
        expect(message).toContain('{countN}');
        expect(message).toContain('other {');
        expect(message).not.toContain('#');
      }
    }
  });

  it('DeleteRefused: the race: the list said nothing used it, the api answers 409 ERP-PAYMENTMODES-0001: the in-use text inside the dialog, Delete disabled, a second click sends nothing, and the list pages ask again (G8)', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, IN_USE) };
    window.history.replaceState(null, '', '/setup/payment-modes?q=race-409');
    show(<PaymentModesList />, { searchParams: '?q=race-409', swr: GLOBAL });
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

  it('a live 409 ERP-PAYMENTMODES-0002 (made the credit expense mode meanwhile) stays inside the dialog in its words and the list pages ask again (G8)', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, CREDIT_MODE) };
    window.history.replaceState(null, '', '/setup/payment-modes?q=race-credit');
    show(<PaymentModesList />, { searchParams: '?q=race-credit', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors[CREDIT_MODE]);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('a 404 (deleted by someone else): the not-found text inside the dialog, Delete disabled, and the list pages ask again so the row is gone when it closes (G8)', async () => {
    api.remove = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    window.history.replaceState(null, '', '/setup/payment-modes?q=gone-404');
    show(<PaymentModesList />, { searchParams: '?q=gone-404', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    api.list = { status: HTTP_OK, body: page([BANK, CASH]) };
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
      expect(screen.queryByRole('link', { name: SPARE.name })).toBeNull();
    });
  });

  it('DeleteRetryable: a network failure: the common network text, Delete still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    show(<PaymentModesList />);
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
    show(<PaymentModesList />);
    await openDelete();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    for (const bare of ['Confirm', 'Cancel', 'Save', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('PaymentModesList: the toolbar (D-12, D-26, D-42, ADR-0043)', () => {
  it('typing "ba" searches the api (q=ba), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<PaymentModesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'ba');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('ba');
    });
    expect(listReads().map((r) => r.url.searchParams.get('q'))).not.toContain('b');
  });

  it('the Export menu offers CSV, Excel, PDF and Print; CSV sends the four columns and their translated labels in the api order: ID, Name, Description, Active (no date column)', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<PaymentModesList />);
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
    expect(sent?.url.searchParams.getAll('column')).toEqual([
      'id',
      'name',
      'description',
      'active',
    ]);
    expect(sent?.url.searchParams.getAll('header')).toEqual([
      EN.id,
      EN.payment_modes_dt_name,
      EN.payment_modes_dt_description,
      EN.payment_modes_dt_active,
    ]);
  });

  it('New Payment Mode links to /setup/payment-modes/new', async () => {
    show(<PaymentModesList />);
    await table();
    expect(screen.getByRole('link', { name: EN.new_payment_mode }).getAttribute('href')).toBe(
      '/setup/payment-modes/new',
    );
  });
});

describe('GuardedPaymentModesList: the gate is ADMIN_GATE (D-06, D-32)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedPaymentModesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('anyone else is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedPaymentModesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });
});

describe('PaymentModesList: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack title and no physical-direction class', async () => {
    const { container } = show(<PaymentModesList />, { locale: 'ar' });
    await table();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(AR.payment_modes);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
