// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { PERMISSIONS } from '@/config/permissions';
import type { StaffRole } from '@/features/staff/schemas/staff.schema';
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
import staffAr from '../../messages/ar.json';
import staffEn from '../../messages/en.json';
import { GuardedRolesList, RolesList } from '../RolesList';

/**
 * `/setup/roles` on the kit (UIK-04): the screen passes columns, a path and its actions to
 * `ListPageTemplate`, which owns the URL state, the request and every list state (its own tests
 * cover those). These tests cover what the SCREEN decides: the Role Name cell and its count, the
 * labelled Edit and Delete (UAT 6, finding 4), the delete that names the role and keeps a refusal
 * inside (UAT 7), the export labels, and the administrator-only guard. The transport is a fake axios
 * adapter on the shared instance, so the real read and write paths run.
 */
const EN = staffEn.staff;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NO_CONTENT = 204;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const LIST = '/api/v1/identity/roles';
const EXPORT = '/api/v1/identity/roles/export';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/roles',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const WAREHOUSE: StaffRole = { roleId: 7, name: 'Warehouse Supervisor', memberCount: 7 };
const CLERK: StaffRole = { roleId: 8, name: 'Clerk', memberCount: 0 };
const DRIVER: StaffRole = { roleId: 9, name: 'Driver', memberCount: 1 };

const page = (rows: readonly StaffRole[]) => ({
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
  remove: Reply;
  exported: Reply;
}
let api: Api;
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

/** A private SWR cache per test, no automatic retry: the settled state is what is asserted. */
const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };

/** Renders under a URL WITH memory (`hasMemory`), as a browser has. */
function show(
  ui: ReactElement,
  { searchParams = '', locale }: { searchParams?: string; locale?: 'ar' } = {},
) {
  return renderWithProviders(
    <SWRConfig value={ISOLATED}>
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
    list: { status: HTTP_OK, body: page([WAREHOUSE, CLERK, DRIVER]) },
    remove: { status: NO_CONTENT },
    exported: { status: HTTP_OK, body: new Blob(['﻿#\r\n'], { type: 'text/csv' }) },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/setup/roles');
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
  const link = screen.getByRole('link', { name: new RegExp(`^${name}`) });
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
/** Opens the delete of one role; by default Clerk, the role nobody holds. */
async function openDelete(user = userEvent.setup(), role: StaffRole = CLERK) {
  await table();
  await user.click(inline(role.name).getByRole('button', { name: `Delete role ${role.name}` }));
  return { user, open: await dialog() };
}
/** The dialog's body line (its description). */
const bodyOf = (open: HTMLElement): string | null | undefined =>
  open.querySelector('[data-slot="alert-dialog-description"]')?.textContent;
const IN_USE =
  'This role is still assigned to staff members. Move them to another role first, then delete it.';

describe('RolesList — the Role Name column (UI-SPEC § The four screens, UAT 6, D-41)', () => {
  it('the role name is the row link to /setup/roles/7 with "Total Users: 7" as a text-xs second line; only Role Name sorts, by name', async () => {
    show(<RolesList />);
    const list = await table();
    const headers = within(list).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([EN.roles_dt_name, COMMON.actions]);
    const sortable = within(list).getAllByRole('button', { name: /^Sort by / });
    expect(sortable.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Sort by ${EN.roles_dt_name}`,
    ]);
    const link = screen.getByRole('link', { name: /^Warehouse Supervisor/ });
    expect(link.getAttribute('href')).toBe('/setup/roles/7');
    const count = within(link).getByText('Total Users: 7');
    expect(count.className.split(' ')).toEqual(expect.arrayContaining(['block', 'text-xs']));
    await userEvent.click(
      within(list).getByRole('button', { name: `Sort by ${EN.roles_dt_name}` }),
    );
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('sort')).toBe('name');
    });
  });
});

describe('RolesList — labelled row actions (UAT 6, finding 4, UI-SPEC § Row actions)', () => {
  it('Edit is a filled button "Edit Warehouse Supervisor"; Delete is a red ghost button with the trash icon after a separator, "Delete role Warehouse Supervisor"', async () => {
    show(<RolesList />);
    await table();
    const actions = inline(WAREHOUSE.name);
    const edit = actions.getByRole('button', { name: 'Edit Warehouse Supervisor' });
    expect(edit.textContent).toBe(COMMON.edit);
    expect(edit.getAttribute('data-variant')).toBe('default');
    const remove = actions.getByRole('button', { name: 'Delete role Warehouse Supervisor' });
    expect(remove.textContent).toBe(COMMON.delete);
    expect(remove.getAttribute('data-variant')).toBe('ghost');
    expect(remove.className).toContain('text-destructive');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.previousElementSibling?.getAttribute('data-slot')).toBe('separator');
  });

  it('below md both are in the kebab "Actions for Warehouse Supervisor": Edit, then Delete in the destructive variant after a separator', async () => {
    const user = userEvent.setup();
    show(<RolesList />);
    await table();
    await user.click(
      within(row(WAREHOUSE.name)).getByRole('button', { name: 'Actions for Warehouse Supervisor' }),
    );
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Edit Warehouse Supervisor',
      'Delete role Warehouse Supervisor',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[1]?.previousElementSibling?.getAttribute('role')).toBe('separator');
  });

  it('Edit records the list URL and opens /setup/roles/7', async () => {
    window.history.replaceState(null, '', '/setup/roles?q=war');
    show(<RolesList />, { searchParams: '?q=war' });
    await table();
    await userEvent.click(
      inline(WAREHOUSE.name).getByRole('button', { name: 'Edit Warehouse Supervisor' }),
    );
    expect(push).toHaveBeenCalledWith('/setup/roles/7');
    expect(sessionStorage.getItem('erp.list.return:/setup/roles')).toContain('/setup/roles?q=war');
  });
});

describe('RolesList — Delete (D-25.1, UAT 7, T-3.2-80)', () => {
  it('a role nobody holds: "Delete role Clerk?" with the body, Keep role / Delete role (destructive, trash icon, enabled) and focus on Keep role', async () => {
    show(<RolesList />);
    const { open } = await openDelete();
    expect(within(open).getByRole('heading').textContent).toBe('Delete role Clerk?');
    expect(bodyOf(open)).toBe('This cannot be undone.');
    expect(open.textContent).not.toContain('No staff member');
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    const dismiss = within(open).getByTestId('confirm-dialog-dismiss');
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(dismiss.textContent).toBe('Keep role');
    expect(confirm.textContent).toBe('Delete role');
    expect(confirm.getAttribute('data-variant')).toBe('destructive');
    expect(confirm.querySelector('svg')).not.toBeNull();
    expect(confirm.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(dismiss);
    expect(deletes()).toHaveLength(0);
  });

  it('confirming DELETEs once; success toasts "Role deleted", closes the dialog and the list pages ask again', async () => {
    const { user, open } = await (async () => {
      show(<RolesList />);
      return openDelete();
    })();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const before = listReads().length;
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(deletes().map((r) => r.url.pathname)).toEqual(['/api/v1/identity/roles/8']);
    expect(await screen.findByText(EN.toast_role_deleted)).toBeTruthy();
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
  });

  it('a role 7 members hold: "7 staff members hold this role.", the in-use sentence in the alert from the start, Delete role disabled, focus on Keep role, and NO DELETE is ever sent (lead 2026-09-26)', async () => {
    show(<RolesList />);
    const { user, open } = await openDelete(undefined, WAREHOUSE);
    expect(within(open).getByRole('heading').textContent).toBe('Delete role Warehouse Supervisor?');
    expect(open.textContent).toContain('7 staff members hold this role.');
    expect(open.textContent).not.toContain('No staff member holds this role');
    expect(within(open).getByTestId('confirm-dialog-error').textContent).toBe(IN_USE);
    const confirm = within(open).getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(within(open).getByTestId('confirm-dialog-dismiss'));
    await user.click(confirm);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(deletes()).toHaveLength(0);
  });

  it('a role one member holds: the singular "1 staff member holds this role."', async () => {
    show(<RolesList />);
    const { open } = await openDelete(undefined, DRIVER);
    expect(open.textContent).toContain('1 staff member holds this role.');
  });

  it('under ar the held count keeps Western digits (D-34)', async () => {
    show(<RolesList />, { locale: 'ar' });
    await table();
    const [, remove] = within(
      within(row(WAREHOUSE.name)).getByTestId('row-actions-inline'),
    ).getAllByRole('button');
    if (remove === undefined) throw new Error('no delete button');
    await userEvent.click(remove);
    const body = (await dialog()).querySelector('[data-slot="alert-dialog-description"]');
    expect(body?.textContent).toContain('7');
    expect(body?.textContent).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });

  it('delete_role_body_held is an ICU plural on count whose number is the formatted countN, never # (D-34: # takes the locale digits; ICU 77 prints plain ar in Latin, ar-EG does not)', () => {
    for (const message of [EN.delete_role_body_held, staffAr.staff.delete_role_body_held]) {
      expect(message).toMatch(/^\{count, plural, /);
      expect(message).toContain('{countN}');
      expect(message).not.toContain('#');
    }
  });

  it('the race: the list said nobody held it, the api answers 409 ERP-IDENTITY-0006 — the in-use text inside the dialog, Delete role disabled, a second click sends nothing, Keep role closes (UAT 7)', async () => {
    api.remove = { status: CONFLICT, body: problem(CONFLICT, 'ERP-IDENTITY-0006') };
    show(<RolesList />);
    const { user, open } = await openDelete();
    expect(within(open).queryByTestId('confirm-dialog-error')).toBeNull();
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(IN_USE);
    // Nothing the screen said contradicts the api's answer: the body asserts no count (lead option 3).
    expect(bodyOf(open)).toBe('This cannot be undone.');
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.click(confirm);
    expect(deletes()).toHaveLength(1);
    await user.click(screen.getByTestId('confirm-dialog-dismiss'));
    await closed();
    expect(row(CLERK.name)).toBeTruthy();
  });

  it('a network failure: the common network text, Delete role still enabled, and a click retries', async () => {
    api.remove = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
    };
    show(<RolesList />);
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
    show(<RolesList />);
    await openDelete();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    for (const bare of ['Confirm', 'Cancel', 'Save', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('RolesList — search, empty and export (D-19, D-26, D-30, D-42)', () => {
  it('typing "war" searches the API (q=war), never the loaded page', async () => {
    const user = userEvent.setup();
    show(<RolesList />);
    await table();
    await user.type(screen.getByRole('textbox', { name: COMMON.search }), 'war');
    await waitFor(() => {
      expect(listReads().at(-1)?.url.searchParams.get('q')).toBe('war');
    });
    expect(listReads().map((r) => r.url.searchParams.get('q'))).not.toContain('wa');
  });

  it('no rows for "zz": "No roles match “zz”" with Clear search', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<RolesList />, { searchParams: '?q=zz' });
    const empty = await screen.findByTestId('list-no-results');
    expect(within(empty).getByRole('heading').textContent).toBe('No roles match “zz”');
    expect(empty.textContent).toContain(EN.no_roles_match_body);
    expect(within(empty).getByRole('button', { name: COMMON.clear_search })).toBeTruthy();
  });

  it('no rows and no search: "No roles yet" with New Role', async () => {
    api.list = { status: HTTP_OK, body: page([]) };
    show(<RolesList />);
    const empty = await screen.findByTestId('list-empty');
    expect(within(empty).getByRole('heading').textContent).toBe(EN.no_roles_heading);
    expect(within(empty).getByRole('link', { name: EN.new_role }).getAttribute('href')).toBe(
      '/setup/roles/new',
    );
  });

  it('Export sends the three translated labels in ROLE_EXPORT_COLUMNS order to the roles export', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:erp.invalid/1');
    URL.revokeObjectURL = vi.fn();
    show(<RolesList />);
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
      EN.roles_dt_name,
      EN.total_users,
    ]);
  });
});

describe('GuardedRolesList (UIK-03, ADR-0034 d.2, D-39)', () => {
  it('while /me is pending: the list skeleton, and no refusal, no error and no roles request', () => {
    api.me = 'pending';
    show(<GuardedRolesList />);
    expect(screen.getByTestId('permission-pending').getAttribute('data-variant')).toBe('list');
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('permission-error')).toBeNull();
    expect(listReads()).toHaveLength(0);
  });

  it('a member without the administrator flag gets the no-access state once, whatever codes they hold, and no roles request', async () => {
    api.me = {
      status: HTTP_OK,
      body: me(false, [PERMISSIONS.staff.members.view, PERMISSIONS.staff.members.edit]),
    };
    show(<GuardedRolesList />);
    expect(await screen.findAllByTestId('permission-refused')).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(listReads()).toHaveLength(0);
  });

  it('an administrator gets the list', async () => {
    show(<GuardedRolesList />);
    expect(await table()).toBeTruthy();
  });
});

describe('RolesList — route and RTL', () => {
  it('app/(shell)/setup/roles/page.tsx reads no searchParams and stays within 30 lines (FE-01, FE-15)', () => {
    const source = readFileSync(
      join(process.cwd(), 'app', '(shell)', 'setup', 'roles', 'page.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/searchParams/);
    expect(source.trimEnd().split('\n').length).toBeLessThanOrEqual(30);
  });

  it('uses no physical-direction class under ar', async () => {
    const { container } = show(<RolesList />, { locale: 'ar' });
    await table();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
