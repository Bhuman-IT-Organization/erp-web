// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { ExpenseCategoriesRow } from '@/features/expense-categories/schemas/expense-categories.schema';
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
import { ExpenseCategoriesList, GuardedExpenseCategoriesList } from '../ExpenseCategoriesList';

/**
 * The list screen on `ListPageTemplate` (UIK-06). The template's own tests cover the URL state, the
 * search, the pager and the export mechanics; these cover what the SCREEN decides: Perfex's three
 * columns, the labelled Edit and Delete, the delete refused up front from the row's usage counts or
 * live from the api (and the list asked again), one `it` per state of the UI-SPEC, the names and
 * descriptions rendered as text (D-19, T-4.1-25), and the administrator-only guard. The transport is
 * a fake axios adapter on the shared instance, so the real read and write paths run.
 */
const EN = en['expense-categories'];
const AR = ar['expense-categories'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/expense-categories';
const EXPORT = '/api/v1/expense-categories/export';
const IN_USE = 'ERP-EXPENSECATEGORIES-0001';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/expense-categories',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const UNUSED = { expenseCount: 0, mappingCount: 0, pettyCashCount: 0 };
const POSTAGE: ExpenseCategoriesRow = { id: '8', name: 'Postage', description: '', ...UNUSED };
const TRAVEL: ExpenseCategoriesRow = {
  id: '7',
  name: 'Travel',
  description: 'Line one\nline two <b>bold</b>',
  expenseCount: 3,
  mappingCount: 1,
  pettyCashCount: 2,
};
const MEALS: ExpenseCategoriesRow = {
  id: '9',
  name: 'Meals',
  description: 'Lunch',
  ...UNUSED,
  expenseCount: 1,
};
const FUEL: ExpenseCategoriesRow = { id: '11', name: 'Fuel < 50 km', description: '', ...UNUSED };
const SCRIPT: ExpenseCategoriesRow = {
  id: '12',
  name: '<script>alert(1)</script>',
  description: '<b onmouseover=alert(1)>hover</b>',
  ...UNUSED,
};
const PETTY: ExpenseCategoriesRow = {
  id: '13',
  name: 'Petty',
  description: '',
  ...UNUSED,
  pettyCashCount: 1,
};

const page = (rows: readonly ExpenseCategoriesRow[]) => ({
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
    list: { status: HTTP_OK, body: page([TRAVEL, POSTAGE, MEALS]) },
    remove: { status: NO_CONTENT },
    exported: { status: HTTP_OK, body: new Blob(['id\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/expense-categories');
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
/** Opens the delete of one category; by default Postage, which nothing uses. */
async function openDelete(user = userEvent.setup(), category: ExpenseCategoriesRow = POSTAGE) {
  await table();
  await user.click(
    inline(category.name).getByRole('button', {
      name: `Delete expense category ${category.name}`,
    }),
  );
  return { user, open: await dialog() };
}
/** The dialog's body (its description). */
const bodyOf = (open: HTMLElement): string | null | undefined =>
  open.querySelector('[data-slot="alert-dialog-description"]')?.textContent;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('ExpenseCategoriesList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<ExpenseCategoriesList />);
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
    show(<GuardedExpenseCategoriesList />);
    await settle();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('list-empty')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });

  it('Empty: "No expense categories yet" and New Category to /setup/expense-categories/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<ExpenseCategoriesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.empty_heading);
    expect(empty.textContent).toContain(EN.empty_body);
    const create = within(empty).getByRole('link', { name: EN.new_expense_category });
    expect(create.getAttribute('href')).toBe('/setup/expense-categories/new');
  });

  it('NoResults: no rows for "zz": "No expense categories match “zz”" with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<ExpenseCategoriesList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe('No expense categories match “zz”');
    expect(empty.textContent).toContain(EN.no_match_body);
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });

  it('Error: a 503 says the list could not load, in plain language with the plural noun, and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<ExpenseCategoriesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_expense_categories),
    );
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it('Loaded: the title, ID, Name and Description in Perfex order; Name is the link; ID and Name sort, Description does not; no checkbox column', async () => {
    show(<ExpenseCategoriesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.expense_categories);
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      EN.id,
      EN.name,
      EN.dt_expense_description,
      COMMON.actions,
    ]);
    expect(screen.getByRole('link', { name: 'Travel' }).getAttribute('href')).toBe(
      '/setup/expense-categories/7',
    );
    const sortable = within(list).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.id}`,
      `Sort by ${EN.name}`,
    ]);
    // No bulk actions (D-16): no checkbox anywhere, no selection bar.
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
    // The usage counts are never columns.
    expect(list.textContent).not.toContain('3 expenses');
  });

  it('the ID is digits in <bdi> with tabular numbers; an empty description reads "None" in the muted colour', async () => {
    show(<ExpenseCategoriesList />);
    await table();
    const id = within(row('Travel')).getByText('7');
    expect(id.tagName).toBe('BDI');
    expect(id.className).toContain('tabular-nums');
    const none = within(row('Postage')).getByText(COMMON.none);
    expect(none.className).toContain('text-muted-foreground');
  });

  it('LongDescription: the description keeps its line breaks and wraps, and renders <b> as text, never markup', async () => {
    show(<ExpenseCategoriesList />);
    await table();
    const cell = within(row('Travel')).getByText(/Line one/);
    expect(cell.textContent).toBe('Line one\nline two <b>bold</b>');
    expect(cell.className.split(' ')).toEqual(
      expect.arrayContaining(['whitespace-pre-line', 'break-words']),
    );
    expect(cell.querySelector('b')).toBeNull();
  });

  it('the default order is the api default: the first read carries no sort (name ascending, no arrow, D-16)', async () => {
    show(<ExpenseCategoriesList />);
    await table();
    expect(listReads()[0]?.url.searchParams.get('sort')).toBeNull();
    // G6, accepted for the pilot: no header claims an order, so no arrow on the default column.
    const sorts = within(await table())
      .getAllByRole('columnheader')
      .map((th) => th.getAttribute('aria-sort'));
    expect(sorts).not.toContain('ascending');
    expect(sorts).not.toContain('descending');
  });
});

describe('ExpenseCategoriesList: names and descriptions are text only (D-19, T-4.1-25)', () => {
  it('"Fuel < 50 km" and "<script>alert(1)</script>" show as typed in the list cell and the delete dialog, and no script element is added', async () => {
    api.list = { status: HTTP_OK, body: page([FUEL, SCRIPT]) };
    const scriptsBefore = document.querySelectorAll('script').length;
    const user = userEvent.setup();
    show(<ExpenseCategoriesList />);
    await table();
    expect(screen.getByRole('link', { name: 'Fuel < 50 km' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '<script>alert(1)</script>' })).toBeTruthy();
    expect(within(row(SCRIPT.name)).getByText(SCRIPT.description)).toBeTruthy();
    for (const category of [FUEL, SCRIPT]) {
      await user.click(
        inline(category.name).getByRole('button', {
          name: `Delete expense category ${category.name}`,
        }),
      );
      const open = await dialog();
      expect(within(open).getByRole('heading').textContent).toBe(
        `Delete expense category ${category.name}?`,
      );
      await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
      await closed();
    }
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('ExpenseCategoriesList: labelled row actions (UI-SPEC List)', () => {
  it('Edit is a filled button "Edit Travel"; Delete is a red ghost button with the trash icon after a separator, "Delete expense category Travel"', async () => {
    show(<ExpenseCategoriesList />);
    await table();
    const actions = inline(TRAVEL.name);
    const edit = actions.getByRole('button', { name: 'Edit Travel' });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const remove = actions.getByRole('button', { name: 'Delete expense category Travel' });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.getAttribute('data-variant')).toBe('ghost');
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.previousElementSibling?.getAttribute('data-slot')).toBe('separator');
  });

  it('Mobile: below md both are in the kebab "Actions for Travel": Edit, then Delete in the destructive variant after a separator', async () => {
    const user = userEvent.setup();
    show(<ExpenseCategoriesList />);
    await table();
    await user.click(within(row(TRAVEL.name)).getByRole('button', { name: 'Actions for Travel' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit Travel',
      'Delete expense category Travel',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[1]?.previousElementSibling?.getAttribute('role')).toBe('separator');
  });

  it('Mobile: the Description column is hidden below md', async () => {
    show(<ExpenseCategoriesList />);
    const list = await table();
    const header = within(list)
      .getAllByRole('columnheader')
      .find((th) => th.textContent === EN.dt_expense_description);
    expect(header?.className).toContain('hidden');
    expect(header?.className).toContain('md:table-cell');
  });

  it('the Name link opens the record and records the list URL for the way back (D-28, D-35)', async () => {
    window.history.replaceState(null, '', '/setup/expense-categories?q=pos');
    show(<ExpenseCategoriesList />, { searchParams: '?q=pos' });
    await table();
    const link = screen.getByRole('link', { name: 'Postage' });
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(sessionStorage.getItem('erp.list.return:/setup/expense-categories')).toContain(
      '/setup/expense-categories?q=pos',
    );
  });

  it('Edit records the list URL, seeds the form from the row and opens /setup/expense-categories/7', async () => {
    window.history.replaceState(null, '', '/setup/expense-categories?q=tra');
    show(<ExpenseCategoriesList />, { searchParams: '?q=tra' });
    await table();
    await userEvent.click(inline(TRAVEL.name).getByRole('button', { name: 'Edit Travel' }));
    expect(push).toHaveBeenCalledWith('/setup/expense-categories/7');
    expect(sessionStorage.getItem('erp.list.return:/setup/expense-categories')).toContain(
      '/setup/expense-categories?q=tra',
    );
  });
});

describe('ExpenseCategoriesList: Delete (D-07, D-15, D-25.1, UI-SPEC G8)', () => {
  it('DeleteConfirm: a category nothing uses: "Delete expense category Postage?", "This cannot be undone.", Keep / Delete (destructive, trash icon, enabled), focus on Keep', async () => {
    show(<ExpenseCategoriesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete expense category Postage?');
    expect(bodyOf(open)).toBe(EN.delete_body);
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe('Keep expense category');
    expect(confirm.textContent).toBe('Delete expense category');
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; the 204 toasts "Expense category deleted", closes the dialog and the list pages ask again', async () => {
    show(<ExpenseCategoriesList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/expense-categories/8']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('DeleteInUse: a row used by 3 expenses, 1 accounting mapping and 2 petty cash advances names each, shows the in-use refusal from the start, disables Delete and NEVER sends a DELETE', async () => {
    show(<ExpenseCategoriesList />);
    const { user, open } = await openDelete(undefined, TRAVEL);
    expect(within(open).getByRole('heading').textContent).toBe('Delete expense category Travel?');
    const lines = [...open.querySelectorAll('[data-slot="alert-dialog-description"] > span')].map(
      (span) => span.textContent,
    );
    expect(lines).toEqual([
      '3 expenses use this category.',
      '1 accounting mapping uses this category.',
      '2 petty cash advances use this category.',
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

  it('only the non-zero counts get a line, in the singular for one: "1 expense uses this category." alone, and a petty cash advance alone', async () => {
    api.list = { status: HTTP_OK, body: page([MEALS, PETTY]) };
    const user = userEvent.setup();
    show(<ExpenseCategoriesList />);
    const first = await openDelete(user, MEALS);
    expect(bodyOf(first.open)).toBe('1 expense uses this category.');
    await user.click(within(first.open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    const second = await openDelete(user, PETTY);
    expect(bodyOf(second.open)).toBe('1 petty cash advance uses this category.');
    expect(within(second.open).getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('under ar the counts keep Western digits (D-34)', async () => {
    show(<ExpenseCategoriesList />, { locale: 'ar' });
    await table();
    const [, remove] = within(
      within(row(TRAVEL.name)).getByTestId('row-actions-inline'),
    ).getAllByRole('button');
    if (remove === undefined) throw new Error('no delete button');
    await userEvent.click(remove);
    const body = (await dialog()).querySelector('[data-slot="alert-dialog-description"]');
    expect(body?.textContent).toContain('3');
    expect(body?.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('the three in_use_* messages are ICU plurals on count whose number is the formatted countN, never # (D-34), in both packs', () => {
    for (const pack of [EN, AR]) {
      for (const message of [
        pack.in_use_expenses,
        pack.in_use_accounting_mappings,
        pack.in_use_petty_cash_advances,
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
    window.history.replaceState(null, '', '/setup/expense-categories?q=race-409');
    show(<ExpenseCategoriesList />, { searchParams: '?q=race-409', swr: GLOBAL });
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
    window.history.replaceState(null, '', '/setup/expense-categories?q=gone-404');
    show(<ExpenseCategoriesList />, { searchParams: '?q=gone-404', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    api.list = { status: HTTP_OK, body: page([TRAVEL, MEALS]) };
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
      expect(screen.queryByRole('link', { name: POSTAGE.name })).toBeNull();
    });
  });

  it('DeleteRetryable: a network failure: the common network text, Delete still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    show(<ExpenseCategoriesList />);
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
    show(<ExpenseCategoriesList />);
    await openDelete();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    for (const bare of ['Confirm', 'Cancel', 'Save', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('ExpenseCategoriesList: the toolbar (D-19, D-26, D-42)', () => {
  it('typing "tra" searches the api (q=tra), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<ExpenseCategoriesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'tra');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('tra');
    });
    expect(listReads().map((r) => r.url.searchParams.get('q'))).not.toContain('tr');
  });

  it('Export sends the three translated labels in the api order: ID, Name, Description', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<ExpenseCategoriesList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((r) => r.url.pathname === EXPORT);
    expect(sent?.url.searchParams.get('format')).toBe('csv');
    expect(sent?.url.searchParams.getAll('header')).toEqual([
      EN.id,
      EN.name,
      EN.dt_expense_description,
    ]);
  });

  it('New Category links to /setup/expense-categories/new', async () => {
    show(<ExpenseCategoriesList />);
    await table();
    expect(screen.getByRole('link', { name: EN.new_expense_category }).getAttribute('href')).toBe(
      '/setup/expense-categories/new',
    );
  });
});

describe('GuardedExpenseCategoriesList: the gate is ADMIN_GATE (D-06)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedExpenseCategoriesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('anyone else is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedExpenseCategoriesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });
});

describe('ExpenseCategoriesList: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack title and no physical-direction class', async () => {
    const { container } = show(<ExpenseCategoriesList />, { locale: 'ar' });
    await table();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(AR.expense_categories);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
