// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { TemplateListItem } from '@/features/mail/schemas/mail.schema';
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
import { EmailTemplatesList, GuardedEmailTemplatesList } from '../EmailTemplatesList';

/**
 * The Email Templates list (04.3 UI-SPEC § Email Templates list, § States and stories): one `it` per
 * story, over a fake axios adapter on the shared instance so the real read and write paths run.
 * Synthetic rows only ("Template 1", `zz_mod_a`).
 */
const EN = en.mail;
const COMMON = commonEn.common;
const LIST = '/api/v1/mail/templates';
const VIEW = 'settings.emailTemplates.view';
const EDIT = 'settings.emailTemplates.edit';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/email-templates',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const template = (id: number, patch: Partial<TemplateListItem> = {}): TemplateListItem => ({
  id: String(id),
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: true,
  locales: ['en', 'ar'],
  ...patch,
});
const NOTICE = template(4);
const REMIND = template(5, { key: 'remind_user_check_in', active: false, locales: ['en'] });
const OTHER = template(6, {
  key: 'zz_mod_a_template_1',
  module: 'zz_mod_a',
  audience: null,
  locales: [],
});

const page = (rows: readonly TemplateListItem[], modules = ['timesheets', 'zz_mod_a']) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    modules,
    locales: ['en', 'ar'],
  },
});
const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'user@example.test',
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
let requests: { readonly method: string; readonly url: URL; readonly data: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  requests.push({
    method,
    url,
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
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
    list: { status: 200, body: page([NOTICE, REMIND, OTHER]) },
    write: { status: 204 },
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
const rowOf = (name: string): HTMLElement => {
  const tr = screen.getByRole('link', { name }).closest('tr');
  if (tr === null) throw new Error(`no row for ${name}`);
  return tr;
};
const writes = () => requests.filter((r) => r.method !== 'GET');
const listReads = () => requests.filter((r) => r.method === 'GET' && r.url.pathname === LIST);
const NOTICE_NAME = EN.template_names.attendance_notice;
const REMIND_NAME = EN.template_names.remind_user_check_in;

describe('EmailTemplatesList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton with the filter row and no empty, error or no-access text', async () => {
    api.list = 'pending';
    show(<EmailTemplatesList />);
    expect(await screen.findByTestId('list-loading')).toBeTruthy();
    expect(screen.getByTestId('skeleton-filter-row')).toBeTruthy();
    expect(document.body.textContent).not.toContain(EN.templates_empty_heading);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('Empty: "No email templates yet" only after the list answered empty, with Perfex\'s link above', async () => {
    api.list = { status: 200, body: page([], []) };
    show(<EmailTemplatesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(empty.textContent).toContain(EN.templates_empty_heading);
    expect(empty.textContent).toContain(EN.templates_empty_body);
    const link = screen.getByRole('link', {
      name: `${EN.open_perfex_templates} ${EN.opens_in_perfex}`,
    });
    expect(link.getAttribute('href')).toBe('/admin/emails');
  });

  it('NoResults: a Module filter matching nothing reads the no-match heading with Clear search and filters', async () => {
    api.list = { status: 200, body: page([]) };
    show(<EmailTemplatesList />, { searchParams: '?filter[module][in]=zz_mod_b' });
    const empty = await screen.findByTestId('list-no-results');
    expect(empty.textContent).toContain('No email templates match your search or filters');
    expect(
      within(empty).getByRole('button', { name: COMMON.clear_search_and_filters }),
    ).toBeTruthy();
  });

  it('Error: a 503 reads "We couldn\'t load email templates" with Retry, never the code', async () => {
    api.list = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show(<EmailTemplatesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_email_templates),
    );
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(error.textContent).not.toMatch(/ERP-/);
  });

  it('Loaded: the title, the scope notice, the five columns and the names', async () => {
    show(<EmailTemplatesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.email_templates);
    expect(screen.getByTestId('templates-scope-notice').textContent).toContain(
      EN.templates_scope_notice,
    );
    expect(
      within(list)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      expect.stringContaining(EN.email_templates_table_heading_name),
      expect.stringContaining(EN.module),
      EN.sent_to,
      EN.languages,
      EN.active,
      COMMON.actions,
    ]);
    expect(screen.getByRole('link', { name: NOTICE_NAME }).getAttribute('href')).toBe(
      '/setup/email-templates/4',
    );
    const notice = rowOf(NOTICE_NAME);
    expect(notice.textContent).toContain('Timesheets');
    expect(notice.textContent).toContain(EN.staff);
    expect(notice.textContent).toContain('English, Arabic');
  });

  it('a template key with no name shows the raw key in <bdi>; an unknown module reads as itself; empty cells read None', async () => {
    show(<EmailTemplatesList />);
    await table();
    const other = rowOf('zz_mod_a_template_1');
    expect(other.querySelector('bdi')?.textContent).toBe('zz_mod_a_template_1');
    expect(other.textContent).toContain('zz_mod_a');
    // Sent to (no definition) is None; Languages has no version but two alert badges.
    expect(other.textContent).toContain(COMMON.none);
    expect(other.textContent).not.toContain(String.fromCodePoint(0x2014));
  });

  it('TranslationMissing: an alert badge "Arabic missing" for each supported locale without a version', async () => {
    show(<EmailTemplatesList />);
    await table();
    const badges = rowOf(REMIND_NAME).querySelectorAll('[data-status="alert"]');
    expect([...badges].map((b) => b.textContent)).toEqual(['Arabic missing']);
    expect(rowOf(NOTICE_NAME).querySelector('[data-status="alert"]')).toBeNull();
    expect(
      [...rowOf('zz_mod_a_template_1').querySelectorAll('[data-status="alert"]')].map(
        (b) => b.textContent,
      ),
    ).toEqual(['English missing', 'Arabic missing']);
  });

  it('Rtl: no physical-direction class under ar', async () => {
    show(<EmailTemplatesList />, { locale: 'ar' });
    await table();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });

  it('Mobile: Sent to and Languages hide below md and lg; every action stays in the row menu', async () => {
    show(<EmailTemplatesList />);
    const list = await table();
    const header = (text: string) =>
      within(list)
        .getAllByRole('columnheader')
        .find((th) => th.textContent === text);
    expect(header(EN.sent_to)?.className).toContain('hidden md:table-cell');
    expect(header(EN.languages)?.className).toContain('hidden lg:table-cell');
    expect(within(rowOf(NOTICE_NAME)).getByTestId('row-actions-menu')).toBeTruthy();
  });

  it('a markup module or key is text on the page, never an element (T-4.3-16)', async () => {
    api.list = {
      status: 200,
      body: page([template(7, { key: 'zz_<b>x</b>', module: '<i>zz_mod_a</i>' })]),
    };
    show(<EmailTemplatesList />);
    const list = await table();
    expect(list.querySelector('i')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
    expect(list.textContent).toContain('<i>zz_mod_a</i>');
  });
});

describe('EmailTemplatesList: row actions', () => {
  it('Edit is the one quiet button; it opens the editor seeded from the row', async () => {
    show(<EmailTemplatesList />);
    await table();
    const inline = within(within(rowOf(NOTICE_NAME)).getByTestId('row-actions-inline'));
    await userEvent.click(inline.getByRole('button', { name: `Edit ${NOTICE_NAME}` }));
    expect(push).toHaveBeenCalledWith('/setup/email-templates/4');
  });

  it('Sent emails links to the log filtered by the template KEY, for an administrator', async () => {
    show(<EmailTemplatesList />);
    await table();
    const user = userEvent.setup();
    await user.click(
      within(rowOf(NOTICE_NAME)).getByRole('button', { name: `Actions for ${NOTICE_NAME}` }),
    );
    const item = await screen.findByRole('menuitem', { name: `Sent emails of ${NOTICE_NAME}` });
    expect(item.getAttribute('href')).toBe(
      '/setup/sent-emails?filter[template][in]=attendance_notice',
    );
  });

  it('a member who is not an administrator gets no Sent emails action (the log is administrator-only)', async () => {
    api.me = { status: 200, body: me(false, [VIEW, EDIT]) };
    show(<EmailTemplatesList />);
    await table();
    const user = userEvent.setup();
    await user.click(
      within(rowOf(NOTICE_NAME)).getByRole('button', { name: `Actions for ${NOTICE_NAME}` }),
    );
    expect(await screen.findByRole('menuitem', { name: `Edit ${NOTICE_NAME}` })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: `Sent emails of ${NOTICE_NAME}` })).toBeNull();
  });
});

describe('EmailTemplatesList: the Active switch (immediate both ways, M11)', () => {
  it('turning one off PUTs at once with "Email template disabled"; turning one on says "Email template enabled"', async () => {
    api.write = { status: 200, body: { ...NOTICE, active: false } };
    show(<EmailTemplatesList />);
    await table();
    await userEvent.click(
      within(rowOf(NOTICE_NAME)).getByRole('switch', { name: `Active: ${NOTICE_NAME}` }),
    );
    expect(await screen.findByText(EN.disabled_toast)).toBeTruthy();
    api.write = { status: 200, body: { ...REMIND, active: true } };
    await userEvent.click(
      within(rowOf(REMIND_NAME)).getByRole('switch', { name: `Active: ${REMIND_NAME}` }),
    );
    expect(await screen.findByText(EN.enabled_toast)).toBeTruthy();
    expect(writes().map((w) => [w.method, w.url.pathname, w.data])).toEqual([
      ['PUT', '/api/v1/mail/templates/4/active', { active: false }],
      ['PUT', '/api/v1/mail/templates/5/active', { active: true }],
    ]);
  });

  it('SwitchPending: the switch is disabled and aria-busy while its write is in flight', async () => {
    api.write = 'pending';
    show(<EmailTemplatesList />);
    await table();
    const toggle = within(rowOf(REMIND_NAME)).getByRole('switch', {
      name: `Active: ${REMIND_NAME}`,
    });
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute('aria-busy')).toBe('true');
    });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('SwitchFailed: the switch goes back and "Not saved. Try again." is announced beside it', async () => {
    api.write = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show(<EmailTemplatesList />);
    await table();
    const toggle = within(rowOf(REMIND_NAME)).getByRole('switch', {
      name: `Active: ${REMIND_NAME}`,
    });
    await userEvent.click(toggle);
    const status = await within(rowOf(REMIND_NAME)).findByRole('status');
    expect(status.textContent).toBe(EN.active_not_saved);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.getAttribute('aria-busy')).toBe('false');
  });

  it('a member with view but not edit sees Active and Inactive badges, no switch', async () => {
    api.me = { status: 200, body: me(false, [VIEW]) };
    show(<EmailTemplatesList />);
    await table();
    expect(screen.queryAllByRole('switch')).toEqual([]);
    expect(rowOf(NOTICE_NAME).querySelector('[data-status="active"]')?.textContent).toBe(EN.active);
    expect(rowOf(REMIND_NAME).querySelector('[data-status="inactive"]')?.textContent).toBe(
      EN.inactive,
    );
  });
});

describe('EmailTemplatesList: filters and search in the URL (K1, K2)', () => {
  it('reloads from a permalink with the three filters on the list request', async () => {
    show(<EmailTemplatesList />, {
      searchParams:
        '?filter[module][in]=timesheets&filter[translation][eq]=missing&filter[active][eq]=1',
    });
    await table();
    const read = listReads().find((r) => r.url.searchParams.get('limit') !== '1');
    expect(read?.url.searchParams.get('filter[module][in]')).toBe('timesheets');
    expect(read?.url.searchParams.get('filter[translation][eq]')).toBe('missing');
    expect(read?.url.searchParams.get('filter[active][eq]')).toBe('1');
  });

  it('Module writes filter[module][in], Translation filter[translation][eq], Status filter[active][eq]', async () => {
    const urls: string[] = [];
    show(<EmailTemplatesList />, { onUrl: (query) => urls.push(query) });
    await table();
    const user = userEvent.setup();
    const bar = within(screen.getByTestId('filter-bar-inline'));
    await user.click(bar.getByRole('combobox', { name: EN.module }));
    await user.click(await screen.findByRole('option', { name: 'Timesheets' }));
    await waitFor(() => {
      expect(urls.at(-1)).toContain('filter[module][in]=timesheets');
    });
    await user.keyboard('{Escape}');
    await user.click(bar.getByRole('combobox', { name: EN.translation }));
    await user.click(await screen.findByRole('option', { name: EN.translation_missing_filter }));
    await waitFor(() => {
      expect(urls.at(-1)).toContain('filter[translation][eq]=missing');
    });
    await user.click(bar.getByRole('combobox', { name: EN.status }));
    await user.click(await screen.findByRole('option', { name: EN.active }));
    await waitFor(() => {
      expect(urls.at(-1)).toContain('filter[active][eq]=1');
    });
    await user.click(bar.getByRole('combobox', { name: /^Status/ }));
    await user.click(await screen.findByRole('option', { name: EN.status_all }));
    await waitFor(() => {
      expect(urls.at(-1)).not.toContain('filter[active]');
    });
  });

  it('search writes q after the 300 ms settle', async () => {
    const urls: string[] = [];
    show(<EmailTemplatesList />, { onUrl: (query) => urls.push(query) });
    await table();
    await userEvent.type(screen.getByRole('textbox', { name: COMMON.search }), 'notice');
    await waitFor(() => {
      expect(urls.at(-1)).toContain('q=notice');
    });
  });

  it('FiltersMobileSheet: below md one Filters button opens the three filters in a sheet', async () => {
    show(<EmailTemplatesList />);
    await table();
    const mobile = within(screen.getByTestId('filter-bar-mobile'));
    await userEvent.click(mobile.getByRole('button', { name: COMMON.filters }));
    const sheet = await screen.findByRole('dialog');
    for (const label of [EN.module, EN.translation, EN.status]) {
      expect(within(sheet).getByRole('combobox', { name: label })).toBeTruthy();
    }
  });
});

describe('EmailTemplatesList: Enable All and Disable All (choice 5)', () => {
  it('ModuleFiltered: shown only with exactly one module in the filter and the edit code', async () => {
    show(<EmailTemplatesList />, { searchParams: '?filter[module][in]=timesheets' });
    await table();
    expect(await screen.findByRole('button', { name: EN.enable_all })).toBeTruthy();
    expect(screen.getByRole('button', { name: EN.disable_all })).toBeTruthy();
    cleanup();
    show(<EmailTemplatesList />, { searchParams: '?filter[module][in]=timesheets,zz_mod_a' });
    await table();
    expect(screen.queryByRole('button', { name: EN.enable_all })).toBeNull();
    cleanup();
    show(<EmailTemplatesList />);
    await table();
    expect(screen.queryByRole('button', { name: EN.disable_all })).toBeNull();
  });

  it('a member without the edit code never sees the group buttons', async () => {
    api.me = { status: 200, body: me(false, [VIEW]) };
    show(<EmailTemplatesList />, { searchParams: '?filter[module][in]=timesheets' });
    await table();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole('button', { name: EN.enable_all })).toBeNull();
    expect(screen.queryByRole('button', { name: EN.disable_all })).toBeNull();
  });

  it('Enable All posts { module, active: true } at once and toasts how many changed', async () => {
    api.list = { status: 200, body: page([NOTICE, REMIND]) };
    api.write = { status: 200, body: { changed: 1 } };
    show(<EmailTemplatesList />, { searchParams: '?filter[module][in]=timesheets' });
    await table();
    await userEvent.click(await screen.findByRole('button', { name: EN.enable_all }));
    expect(await screen.findByText('1 template enabled')).toBeTruthy();
    expect(writes().map((w) => [w.method, w.url.pathname, w.data])).toEqual([
      ['POST', '/api/v1/mail/templates/active', { module: 'timesheets', active: true }],
    ]);
  });

  it('DisableAllDialog: names the count and the module, keeps or disables, then toasts', async () => {
    api.list = { status: 200, body: page([NOTICE, REMIND]) };
    api.write = { status: 200, body: { changed: 2 } };
    show(<EmailTemplatesList />, { searchParams: '?filter[module][in]=timesheets' });
    await table();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: EN.disable_all }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Stop sending 2 Timesheets emails?',
    );
    expect(dialog.textContent).toContain(EN.disable_all_body);
    expect(within(dialog).getByRole('button', { name: EN.keep_templates_active })).toBeTruthy();
    // The count comes from the module's ACTIVE templates (what Disable All changes).
    const count = listReads().find((r) => r.url.searchParams.get('filter[active][eq]') === '1');
    expect(count?.url.searchParams.get('filter[module][in]')).toBe('timesheets');
    await user.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    expect(await screen.findByText('2 templates disabled')).toBeTruthy();
    expect(writes().map((w) => [w.method, w.url.pathname, w.data])).toEqual([
      ['POST', '/api/v1/mail/templates/active', { module: 'timesheets', active: false }],
    ]);
  });

  it('Keep templates active closes the dialog and sends nothing', async () => {
    api.list = { status: 200, body: page([NOTICE, REMIND]) };
    show(<EmailTemplatesList />, { searchParams: '?filter[module][in]=timesheets' });
    await table();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: EN.disable_all }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByTestId('confirm-dialog-confirm').textContent).toBe(
      'Disable 2 templates',
    );
    await user.click(within(dialog).getByRole('button', { name: EN.keep_templates_active }));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(writes()).toEqual([]);
  });
});

describe('GuardedEmailTemplatesList (settings.emailTemplates.view, D-09)', () => {
  it('a member without the view code gets the no-access state after /me answers, and the list is never read', async () => {
    api.me = { status: 200, body: me(false, []) };
    show(<GuardedEmailTemplatesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toEqual([]);
  });

  it('a member with the view code sees the list', async () => {
    api.me = { status: 200, body: me(false, [VIEW]) };
    show(<GuardedEmailTemplatesList />);
    expect(await table()).toBeTruthy();
  });

  it('nothing refuses while /me is unknown', async () => {
    api.me = 'pending';
    show(<GuardedEmailTemplatesList />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.getByTestId('permission-pending')).toBeTruthy();
  });
});
