// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { mutate, SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
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
import { GuardedTodosList, TodosList } from '../TodoList';

/**
 * The To Do screen: two panels (unfinished, latest finished), each paged by "Load more"; a row has
 * a checkbox, the description as TEXT, its date, Edit and Delete. Every member sees their own
 * (the auth guard only, no admin gate). The transport is a fake axios adapter on the shared
 * instance, so the real read and write paths run.
 */
const EN = en.todo;
const AR = ar.todo;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/todo';

// Test ids of the screen: change here if the component names them differently.
const PANEL = (status: 'unfinished' | 'finished') => `todos-${status}`;
const ROW = 'todo-row';
const EMPTY = (status: 'unfinished' | 'finished') => `todos-empty-${status}`;
/** The page title key of `en.json`. */
const TITLE = EN.todos;

const editLabel = (name: string): string => EN.edit_action_named.replace('{name}', name);
const deleteLabel = (name: string): string => EN.delete_action_named.replace('{name}', name);

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/todo',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const todo = (id: string, description: string, finished = false) => ({
  id,
  description,
  finished,
  dateAdded: '2026-10-02T20:30:15.000Z',
  dateFinished: finished ? '2026-10-03T08:00:00.000Z' : null,
});
type TodoFixture = ReturnType<typeof todo>;

const page = (rows: readonly TodoFixture[], nextCursor: string | null = null) => ({
  data: rows,
  meta: { nextCursor, total: rows.length },
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
let api: {
  me: Reply;
  /** Keyed `${status}:${cursor ?? ''}`; an unlisted page is an empty one. */
  pages: Record<string, Reply>;
  finish: Reply;
  remove: Reply;
};
let requests: { readonly method: string; readonly url: URL; readonly body: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  const raw: unknown = config.data;
  requests.push({ method, url, body: typeof raw === 'string' ? JSON.parse(raw) : raw });
  let reply: Reply;
  if (url.pathname === '/api/v1/auth/me') reply = api.me;
  else if (method === 'DELETE') reply = api.remove;
  else if (method === 'PATCH') reply = api.finish;
  else {
    const key = `${url.searchParams.get('status') ?? ''}:${url.searchParams.get('cursor') ?? ''}`;
    reply = api.pages[key] ?? { status: HTTP_OK, body: page([]) };
  }
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
const patches = () => requests.filter((r) => r.method === 'PATCH');
const deletes = () => requests.filter((r) => r.method === 'DELETE');

const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };
/**
 * The app's ONE cache: `revalidateLists` (the refresh after a toggle or a delete) writes through the
 * global cache, as the app's `SwrProvider` has it. It is emptied after every test.
 */
const GLOBAL: SWRConfiguration = { shouldRetryOnError: false, dedupingInterval: 0 };

function show(
  ui: ReactElement,
  { locale, swr = ISOLATED }: { locale?: 'ar'; swr?: SWRConfiguration } = {},
) {
  return renderWithProviders(
    <SWRConfig value={swr}>
      {ui}
      <Toaster />
    </SWRConfig>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(false) },
    pages: {
      'unfinished:': {
        status: HTTP_OK,
        body: page([todo('7', 'Call Ali'), todo('8', 'Send quote')]),
      },
      'finished:': { status: HTTP_OK, body: page([todo('3', 'Book flight', true)]) },
    },
    finish: { status: HTTP_OK, body: todo('7', 'Call Ali', true) },
    remove: { status: NO_CONTENT },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
});
afterEach(async () => {
  toast.dismiss();
  cleanup();
  await mutate(() => true, undefined, { revalidate: false });
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

const panel = (status: 'unfinished' | 'finished') => screen.findByTestId(PANEL(status));
const rowOf = (scope: HTMLElement, description: string): HTMLElement => {
  const row = within(scope).getByText(description).closest(`[data-testid="${ROW}"]`);
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${description}`);
  return row;
};
const dialog = () => screen.findByTestId('confirm-dialog');
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('TodosList: the panels', () => {
  it('shows the title and the two panels with their headings, the unfinished first', async () => {
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    const finished = await panel('finished');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLE);
    expect(within(unfinished).getByRole('heading', { level: 2 }).textContent).toBe(EN.unfinished);
    expect(within(finished).getByRole('heading', { level: 2 }).textContent).toBe(EN.finished);
    expect(
      unfinished.compareDocumentPosition(finished) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('reads each panel from its own status', async () => {
    show(<TodosList />);
    await panel('unfinished');
    await waitFor(() => {
      expect(
        listReads()
          .map((r) => r.url.searchParams.get('status'))
          .sort(),
      ).toEqual(['finished', 'unfinished']);
    });
  });

  it('Loaded: the unfinished rows in the panel, the finished one in the other', async () => {
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    const finished = await panel('finished');
    expect(await within(unfinished).findByText('Call Ali')).toBeTruthy();
    expect(within(unfinished).getByText('Send quote')).toBeTruthy();
    expect(await within(finished).findByText('Book flight')).toBeTruthy();
    expect(within(unfinished).queryByText('Book flight')).toBeNull();
  });

  it('a row shows the date it was added; a finished row the date it was finished', async () => {
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    const finished = await panel('finished');
    await within(unfinished).findByText('Call Ali');
    expect(rowOf(unfinished, 'Call Ali').textContent).toContain(EN.added_on.split('{date}')[0]);
    await within(finished).findByText('Book flight');
    expect(rowOf(finished, 'Book flight').textContent).toContain(EN.finished_on.split('{date}')[0]);
  });

  it('a finished row is checked and struck through; an unfinished one is neither', async () => {
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    const finished = await panel('finished');
    await within(finished).findByText('Book flight');
    const done = within(rowOf(finished, 'Book flight')).getByRole('checkbox');
    expect((done as HTMLInputElement).checked).toBe(true);
    expect(done.getAttribute('aria-label')).toBe(EN.mark_unfinished);
    expect(within(finished).getByText('Book flight').className).toContain('line-through');
    await within(unfinished).findByText('Call Ali');
    const open = within(rowOf(unfinished, 'Call Ali')).getByRole('checkbox');
    expect((open as HTMLInputElement).checked).toBe(false);
    expect(open.getAttribute('aria-label')).toBe(EN.mark_finished);
    expect(within(unfinished).getByText('Call Ali').className).not.toContain('line-through');
  });

  it('Empty: each panel says it has none, in its own words', async () => {
    api.pages = {};
    show(<TodosList />);
    expect((await screen.findByTestId(EMPTY('unfinished'))).textContent).toBe(EN.empty_unfinished);
    expect((await screen.findByTestId(EMPTY('finished'))).textContent).toBe(EN.empty_finished);
    expect(screen.queryByRole('button', { name: EN.load_more })).toBeNull();
  });

  it('Loading: no empty text and no rows while the first answer is unknown', async () => {
    api.pages = {
      'unfinished:': 'pending',
      'finished:': 'pending',
    };
    show(<TodosList />);
    await settle();
    expect(screen.queryByTestId(EMPTY('unfinished'))).toBeNull();
    expect(screen.queryByTestId(EMPTY('finished'))).toBeNull();
    expect(screen.queryAllByTestId(ROW)).toHaveLength(0);
  });

  it('Error: one panel failing says so with Retry and leaves the other panel working', async () => {
    api.pages['unfinished:'] = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    const finished = await panel('finished');
    const error = await within(unfinished).findByTestId('inline-error');
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(await within(finished).findByText('Book flight')).toBeTruthy();
  });
});

describe('TodosList: Load more', () => {
  it('shows Load more only while the panel has a next cursor, and appends the next page', async () => {
    api.pages['unfinished:'] = { status: HTTP_OK, body: page([todo('7', 'Call Ali')], 'c1') };
    api.pages['unfinished:c1'] = { status: HTTP_OK, body: page([todo('9', 'Pay rent')]) };
    const user = userEvent.setup();
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    await within(unfinished).findByText('Call Ali');
    // The finished panel has no next cursor, so the one button is the unfinished panel's.
    expect(screen.getAllByRole('button', { name: EN.load_more })).toHaveLength(1);

    await user.click(within(unfinished).getByRole('button', { name: EN.load_more }));

    expect(await within(unfinished).findByText('Pay rent')).toBeTruthy();
    expect(within(unfinished).getByText('Call Ali')).toBeTruthy();
    const asked = listReads().find((r) => r.url.searchParams.get('cursor') === 'c1');
    expect(asked?.url.searchParams.get('status')).toBe('unfinished');
    expect(screen.queryByRole('button', { name: EN.load_more })).toBeNull();
  });
});

describe('TodoList: finishing and reopening', () => {
  it('ticking the box PATCHes { finished: true } to the to do, then the lists ask again', async () => {
    const user = userEvent.setup();
    show(<TodosList />, { swr: GLOBAL });
    const unfinished = await panel('unfinished');
    await within(unfinished).findByText('Call Ali');
    await settle();
    const before = listReads().length;

    await user.click(within(rowOf(unfinished, 'Call Ali')).getByRole('checkbox'));

    await waitFor(() => {
      expect(patches()).toHaveLength(1);
    });
    expect(patches()[0]?.url.pathname).toBe('/api/v1/todo/7/finished');
    expect(patches()[0]?.body).toEqual({ finished: true });
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('unticking a finished to do PATCHes { finished: false }', async () => {
    api.finish = { status: HTTP_OK, body: todo('3', 'Book flight') };
    const user = userEvent.setup();
    show(<TodosList />);
    const finished = await panel('finished');
    await within(finished).findByText('Book flight');

    await user.click(within(rowOf(finished, 'Book flight')).getByRole('checkbox'));

    await waitFor(() => {
      expect(patches()).toHaveLength(1);
    });
    expect(patches()[0]?.url.pathname).toBe('/api/v1/todo/3/finished');
    expect(patches()[0]?.body).toEqual({ finished: false });
  });
});

describe('TodosList: names are text only', () => {
  it('"<b>x</b>" and "<script>" show as typed and no element is created from them', async () => {
    api.pages['unfinished:'] = {
      status: HTTP_OK,
      body: page([todo('11', '<b>x</b>'), todo('12', '<script>alert(1)</script>')]),
    };
    const scriptsBefore = document.querySelectorAll('script').length;
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    expect(await within(unfinished).findByText('<b>x</b>')).toBeTruthy();
    expect(within(unfinished).getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
  });
});

describe('TodosList: New, Edit and Delete', () => {
  it('New To Do goes to /todo/new', async () => {
    show(<TodosList />);
    await panel('unfinished');
    await userEvent.click(screen.getByRole('button', { name: EN.new_todo }));
    expect(push).toHaveBeenCalledWith('/setup/todo/new');
  });

  it('Edit goes to the record page /todo/7', async () => {
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    await within(unfinished).findByText('Call Ali');
    await userEvent.click(within(unfinished).getByRole('button', { name: editLabel('Call Ali') }));
    expect(push).toHaveBeenCalledWith('/setup/todo/7');
  });

  it('Delete asks first and sends nothing until it is confirmed', async () => {
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    await within(unfinished).findByText('Call Ali');
    await userEvent.click(
      within(unfinished).getByRole('button', { name: deleteLabel('Call Ali') }),
    );
    const open = await dialog();
    expect(within(open).getByRole('heading').textContent).toBe(EN.delete_title);
    expect(open.textContent).toContain(EN.delete_body);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once, toasts "To do deleted", closes the dialog and the lists ask again', async () => {
    const user = userEvent.setup();
    show(<TodosList />, { swr: GLOBAL });
    const unfinished = await panel('unfinished');
    await within(unfinished).findByText('Call Ali');
    await settle();
    const before = listReads().length;
    await user.click(within(unfinished).getByRole('button', { name: deleteLabel('Call Ali') }));
    const open = await dialog();

    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();

    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/todo/7']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('a 404 (deleted elsewhere): the not-found text inside the dialog and Delete disabled', async () => {
    api.remove = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    const user = userEvent.setup();
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    await within(unfinished).findByText('Call Ali');
    await user.click(within(unfinished).getByRole('button', { name: deleteLabel('Call Ali') }));
    const open = await dialog();

    await user.click(within(open).getByTestId('confirm-dialog-confirm'));

    expect((await screen.findByTestId('confirm-dialog-error')).textContent).toBe(
      EN.errors['ERP-CORE-0004'],
    );
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
  });

  it('a network failure: the common text, Delete still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    const user = userEvent.setup();
    show(<TodosList />);
    const unfinished = await panel('unfinished');
    await within(unfinished).findByText('Call Ali');
    await user.click(within(unfinished).getByRole('button', { name: deleteLabel('Call Ali') }));
    const open = await dialog();
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

describe('GuardedTodoList: any signed-in member (no admin gate)', () => {
  it("a member who is not an administrator sees their own to do's", async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedTodosList />);
    expect(await panel('unfinished')).toBeTruthy();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('shows no to do and no refusal while session is pending', () => {
    clearSession();
    show(<GuardedTodosList />);
    expect(screen.queryByTestId(PANEL('unfinished'))).toBeNull();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });
});

describe('TodosList: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack title and no physical-direction class', async () => {
    const { container } = show(<TodosList />, { locale: 'ar' });
    await panel('unfinished');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(AR.todos);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
