// @vitest-environment happy-dom
import { act, cleanup, fireEvent } from '@testing-library/react';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { PERMISSIONS } from '@/config/permissions';
import * as endpoints from '@/features/staff/api/staff.endpoints';
import { useRole } from '@/features/staff/hooks/use-roles';
import { staffRoleSchema, type StaffRole } from '@/features/staff/schemas/staff.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { useList } from '@/lib/api/use-common-api';
import { clearSession, setSession } from '@/lib/auth/session';
import { BreadcrumbLabelContext } from '@/lib/hooks/use-breadcrumb-label';
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
import staffEn from '../../messages/en.json';
import { GuardedRoleForm, RoleForm } from '../RoleForm';

/**
 * `/setup/roles/new` and `/setup/roles/:id` on the kit (UIK-04, UAT 6): the screen writes field specs and
 * `SchemaForm` decides the controls, widths, marks and states; the permissions are the
 * `PermissionPicker` open in its editable accordion, because a role IS the template. These tests
 * cover what the SCREEN decides (the kit's own tests cover the kit). The transport is a fake axios
 * adapter on the shared instance, so the real reads and writes run.
 */
const EN = staffEn.staff;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const ROLE_ID = 7;

const pathname = { current: '/setup/roles/7' };
const push = vi.fn<(href: string, options?: unknown) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'actor@example.invalid',
  firstName: 'Actor',
  lastName: 'Person',
  isAdmin,
  roleId: null,
  permissions: [...permissions],
  locale: null,
});

const MEMBERS = [
  {
    staffId: 4,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.invalid',
    active: true,
  },
  {
    staffId: 5,
    firstName: 'Alan',
    lastName: 'Turing',
    email: 'alan@example.invalid',
    active: true,
  },
];
const detail = (overrides: Record<string, unknown> = {}) => ({
  roleId: ROLE_ID,
  name: 'Warehouse Supervisor',
  permissions: ['sales.invoices.view', 'staff.members.view'],
  members: MEMBERS,
  memberCount: MEMBERS.length,
  ...overrides,
});
const ROW: StaffRole = { roleId: ROLE_ID, name: 'Warehouse Supervisor', memberCount: 2 };

const CATALOGUE = {
  data: [
    {
      module: 'sales',
      resources: [
        {
          resource: 'invoices',
          actions: ['view', 'create', 'edit', 'delete'].map((action) => ({
            action,
            code: `sales.invoices.${action}`,
          })),
        },
        { resource: 'estimates', actions: [{ action: 'view', code: 'sales.estimates.view' }] },
      ],
    },
    {
      module: 'staff',
      resources: [
        {
          resource: 'members',
          actions: ['view', 'edit'].map((action) => ({ action, code: `staff.members.${action}` })),
        },
      ],
    },
  ],
  meta: { total: 7 },
};

const problem = (status: number, code: string, issues?: unknown) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
  ...(issues === undefined ? {} : { issues }),
});
const listPage = (rows: readonly StaffRole[]) => ({
  data: rows,
  meta: { nextCursor: null, prevCursor: null, total: rows.length, rangeStart: 1, exportLimit: 10 },
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

interface Api {
  me: Reply;
  detail: Reply;
  save: Reply;
  list: Reply;
  catalogue: Reply;
}
let api: Api;
let requests: { readonly method: string; readonly url: URL; readonly body: unknown }[] = [];

function replyFor(method: string, path: string): Reply {
  if (path === '/api/v1/auth/me') return api.me;
  if (path === '/api/v1/identity/permissions/catalogue') return api.catalogue;
  if (method === 'PATCH' || method === 'POST') return api.save;
  if (/^\/api\/v1\/identity\/roles\/\d+$/.test(path)) return api.detail;
  if (path === '/api/v1/identity/roles') return api.list;
  return { status: 404, body: problem(404, 'ERP-HTTP-404') };
}

function respond(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  requests.push({ method, url, body });
  const reply = replyFor(method, url.pathname);
  if (reply === 'pending') return new Promise<never>(() => undefined);
  const response: AxiosResponse = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (reply.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

const saves = () => requests.filter((r) => r.method === 'PATCH' || r.method === 'POST');
/** The list pages read: GETs of the roles path (a create POSTs to the same path). */
const listReads = () =>
  requests.filter((r) => r.method === 'GET' && r.url.pathname === '/api/v1/identity/roles');

/** A private SWR cache per test and no automatic retry: the settled state is what is asserted. */
const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };
/** The app's one cache, which `seedRow` and `replaceRowInLists` write: each such test uses its own `q`. */
const GLOBAL: SWRConfiguration = { shouldRetryOnError: false, dedupingInterval: 0 };

function show(
  ui: ReactElement,
  { swr = ISOLATED, locale }: { swr?: SWRConfiguration; locale?: 'ar' } = {},
) {
  return renderWithProviders(
    <SWRConfig value={swr}>
      {ui}
      <Toaster />
    </SWRConfig>,
    { hasMemory: true, ...(locale === undefined ? {} : { locale }) },
  );
}
const edit = <RoleForm mode="edit" id={ROLE_ID} />;

// Harness order (RESEARCH Pitfall 9): the session first; unmount BEFORE the session is cleared.
let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  assign = vi.fn<(url: string | URL) => void>();
  vi.spyOn(window.location, 'assign').mockImplementation(assign);
  resetApiStatus();
  requests = [];
  pathname.current = '/setup/roles/7';
  api = {
    me: { status: HTTP_OK, body: me(true) },
    detail: { status: HTTP_OK, body: detail() },
    save: { status: HTTP_OK, body: detail({ name: 'Stock Lead' }) },
    list: { status: HTTP_OK, body: listPage([ROW]) },
    catalogue: { status: HTTP_OK, body: CATALOGUE },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  sessionStorage.clear();
});
afterEach(() => {
  // sonner keeps its toasts in a module store: one test's toast must not show in the next.
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  vi.restoreAllMocks();
});

const nameBox = () => screen.findByRole('textbox', { name: EN.role_add_edit_name });
/** The form once the role AND the catalogue have answered. */
const loaded = async () => {
  const box = await nameBox();
  await screen.findByRole('searchbox', { name: EN.search_permissions });
  return box;
};
const cell = (name: string): string[] =>
  document.querySelector(`[data-field="${name}"]`)?.className.split(' ') ?? [];
const dialog = () => screen.findByTestId('confirm-dialog');
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
const byId = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`no #${id}`);
  return node;
};
const SAVE = 'Save role';

async function renameAndSubmit(user = userEvent.setup(), to = 'Stock Lead') {
  const box = await loaded();
  await user.clear(box);
  await user.type(box, to);
  await user.click(screen.getByRole('button', { name: SAVE }));
  return user;
}
async function confirmSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(await dialog()).getByTestId('confirm-dialog-confirm'));
}

describe('RoleForm — one card of two sections (UAT 6, D-01, ui-kit-decisions §3)', () => {
  it('the form card\'s sections Role and Permissions; Role Name required (asterisk, aria-required) with the placeholder "e.g. Warehouse Supervisor" at half width; the Bootstrap col-span-7 / col-span-5 classes are gone', async () => {
    const { container } = show(edit);
    const box = await loaded();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      EN.role,
      EN.staff_add_edit_permissions,
      EN.staff_which_are_using_role,
    ]);
    expect(box.getAttribute('aria-required')).toBe('true');
    expect(box.getAttribute('placeholder')).toBe('e.g. Warehouse Supervisor');
    expect(document.querySelector(`label[for="${box.id}"]`)?.textContent).toContain('*');
    expect(cell('name')).not.toContain('md:col-span-2');
    expect(container.innerHTML).not.toMatch(/col-span-7|col-span-5/);
  });

  it('edit with members: the "Update all staff members…" checkbox, unticked, and the members as links to /setup/staff/:id', async () => {
    show(edit);
    await loaded();
    const apply = screen.getByRole('checkbox', { name: EN.role_update_staff_permissions });
    expect(apply.getAttribute('data-state')).toBe('unchecked');
    const region = screen.getByRole('region', { name: EN.staff_which_are_using_role });
    const members = within(region).getByTestId('role-members');
    expect(
      within(members)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Ada Lovelace', '/setup/staff/4'],
      ['Alan Turing', '/setup/staff/5'],
    ]);
    expect(region.querySelector('img')).toBeNull();
  });

  it('"Update all staff members permissions that are using this role" sits under Role Name on its own row, and its warning is a footnote: caption size, muted, under the label text, the checkbox\'s description', async () => {
    show(edit);
    await loaded();
    expect(cell('applyToMembers')).toContain('md:col-span-2');
    expect(cell('name')).not.toContain('md:col-span-2');
    const helper = byId('role-form-applyToMembers-helper');
    expect(helper.className.split(' ')).toEqual(
      expect.arrayContaining(['text-xs', 'ps-6', 'text-muted-foreground']),
    );
    expect(helper.textContent).toBe(EN.change_role_permission_warning);
    const apply = screen.getByRole('checkbox', { name: EN.role_update_staff_permissions });
    expect(apply.getAttribute('aria-describedby')).toBe('role-form-applyToMembers-helper');
  });

  it('the members card sits beside the form from 63rem of content width (a container query) and under it below that', async () => {
    const { container } = show(edit);
    await loaded();
    const root = container.querySelector('h1')?.parentElement;
    expect(root?.className.split(' ')).toContain('@container');
    const form = byId('role-form');
    const grid = form.parentElement?.className.split(' ') ?? [];
    expect(grid).toContain('grid-cols-1');
    expect(grid).toContain('@min-[63rem]:grid-cols-[minmax(0,64rem)_20rem]');
    const region = screen.getByRole('region', { name: EN.staff_which_are_using_role });
    expect(form.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('edit with no members: no checkbox, and "role has no members"; create: neither', async () => {
    api.detail = { status: HTTP_OK, body: detail({ members: [], memberCount: 0 }) };
    show(edit);
    await loaded();
    expect(screen.queryByRole('checkbox', { name: EN.role_update_staff_permissions })).toBeNull();
    const region = screen.getByRole('region', { name: EN.staff_which_are_using_role });
    expect(within(region).getByText(EN.role_has_no_members)).toBeTruthy();
    cleanup();
    pathname.current = '/setup/roles/new';
    show(<RoleForm mode="create" />);
    await loaded();
    expect(screen.queryByRole('checkbox', { name: EN.role_update_staff_permissions })).toBeNull();
    expect(screen.queryByText(EN.role_has_no_members)).toBeNull();
    expect(screen.queryByTestId('role-members')).toBeNull();
    expect(screen.queryByRole('region', { name: EN.staff_which_are_using_role })).toBeNull();
  });

  it('Permissions is the PermissionPicker in edit mode at once: search, select-all per module, a checkbox per capability; never the role summary', async () => {
    show(edit);
    await loaded();
    const picker = screen.getByTestId('permission-picker');
    expect(within(picker).getByRole('searchbox', { name: EN.search_permissions })).toBeTruthy();
    expect(within(picker).getByRole('checkbox', { name: 'Select all in Sales' })).toBeTruthy();
    expect(within(picker).queryByRole('button', { name: EN.customise_permissions })).toBeNull();
    expect(screen.queryByTestId('permission-grid')).toBeNull();
  });

  it('the permission table\'s resource column is headed "Feature" (legacy key feature)', async () => {
    show(edit);
    await loaded();
    await userEvent.click(screen.getByRole('button', { name: /^Sales/ }));
    const table = await screen.findByRole('table', { name: 'Sales' });
    expect(within(table).getAllByRole('columnheader')[0]?.textContent).toBe('Feature');
  });
});

describe('RoleForm — every save is confirmed by what changes (D-25.4, T-3.2-81, T-3.2-83)', () => {
  it('a valid edit opens "Save changes to Warehouse Supervisor?" with "Role Name updated", focus on "Save role"; "Back to form" sends nothing', async () => {
    show(edit);
    const user = await renameAndSubmit();
    const open = await dialog();
    expect(within(open).getByRole('heading').textContent).toBe(
      'Save changes to Warehouse Supervisor?',
    );
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe(
      `${EN.role_add_edit_name} updated`,
    );
    expect(document.activeElement).toBe(within(open).getByTestId('confirm-dialog-confirm'));
    expect(within(open).getByTestId('confirm-dialog-confirm').textContent).toBe(SAVE);
    await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    expect(saves()).toHaveLength(0);
  });

  it('ticking "Update all staff members…" is listed FIRST as an access change, and the PATCH carries applyToMembers true', async () => {
    show(edit);
    const user = userEvent.setup();
    await loaded();
    await user.click(screen.getByRole('checkbox', { name: EN.role_update_staff_permissions }));
    await renameAndSubmit(user);
    const open = await dialog();
    const items = [
      ...within(open).getByTestId('confirm-dialog-changes').querySelectorAll(':scope > li'),
    ].map((li) => li.textContent);
    expect(items).toEqual([EN.role_update_staff_permissions, `${EN.role_add_edit_name} updated`]);
    await confirmSave(user);
    await closed();
    expect(saves().map((r) => [r.method, r.url.pathname, r.body])).toEqual([
      [
        'PATCH',
        '/api/v1/identity/roles/7',
        {
          name: 'Stock Lead',
          permissions: ['sales.invoices.view', 'staff.members.view'],
          applyToMembers: true,
        },
      ],
    ]);
  });

  it('a permission removed and one added read through PermissionChanges: the sentence, the removal open, the addition behind "Show 1 added"', async () => {
    show(edit);
    const user = userEvent.setup();
    await loaded();
    await user.click(screen.getByRole('button', { name: /^Sales/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Invoices Create' }));
    await user.click(screen.getByRole('checkbox', { name: 'Invoices View' }));
    await user.click(screen.getByRole('button', { name: SAVE }));
    const lines = within(await dialog()).getByTestId('confirm-dialog-changes');
    expect(lines.textContent).toContain('Adds 1 permission and removes 1.');
    expect(
      [...lines.querySelectorAll('[data-testid="permission-changes-removed"] li')].map(
        (li) => li.textContent,
      ),
    ).toEqual(['Sales · Invoices · View']);
    expect(within(lines).getByRole('button', { name: 'Show 1 added' })).toBeTruthy();
  });
});

/** Reads the role's detail and one list page from the app's cache, as the list screen does. */
function CacheProbe({ q }: { readonly q: string }): ReactElement {
  const one = useRole(ROLE_ID);
  const page = useList('/api/v1/identity/roles', staffRoleSchema, { q });
  return (
    <>
      <output data-testid="probe-detail">{one.data?.name ?? 'none'}</output>
      <output data-testid="probe-list">{page.data?.data[0]?.name ?? 'none'}</output>
    </>
  );
}

const RETURN_URL = '/setup/roles?cursor=abc&sort=-name';
const recordReturn = (url = RETURN_URL) => {
  sessionStorage.setItem('erp.list.return:/setup/roles', JSON.stringify({ url }));
};

describe('RoleForm — a record that cannot be loaded offers a way back (lead 2026-09-27, D-28, D-31, D-39)', () => {
  const backLink = () => screen.getByRole('link', { name: COMMON.back_to_list });

  it('a permalink answered 404 ERP-IDENTITY-0008: the plain message, no Retry, and Back to list to the recorded list URL', async () => {
    recordReturn();
    pathname.current = '/setup/roles/8';
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0008') };
    show(<RoleForm mode="edit" id={8} />);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-IDENTITY-0008']);
    expect(screen.queryByRole('button')).toBeNull();
    expect(backLink().getAttribute('href')).toBe(RETURN_URL);
  });

  it('a permalink whose read fails retryably (503): Retry AND Back to list — the list base when nothing is recorded', async () => {
    pathname.current = '/setup/roles/8';
    api.detail = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<RoleForm mode="edit" id={8} />);
    await screen.findByTestId('inline-error');
    expect(screen.getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe('/setup/roles');
  });

  /** Opens role `id` from the list: its row seeded in the app's cache, the role as `api.detail`. */
  const openSeeded = (id: number) => {
    pathname.current = `/setup/roles/${String(id)}`;
    seedRow(`/api/v1/identity/roles/${String(id)}`, { ...ROW, roleId: id });
    show(<RoleForm mode="edit" id={id} />, { swr: GLOBAL });
  };
  const submitButton = () => screen.getByRole('button', { name: SAVE });

  it('opened from the list, the role answers 404: the whole page is the not-found state with Back to list — never the seeded form, never a skeleton', async () => {
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0008') };
    openSeeded(41);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-IDENTITY-0008']);
    expect(backLink().getAttribute('href')).toBe('/setup/roles');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('page-skeleton')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('opened from the list, the role fails retryably (503): Role Name stays but locked, Permissions shows the error with Retry instead of its skeleton, no members skeleton, and Retry loads it', async () => {
    const user = userEvent.setup();
    api.detail = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    openSeeded(42);
    const permissions = screen.getByRole('region', { name: EN.staff_add_edit_permissions });
    const error = await within(permissions).findByTestId('permissions-error');
    const retry = within(error).getByRole('button', { name: COMMON.retry });
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    const box = await nameBox();
    expect(box.getAttribute('value')).toBe('Warehouse Supervisor');
    expect(box).toHaveProperty('disabled', true);
    expect(screen.queryByRole('region', { name: EN.staff_which_are_using_role })).toBeNull();
    api.detail = { status: HTTP_OK, body: detail({ roleId: 42 }) };
    await user.click(retry);
    expect(await screen.findByTestId('permission-picker')).toBeTruthy();
    await waitFor(async () => {
      expect(await nameBox()).toHaveProperty('disabled', false);
    });
    const region = screen.getByRole('region', { name: EN.staff_which_are_using_role });
    expect(
      within(region)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Ada Lovelace', 'Alan Turing']);
  });

  it('opened from the list, nothing can be edited or saved until the role arrives', async () => {
    api.detail = 'pending';
    openSeeded(43);
    expect(await nameBox()).toHaveProperty('disabled', true);
    expect(submitButton()).toHaveProperty('disabled', true);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(saves()).toHaveLength(0);
  });

  it('a submit event while the detail is missing opens no dialog and sends nothing', async () => {
    api.detail = 'pending';
    openSeeded(44);
    await nameBox();
    fireEvent.submit(byId('role-form'));
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(saves()).toHaveLength(0);
  });
});

describe("RoleForm: the breadcrumb's record name after a failed read (D-39)", () => {
  /** The form inside a stand-in shell that records every label it publishes. */
  const inShell = (ui: ReactElement, swr?: SWRConfiguration) => {
    const published = vi.fn<(label: string | null | undefined) => void>();
    show(
      <BreadcrumbLabelContext.Provider value={published}>{ui}</BreadcrumbLabelContext.Provider>,
      swr === undefined ? {} : { swr },
    );
    return published;
  };
  const openSeeded = (id: number) => {
    pathname.current = `/setup/roles/${String(id)}`;
    seedRow(`/api/v1/identity/roles/${String(id)}`, { ...ROW, roleId: id });
    return inShell(<RoleForm mode="edit" id={id} />, GLOBAL);
  };

  it('a permalink answered 404 publishes no record name (null), so the breadcrumb stops loading (D-39)', async () => {
    pathname.current = '/setup/roles/8';
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0008') };
    const published = inShell(<RoleForm mode="edit" id={8} />);
    await screen.findByTestId('inline-error');
    expect(published.mock.lastCall?.[0]).toBeNull();
  });

  it('opened from the list, the role answers 404: the seeded name is withdrawn from the breadcrumb (null)', async () => {
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0008') };
    const published = openSeeded(45);
    await screen.findByTestId('inline-error');
    expect(published.mock.lastCall?.[0]).toBeNull();
  });

  it('opened from the list, the role fails retryably (503): the breadcrumb keeps the seeded name', async () => {
    api.detail = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    const published = openSeeded(46);
    await screen.findByTestId('permissions-error');
    expect(published.mock.lastCall?.[0]).toBe('Warehouse Supervisor');
  });
});

describe('RoleForm — after a save (D-28, D-36)', () => {
  it('confirm → one PATCH; the toast "Role saved", the detail and the cached list page hold the saved role with NO list request, and back to the recorded list URL', async () => {
    recordReturn();
    const user = userEvent.setup();
    show(
      <>
        {edit}
        <CacheProbe q="role-save-probe" />
      </>,
      { swr: GLOBAL },
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-list').textContent).toBe('Warehouse Supervisor');
    });
    const before = listReads().length;
    await renameAndSubmit(user);
    await confirmSave(user);
    await closed();
    expect(saves().map((r) => [r.method, r.url.pathname])).toEqual([
      ['PATCH', '/api/v1/identity/roles/7'],
    ]);
    expect(await screen.findByText(EN.toast_role_saved)).toBeTruthy();
    expect(screen.getByTestId('probe-detail').textContent).toBe('Stock Lead');
    expect(screen.getByTestId('probe-list').textContent).toBe('Stock Lead');
    expect(push).toHaveBeenCalledWith(RETURN_URL, { scroll: false });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(listReads()).toHaveLength(before);
  });

  it('a tampered return URL sends the member to the list base, never away (T-3.2-84)', async () => {
    recordReturn('https://evil.example/roles');
    show(edit);
    const user = await renameAndSubmit();
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/roles', { scroll: false });
    });
  });

  it('create: "Create role Stock Lead?" → one POST; success revalidates the list pages and returns to the list', async () => {
    pathname.current = '/setup/roles/new';
    recordReturn();
    api.save = {
      status: 201,
      body: detail({ roleId: 21, name: 'Stock Lead', members: [], memberCount: 0 }),
    };
    const user = userEvent.setup();
    show(
      <>
        <RoleForm mode="create" />
        <CacheProbe q="role-create-probe" />
      </>,
      { swr: GLOBAL },
    );
    await loaded();
    await waitFor(() => {
      expect(screen.getByTestId('probe-list').textContent).toBe('Warehouse Supervisor');
    });
    await user.type(await nameBox(), 'Stock Lead');
    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const open = await dialog();
    expect(within(open).getByRole('heading').textContent).toBe('Create role Stock Lead?');
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toContain(
      'Role: Stock Lead, 0 permissions',
    );
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const before = listReads().length;
    await confirmSave(user);
    await closed();
    expect(saves().map((r) => [r.method, r.url.pathname, r.body])).toEqual([
      ['POST', '/api/v1/identity/roles', { name: 'Stock Lead', permissions: [] }],
    ]);
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
    expect(push).toHaveBeenCalledWith(RETURN_URL, { scroll: false });
  });
});

describe('RoleForm — when a save fails (D-29, UAT 7)', () => {
  it('a blank name: no request, the field error under Role Name and in the focused summary', async () => {
    show(edit);
    const user = userEvent.setup();
    const box = await loaded();
    await user.clear(box);
    await user.type(box, ' ');
    await user.click(screen.getByRole('button', { name: SAVE }));
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.role_add_edit_name}: ${EN.enter_role_name}`);
    expect(byId('role-form-name-error').textContent).toBe(EN.enter_role_name);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(saves()).toHaveLength(0);
  });

  it('a 400 on name: the dialog closes, the message is under Role Name and in the focused summary; the api text never shows', async () => {
    api.save = {
      status: 400,
      body: problem(400, 'ERP-VALIDATION-0001', [{ path: ['name'], message: 'raw server text' }]),
    };
    show(edit);
    const user = await renameAndSubmit();
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.role_add_edit_name}: ${EN.enter_role_name}`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(document.activeElement).toBe(summary);
    expect(document.body.textContent).not.toContain('raw server text');
  });

  it('a 503: the dialog closes, the alert in the form keeps the edits and offers Retry; Retry re-sends the same body without the dialog', async () => {
    api.save = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show(edit);
    const user = await renameAndSubmit();
    await confirmSave(user);
    await closed();
    const alert = await screen.findByTestId('form-server-error');
    expect(alert.textContent).toContain(COMMON.save_failed);
    expect(alert.textContent).not.toMatch(/ERP-|503/);
    expect((await nameBox()).getAttribute('value')).toBe('Stock Lead');
    api.save = { status: HTTP_OK, body: detail({ name: 'Stock Lead' }) };
    await user.click(within(alert).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(saves()).toHaveLength(2);
    });
    expect(saves()[1]?.body).toEqual(saves()[0]?.body);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('a 409 (a role with that name exists) stays inside the dialog in plain language, with Save role disabled (UAT 7)', async () => {
    api.save = { status: 409, body: problem(409, 'ERP-IDENTITY-0007') };
    show(edit);
    const user = await renameAndSubmit();
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-IDENTITY-0007']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('form-server-error')).toBeNull();
  });

  it('a 403 refusal stays inside the dialog too', async () => {
    api.save = { status: 403, body: problem(403, 'ERP-IDENTITY-0004') };
    show(edit);
    const user = await renameAndSubmit();
    await confirmSave(user);
    expect((await screen.findByTestId('confirm-dialog-error')).textContent).toBe(
      EN.errors['ERP-IDENTITY-0004'],
    );
  });
});

describe('RoleForm — labels, pending and leaving (D-25.3, D-28, D-40)', () => {
  it('"Save role" is disabled while clean; pending reads "Saving role…" with every control disabled; create reads "Create role"', async () => {
    api.save = 'pending';
    const user = userEvent.setup();
    show(edit);
    await loaded();
    expect(screen.getByRole('button', { name: SAVE }).hasAttribute('disabled')).toBe(true);
    await renameAndSubmit(user);
    await confirmSave(user);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Saving role…', hidden: true })).toHaveLength(2);
    });
    expect(document.querySelector('[data-slot="form-body"]')?.hasAttribute('disabled')).toBe(true);
    cleanup();
    pathname.current = '/setup/roles/new';
    show(<RoleForm mode="create" />);
    await loaded();
    expect(screen.getByRole('button', { name: 'Create role' })).toBeTruthy();
  });

  it('dirty + a sidebar link → "Discard changes?" naming the role; Keep editing stays', async () => {
    const user = userEvent.setup();
    show(
      <>
        <a href="/admin/leads">Leads</a>
        {edit}
      </>,
    );
    await user.type(await loaded(), 'x');
    await user.click(screen.getByRole('link', { name: 'Leads' }));
    const open = await dialog();
    expect(within(open).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(open.textContent).toContain("Your changes to Warehouse Supervisor haven't been saved.");
    await user.click(within(open).getByRole('button', { name: COMMON.keep_editing }));
    await closed();
    expect(assign).not.toHaveBeenCalled();
  });

  it('clean + "Back to list" → the recorded list URL at once', async () => {
    recordReturn();
    show(edit);
    await loaded();
    await userEvent.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    expect(push).toHaveBeenCalledWith(RETURN_URL);
  });

  it('no bare Save, Cancel, Confirm or Close label anywhere on the screen', async () => {
    show(edit);
    await renameAndSubmit();
    await dialog();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    expect(labels.length).toBeGreaterThan(3);
    for (const bare of ['Save', 'Cancel', 'Confirm', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('RoleForm — instant detail and skeletons (D-35, D-39)', () => {
  it('opened from the list: the h1 and Role Name at once, Permissions as labelled field blocks until the role arrives', async () => {
    // A role id no other test reads: the seed lives in the app's one cache.
    pathname.current = '/setup/roles/9';
    seedRow('/api/v1/identity/roles/9', { ...ROW, roleId: 9 });
    api.detail = 'pending';
    show(<RoleForm mode="edit" id={9} />, { swr: GLOBAL });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Warehouse Supervisor',
    );
    expect((await nameBox()).getAttribute('value')).toBe('Warehouse Supervisor');
    const permissions = screen.getByRole('region', { name: EN.staff_add_edit_permissions });
    expect(within(permissions).getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('permission-picker')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    const members = screen.getByRole('region', { name: EN.staff_which_are_using_role });
    expect(within(members).getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('role-members')).toBeNull();
  });

  it('a permalink (no seed, the role pending): the form skeleton, and no message', () => {
    pathname.current = '/setup/roles/8';
    api.detail = 'pending';
    show(<RoleForm mode="edit" id={8} />);
    expect(screen.getByTestId('page-skeleton').getAttribute('data-variant')).toBe('form');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('link', { name: COMMON.back_to_list })).toBeNull();
  });
});

describe('GuardedRoleForm (UIK-03, ADR-0034 d.2, D-39)', () => {
  it('while /me is pending: the form skeleton, and no refusal and no error', () => {
    api.me = 'pending';
    show(<GuardedRoleForm mode="edit" id={ROLE_ID} />);
    expect(screen.getByTestId('permission-pending').getAttribute('data-variant')).toBe('form');
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('permission-error')).toBeNull();
  });

  it('a member without the administrator flag gets the no-access state once and asks for no role', async () => {
    api.me = { status: HTTP_OK, body: me(false, [PERMISSIONS.staff.members.view]) };
    show(<GuardedRoleForm mode="edit" id={ROLE_ID} />);
    expect(await screen.findAllByTestId('permission-refused')).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(requests.filter((r) => r.url.pathname.startsWith('/api/v1/identity/'))).toEqual([]);
  });

  it('/setup/roles/new renders the create form for an administrator', async () => {
    pathname.current = '/setup/roles/new';
    show(<GuardedRoleForm mode="create" />);
    expect(await nameBox()).toBeTruthy();
  });
});

describe('RoleForm — what retired (FE-13, UI-SPEC § Copywriting)', () => {
  it('the staff components are the four screens and the role members card: the old grid and delete dialog are gone', () => {
    const components = readdirSync(join(process.cwd(), 'src/features/staff/components')).filter(
      (name) => name.endsWith('.tsx'),
    );
    expect(components.sort()).toEqual([
      'RoleForm.stories.tsx',
      'RoleForm.tsx',
      'RoleMembers.stories.tsx',
      'RoleMembers.tsx',
      'RolesList.stories.tsx',
      'RolesList.tsx',
      'StaffList.stories.tsx',
      'StaffList.tsx',
      'StaffMemberForm.stories.tsx',
      'StaffMemberForm.tsx',
    ]);
  });

  it('the staff endpoints export no code → key map (useErrorText renders the codes); common.confirm, common.cancel and common.saving are gone from both locales', () => {
    expect(Object.keys(endpoints).sort()).toEqual([
      'AUTH_ME_PATH',
      'IDENTITY_CATALOGUE_PATH',
      'IDENTITY_DEPARTMENTS_PATH',
      'IDENTITY_LOCALES_PATH',
      'IDENTITY_MEMBERS_EXPORT_PATH',
      'IDENTITY_MEMBERS_PATH',
      'IDENTITY_ROLES_EXPORT_PATH',
      'IDENTITY_ROLES_PATH',
      'MEMBER_EXPORT_COLUMNS',
      'ROLE_EXPORT_COLUMNS',
      'STAFF_ERROR_CODES',
      'VALIDATION_CODE',
      'fetchRoleTemplate',
      'memberPath',
      'memberStatusPath',
      'rolePath',
      'staffMemberHooks',
      'staffRoleHooks',
    ]);
    for (const pack of [commonEn.common, commonAr.common]) {
      for (const key of ['confirm', 'cancel', 'saving'])
        expect(Object.keys(pack)).not.toContain(key);
    }
  });
});

describe('RoleForm — routes and RTL', () => {
  it('both route files are ≤ 30 lines, force-dynamic with the reason, params awaited, no @/hocs import (FE-01)', () => {
    const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'app', ...parts), 'utf8');
    const create = read('(shell)', 'setup', 'roles', 'new', 'page.tsx');
    const record = read('(shell)', 'setup', 'roles', '[id]', 'page.tsx');
    for (const source of [create, record]) {
      expect(source.trimEnd().split('\n').length).toBeLessThanOrEqual(30);
      expect(source).toMatch(/\/\/ .+\n(?:\/\/ .+\n)*export const dynamic = 'force-dynamic'/);
      expect(source).not.toMatch(/@\/hocs/);
    }
    expect(record).toMatch(/await props\.params/);
  });

  it('uses no physical-direction class under ar', async () => {
    const { container } = show(edit, { locale: 'ar' });
    await screen.findByRole('heading', { level: 1 });
    await screen.findByTestId('permission-picker');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

describe('RoleForm: the page title (D-16, UI-SPEC G1)', () => {
  it('the title is the 24px page title: text-2xl font-semibold (D-16)', async () => {
    show(<RoleForm mode="create" />);
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.className).toContain('text-2xl');
    expect(title.className).toContain('font-semibold');
    expect(title.className).not.toContain('text-xl');
  });
});
