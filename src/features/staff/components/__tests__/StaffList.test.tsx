// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { PERMISSIONS } from '@/config/permissions';
import { staffMemberSchema, type StaffMember } from '@/features/staff/schemas/staff.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { useRowSeed } from '@/lib/api/row-seed';
import { clearSession, setSession } from '@/lib/auth/session';
import { readListReturn } from '@/lib/hooks/use-return-to-list';
import commonEn from '@/messages/common/en.json';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import staffEn from '../../messages/en.json';
import { GuardedStaffList, StaffList } from '../StaffList';

/**
 * `/setup/staff` on the kit (UIK-04): the screen passes columns, a path and its actions to
 * `ListPageTemplate`, and the template owns the URL state, the request and every list state (its own
 * tests cover those). These tests cover what the SCREEN decides: its columns, the photo, the brand
 * View, the confirmed deactivate, the export labels, the create gate, and the HOC guard. The
 * transport is a fake axios adapter on the shared instance, so the real read and write paths run.
 */
const EN = staffEn.staff;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const FORBIDDEN = 403;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/identity/members';
const EXPORT = '/api/v1/identity/members/export';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/staff',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const member = (overrides: Partial<StaffMember> = {}): StaffMember => ({
  staffId: 7,
  email: 'jane@example.invalid',
  firstName: 'Jane',
  lastName: 'Doe',
  phoneNumber: null,
  profileImageUrl: '/files/7/small_jane.png',
  profileImagePreviewUrl: '/files/7/thumb_jane.png',
  isAdmin: false,
  roleId: 3,
  roleName: 'Support',
  active: true,
  dateCreated: '2026-01-02T20:30:00.000Z',
  lastLogin: '2026-09-01T08:00:00.000Z',
  ...overrides,
});

const JANE = member();
const JOHN = member({
  staffId: 8,
  email: 'john@example.invalid',
  firstName: 'John',
  lastName: 'Roe',
  profileImageUrl: null,
  profileImagePreviewUrl: null,
  roleId: null,
  roleName: null,
  active: false,
  lastLogin: null,
});

const page = (rows: readonly StaffMember[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: 10_000,
  },
});

const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'Person',
  isAdmin,
  roleId: null,
  permissions: [...permissions],
  locale: null,
});

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

interface Api {
  me: Reply;
  list: Reply;
  status: Reply;
  exported: Reply;
}
let api: Api;
let requests: { readonly method: string; readonly url: URL; readonly body: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  requests.push({ method: (config.method ?? 'get').toUpperCase(), url, body });
  const reply =
    url.pathname === '/api/v1/auth/me'
      ? api.me
      : url.pathname === EXPORT
        ? api.exported
        : url.pathname.endsWith('/status')
          ? api.status
          : api.list;
  if (reply === 'pending') return new Promise<never>(() => undefined);
  // The api's state moves with a successful write, so a refetch would show the change too: only the
  // request count can tell "updated in place" from "asked again" (D-36).
  const statusId = /\/members\/(\d+)\/status$/.exec(url.pathname)?.[1];
  if (statusId !== undefined && reply.status < 300 && typeof api.list === 'object') {
    const { data, meta } = api.list.body as ReturnType<typeof page>;
    const active = (body as { active: boolean }).active;
    const rows = data.map((r) => (String(r.staffId) === statusId ? { ...r, active } : r));
    api.list = { status: api.list.status, body: { data: rows, meta } };
  }
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

const listRequests = () => requests.filter((r) => r.url.pathname === LIST);

/** A private SWR cache per test, no automatic retry: the settled state is what is asserted. */
const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };

/**
 * Renders under a URL WITH memory (`hasMemory`), as a browser has. `swr: GLOBAL` uses the app's one
 * cache, which `seedRow` and `replaceRowInLists` write through — such a test passes a `q` no other
 * test uses, so no cached page of another test is ever shared.
 */
function show(
  ui: ReactElement,
  {
    searchParams = '',
    swr = ISOLATED,
    locale,
  }: { searchParams?: string; swr?: SWRConfiguration; locale?: 'ar' } = {},
) {
  return renderWithProviders(
    <SWRConfig value={swr}>
      {ui}
      <Toaster />
    </SWRConfig>,
    { searchParams, hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}
const GLOBAL: SWRConfiguration = { shouldRetryOnError: false, dedupingInterval: 0 };

// Harness order (RESEARCH Pitfall 9): the session first; unmount BEFORE the session is cleared.
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: HTTP_OK, body: me(true) },
    list: { status: HTTP_OK, body: page([JANE, JOHN]) },
    status: { status: NO_CONTENT },
    exported: { status: HTTP_OK, body: new Blob(['﻿#\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/staff');
});
afterEach(() => {
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

describe('StaffList — the columns (UI-SPEC § The four screens, D-41)', () => {
  it('photo, Full Name, Email, Role, Last Login, Active and View, in that order; the name links to /setup/staff/7; the email is in <bdi>; only Full Name, Email and Active sort', async () => {
    show(<StaffList />);
    const list = await table();
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      EN.staff_edit_profile_image,
      EN.staff_dt_name,
      EN.staff_dt_email,
      EN.role,
      EN.staff_dt_last_login,
      EN.staff_dt_active,
      COMMON.actions,
    ]);
    const sortable = within(list).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.staff_dt_name}`,
      `Sort by ${EN.staff_dt_email}`,
      `Sort by ${EN.staff_dt_active}`,
    ]);
    // D-41: Role and Last login are not keyset keys — no sort control, no aria-sort.
    expect(headers[3]?.hasAttribute('aria-sort')).toBe(false);
    expect(headers[4]?.hasAttribute('aria-sort')).toBe(false);
    expect(screen.getByRole('link', { name: 'Jane Doe' }).getAttribute('href')).toBe(
      '/setup/staff/7',
    );
    expect(within(row('Jane Doe')).getByText('jane@example.invalid').tagName).toBe('BDI');
    // No role and never signed in read in words, never a dash (UAT gap 6).
    expect(within(row('John Roe')).getByText(EN.no_role)).toBeTruthy();
    expect(within(row('John Roe')).getByText(EN.never)).toBeTruthy();
    expect(within(row('John Roe')).queryByText('—')).toBeNull();
  });

  it('a row with a photo: a thumbnail button whose preview is the 320 px thumb_ copy; a row without one: the placeholder, not a button (D-23)', async () => {
    show(<StaffList />);
    await table();
    const enlarge = within(row('Jane Doe')).getByRole('button', {
      name: 'Enlarge photo of Jane Doe',
    });
    const thumb = enlarge.querySelector('img');
    expect(thumb?.getAttribute('src')).toBe('/files/7/small_jane.png');
    expect(thumb?.getAttribute('loading')).toBe('lazy');
    expect(thumb?.getAttribute('alt')).toBe('');
    await userEvent.click(enlarge);
    const preview = await screen.findByRole('dialog');
    expect(within(preview).getByRole('img', { name: 'Jane Doe' }).getAttribute('src')).toBe(
      '/files/7/thumb_jane.png',
    );
    expect(push).not.toHaveBeenCalled();
    // The preview is modal: close it, and focus returns to the thumbnail.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(within(row('John Roe')).queryByRole('button', { name: /Enlarge photo/ })).toBeNull();
    expect(row('John Roe').querySelector('img')).toBeNull();
  });
});

describe('StaffList — View and the row (finding 4, D-07, D-28, D-35)', () => {
  it('View is a filled brand button "View Jane Doe"; it records the return URL, seeds …/members/7#row and navigates', async () => {
    function SeedProbe() {
      const seeded = useRowSeed('/api/v1/identity/members/7', staffMemberSchema);
      return <output data-testid="seed">{seeded?.email ?? 'none'}</output>;
    }
    window.history.replaceState(null, '', '/setup/staff?q=view-probe');
    show(
      <>
        <StaffList />
        <SeedProbe />
      </>,
      { searchParams: '?q=view-probe', swr: GLOBAL },
    );
    await table();
    const view = within(row('Jane Doe')).getByRole('button', { name: 'View Jane Doe' });
    expect(view.getAttribute('data-variant')).toBe('default');
    await userEvent.click(view);
    expect(push).toHaveBeenCalledWith('/setup/staff/7');
    expect(readListReturn('/setup/staff')).toBe('/setup/staff?q=view-probe');
    await waitFor(() => {
      expect(screen.getByTestId('seed').textContent).toBe('jane@example.invalid');
    });
  });
});

describe('StaffList — Active (D-25.2, D-36)', () => {
  it('switching an active member off asks first; confirming PATCHes, toasts, updates the row in place and asks for NO list page', async () => {
    show(<StaffList />, { searchParams: '?q=deactivate-probe', swr: GLOBAL });
    await table();
    await userEvent.click(
      within(row('Jane Doe')).getByRole('switch', { name: 'Active for Jane Doe' }),
    );
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Deactivate Jane Doe?');
    expect(within(dialog).getByTestId('confirm-dialog-dismiss').textContent).toBe(EN.keep_active);
    const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
    expect(confirm.textContent).toBe(EN.deactivate_member);
    // Access change, not destructive: the brand fill, never the red.
    expect(confirm.getAttribute('data-variant')).toBe('default');
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
    const before = listRequests().length;
    await userEvent.click(confirm);
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    const patch = requests.filter((r) => r.method === 'PATCH');
    expect(patch.map((r) => [r.url.pathname, r.body])).toEqual([
      ['/api/v1/identity/members/7/status', { active: false }],
    ]);
    expect(await screen.findByText(EN.member_deactivated_toast)).toBeTruthy();
    await waitFor(() => {
      expect(
        within(row('Jane Doe'))
          .getByRole('switch', { name: 'Active for Jane Doe' })
          .getAttribute('data-state'),
      ).toBe('unchecked');
    });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(listRequests()).toHaveLength(before);
  });

  it('a 403 refusal stays inside the dialog in plain language, and Confirm is disabled (UAT 7)', async () => {
    api.status = { status: FORBIDDEN, body: problem(FORBIDDEN, 'ERP-AUTH-0005') };
    show(<StaffList />);
    await table();
    await userEvent.click(
      within(row('Jane Doe')).getByRole('switch', { name: 'Active for Jane Doe' }),
    );
    await userEvent.click(await screen.findByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toContain(COMMON.errors['ERP-AUTH-0005']);
    expect(error.textContent).not.toMatch(/ERP-|403/);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    // "Keep active" is the way out, and the member stays active.
    await userEvent.click(screen.getByTestId('confirm-dialog-dismiss'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(
      within(row('Jane Doe'))
        .getByRole('switch', { name: 'Active for Jane Doe' })
        .getAttribute('data-state'),
    ).toBe('checked');
  });

  it('switching a member on applies at once, with the toast "Staff member activated" and no dialog', async () => {
    show(<StaffList />, { searchParams: '?q=activate-probe', swr: GLOBAL });
    await table();
    await userEvent.click(
      within(row('John Roe')).getByRole('switch', { name: 'Active for John Roe' }),
    );
    expect(await screen.findByText(EN.member_activated_toast)).toBeTruthy();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(requests.filter((r) => r.method === 'PATCH').map((r) => r.body)).toEqual([
      { active: true },
    ]);
    expect(
      within(row('John Roe'))
        .getByRole('switch', { name: 'Active for John Roe' })
        .getAttribute('data-state'),
    ).toBe('checked');
  });

  it('a failed activation reverts the switch and says so, and is never retried', async () => {
    api.status = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<StaffList />);
    await table();
    await userEvent.click(
      within(row('John Roe')).getByRole('switch', { name: 'Active for John Roe' }),
    );
    expect(await within(row('John Roe')).findByRole('status')).toHaveProperty(
      'textContent',
      EN.status_not_saved,
    );
    expect(
      within(row('John Roe'))
        .getByRole('switch', { name: 'Active for John Roe' })
        .getAttribute('data-state'),
    ).toBe('unchecked');
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
  });

  it('without staff.members.edit the Active column is a status badge in the fixed colours, not a switch', async () => {
    api.me = { status: HTTP_OK, body: me(false, [PERMISSIONS.staff.members.view]) };
    show(<StaffList />);
    await table();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(within(row('Jane Doe')).getByText(EN.staff_dt_active).getAttribute('data-status')).toBe(
      'active',
    );
    expect(within(row('John Roe')).getByText(EN.inactive).getAttribute('data-status')).toBe(
      'inactive',
    );
  });
});

describe('StaffList — toolbar (D-26, D-42)', () => {
  it('Export sends the seven translated labels in MEMBER_EXPORT_COLUMNS order', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<StaffList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_csv }));
    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((r) => r.url.pathname === EXPORT);
    expect(sent?.url.searchParams.get('format')).toBe('csv');
    expect(sent?.url.searchParams.getAll('header')).toEqual([
      EN.the_number_sign,
      EN.staff_add_edit_firstname,
      EN.staff_add_edit_lastname,
      EN.staff_dt_email,
      EN.role,
      EN.staff_dt_active,
      EN.staff_dt_last_login,
    ]);
  });

  it('PDF sends the Staff blanks (D-26): No role for Role, Never for Last Login, empty for the other five', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<StaffList />);
    await table();
    await userEvent.click(screen.getByRole('button', { name: COMMON.dt_button_export }));
    await userEvent.click(await screen.findByRole('menuitem', { name: COMMON.dt_button_pdf }));
    await waitFor(() => {
      expect(requests.some((r) => r.url.pathname === EXPORT)).toBe(true);
    });
    const sent = requests.find((r) => r.url.pathname === EXPORT);
    expect(sent?.url.searchParams.get('format')).toBe('pdf');
    expect(sent?.url.searchParams.getAll('blank')).toEqual([
      '',
      '',
      '',
      '',
      EN.no_role,
      '',
      EN.never,
    ]);
    expect(sent?.url.searchParams.get('title')).toBe(EN.staff_members);
    expect(sent?.url.searchParams.has('key')).toBe(false);
  });

  it('without staff.members.create there is no New Staff Member; with it the button is last in the toolbar', async () => {
    api.me = { status: HTTP_OK, body: me(false, [PERMISSIONS.staff.members.view]) };
    show(<StaffList />);
    await table();
    expect(screen.queryByRole('link', { name: EN.new_staff })).toBeNull();
    cleanup();
    api.me = {
      status: HTTP_OK,
      body: me(false, [PERMISSIONS.staff.members.view, PERMISSIONS.staff.members.create]),
    };
    show(<StaffList />);
    await table();
    const create = await screen.findByRole('link', { name: EN.new_staff });
    expect(create.getAttribute('href')).toBe('/setup/staff/new');
    const toolbar = screen.getByTestId('list-export').parentElement;
    expect(toolbar?.lastElementChild).toBe(create);
  });
});

describe('StaffList — empty (D-30)', () => {
  it('no rows and no search: "No staff members yet" with the create button', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<StaffList />);
    expect(await screen.findByText(EN.no_staff_heading)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: EN.new_staff }).length).toBeGreaterThan(0);
  });

  it('no rows for "zz": "No staff members match “zz”" with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<StaffList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe('No staff members match “zz”');
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });
});

describe('GuardedStaffList (UIK-03, finding 1, D-39)', () => {
  it('while /me is pending: the list skeleton, and no refusal and no error', () => {
    api.me = 'pending';
    show(<GuardedStaffList />);
    expect(screen.getByTestId('permission-pending').getAttribute('data-variant')).toBe('list');
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('permission-error')).toBeNull();
    expect(listRequests()).toHaveLength(0);
  });

  it('a /me 503 is an error, never "no access"', async () => {
    api.me = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<GuardedStaffList />);
    expect(await screen.findByTestId('permission-error')).toBeTruthy();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('without staff.members.view: the no-access state, and no list request', async () => {
    api.me = { status: HTTP_OK, body: me(false, []) };
    show(<GuardedStaffList />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(listRequests()).toHaveLength(0);
  });

  it('with staff.members.view: the list', async () => {
    api.me = { status: HTTP_OK, body: me(false, [PERMISSIONS.staff.members.view]) };
    show(<GuardedStaffList />);
    expect(await table()).toBeTruthy();
  });
});

describe('StaffList — route and RTL', () => {
  it('app/(shell)/setup/staff/page.tsx reads no searchParams and stays within 30 lines (FE-01, FE-15)', () => {
    const source = readFileSync(
      join(process.cwd(), 'app', '(shell)', 'setup', 'staff', 'page.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/searchParams/);
    expect(source.trimEnd().split('\n').length).toBeLessThanOrEqual(30);
  });

  it('uses no physical-direction class under ar', async () => {
    const { container } = show(<StaffList />, { locale: 'ar' });
    await table();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
