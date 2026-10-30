// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { ServicesRow } from '@/features/services/schemas/services.schema';
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
import { ServicesList, GuardedServicesList } from '../ServicesList';

/**
 * The list screen on `ListPageTemplate` (UIK-06). The template's own tests cover the URL state, the
 * search, the pager and the export mechanics; these cover what the SCREEN decides: Perfex's three
 * columns (ID, Service Name), the labelled Edit and Delete, the delete refused up
 * front from the row's six usage groups or live from the api (and the list asked again), one `it`
 * per state of the UI-SPEC, the names rendered as text (T-4.1-91), and the administrator-only guard.
 * The transport is a fake axios adapter on the shared instance, so the real read and write paths run.
 */
const EN = en.services;
const AR = ar.services;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/services';
const EXPORT = '/api/v1/services/export';
const IN_USE = 'ERP-SERVICES-0001';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/services',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const service = (
  id: string,
  name: string,
  usage: Partial<Record<string, number>> | string | null = {},
): ServicesRow =>
  ({
    id,
    name,
    usage: { ...(typeof usage === 'object' && usage !== null ? usage : {}) },
  }) as ServicesRow;
const SPARE = service('8', 'Spare', '2026-10-02T20:30:15.000Z');
const OFFICE = service('7', 'Office', '2026-01-02T20:30:00.000Z');

const LEGACY = service('5', 'Legacy', null);
const FUEL = service('11', 'Fuel < 50 km', null);
const BOLD = service('12', '<b>x</b>', null);

const page = (rows: readonly ServicesRow[]) => ({
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
    list: { status: HTTP_OK, body: page([LEGACY, OFFICE, SPARE]) },
    remove: { status: NO_CONTENT },
    exported: { status: HTTP_OK, body: new Blob(['id\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/services');
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
/** Opens the delete of one service; by default Spare, which nothing uses. */
async function openDelete(user = userEvent.setup(), one: ServicesRow = SPARE) {
  await table();
  await user.click(inline(one.name).getByRole('button', { name: `Delete service ${one.name}` }));
  return { user, open: await dialog() };
}

/** The dialog's body (its description). */
const bodyOf = (open: HTMLElement): string | null | undefined =>
  open.querySelector('[data-slot="alert-dialog-description"]')?.textContent;

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('ServicesList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<ServicesList />);
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
    show(<GuardedServicesList />);
    await settle();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('list-empty')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });

  it('Empty: "No services yet" and Add Service to /setup/services/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<ServicesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.empty_heading);
    expect(empty.textContent).toContain(EN.empty_body);
    const create = within(empty).getByRole('link', { name: EN.new_service });
    expect(create.getAttribute('href')).toBe('/setup/services/new');
  });

  it('NoResults: no rows for "zz": "No services match “zz”" with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<ServicesList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe('No services match “zz”');
    expect(empty.textContent).toContain(EN.no_match_body);
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });

  it('Error: a 503 says the list could not load, in plain language with the plural noun, and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<ServicesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(COMMON.list_failed.replace('{records}', EN.noun_services));
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it("Loaded: the title, then Perfex's ID, Service Name; the name is the link; ID and the name sort; no checkbox column", async () => {
    show(<ServicesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.services);
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      EN.id,
      EN.services_dt_name,
      COMMON.actions,
    ]);
    expect(screen.getByRole('link', { name: 'Office' }).getAttribute('href')).toBe(
      '/setup/services/7',
    );
    const sortable = within(list).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.id}`,
      `Sort by ${EN.services_dt_name}`,
    ]);
    // No bulk actions (D-16): no checkbox anywhere, no selection bar.
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
  });

  it('the ID is digits in <bdi> with tabular numbers', async () => {
    show(<ServicesList />);
    await table();
    const id = within(row('Office')).getByText('7');
    expect(id.tagName).toBe('BDI');
    expect(id.className).toContain('tabular-nums');
  });

  it('the default order is the api default: name ascending, with no explicit sort or sort arrow', async () => {
    show(<ServicesList />);
    const list = await table();

    expect(listReads()[0]?.url.searchParams.get('sort')).toBeNull();

    const names = within(list)
      .getAllByRole('link')
      .map((link) => link.textContent.trim());

    expect(names).toEqual(['Legacy', 'Office', 'Spare']);

    const sorts = within(list)
      .getAllByRole('columnheader')
      .map((th) => th.getAttribute('aria-sort'));

    expect(sorts).not.toContain('ascending');
    expect(sorts).not.toContain('descending');
  });

  it('two services with the same name are both listed, as Perfex allows (D-29)', async () => {
    api.list = {
      status: HTTP_OK,
      body: page([service('21', 'Branch', null), service('20', 'Branch', null)]),
    };
    show(<ServicesList />);
    await table();
    const links = screen.getAllByRole('link', { name: 'Branch' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/setup/services/21',
      '/setup/services/20',
    ]);
  });
});

describe('ServicesList: names are text only (T-4.1-91)', () => {
  it('"Fuel < 50 km" and "<b>x</b>" show as typed in the list cell and the delete dialog, and no element is created from them', async () => {
    api.list = { status: HTTP_OK, body: page([FUEL, BOLD]) };
    const scriptsBefore = document.querySelectorAll('script').length;
    const user = userEvent.setup();
    show(<ServicesList />);
    await table();
    expect(screen.getByRole('link', { name: 'Fuel < 50 km' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '<b>x</b>' })).toBeTruthy();
    for (const one of [FUEL, BOLD]) {
      await user.click(
        inline(one.name).getByRole('button', { name: `Delete service ${one.name}` }),
      );
      const open = await dialog();
      expect(within(open).getByRole('heading').textContent).toBe(`Delete service ${one.name}?`);
      await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
      await closed();
    }
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('ServicesList: labelled row actions (UI-SPEC List)', () => {
  it('Edit is a filled button "Edit Office"; Delete is a red ghost button with the trash icon after a separator, "Delete service Office"', async () => {
    show(<ServicesList />);
    await table();
    const actions = inline(OFFICE.name);
    const edit = actions.getByRole('button', { name: 'Edit Office' });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const remove = actions.getByRole('button', { name: 'Delete service Office' });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.getAttribute('data-variant')).toBe('ghost');
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.previousElementSibling?.getAttribute('data-slot')).toBe('separator');
  });

  it('Mobile: below md both are in the kebab "Actions for Office": Edit, then Delete in the destructive variant after a separator', async () => {
    const user = userEvent.setup();
    show(<ServicesList />);
    await table();
    await user.click(within(row(OFFICE.name)).getByRole('button', { name: 'Actions for Office' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit Office',
      'Delete service Office',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[1]?.previousElementSibling?.getAttribute('role')).toBe('separator');
  });

  it('the Service Name link opens the record and records the list URL for the way back (D-28, D-35)', async () => {
    window.history.replaceState(null, '', '/setup/services?q=sp');
    show(<ServicesList />, { searchParams: '?q=sp' });
    await table();
    const link = screen.getByRole('link', { name: 'Spare' });
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(sessionStorage.getItem('erp.list.return:/setup/services')).toContain(
      '/setup/services?q=sp',
    );
  });

  it('Edit records the list URL, seeds the form from the row and opens /setup/services/7', async () => {
    window.history.replaceState(null, '', '/setup/services?q=of');
    show(<ServicesList />, { searchParams: '?q=of' });
    await table();
    await userEvent.click(inline(OFFICE.name).getByRole('button', { name: 'Edit Office' }));
    expect(push).toHaveBeenCalledWith('/setup/services/7');
    expect(sessionStorage.getItem('erp.list.return:/setup/services')).toContain(
      '/setup/services?q=of',
    );
  });
});

describe('ServicesList: Delete (D-07, D-28, D-25.1, UI-SPEC G8)', () => {
  it('DeleteConfirm: a service nothing uses: "Delete service Spare?", "This cannot be undone.", Keep / Delete (destructive, trash icon, enabled), focus on Keep', async () => {
    show(<ServicesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete service Spare?');
    expect(bodyOf(open)).toBe(EN.delete_body);
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe('Keep service');
    expect(confirm.textContent).toBe('Delete service');
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; the 204 toasts "Service deleted", closes the dialog and the list pages ask again', async () => {
    show(<ServicesList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/services/8']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('DeleteRefused: the race: the list said nothing used it, the api answers 409: the in-use text inside the dialog, Delete disabled, a second click sends nothing, and the list pages ask again (G8)', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, IN_USE) };
    window.history.replaceState(null, '', '/setup/services?q=race-409');
    show(<ServicesList />, { searchParams: '?q=race-409', swr: GLOBAL });
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
    window.history.replaceState(null, '', '/setup/services?q=gone-404');
    show(<ServicesList />, { searchParams: '?q=gone-404', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    api.list = { status: HTTP_OK, body: page([OFFICE, LEGACY]) };
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
    show(<ServicesList />);
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
    show(<ServicesList />);
    await openDelete();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    for (const bare of ['Confirm', 'Cancel', 'Save', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('ServicesList: the toolbar (D-19, D-26, D-42, ADR-0043)', () => {
  it('typing "of" searches the api (q=of), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<ServicesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'of');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('of');
    });
    expect(listReads().map((r) => r.url.searchParams.get('q'))).not.toContain('o');
  });

  it('the Export menu offers CSV, Excel, PDF and Print; CSV sends the two translated labels in the api order: ID, Service Name', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<ServicesList />);
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
    expect(sent?.url.searchParams.getAll('column')).toEqual(['id', 'name']);
    expect(sent?.url.searchParams.getAll('header')).toEqual([EN.id, EN.services_dt_name]);
  });

  it('Add Service links to /setup/services/new', async () => {
    show(<ServicesList />);
    await table();
    expect(screen.getByRole('link', { name: EN.new_service }).getAttribute('href')).toBe(
      '/setup/services/new',
    );
  });
});

describe('GuardedServicesList: the gate is ADMIN_GATE (D-06, D-26)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedServicesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('anyone else is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedServicesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });
});

describe('ServicesList: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack title and no physical-direction class', async () => {
    const { container } = show(<ServicesList />, { locale: 'ar' });
    await table();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(AR.services);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
