// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type {
  LeadSourcesRow,
  LeadSourcesUsage,
} from '@/features/lead-sources/schemas/lead-sources.schema';
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
import { LeadSourcesList, GuardedLeadSourcesList } from '../LeadSourcesList';

/**
 * The list screen on `ListPageTemplate` (UIK-06). The template's own tests cover the URL state, the
 * search, the pager and the export mechanics; these cover what the SCREEN decides: Perfex's columns
 * (ID, Source Name), the labelled Edit and Delete, the delete refused up front from usage or
 * live from the api, one `it` per state of the UI-SPEC, the names rendered as text (T-4.1-91), and
 * the administrator-only guard.
 */
const EN = en['lead-sources'];
const AR = ar['lead-sources'];
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/lead-sources';
const EXPORT = '/api/v1/lead-sources/export';
const IN_USE = 'ERP-LEADSOURCES-0001';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/lead-sources',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const NO_USE: LeadSourcesUsage = {
  leads: 0,
  emailIntegrations: 0,
  webToLeadForms: 0,
};
const source = (
  id: string,
  name: string,
  usage: Partial<LeadSourcesUsage> = {},
): LeadSourcesRow => ({
  id,
  name,
  usage: { ...NO_USE, ...usage },
});
const SPARE = source('8', 'Spare');
const OFFICE = source('7', 'Office', { leads: 2, emailIntegrations: 3, webToLeadForms: 1 });
const FUEL = source('11', 'Fuel < 50 km');
const BOLD = source('12', '<b>x</b>');

const page = (rows: readonly LeadSourcesRow[]) => ({
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
    list: { status: HTTP_OK, body: page([SPARE, OFFICE]) },
    remove: { status: NO_CONTENT },
    exported: { status: HTTP_OK, body: new Blob(['id\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/lead-sources');
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  localStorage.clear();
});

const table = () => screen.findByTestId('list-table');
const recordLink = (name: string): HTMLElement => {
  const link = screen
    .getAllByRole('link')
    .find((candidate) => candidate.textContent.includes(name));
  if (link === undefined) throw new Error(`no record link for ${name}`);
  return link;
};
const row = (name: string): HTMLElement => {
  const link = recordLink(name);
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

async function openDelete(user = userEvent.setup(), one: LeadSourcesRow = SPARE) {
  await table();
  await user.click(
    inline(one.name).getByRole('button', { name: `Delete lead source ${one.name}` }),
  );
  return { user, open: await dialog() };
}

const linesOf = (open: HTMLElement): (string | null)[] =>
  [...open.querySelectorAll('[data-slot="alert-dialog-description"] > span')].map(
    (span) => span.textContent,
  );
const bodyOf = (open: HTMLElement): string | null | undefined =>
  open.querySelector('[data-slot="alert-dialog-description"]')?.textContent;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

describe('LeadSourcesList: the states (FE-27, D-39)', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<LeadSourcesList />);
    const skeleton = await screen.findByTestId('list-loading');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    for (const id of ['list-empty', 'list-no-results', 'list-error', 'list-table']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
  });

  it('Empty: Perfex empty-list text and New Source to /setup/lead-sources/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<LeadSourcesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.leads_sources_not_found);
    expect(empty.textContent).toContain(EN.empty_body);
    const create = within(empty).getByRole('link', { name: EN.lead_new_source });
    expect(create.getAttribute('href')).toBe('/setup/lead-sources/new');
  });

  it('No results: names the query and offers Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<LeadSourcesList />, { searchParams: '?q=unmatched' });
    const noResults = await screen.findByTestId('list-no-results');
    expect(within(noResults).getByRole('heading').textContent).toBe(
      EN.no_match_heading.replace('{query}', 'unmatched'),
    );
    expect(noResults.textContent).toContain(EN.no_match_body);
    expect(within(noResults).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
    expect(screen.queryByTestId('list-empty')).toBeNull();
  });

  it('Error: a 503 says the list could not load, in plain language with the plural noun, and offers Retry', async () => {
    api.list = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<LeadSourcesList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_lead_sources),
    );
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it("Loaded: the title, then Perfex's ID and Source Name; the name is the link", async () => {
    show(<LeadSourcesList />);
    const list = await table();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.lead_sources);
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      EN.id,
      EN.leads_sources_table_name,
      COMMON.actions,
    ]);
    expect(recordLink('Office').getAttribute('href')).toBe('/setup/lead-sources/7');
  });
});

describe('LeadSourcesList: names are text only (T-4.1-91)', () => {
  it('"Fuel < 50 km" and "<b>x</b>" show as typed in the list cell and the delete dialog', async () => {
    api.list = { status: HTTP_OK, body: page([FUEL, BOLD]) };
    const scriptsBefore = document.querySelectorAll('script').length;
    const user = userEvent.setup();
    show(<LeadSourcesList />);
    await table();
    expect(recordLink('Fuel < 50 km')).toBeTruthy();
    expect(recordLink('<b>x</b>')).toBeTruthy();
    for (const one of [FUEL, BOLD]) {
      await user.click(
        inline(one.name).getByRole('button', { name: `Delete lead source ${one.name}` }),
      );
      const open = await dialog();
      expect(within(open).getByRole('heading').textContent).toBe(`Delete lead source ${one.name}?`);
      await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
      await closed();
    }
    expect(document.querySelectorAll('script').length).toBe(scriptsBefore);
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('LeadSourcesList: Delete (D-07, D-28, D-25.1, UI-SPEC G8)', () => {
  it('DeleteConfirm: a lead source nothing uses: "Delete lead source Spare?"', async () => {
    show(<LeadSourcesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete lead source Spare?');
    expect(bodyOf(open)).toBe(EN.delete_body);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.textContent).toBe('Delete lead source');
    expect(confirm.hasAttribute('disabled')).toBe(false);
  });

  it('confirming DELETEs once; the 204 toasts "Lead source deleted", closes the dialog', async () => {
    show(<LeadSourcesList />);
    const { user, open } = await openDelete();
    await settle();
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/lead-sources/8']);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
  });

  it('DeleteInUse: each reference group gets a usage line and disables Delete', async () => {
    show(<LeadSourcesList />);
    const { open } = await openDelete(undefined, OFFICE);
    expect(within(open).getByRole('heading').textContent).toBe('Delete lead source Office?');
    expect(linesOf(open)).toEqual([
      '2 leads use this lead source.',
      '3 email integrations use this lead source.',
      '1 web-to-lead form uses this lead source.',
    ]);
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(EN.errors[IN_USE]);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
  });
});

describe('LeadSourcesList: the toolbar (D-19, D-26, D-42, ADR-0043)', () => {
  it('typing "of" searches the api (q=of)', async () => {
    const user = userEvent.setup();
    show(<LeadSourcesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'of');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('of');
    });
  });

  it('New Source links to /setup/lead-sources/new', async () => {
    show(<LeadSourcesList />);
    await table();
    expect(screen.getByRole('link', { name: EN.lead_new_source }).getAttribute('href')).toBe(
      '/setup/lead-sources/new',
    );
  });
});

describe('GuardedLeadSourcesList: the gate is ADMIN_GATE (D-06, D-26)', () => {
  it('an administrator sees the list', async () => {
    show(<GuardedLeadSourcesList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('anyone else is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false) };
    show(<GuardedLeadSourcesList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });
});

describe('LeadSourcesList: Arabic (FE-20)', () => {
  it('Rtl: renders under ar with the pack title and no physical-direction class', async () => {
    const { container } = show(<LeadSourcesList />, { locale: 'ar' });
    await table();
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(AR.lead_sources);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
