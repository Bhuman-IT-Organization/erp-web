// @vitest-environment happy-dom
import { cleanup, fireEvent } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { SentEmailRow } from '@/features/mail/schemas/mail.schema';
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
import { GuardedSentEmailsList, SentEmailsList } from '../SentEmailsList';

/**
 * The sent-email log (04.3 UI-SPEC § Sent emails log, § Resend, § States and stories): one `it` per
 * story, over a fake axios adapter on the shared instance so the real read and write paths run.
 * Synthetic entries only (`user@example.test`, "Template 1").
 */
const EN = en.mail;
const COMMON = commonEn.common;
const LIST = '/api/v1/mail/sent-emails';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/sent-emails',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const entry = (id: number, patch: Partial<SentEmailRow> = {}): SentEmailRow => ({
  id: String(id),
  templateKey: 'attendance_notice',
  isTest: false,
  recipient: `user${String(id)}@example.test`,
  locale: 'en',
  status: 'sent',
  attempts: 1,
  maxAttempts: 8,
  nextTryAt: null,
  queuedAt: '2026-10-03T08:00:00.000Z',
  sentAt: '2026-10-03T08:00:02.000Z',
  failureReason: null,
  templateActive: true,
  waitingForServer: false,
  ...patch,
});
const SENT = entry(41);
const FAILED = entry(42, {
  status: 'failed',
  attempts: 8,
  sentAt: null,
  failureReason: 'recipient_refused',
  locale: 'ar',
});
const RETRYING = entry(43, {
  status: 'retrying',
  attempts: 2,
  sentAt: null,
  nextTryAt: '2026-10-03T08:05:00.000Z',
  templateKey: 'remind_user_check_in',
});
const TEMPLATE_TEST = entry(44, { isTest: true, templateActive: null });
const STATUS_TEST = entry(45, { isTest: true, templateKey: null, templateActive: null });
const OFF = entry(46, { status: 'failed', templateActive: false, sentAt: null });
const ROWS = [SENT, FAILED, RETRYING, TEMPLATE_TEST, STATUS_TEST, OFF];

const page = (rows: readonly SentEmailRow[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    templates: ['attendance_notice', 'remind_user_check_in'],
  },
});
const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'admin@example.test',
  firstName: 'Some',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});
const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';
let api: { me: Reply; list: Reply; write: Reply };
let requests: { readonly method: string; readonly url: URL; readonly headers: AxiosHeaders }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  requests.push({ method, url, headers: AxiosHeaders.from(config.headers) });
  const reply =
    url.pathname === '/api/v1/auth/me' ? api.me : method === 'GET' ? api.list : api.write;
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

function show(
  ui: ReactElement,
  {
    searchParams = '',
    locale,
    onUrl,
  }: { searchParams?: string; locale?: 'ar'; onUrl?: (query: string) => void } = {},
) {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      {ui}
      <Toaster />
    </SWRConfig>,
    {
      searchParams,
      hasMemory: true,
      ...(locale === undefined ? {} : { locale }),
      ...(onUrl === undefined
        ? {}
        : {
            onUrlUpdate: (update: { readonly queryString: string }) => {
              onUrl(decodeURIComponent(update.queryString));
            },
          }),
    },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: 200, body: me(true) },
    list: { status: 200, body: page(ROWS) },
    write: { status: 202, body: { id: '99' } },
  };
  http.defaults.adapter = respond;
  push.mockClear();
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

const table = () => screen.findByTestId('list-table');
const rowOf = (recipient: string): HTMLElement => {
  const tr = screen.getByText(recipient).closest('tr');
  if (tr === null) throw new Error(`no row for ${recipient}`);
  return tr;
};
/** The list's own reads (not the facets read, which asks for one row). */
const listReads = () =>
  requests.filter(
    (r) => r.method === 'GET' && r.url.pathname === LIST && r.url.searchParams.get('limit') !== '1',
  );
const writes = () => requests.filter((r) => r.method !== 'GET');
const NOTICE = EN.template_names.attendance_notice;

describe('SentEmailsList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton with the filter row and no empty, error or no-access text', async () => {
    api.list = 'pending';
    show(<SentEmailsList />);
    expect(await screen.findByTestId('list-loading')).toBeTruthy();
    expect(screen.getByTestId('skeleton-filter-row')).toBeTruthy();
    expect(document.body.textContent).not.toContain(EN.log_empty_heading);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('Empty: "No emails sent yet" only after the list answered empty, with no action', async () => {
    api.list = { status: 200, body: page([]) };
    show(<SentEmailsList />);
    const empty = await screen.findByTestId('list-empty');
    expect(empty.textContent).toContain(EN.log_empty_heading);
    expect(empty.textContent).toContain(EN.log_empty_body);
    expect(within(empty).queryByRole('link')).toBeNull();
    expect(within(empty).queryByRole('button')).toBeNull();
  });

  it('NoResults: a filter matching nothing reads the no-match heading with Clear search and filters', async () => {
    api.list = { status: 200, body: page([]) };
    show(<SentEmailsList />, { searchParams: '?filter[status][in]=failed' });
    const empty = await screen.findByTestId('list-no-results');
    expect(empty.textContent).toContain('No sent emails match your search or filters');
    expect(
      within(empty).getByRole('button', { name: COMMON.clear_search_and_filters }),
    ).toBeTruthy();
  });

  it('Error: a 503 reads "We couldn\'t load sent emails" with Retry, never the code', async () => {
    api.list = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show(<SentEmailsList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_sent_emails),
    );
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(error.textContent).not.toMatch(/ERP-/);
  });

  it('Loaded: the title, the two captions, the six columns, newest first as the api answers', async () => {
    show(<SentEmailsList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.sent_emails);
    const header = screen.getByTestId('sent-emails-captions');
    expect(header.textContent).toContain(EN.body_not_kept);
    expect(header.textContent).toContain('Entries older than 12 months are removed.');
    expect(
      within(list)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      expect.stringContaining(EN.sent_when),
      EN.template,
      EN.status,
      EN.recipient,
      EN.language,
      EN.attempts,
      COMMON.actions,
    ]);
    const sent = rowOf(SENT.recipient);
    expect(within(sent).getByRole('link', { name: NOTICE }).getAttribute('href')).toBe(
      '/setup/sent-emails/41',
    );
    expect(screen.getByText(SENT.recipient).tagName).toBe('BDI');
    expect(sent.textContent).toContain('English');
    expect(sent.querySelector('[data-status="done"]')?.textContent).toBe(EN.status_sent);
    const attempts = within(sent).getByText('1');
    expect(attempts.className).toContain('tabular-nums');
    expect(rowOf(FAILED.recipient).textContent).toContain('Arabic');
    // Newest first is the api's default: the page sends no sort of its own.
    expect(listReads()[0]?.url.searchParams.get('sort')).toBeNull();
  });

  it('the search box says what it searches and writes q', async () => {
    show(<SentEmailsList />);
    await table();
    const search = screen.getByRole('textbox', { name: EN.search_recipient });
    expect(search.getAttribute('placeholder')).toBe(EN.search_recipient);
  });

  it('there is no export and no create (choice 13)', async () => {
    show(<SentEmailsList />);
    await table();
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
    expect(screen.queryByTestId('list-create')).toBeNull();
  });

  it('Retrying: the pending badge with "Next try at {time}" under it', async () => {
    show(<SentEmailsList />);
    await table();
    const retrying = rowOf(RETRYING.recipient);
    expect(retrying.querySelector('[data-status="pending"]')?.textContent).toBe(EN.status_retrying);
    expect(within(retrying).getByTestId('next-try').textContent).toMatch(/^Next try at /);
    expect(within(rowOf(SENT.recipient)).queryByTestId('next-try')).toBeNull();
  });

  it('Failed: the alert badge, never red', async () => {
    show(<SentEmailsList />);
    await table();
    const badge = rowOf(FAILED.recipient).querySelector('[data-status="alert"]');
    expect(badge?.textContent).toBe(EN.status_failed);
    expect(badge?.getAttribute('data-variant')).not.toBe('destructive');
  });

  it('TestEntry: a template test shows its name and the Test badge; a status-page test reads "Test email"', async () => {
    show(<SentEmailsList />);
    await table();
    const templateTest = rowOf(TEMPLATE_TEST.recipient);
    expect(within(templateTest).getByTestId('test-badge').textContent).toBe(EN.test_badge);
    expect(templateTest.textContent).toContain(NOTICE);
    const statusTest = rowOf(STATUS_TEST.recipient);
    expect(within(statusTest).getByRole('link', { name: EN.test_email_template })).toBeTruthy();
  });

  it('a long template name wraps in the long-text box, so Status stays in view at 1024 (screen review)', async () => {
    api.list = {
      status: 200,
      body: page([
        entry(48, { templateKey: 'new_leave_application_send_to_notification_recipient' }),
      ]),
    };
    show(<SentEmailsList />);
    await table();
    const name = within(rowOf('user48@example.test')).getByText(
      EN.template_names.new_leave_application_send_to_notification_recipient,
    );
    expect(name.className).toContain('max-w-xs');
    expect(name.className).toContain('min-w-40');
  });

  it('a key with no name shows the raw key; markup in a key or an address is text (T-4.3-16)', async () => {
    api.list = {
      status: 200,
      body: page([
        entry(47, { templateKey: 'zz_mod_a_template_1', recipient: '<b>x</b>@example.test' }),
      ]),
    };
    show(<SentEmailsList />);
    const list = await table();
    expect(list.textContent).toContain('zz_mod_a_template_1');
    expect(list.textContent).toContain('<b>x</b>@example.test');
    expect(list.querySelector('b')).toBeNull();
  });

  it('Rtl: no physical-direction class under ar', async () => {
    show(<SentEmailsList />, { locale: 'ar' });
    await table();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });

  it('Mobile: Recipient hides below md, Language and Attempts below lg; actions sit in the row menu', async () => {
    show(<SentEmailsList />);
    const list = await table();
    const header = (text: string) =>
      within(list)
        .getAllByRole('columnheader')
        .find((th) => th.textContent === text);
    expect(header(EN.recipient)?.className).toContain('hidden md:table-cell');
    expect(header(EN.language)?.className).toContain('hidden lg:table-cell');
    expect(header(EN.attempts)?.className).toContain('hidden lg:table-cell');
    expect(within(rowOf(SENT.recipient)).getByTestId('row-actions-menu')).toBeTruthy();
  });
});

describe('SentEmailsList: filters in the URL (K1, K2)', () => {
  it('WithFilters: a permalink with the four filters sends the keys, the status and the local-day bounds', async () => {
    show(<SentEmailsList />, {
      searchParams:
        '?filter[template][in]=attendance_notice,status-test&filter[status][in]=failed&filter[queuedAt][gte]=2026-10-01&filter[queuedAt][lte]=2026-10-02',
    });
    await table();
    const read = listReads().at(-1)?.url.searchParams;
    expect(read?.get('filter[template][in]')).toBe('attendance_notice,status-test');
    expect(read?.get('filter[status][in]')).toBe('failed');
    expect(read?.get('filter[queuedAt][gte]')).toBe(new Date(2026, 9, 1).toISOString());
    expect(read?.get('filter[queuedAt][lte]')).toBe(
      new Date(2026, 9, 2, 23, 59, 59, 999).toISOString(),
    );
  });

  it('the Template filter offers every template name from meta.templates plus "Test email"', async () => {
    show(<SentEmailsList />);
    await table();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: EN.template }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      NOTICE,
      EN.template_names.remind_user_check_in,
      EN.test_email_template,
    ]);
  });

  it('the Status filter writes filter[status][in]', async () => {
    const urls: string[] = [];
    show(<SentEmailsList />, { onUrl: (query) => urls.push(query) });
    await table();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: EN.status }));
    await user.click(await screen.findByRole('option', { name: EN.status_failed }));
    await waitFor(() => {
      expect(urls.at(-1)).toContain('filter[status][in]=failed');
    });
  });

  it('a From date writes the day itself to the URL, and the request gets its local start', async () => {
    const urls: string[] = [];
    show(<SentEmailsList />, { onUrl: (query) => urls.push(query) });
    await table();
    fireEvent.change(screen.getByLabelText(EN.from_date), { target: { value: '2026-10-01' } });
    await waitFor(() => {
      expect(urls.at(-1)).toContain('filter[queuedAt][gte]=2026-10-01');
    });
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('filter[queuedAt][gte]')).toBe(
        new Date(2026, 9, 1).toISOString(),
      );
    });
  });

  it('FiltersMobileSheet: below md one Filters button opens the four filters in a sheet', async () => {
    show(<SentEmailsList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.filters }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('combobox', { name: EN.template })).toBeTruthy();
    expect(within(sheet).getByRole('combobox', { name: EN.status })).toBeTruthy();
    expect(within(sheet).getByLabelText(EN.from_date).getAttribute('type')).toBe('date');
    expect(within(sheet).getByLabelText(EN.to_date).getAttribute('type')).toBe('date');
  });
});

describe('SentEmailsList: row actions and Resend', () => {
  it('View is the quiet main action named with the recipient; it opens the entry', async () => {
    show(<SentEmailsList />);
    await table();
    const inline = within(within(rowOf(SENT.recipient)).getByTestId('row-actions-inline'));
    await userEvent.click(inline.getByRole('button', { name: `View email to ${SENT.recipient}` }));
    expect(push).toHaveBeenCalledWith('/setup/sent-emails/41');
  });

  it.each([
    ['a sent entry', SENT, true],
    ['a failed entry', FAILED, true],
    ['a retrying entry', RETRYING, false],
    ['a template test', TEMPLATE_TEST, false],
    ['a status-page test', STATUS_TEST, false],
  ] as const)('Resend on %s: %s', async (_name, row, offered) => {
    show(<SentEmailsList />);
    await table();
    const user = userEvent.setup();
    await user.click(
      within(rowOf(row.recipient)).getByRole('button', {
        name: (label) => label.startsWith('Actions for'),
      }),
    );
    await screen.findByRole('menuitem', { name: `View email to ${row.recipient}` });
    expect(
      screen.queryByRole('menuitem', { name: `Resend email to ${row.recipient}` }) !== null,
    ).toBe(offered);
  });

  it('ResendDialog: confirm sends one POST with a key, toasts and the list is read again', async () => {
    show(<SentEmailsList />);
    await table();
    const before = listReads().length;
    const user = userEvent.setup();
    await user.click(
      within(rowOf(FAILED.recipient)).getByRole('button', {
        name: (label) => label.startsWith('Actions for'),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: `Resend email to ${FAILED.recipient}` }),
    );
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog.textContent).toContain(FAILED.recipient);
    await user.click(within(dialog).getByRole('button', { name: EN.resend_email }));
    expect(await screen.findByText(EN.resent_toast)).toBeTruthy();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]?.url.pathname).toBe('/api/v1/mail/sent-emails/42/resend');
    expect(writes()[0]?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f]{32}$/);
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('ResendRefusedInactive: the row says the template is off, so the dialog refuses up front', async () => {
    show(<SentEmailsList />);
    await table();
    const user = userEvent.setup();
    await user.click(
      within(rowOf(OFF.recipient)).getByRole('button', {
        name: (label) => label.startsWith('Actions for'),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: `Resend email to ${OFF.recipient}` }),
    );
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog.textContent).toContain(EN.errors['ERP-MAIL-0004']);
    expect(
      within(dialog).getByRole('button', { name: EN.resend_email }).hasAttribute('disabled'),
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });

  it('ResendRefusedLive: a 409 ERP-MAIL-0005 stays in the dialog with confirm disabled', async () => {
    api.write = { status: 409, body: problem(409, 'ERP-MAIL-0005') };
    show(<SentEmailsList />);
    await table();
    const user = userEvent.setup();
    await user.click(
      within(rowOf(SENT.recipient)).getByRole('button', {
        name: (label) => label.startsWith('Actions for'),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: `Resend email to ${SENT.recipient}` }),
    );
    const dialog = await screen.findByTestId('confirm-dialog');
    await user.click(within(dialog).getByRole('button', { name: EN.resend_email }));
    await waitFor(() => {
      expect(dialog.textContent).toContain(EN.errors['ERP-MAIL-0005']);
    });
    expect(
      within(dialog).getByRole('button', { name: EN.resend_email }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('GuardedSentEmailsList (administrator only, D-05)', () => {
  it('a member who is not an administrator gets the no-access state after /me answers, and the log is never read', async () => {
    api.me = { status: 200, body: me(false, ['settings.emailTemplates.view']) };
    show(<GuardedSentEmailsList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(requests.filter((r) => r.url.pathname === LIST)).toHaveLength(0);
  });

  it('an administrator sees the log', async () => {
    show(<GuardedSentEmailsList />);
    expect(await table()).toBeTruthy();
  });

  it('nothing refuses while /me is unknown', async () => {
    api.me = 'pending';
    show(<GuardedSentEmailsList />);
    expect(await screen.findByTestId('permission-pending')).toBeTruthy();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });
});
