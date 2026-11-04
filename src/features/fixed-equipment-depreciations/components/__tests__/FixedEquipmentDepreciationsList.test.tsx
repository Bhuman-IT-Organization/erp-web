// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { PERMISSIONS } from '@/config/permissions';
import { DELETE_REFUSED_CODES } from '@/features/fixed-equipment-depreciations/api/fixed-equipment-depreciations.endpoints';
import type { FixedEquipmentDepreciationsRow } from '@/features/fixed-equipment-depreciations/schemas/fixed-equipment-depreciations.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { clearSession, setSession } from '@/lib/auth/session';
import commonAr from '@/messages/common/ar.json';
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
import {
  FixedEquipmentDepreciationsList,
  GuardedFixedEquipmentDepreciationsList,
} from '../FixedEquipmentDepreciationsList';

/**
 * The list screen on `ListPageTemplate`. The template's own tests cover the URL state, the search
 * and the pager; these cover what the SCREEN decides: Perfex's three columns (ID, Name, Term as one
 * plural message, "None" for a row without one), the actions a member may use (Add, Edit and Delete
 * each with that action's code in any of the tab's five groups; no ⋮ menu at all without edit or
 * delete), the delete answered 204, refused 409 (in use, or its use could not be checked) or 404,
 * the Export, one `it` per state, names rendered as text, and the guard on any view or view-own code
 * of the tab's five groups. The transport is a fake axios adapter on the shared instance, so the real
 * read and write paths run.
 */
vi.mock('@/lib/api/row-seed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/row-seed')>();
  return { ...actual, seedRow: vi.fn(actual.seedRow) };
});

const EN = en['fixed-equipment-depreciations'];
const AR = ar['fixed-equipment-depreciations'];
const COMMON = commonEn.common;
const CODES = PERMISSIONS.fixedEquipment.settingDepreciation;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/fixed-equipment-depreciations';
const EXPORT = '/api/v1/fixed-equipment-depreciations/export';
const ME = '/api/v1/auth/me';
const ASSETS = PERMISSIONS.fixedEquipment.assets;

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/fixed-equipment-depreciations',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const ONE: FixedEquipmentDepreciationsRow = { id: '1', name: 'Depreciation 1', term: 12 };
const TWO: FixedEquipmentDepreciationsRow = { id: '2', name: 'Depreciation 2', term: 36 };
const LINE: FixedEquipmentDepreciationsRow = { id: '3', name: 'Straight line', term: 60 };
const ARABIC: FixedEquipmentDepreciationsRow = { id: '4', name: 'إهلاك ثابت', term: 24 };
const BOLD: FixedEquipmentDepreciationsRow = { id: '5', name: '<b>x</b>', term: 12 };
const LEGACY: FixedEquipmentDepreciationsRow = { id: '6', name: 'Legacy', term: null };
const SHORT: FixedEquipmentDepreciationsRow = { id: '7', name: 'Short', term: 1 };

const editLabel = (name: string): string => EN.edit_action_named.replace('{name}', name);
const deleteLabel = (name: string): string => EN.delete_action_named.replace('{name}', name);

const page = (rows: readonly FixedEquipmentDepreciationsRow[]) => ({
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
const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'someone@example.invalid',
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
let api: { me: Reply; list: Reply; remove: Reply };
let requests: { readonly method: string; readonly url: URL }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  requests.push({ method, url });
  const reply = url.pathname === ME ? api.me : method === 'DELETE' ? api.remove : api.list;
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
const meAnswered = () =>
  waitFor(() => {
    expect(requests.some((r) => r.url.pathname === ME)).toBe(true);
  });

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
    list: { status: HTTP_OK, body: page([ONE, TWO, LINE]) },
    remove: { status: NO_CONTENT },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  vi.mocked(seedRow).mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/fixed-equipment-depreciations');
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

/** Opens the delete of one depreciation; by default Depreciation 1. */
async function openDelete(user = userEvent.setup(), one: FixedEquipmentDepreciationsRow = ONE) {
  await table();
  const button = await within(row(one.name)).findByRole('button', { name: deleteLabel(one.name) });
  await user.click(button);
  return { user, open: await dialog() };
}

describe('FixedEquipmentDepreciationsList: the states', () => {
  it('Loading: the list skeleton, and no empty, error or no-access text while the first answer is unknown', async () => {
    api.list = 'pending';
    show(<FixedEquipmentDepreciationsList />);
    const skeleton = await screen.findByTestId('list-loading');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    for (const id of ['list-empty', 'list-no-results', 'list-error', 'list-table']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(document.body.textContent).not.toContain(EN.no_depreciations_found);
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('Empty: "no depreciations found" and Add to /setup/fixed-equipment-depreciations/new', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<FixedEquipmentDepreciationsList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.no_depreciations_found);
    expect(empty.textContent).toContain(EN.empty_body);
    expect((await within(empty).findByRole('link', { name: EN.add })).getAttribute('href')).toBe(
      '/setup/fixed-equipment-depreciations/new',
    );
  });

  it('NoResults: the query is named, with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<FixedEquipmentDepreciationsList />, { searchParams: '?q=zz' });
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
    show(<FixedEquipmentDepreciationsList />);
    const error = await screen.findByTestId('list-error');
    expect(error.textContent).toContain(
      COMMON.list_failed.replace('{records}', EN.noun_depreciations),
    );
    expect(error.textContent).not.toMatch(/ERP-|503/);
    expect(within(error).getByRole('button', { name: COMMON.retry })).toBeTruthy();
  });

  it("Loaded: titled fe_depreciations; Perfex's three columns, ID, Name and Term; ID and Name sortable; no checkbox", async () => {
    show(<FixedEquipmentDepreciationsList />);
    const list = await table();
    await within(row('Straight line')).findByRole('button', { name: editLabel('Straight line') });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.fe_depreciations);
    expect(
      within(list)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([EN.id, EN.fe_name, EN.fe_term, COMMON.actions]);
    expect(screen.getByRole('link', { name: 'Straight line' }).getAttribute('href')).toBe(
      '/setup/fixed-equipment-depreciations/3',
    );
    expect(
      within(list)
        .getAllByRole('button', { name: /^Sort by / })
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([`Sort by ${EN.id}`, `Sort by ${EN.fe_name}`]);
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
  });

  it('the Term cell is one plural message: "1 month", "60 months"', async () => {
    api.list = { status: HTTP_OK, body: page([LINE, SHORT]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect(row('Short').textContent).toContain('1 month');
    expect(row('Short').textContent).not.toContain('1 months');
    expect(row('Straight line').textContent).toContain('60 months');
  });

  it('the Term cell of a row stored without a term shows "None"', async () => {
    api.list = { status: HTTP_OK, body: page([LINE, LEGACY]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect(row('Legacy').textContent).toContain(COMMON.none);
  });

  it('lists an Arabic name as it is stored', async () => {
    api.list = { status: HTTP_OK, body: page([ONE, ARABIC]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect(screen.getByRole('link', { name: 'إهلاك ثابت' }).getAttribute('href')).toBe(
      '/setup/fixed-equipment-depreciations/4',
    );
  });
});

describe('FixedEquipmentDepreciationsList: names are text only', () => {
  it('"<b>x</b>" shows as typed in the list cell and the delete dialog, and no element is created from it', async () => {
    api.list = { status: HTTP_OK, body: page([BOLD]) };
    show(<FixedEquipmentDepreciationsList />);
    const { user, open } = await openDelete(undefined, BOLD);
    expect(within(open).getByRole('heading').textContent).toBe(
      EN.delete_title.replace('{name}', '<b>x</b>'),
    );
    await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    expect(document.querySelector('b')).toBeNull();
  });
});

describe('FixedEquipmentDepreciationsList: the actions a member may use (Perfex hides the others)', () => {
  it('a view-only member sees no Add, no Edit and no Delete; the rows stay links', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await meAnswered();
    await settle();
    expect(within(row('Straight line')).queryByTestId('row-actions-inline')).toBeNull();
    expect(
      within(row('Straight line')).queryByRole('button', { name: 'Actions for Straight line' }),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: EN.add })).toBeNull();
    expect(
      within(row('Straight line')).queryByRole('button', { name: editLabel('Straight line') }),
    ).toBeNull();
    expect(
      within(row('Straight line')).queryByRole('button', { name: deleteLabel('Straight line') }),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Straight line' }).getAttribute('href')).toBe(
      '/setup/fixed-equipment-depreciations/3',
    );
  });

  it('a member holding edit, not delete, sees Edit and no Delete', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view, CODES.edit]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect(
      await within(row('Straight line')).findByRole('button', {
        name: editLabel('Straight line'),
      }),
    ).toBeTruthy();
    expect(
      within(row('Straight line')).queryByRole('button', { name: deleteLabel('Straight line') }),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: EN.add })).toBeNull();
  });

  it('a member holding delete, not edit, sees Delete and no Edit', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view, CODES.delete]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect(
      await within(row('Straight line')).findByRole('button', {
        name: deleteLabel('Straight line'),
      }),
    ).toBeTruthy();
    expect(
      within(row('Straight line')).queryByRole('button', { name: editLabel('Straight line') }),
    ).toBeNull();
  });

  it('a member holding create sees Add', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view, CODES.create]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect((await screen.findByRole('link', { name: EN.add })).getAttribute('href')).toBe(
      '/setup/fixed-equipment-depreciations/new',
    );
  });

  it('a member holding only the assets group’s codes uses every action: an item group reaches this tab', async () => {
    api.me = {
      status: HTTP_OK,
      body: me(false, [ASSETS.view, ASSETS.create, ASSETS.edit, ASSETS.delete]),
    };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect(await screen.findByRole('link', { name: EN.add })).toBeTruthy();
    expect(
      await within(row('Straight line')).findByRole('button', { name: editLabel('Straight line') }),
    ).toBeTruthy();
    expect(
      within(row('Straight line')).getByRole('button', { name: deleteLabel('Straight line') }),
    ).toBeTruthy();
  });

  it('a member holding only the assets group’s view sees the rows and no action', async () => {
    api.me = { status: HTTP_OK, body: me(false, [ASSETS.view]) };
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await meAnswered();
    await settle();
    expect(screen.queryByRole('link', { name: EN.add })).toBeNull();
    expect(within(row('Straight line')).queryByTestId('row-actions-inline')).toBeNull();
    expect(
      within(row('Straight line')).queryByRole('button', { name: editLabel('Straight line') }),
    ).toBeNull();
    expect(
      within(row('Straight line')).queryByRole('button', { name: deleteLabel('Straight line') }),
    ).toBeNull();
  });

  it('a view-only member with an empty list reads the neutral text, never the "add one" text', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view]) };
    api.list = { status: HTTP_OK, body: page([]) };
    show(<FixedEquipmentDepreciationsList />);
    const empty = await screen.findByTestId('list-empty');
    await meAnswered();
    await settle();
    expect(empty.textContent).toContain(EN.empty_body_readonly);
    expect(empty.textContent).not.toContain(EN.empty_body);
  });
});

describe('FixedEquipmentDepreciationsList: labelled row actions', () => {
  it('Edit is a filled button; Delete is a destructive ghost button with the trash icon', async () => {
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await within(row('Straight line')).findByRole('button', { name: editLabel('Straight line') });
    const actions = inline('Straight line');
    const edit = actions.getByRole('button', { name: editLabel('Straight line') });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const remove = actions.getByRole('button', { name: deleteLabel('Straight line') });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
  });

  it('Mobile: below md both are in the kebab: Edit, then Delete in the destructive variant', async () => {
    const user = userEvent.setup();
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await within(row('Straight line')).findByRole('button', { name: editLabel('Straight line') });
    await user.click(
      within(row('Straight line')).getByRole('button', { name: 'Actions for Straight line' }),
    );
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      editLabel('Straight line'),
      deleteLabel('Straight line'),
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
  });

  it('Edit records the list URL, seeds the form from the row and opens /setup/fixed-equipment-depreciations/3', async () => {
    window.history.replaceState(null, '', '/setup/fixed-equipment-depreciations?q=line');
    show(<FixedEquipmentDepreciationsList />, { searchParams: '?q=line' });
    await table();
    await userEvent.click(
      await within(row('Straight line')).findByRole('button', {
        name: editLabel('Straight line'),
      }),
    );
    expect(push).toHaveBeenCalledWith('/setup/fixed-equipment-depreciations/3');
    expect(seedRow).toHaveBeenCalledWith('/api/v1/fixed-equipment-depreciations/3', LINE);
    expect(
      sessionStorage.getItem('erp.list.return:/setup/fixed-equipment-depreciations'),
    ).toContain('/setup/fixed-equipment-depreciations?q=line');
  });

  it('opening a row from its link seeds the form from the row, so the record shows at once', async () => {
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await userEvent.click(screen.getByRole('link', { name: 'Straight line' }));
    expect(seedRow).toHaveBeenCalledWith('/api/v1/fixed-equipment-depreciations/3', LINE);
  });
});

describe('FixedEquipmentDepreciationsList: Delete', () => {
  it('DeleteConfirm: the title names it, "can’t be undone", Keep / Delete, focus on Keep, nothing sent', async () => {
    show(<FixedEquipmentDepreciationsList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe(
      EN.delete_title.replace('{name}', 'Depreciation 1'),
    );
    expect(open.querySelector('[data-slot="alert-dialog-description"]')?.textContent).toBe(
      EN.delete_body,
    );
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe(COMMON.keep_noun.replace('{noun}', EN.depreciation_lowercase));
    expect(confirm.textContent).toBe(
      COMMON.delete_noun.replace('{noun}', EN.depreciation_lowercase),
    );
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; the 204 toasts, closes the dialog and the list pages ask again', async () => {
    show(<FixedEquipmentDepreciationsList />);
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual([
      '/api/v1/fixed-equipment-depreciations/1',
    ]);
    expect(await screen.findByText(EN.deleted_toast)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it.each(DELETE_REFUSED_CODES)(
    'DeleteRefused: a 409 %s (in use, or its use could not be checked) stays inside the dialog in its own words, Delete disabled, and the list is not asked again',
    async (code) => {
      api.remove = { status: CONFLICT, body: problem(CONFLICT, code) };
      show(<FixedEquipmentDepreciationsList />);
      const { user, open } = await openDelete();
      await settle();
      const before = listReads().length;
      await user.click(within(open).getByTestId('confirm-dialog-confirm'));
      const error = await screen.findByTestId('confirm-dialog-error');
      expect(error.textContent).toBe(EN.errors[code]);
      expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
      expect(deletes()).toHaveLength(1);
      await settle();
      expect(listReads()).toHaveLength(before);
    },
  );

  it('404 ERP-CORE-0004 (deleted by someone else): the not-found text inside the dialog, and the list pages ask again so the row is gone when it closes', async () => {
    api.remove = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-CORE-0004') };
    window.history.replaceState(null, '', '/setup/fixed-equipment-depreciations?q=gone-404');
    show(<FixedEquipmentDepreciationsList />, { searchParams: '?q=gone-404', swr: GLOBAL });
    const { user, open } = await openDelete();
    await settle();
    const before = listReads().length;
    api.list = { status: HTTP_OK, body: page([TWO, LINE]) };
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
      expect(screen.queryByRole('link', { name: 'Depreciation 1' })).toBeNull();
    });
  });

  it('DeleteRetryable: a network failure: the common network text, Delete still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    show(<FixedEquipmentDepreciationsList />);
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

describe('FixedEquipmentDepreciationsList: toolbar and guard', () => {
  it('Add links to /setup/fixed-equipment-depreciations/new', async () => {
    show(<FixedEquipmentDepreciationsList />);
    await table();
    expect((await screen.findByRole('link', { name: EN.add })).getAttribute('href')).toBe(
      '/setup/fixed-equipment-depreciations/new',
    );
  });

  it('Export, then CSV, asks the export path for csv with one translated label per column, in the api order: ID, Name, Term', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((r) => r.url.pathname === EXPORT)?.url;
    expect(sent?.searchParams.get('format')).toBe('csv');
    expect(sent?.searchParams.getAll('header')).toEqual([EN.id, EN.fe_name, EN.fe_term]);
  });

  it('Export, then PDF, sends one blank label per column: "None" for the Term, so a row with no term reads "None"', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/2');
    URL.revokeObjectURL = vi.fn();
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_pdf }));
    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((r) => r.url.pathname === EXPORT)?.url;
    expect(sent?.searchParams.get('format')).toBe('pdf');
    expect(sent?.searchParams.getAll('blank').at(-1)).toBe(COMMON.none);
  });

  it('typing "line" searches the api (q=line), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<FixedEquipmentDepreciationsList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'line');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('line');
    });
  });

  it('Guarded: an administrator sees the list', async () => {
    show(<GuardedFixedEquipmentDepreciationsList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('Guarded: a member holding the view code sees the list', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.view]) };
    show(<GuardedFixedEquipmentDepreciationsList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('Guarded: a member holding only the view-own code sees the list too (the api narrows the rows)', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.viewOwn]) };
    show(<GuardedFixedEquipmentDepreciationsList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('Guarded: a member with neither code is refused once /me has answered, and the list is never asked', async () => {
    api.me = { status: HTTP_OK, body: me(false, [CODES.create]) };
    show(<GuardedFixedEquipmentDepreciationsList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });

  it('Guarded: the list skeleton while /me is unknown, never "no access"', async () => {
    api.me = 'pending';
    show(<GuardedFixedEquipmentDepreciationsList />);
    await settle();
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('list');
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });

  it('Guarded: a member holding only an item group’s view (assets) sees the list', async () => {
    api.me = { status: HTTP_OK, body: me(false, [ASSETS.view]) };
    show(<GuardedFixedEquipmentDepreciationsList />);
    expect(await screen.findByTestId('list-table')).toBeTruthy();
  });

  it('Guarded: a member holding only another settings tab’s view (categories) is refused', async () => {
    api.me = {
      status: HTTP_OK,
      body: me(false, [PERMISSIONS.fixedEquipment.settingCategory.view]),
    };
    show(<GuardedFixedEquipmentDepreciationsList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listReads()).toHaveLength(0);
  });
});

describe('FixedEquipmentDepreciationsList: Arabic', () => {
  it('Rtl: renders under ar with the Arabic empty-state text and no physical-direction class', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    const { container } = show(<FixedEquipmentDepreciationsList />, { locale: 'ar' });
    const empty = await screen.findByTestId('list-empty');
    expect(document.documentElement.dir).toBe('rtl');
    expect(within(empty).getByRole('heading').textContent).toBe(AR.no_depreciations_found);
    expect(physicalClassesIn(container)).toEqual([]);
  });

  it('loaded under ar: each Term in its Arabic plural form (1, 2, 3–10, 11–99, 100), and "None" in Arabic', async () => {
    api.list = {
      status: HTTP_OK,
      body: page([
        { id: '11', name: 'One', term: 1 },
        { id: '12', name: 'Two', term: 2 },
        { id: '13', name: 'Five', term: 5 },
        { id: '14', name: 'Twelve', term: 12 },
        { id: '15', name: 'Hundred', term: 100 },
        { id: '16', name: 'Legacy', term: null },
      ]),
    };
    show(<FixedEquipmentDepreciationsList />, { locale: 'ar' });
    await table();
    expect(row('One').textContent).toContain('شهر واحد');
    expect(row('Two').textContent).toContain('شهران');
    expect(row('Five').textContent).toContain('أشهر');
    expect(row('Twelve').textContent).toContain('شهرًا');
    const hundred = row('Hundred').textContent;
    expect(hundred).toContain('شهر');
    expect(hundred).not.toContain('شهرًا');
    expect(hundred).not.toContain('أشهر');
    expect(row('Legacy').textContent).toContain(commonAr.common.none);
  });
});
