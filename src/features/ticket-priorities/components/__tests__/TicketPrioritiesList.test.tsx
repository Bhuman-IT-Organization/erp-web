// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { TicketPrioritiesRow } from '@/features/ticket-priorities/schemas/ticket-priorities.schema';
import shellEn from '@/features/shell/messages/en.json';
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
import { GuardedTicketPrioritiesList, TicketPrioritiesList } from '../TicketPrioritiesList';

/**
 * The list screen on `ListPageTemplate`. The template's own tests cover the URL state, the search
 * and the pager; these cover what the SCREEN decides: Perfex's one column, the labelled Edit and
 * Delete, the delete refused live by the api (used by a ticket, the email-piping default) or
 * answered 404, one `it` per state, names rendered as text, and the guard. The transport is a fake
 * axios adapter on the shared instance, so the real read and write paths run.
 */
const EN = en['ticket-priorities'];
const AR = ar['ticket-priorities'];
const COMMON = commonEn.common;
const TITLE = shellEn.shell.acs_ticket_priority_submenu;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/ticket-priorities';
const IN_USE = 'ERP-TICKETPRIORITIES-0001';
const EMAIL_DEFAULT = 'ERP-TICKETPRIORITIES-0002';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/ticket-priorities',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const LOW: TicketPrioritiesRow = { id: '1', name: 'Low' };
const MEDIUM: TicketPrioritiesRow = { id: '2', name: 'Medium' };
const HIGH: TicketPrioritiesRow = { id: '3', name: 'High' };
const ARABIC: TicketPrioritiesRow = { id: '4', name: 'عاجل' };
const BOLD: TicketPrioritiesRow = { id: '5', name: '<b>x</b>' };

const page = (rows: readonly TicketPrioritiesRow[]) => ({
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
let api: { me: Reply; list: Reply; remove: Reply };
let requests: { readonly method: string; readonly url: URL }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  requests.push({ method, url });
  const reply =
    url.pathname === '/api/v1/auth/me' ? api.me : method === 'DELETE' ? api.remove : api.list;
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
/** The app's ONE cache: `revalidateLists` writes through it, so a test of it uses a `q` no other test uses. */
const GLOBAL: SWRConfiguration = { shouldRetryOnError: false, dedupingInterval: 0 };

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

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(true) },
    list: { status: HTTP_OK, body: page([LOW, MEDIUM, HIGH]) },
    remove: { status: NO_CONTENT },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/ticket-priorities');
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

const table = () => screen.findByTestId('list-table');
const row = (name: string): HTMLElement => {
  const tr = screen.getByRole('link', { name }).closest('tr');
  if (tr === null) throw new Error(`no row for ${name}`);
  return tr;
};
const inline = (name: string) => within(within(row(name)).getByTestId('row-actions-inline'));
const dialog = () => screen.findByTestId('confirm-dialog');
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

/** Opens the delete of one priority; by default Low. */
async function openDelete(user = userEvent.setup(), one: TicketPrioritiesRow = LOW) {
  await table();
  await user.click(
    inline(one.name).getByRole('button', { name: `Delete ticket priority ${one.name}` }),
  );
  return { user, open: await dialog() };
}

describe('TicketPrioritiesList: the states', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<TicketPrioritiesList />);
    const skeleton = await screen.findByTestId('list-loading');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    for (const id of ['list-empty', 'list-no-results', 'list-error', 'list-table']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(document.body.textContent).not.toContain(EN.no_ticket_priorities_found);
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('Empty: the Perfex "no priorities found" key and New Priority to /setup/ticket-priorities/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<TicketPrioritiesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.no_ticket_priorities_found);
    expect(empty.textContent).toContain(EN.empty_body);
    expect(
      within(empty).getByRole('link', { name: EN.new_ticket_priority }).getAttribute('href'),
    ).toBe('/setup/ticket-priorities/new');
  });

  it('NoResults: the query is named, with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<TicketPrioritiesList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe(
      EN.no_match_heading.replace('{query}', 'zz'),
    );
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });

  it('Error: a 503 says the list could not load in plain language and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<TicketPrioritiesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_ticket_priorities),
    );
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it("Loaded: the title is the shell menu key; two data columns, the ID and Perfex's Priority Name, both sortable; no checkbox", async () => {
    show(<TicketPrioritiesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLE);
    expect(
      within(list)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([EN.id, EN.ticket_priority_dt_name, COMMON.actions]);
    expect(screen.getByRole('link', { name: 'High' }).getAttribute('href')).toBe(
      '/setup/ticket-priorities/3',
    );
    expect(
      within(list)
        .getAllByRole('button', { name: /^Sort by / })
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([`Sort by ${EN.id}`, `Sort by ${EN.ticket_priority_dt_name}`]);
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
  });

  it('lists three rows and an Arabic name as it is stored', async () => {
    api.list = { status: HTTP_OK, body: page([LOW, ARABIC]) };
    show(<TicketPrioritiesList />);
    await table();
    expect(screen.getByRole('link', { name: 'عاجل' }).getAttribute('href')).toBe(
      '/setup/ticket-priorities/4',
    );
  });
});

describe('TicketPrioritiesList: names are text only', () => {
  it('"<b>x</b>" shows as typed in the list cell and the delete dialog, and no element is created from it', async () => {
    api.list = { status: HTTP_OK, body: page([BOLD]) };
    show(<TicketPrioritiesList />);
    const { user, open } = await openDelete(undefined, BOLD);
    expect(within(open).getByRole('heading').textContent).toBe(
      EN.delete_title.replace('{name}', '<b>x</b>'),
    );
    await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('TicketPrioritiesList: labelled row actions', () => {
  it('Edit is a filled button "Edit High"; Delete is a destructive ghost button with the trash icon, "Delete ticket priority High"', async () => {
    show(<TicketPrioritiesList />);
    await table();
    const actions = inline('High');
    const edit = actions.getByRole('button', { name: 'Edit High' });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const remove = actions.getByRole('button', { name: 'Delete ticket priority High' });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
  });

  it('Mobile: below md both are in the kebab "Actions for High": Edit, then Delete in the destructive variant', async () => {
    const user = userEvent.setup();
    show(<TicketPrioritiesList />);
    await table();
    await user.click(within(row('High')).getByRole('button', { name: 'Actions for High' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit High',
      'Delete ticket priority High',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
  });

  it('Edit records the list URL, seeds the form from the row and opens /setup/ticket-priorities/3', async () => {
    window.history.replaceState(null, '', '/setup/ticket-priorities?q=hi');
    show(<TicketPrioritiesList />, { searchParams: '?q=hi' });
    await table();
    await userEvent.click(inline('High').getByRole('button', { name: 'Edit High' }));
    expect(push).toHaveBeenCalledWith('/setup/ticket-priorities/3');
    expect(sessionStorage.getItem('erp.list.return:/setup/ticket-priorities')).toContain(
      '/setup/ticket-priorities?q=hi',
    );
  });
});

describe('TicketPrioritiesList: Delete', () => {
  it('DeleteConfirm: "Delete ticket priority Low?", "This cannot be undone.", Keep / Delete, focus on Keep, nothing sent', async () => {
    show(<TicketPrioritiesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete ticket priority Low?');
    expect(open.querySelector('[data-slot="alert-dialog-description"]')?.textContent).toBe(
      EN.delete_body,
    );
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe('Keep ticket priority');
    expect(confirm.textContent).toBe('Delete ticket priority');
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; the 204 toasts "Ticket priority deleted", closes the dialog and the list pages ask again', async () => {
    show(<TicketPrioritiesList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/ticket-priorities/1']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('409 ERP-TICKETPRIORITIES-0001 (used by a ticket): the in-use text inside the dialog, Delete disabled', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, IN_USE) };
    show(<TicketPrioritiesList />);
    const { user, open } = await openDelete();
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors[IN_USE]);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(deletes()).toHaveLength(1);
  });

  it('409 ERP-TICKETPRIORITIES-0002 (the email-piping default): its own text inside the dialog, Delete disabled', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, EMAIL_DEFAULT) };
    show(<TicketPrioritiesList />);
    const { user, open } = await openDelete(undefined, MEDIUM);
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors[EMAIL_DEFAULT]);
    expect(error.textContent).not.toBe(EN.errors[IN_USE]);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
  });

  it('404 ERP-CORE-0004 (deleted by someone else): the not-found text inside the dialog, and the list pages ask again so the row is gone when it closes', async () => {
    api.remove = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    window.history.replaceState(null, '', '/setup/ticket-priorities?q=gone-404');
    show(<TicketPrioritiesList />, { searchParams: '?q=gone-404', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    api.list = { status: HTTP_OK, body: page([MEDIUM, HIGH]) };
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    expect((await screen.findByTestId('confirm-dialog-error')).textContent).toBe(
      EN.errors['ERP-CORE-0004'],
    );
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
    await user.click(screen.getByTestId('confirm-dialog-dismiss'));
    await closed();
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Low' })).toBeNull();
    });
  });

  it('a 409 does NOT refresh the list (the row shows no usage): only a 404 does', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, IN_USE) };
    show(<TicketPrioritiesList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await screen.findByTestId('confirm-dialog-error');
    await settle();
    expect(listReads()).toHaveLength(before);
  });

  it('DeleteRetryable: a network failure: the common network text, Delete still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    show(<TicketPrioritiesList />);
    const { user, open } = await openDelete();
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    expect((await screen.findByTestId('confirm-dialog-error')).textContent).toBe(
      COMMON.errors['ERP-NETWORK-0001'],
    );
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(false);
    api.remove = { status: NO_CONTENT };
    await user.click(confirm);
    await closed();
    expect(deletes()).toHaveLength(2);
  });
});

describe('TicketPrioritiesList: toolbar and guard', () => {
  it('New Priority links to /setup/ticket-priorities/new', async () => {
    show(<TicketPrioritiesList />);
    await table();
    expect(screen.getByRole('link', { name: EN.new_ticket_priority }).getAttribute('href')).toBe(
      '/setup/ticket-priorities/new',
    );
  });

  it('typing "hi" searches the api (q=hi), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<TicketPrioritiesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'hi');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('hi');
    });
  });

  it('Guarded: an administrator sees the list', async () => {
    show(<GuardedTicketPrioritiesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('Guarded: anyone else is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedTicketPrioritiesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });

  it('Guarded: the skeleton while /me is unknown, never "no access"', async () => {
    api.me = 'pending';
    show(<GuardedTicketPrioritiesList />);
    await settle();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });
});

describe('TicketPrioritiesList: Arabic', () => {
  it('Rtl: renders under ar with the Arabic empty-state text and no physical-direction class', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    const { container } = show(<TicketPrioritiesList />, { locale: 'ar' });
    const empty = await screen.findByTestId('list-empty');
    expect(document.documentElement.dir).toBe('rtl');
    expect(within(empty).getByRole('heading').textContent).toBe(AR.no_ticket_priorities_found);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
