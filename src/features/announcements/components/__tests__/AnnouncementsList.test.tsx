// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { Locale } from '@/i18n/locales';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
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
import { AnnouncementsList, GuardedAnnouncementsList } from '../AnnouncementsList';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/setup/announcements',
}));
const ROW = {
  hasOtherFormatting: false,
  id: '7',
  name: 'Retail',
  message: 'A message.',
  dateAdded: '2026-01-15T09:00:00.000Z',
  showToUsers: false,
  showToStaff: true,
  showName: false,
};
const page = {
  data: [ROW],
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: 1,
    rangeStart: 1,
    exportLimit: 10000,
    printLimit: 1000,
  },
};
const ME = {
  staffId: 1,
  email: 'a@b.invalid',
  firstName: 'A',
  lastName: 'B',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};
const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});
interface Reply {
  status: number;
  body?: unknown;
}
type ListReply = Reply | 'pending';
let me: typeof ME = ME;
let remove: Reply = { status: 204 };
let list: ListReply = { status: 200, body: page };
let requests: { method: string; url: string; search: string }[] = [];
function adapter(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toUpperCase();
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push({ method, url: url.pathname, search: url.search });
  if (url.pathname === '/api/v1/auth/me') {
    return Promise.resolve({
      data: me,
      status: 200,
      statusText: '200',
      headers: new AxiosHeaders(),
      config,
    });
  }
  let reply: Reply;
  if (method === 'DELETE') {
    reply = remove;
  } else {
    if (list === 'pending') return new Promise<never>(() => undefined);
    reply = list;
  }
  const status = reply.status;
  const response: AxiosResponse<unknown> = {
    data: status === 204 ? undefined : reply.body,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
  };
  return status < 300
    ? Promise.resolve(response)
    : Promise.reject(
        new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
          ...response,
          data: reply.body,
        }),
      );
}
const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };
/**
 * The app's ONE cache: `revalidateLists` (the refresh after a 404) writes through the global cache,
 * as the app's `SwrProvider` has it, so a test of it renders here with a `q` no other test uses.
 */
const GLOBAL: SWRConfiguration = { shouldRetryOnError: false, dedupingInterval: 0 };
const listReads = () =>
  requests.filter((r) => r.method === 'GET' && r.url === '/api/v1/announcements');
const show = (searchParams = '', locale: Locale = 'en', swr: SWRConfiguration = ISOLATED) =>
  renderWithProviders(
    <SWRConfig value={swr}>
      <AnnouncementsList />
      <Toaster />
    </SWRConfig>,
    { hasMemory: true, searchParams, locale },
  );
const showGuarded = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <GuardedAnnouncementsList />
    </SWRConfig>,
    { hasMemory: true },
  );
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  me = ME;
  remove = { status: 204 };
  list = { status: 200, body: page };
  requests = [];
  push.mockClear();
  http.defaults.adapter = adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('AnnouncementsList', () => {
  it('shows the loading state while the first list response is pending', async () => {
    list = 'pending';
    show();
    expect((await screen.findByTestId('list-loading')).getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('list-table')).toBeNull();
  });
  it('shows the empty state and its create link', async () => {
    list = {
      status: 200,
      body: { ...page, data: [], meta: { ...page.meta, total: 0, rangeStart: 0 } },
    };
    show();
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe('No announcements yet');
    expect(within(empty).getByRole('link', { name: 'New Announcement' }).getAttribute('href')).toBe(
      '/setup/announcements/new',
    );
  });
  it('shows the no-results state for a search with no matches', async () => {
    list = {
      status: 200,
      body: { ...page, data: [], meta: { ...page.meta, total: 0, rangeStart: 0 } },
    };
    show('?q=zz');
    const noResults = await screen.findByTestId('list-no-results');
    expect(noResults.textContent).toContain('No announcements match');
    expect(within(noResults).getByRole('button', { name: /clear search/i })).toBeTruthy();
  });
  it('uses the singular record noun in its list error and offers retry', async () => {
    list = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show();
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain("couldn't load announcements. Try again in a moment.");
    expect(error.textContent).not.toContain('ERP-UPSTREAM-0001');
    expect(within(error).getByRole('button', { name: /retry/i })).toBeTruthy();
  });
  it('shows Subject and Date and provides the export action', async () => {
    show();
    const table = await screen.findByTestId('list-table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Subject', 'Date', 'Actions']);
    expect(within(table).getByRole('link', { name: 'Retail' }).getAttribute('href')).toBe(
      '/setup/announcements/7',
    );
    expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
  });
  it('deletes an announcement after confirmation', async () => {
    show();
    const row = await screen.findByRole('link', { name: 'Retail' });
    const tr = row.closest('tr') as HTMLElement;
    await userEvent.click(within(tr).getByRole('button', { name: 'Delete announcement Retail' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    const beforeReads = listReads().length;
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(requests).toContainEqual(
        expect.objectContaining({ method: 'DELETE', url: '/api/v1/announcements/7' }),
      );
    });
    expect(await screen.findByText('Announcement deleted')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(listReads().length).toBeLessThanOrEqual(beforeReads + 1);
  });
  it('asks the list pages again when a delete hits a row already gone', async () => {
    remove = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show('?q=gone-404', 'en', GLOBAL);
    const row = await screen.findByRole('link', { name: 'Retail' });
    const before = listReads().length;
    await userEvent.click(
      within(row.closest('tr') as HTMLElement).getByRole('button', {
        name: 'Delete announcement Retail',
      }),
    );
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(within(dialog).getByTestId('confirm-dialog-error').textContent).toContain(
        'no longer exists',
      );
    });
    expect(within(dialog).getByTestId('confirm-dialog-error').textContent).not.toContain(
      'Something went wrong',
    );
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('sorts by the Subject and Date headers through the list request', async () => {
    show();
    const table = await screen.findByTestId('list-table');
    expect(listReads()[0]?.search ?? '').not.toContain('sort=');
    const [subject, date] = within(table).getAllByRole('columnheader');
    if (subject === undefined || date === undefined) throw new Error('no headers');
    await userEvent.click(within(subject).getByRole('button'));
    await waitFor(() => {
      expect(listReads().at(-1)?.search).toContain('sort=name');
    });
    await userEvent.click(within(date).getByRole('button'));
    await waitFor(() => {
      expect(listReads().at(-1)?.search).toContain('sort=dateadded');
    });
  });
  it('opens the edit form from the Edit row action', async () => {
    show();
    const link = await screen.findByRole('link', { name: 'Retail' });
    const tr = link.closest('tr') as HTMLElement;
    await userEvent.click(within(tr).getByRole('button', { name: 'Edit Retail' }));
    expect(push).toHaveBeenCalledWith('/setup/announcements/7');
  });
  it('names the export columns ID, Subject and Date', async () => {
    show();
    await screen.findByTestId('list-table');
    await userEvent.click(screen.getByTestId('list-export'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByTestId('list-export-csv')).toBeTruthy();
    expect(within(menu).getByTestId('list-export-xlsx')).toBeTruthy();
    expect(within(menu).getByTestId('list-export-pdf')).toBeTruthy();
    expect(within(menu).getByTestId('list-export-print')).toBeTruthy();
    expect(en.announcements.announcement_id).toBe('ID');
    expect(en.announcements.announcement_name).toBe('Subject');
    expect(en.announcements.date_added).toBe('Date');
  });
  it('shows a name with markup as plain text, never as an element', async () => {
    list = {
      status: 200,
      body: { ...page, data: [{ ...ROW, name: '<b>Bold</b>' }] },
    };
    show();
    const table = await screen.findByTestId('list-table');
    const link = within(table).getByRole('link', { name: '<b>Bold</b>' });
    expect(link.textContent).toBe('<b>Bold</b>');
    expect(table.querySelector('b')).toBeNull();
  });
  it('lists for an administrator behind the guards', async () => {
    showGuarded();
    expect(await screen.findByRole('link', { name: 'Retail' })).toBeTruthy();
  });
  it('shows a non-administrator no list and asks the api for nothing', async () => {
    me = { ...ME, isAdmin: false };
    showGuarded();
    await waitFor(() => {
      expect(requests.map((r) => r.url)).toContain('/api/v1/auth/me');
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('list-table')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Retail' })).toBeNull();
    expect(requests.filter((r) => r.url.startsWith('/api/v1/announcements'))).toEqual([]);
  });
  it('renders in Arabic with the Arabic headers and no physical-direction classes', async () => {
    show('', 'ar');
    const table = await screen.findByTestId('list-table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .slice(0, 2)
        .map((h) => h.textContent),
    ).toEqual([ar.announcements.announcement_name, ar.announcements.date_added]);
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});
