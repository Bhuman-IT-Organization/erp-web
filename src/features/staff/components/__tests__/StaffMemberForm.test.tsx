// @vitest-environment happy-dom
import { act, cleanup, fireEvent } from '@testing-library/react';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Toaster } from '@/components/ui/sonner';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@/config/permissions';
import { useStaffMember } from '@/features/staff/hooks/use-staff-members';
import { staffMemberSchema, type StaffMember } from '@/features/staff/schemas/staff.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { useList } from '@/lib/api/use-common-api';
import { clearSession, setSession } from '@/lib/auth/session';
import { BreadcrumbLabelContext } from '@/lib/hooks/use-breadcrumb-label';
import { messagesFor } from '@/messages';
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
import { GuardedStaffMemberForm, StaffMemberForm } from '../StaffMemberForm';

/**
 * `/setup/staff/new` and `/setup/staff/:id` on the kit (UIK-04): the screen writes field specs and `SchemaForm`
 * decides the controls, widths, marks and states; `PermissionPicker` is role-first. These tests
 * cover what the SCREEN decides (the kit's own tests cover the kit). The transport is a fake axios
 * adapter on the shared instance, so the real reads run; a reply can be held open to observe a
 * loading state.
 */
const EN = staffEn.staff;
const COMMON = commonEn.common;
const HTTP_OK = 200;
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;
const SETTLE_MS = 100;
const JANE_ID = 7;

const pathname = { current: '/setup/staff/7' };
const push = vi.fn<(href: string, options?: unknown) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const me = (isAdmin: boolean, permissions: readonly string[] = [], staffId = 1) => ({
  staffId,
  email: 'actor@example.invalid',
  firstName: 'Actor',
  lastName: 'Person',
  isAdmin,
  roleId: null,
  permissions: [...permissions],
  locale: null,
});

const EMPLOYEE_CODES = [
  'sales.estimates.view',
  'sales.invoices.create',
  'sales.invoices.edit',
  'sales.invoices.view',
  'staff.members.view',
];

const detail = (overrides: Record<string, unknown> = {}) => ({
  staffId: JANE_ID,
  email: 'jane@example.invalid',
  firstName: 'Jane',
  lastName: 'Doe',
  phoneNumber: '0501234567',
  facebook: null,
  linkedin: null,
  skype: null,
  hourlyRate: 0,
  defaultLanguage: null,
  // The api still sends the legacy column; the screen must not render it (finding 8).
  direction: 'rtl',
  emailSignature: null,
  mediaPathSlug: null,
  profileImageUrl: null,
  profileImagePreviewUrl: null,
  dateCreated: '2026-01-02T20:30:00.000Z',
  lastLogin: null,
  lastActivity: null,
  isAdmin: false,
  roleId: 3,
  roleName: 'Employee',
  active: true,
  isNotStaff: false,
  departmentIds: [2],
  // Two of the Employee role's five codes: three behind the role.
  permissions: ['sales.invoices.view', 'staff.members.view'],
  ...overrides,
});

const ROW: StaffMember = {
  staffId: JANE_ID,
  email: 'jane@example.invalid',
  firstName: 'Jane',
  lastName: 'Doe',
  phoneNumber: '0501234567',
  isAdmin: false,
  roleId: 3,
  roleName: 'Employee',
  active: true,
  dateCreated: '2026-01-02T20:30:00.000Z',
  profileImageUrl: null,
  profileImagePreviewUrl: null,
  lastLogin: null,
};

const ROLES = {
  data: Array.from({ length: 21 }, (_, index) => {
    const roleId = index + 1;
    const name =
      roleId === 3 ? 'Employee' : roleId === 5 ? 'Warehouse Supervisor' : `Role ${String(roleId)}`;
    return { roleId, name, memberCount: 1 };
  }),
  meta: { nextCursor: null },
};
const template = (roleId: number, name: string, permissions: readonly string[]) => ({
  roleId,
  name,
  permissions: [...permissions],
});
/** Twenty-seven locales, so the select offers 28 with "System Default". */
const LOCALES = {
  data: [
    { locale: 'en', legacyLanguage: 'english' },
    { locale: 'ar', legacyLanguage: 'arabic' },
    ...Array.from({ length: 25 }, (_, index) => {
      const n = String(index + 1).padStart(2, '0');
      return { locale: `x${n}`, legacyLanguage: `language${n}` };
    }),
  ],
  meta: { total: 27 },
};
const departments = (count: number) => ({
  data: Array.from({ length: count }, (_, index) => ({
    departmentId: index + 1,
    name: `Department ${String(index + 1)}`,
  })),
  meta: { total: count },
});
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
        {
          resource: 'estimates',
          actions: [{ action: 'view', code: 'sales.estimates.view' }],
        },
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
const listPage = (rows: readonly StaffMember[]) => ({
  data: rows,
  meta: { nextCursor: null, prevCursor: null, total: rows.length, rangeStart: 1, exportLimit: 10 },
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

interface Api {
  me: Reply;
  detail: Reply;
  save: Reply;
  list: Reply;
  departments: Reply;
  roles: Reply;
  template: Reply;
  locales: Reply;
  catalogue: Reply;
}
let api: Api;
let requests: { readonly method: string; readonly url: URL; readonly body: unknown }[] = [];
/** A reply held open until `release(path)`, to watch a loading state turn into the loaded one. */
let held = new Map<string, () => void>();

function replyFor(method: string, path: string): Reply {
  if (path === '/api/v1/auth/me') return api.me;
  if (path === '/api/v1/identity/departments') return api.departments;
  if (path === '/api/v1/identity/locales') return api.locales;
  if (path === '/api/v1/identity/permissions/catalogue') return api.catalogue;
  if (path === '/api/v1/identity/roles') return api.roles;
  if (path.startsWith('/api/v1/identity/roles/')) return api.template;
  if (method === 'GET' && /^\/api\/v1\/identity\/members\/\d+$/.test(path)) return api.detail;
  if (method === 'PATCH' || method === 'POST') return api.save;
  if (path === '/api/v1/identity/members') return api.list;
  return { status: 404, body: problem(404, 'ERP-HTTP-404') };
}

function respond(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  requests.push({ method, url, body });
  const reply = replyFor(method, url.pathname);
  if (reply === 'pending') return new Promise<never>(() => undefined);
  const answer = (): Promise<AxiosResponse> => {
    const response: AxiosResponse = {
      data: reply.body,
      status: reply.status,
      statusText: String(reply.status),
      headers: new AxiosHeaders(),
      config,
    };
    if (reply.status < 300) return Promise.resolve(response);
    return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
  };
  const gate = held.get(url.pathname);
  if (gate === undefined) return answer();
  return new Promise<AxiosResponse>((resolve, reject) => {
    held.set(url.pathname, () => {
      answer().then(resolve, reject);
    });
  });
}
const hold = (path: string) => {
  held.set(path, () => undefined);
};
const release = async (path: string) => {
  await act(async () => {
    held.get(path)?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const requestsTo = (path: string) => requests.filter((r) => r.url.pathname === path);
/** The list pages read: GETs of the members path (a create POSTs to the same path). */
const listReads = () => requestsTo('/api/v1/identity/members').filter((r) => r.method === 'GET');

/** A private SWR cache per test and no automatic retry: the settled state is what is asserted. */
const ISOLATED: SWRConfiguration = { provider: () => new Map(), shouldRetryOnError: false };
/** The app's one cache, which `seedRow` writes: such a test uses a member id no other test uses. */
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
    {
      hasMemory: true,
      ...(locale === undefined ? {} : { locale }),
    },
  );
}
const edit = <StaffMemberForm mode="edit" id={JANE_ID} />;

// Harness order (RESEARCH Pitfall 9): the session first; unmount BEFORE the session is cleared.
let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  assign = vi.fn<(url: string | URL) => void>();
  vi.spyOn(window.location, 'assign').mockImplementation(assign);
  resetApiStatus();
  requests = [];
  held = new Map();
  pathname.current = '/setup/staff/7';
  api = {
    me: { status: HTTP_OK, body: me(true) },
    detail: { status: HTTP_OK, body: detail() },
    save: { status: HTTP_OK, body: detail({ phoneNumber: '0559876543' }) },
    list: { status: HTTP_OK, body: listPage([ROW]) },
    departments: { status: HTTP_OK, body: departments(4) },
    roles: { status: HTTP_OK, body: ROLES },
    template: { status: HTTP_OK, body: template(3, 'Employee', EMPLOYEE_CODES) },
    locales: { status: HTTP_OK, body: LOCALES },
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

const loaded = () => screen.findByRole('textbox', { name: EN.staff_add_edit_firstname });
const region = (name: string) => screen.getByRole('region', { name });
const cell = (name: string): string[] =>
  document.querySelector(`[data-field="${name}"]`)?.className.split(' ') ?? [];

describe('StaffMemberForm — one card of sections (findings 5, 6, 7, 8; D-01)', () => {
  it('one card with the sections Profile, Access and In Perfex in that order; no tablist; First and Last Name share a row, the signature spans both', async () => {
    show(edit);
    await loaded();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([EN.staff_profile_string, EN.section_access, EN.section_in_perfex]);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(cell('firstName')).not.toContain('md:col-span-2');
    expect(cell('lastName')).not.toContain('md:col-span-2');
    expect(cell('emailSignature')).toContain('md:col-span-2');
    // The four legacy tabs are links in the last section, each saying it opens in Perfex.
    const perfex = region(EN.section_in_perfex);
    const links = within(perfex).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/staff/member/7?legacy=1',
      '/admin/staff/member/7?legacy=1',
      '/admin/staff/member/7?legacy=1',
      '/admin/staff/member/7?legacy=1',
      '/admin/staff?legacy=1',
    ]);
    expect(links[0]?.textContent).toContain(EN.tab_notes_on_legacy);
  });

  it('First Name, Last Name and Email carry the asterisk and aria-required; Phone does not; the legend appears once', async () => {
    show(edit);
    await loaded();
    for (const name of [
      EN.staff_add_edit_firstname,
      EN.staff_add_edit_lastname,
      EN.staff_add_edit_email,
    ]) {
      const box = screen.getByRole('textbox', { name });
      expect(box.getAttribute('aria-required'), name).toBe('true');
      const label = document.querySelector(`label[for="${box.id}"]`);
      expect(label?.querySelector('[aria-hidden="true"]')?.textContent, name).toBe('*');
    }
    const phone = screen.getByRole('textbox', { name: EN.staff_add_edit_phonenumber });
    expect(phone.hasAttribute('aria-required')).toBe(false);
    expect(screen.getAllByText(COMMON.required_legend)).toHaveLength(1);
  });

  it('no control or label for Direction exists (finding 8)', async () => {
    const { container } = show(edit);
    await loaded();
    expect(container.textContent).not.toMatch(/direction|LTR|RTL/i);
    expect(EN).not.toHaveProperty('document_direction');
  });

  // A multi-step userEvent flow: about 1 s alone, measured at up to 9.5 s under full-suite parallel
  // load (quick 260927-m8a), so it gets an explicit timeout instead of the 5 s default.
  it('"More details" is one closed disclosure holding Email Signature, Facebook, LinkedIn and Skype; it opens on load when any of them has a value (findings 6, 7; lead 2026-09-26)', async () => {
    show(edit);
    await loaded();
    const details = screen.getByText(EN.more_details).closest('details');
    expect(details?.open).toBe(false);
    for (const field of ['emailSignature', 'facebook', 'linkedin', 'skype']) {
      expect(details?.contains(document.getElementById(`staff-member-${field}`)), field).toBe(true);
    }
    // The helper still describes the signature inside the disclosure.
    expect(details?.textContent).toContain(EN.staff_email_signature_help);
    expect(screen.queryByText('Social profiles')).toBeNull();
    for (const filled of [{ facebook: 'fb.example/jane' }, { emailSignature: 'Kind regards' }]) {
      cleanup();
      api.detail = { status: HTTP_OK, body: detail(filled) };
      show(edit);
      await loaded();
      await waitFor(() => {
        expect(screen.getByText(EN.more_details).closest('details')?.open).toBe(true);
      });
    }
  }, 20_000);
});

describe('StaffMemberForm — the kit chooses every control (D-24, finding 9)', () => {
  it('Role (21) and Default Language (28) are searchable selects; Departments (4) are checkboxes; Administrator is a checkbox, never a switch; Password has a named reveal', async () => {
    show(edit);
    await loaded();
    expect(await screen.findByRole('combobox', { name: EN.staff_add_edit_role })).toBeTruthy();
    expect(
      await screen.findByRole('combobox', { name: EN.localization_default_language }),
    ).toBeTruthy();
    const group = await screen.findByRole('group', { name: /^Member departments/ });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByRole('checkbox', { name: EN.staff_add_edit_administrator })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('button', { name: COMMON.show_password })).toBeTruthy();
  });

  it('Departments with 9 options is a searchable multi-select', async () => {
    api.departments = { status: HTTP_OK, body: departments(9) };
    show(edit);
    await loaded();
    expect(
      await screen.findByRole('combobox', { name: EN.staff_add_edit_departments }),
    ).toBeTruthy();
  });

  it('Role and Default Language are declared half width: each keeps the same grid columns while its options load and once loaded, so nothing reflows (lead decision (a))', async () => {
    hold('/api/v1/identity/roles');
    hold('/api/v1/identity/locales');
    show(edit);
    await loaded();
    await waitFor(() => {
      expect(requestsTo('/api/v1/identity/roles')).toHaveLength(1);
    });
    const role = cell('roleId');
    const language = cell('defaultLanguage');
    expect(role).not.toContain('md:col-span-2');
    expect(language).not.toContain('md:col-span-2');
    await release('/api/v1/identity/roles');
    await release('/api/v1/identity/locales');
    expect(await screen.findByRole('combobox', { name: EN.staff_add_edit_role })).toBeTruthy();
    expect(
      await screen.findByRole('combobox', { name: EN.localization_default_language }),
    ).toBeTruthy();
    expect(cell('roleId')).toEqual(role);
    expect(cell('defaultLanguage')).toEqual(language);
  });
});

describe('StaffMemberForm — role-first permissions (ui-kit-decisions §1, UAT 12)', () => {
  it('admin, edit: the role summary and "Customise these permissions"; customising shows the editable accordion', async () => {
    show(edit);
    await loaded();
    const access = region(EN.section_access);
    expect(
      await within(access).findByText('Employee grants 2 permissions in 2 modules'),
    ).toBeTruthy();
    expect(within(access).queryByRole('searchbox')).toBeNull();
    await userEvent.click(within(access).getByRole('button', { name: EN.customise_permissions }));
    expect(within(access).getByRole('searchbox', { name: EN.search_permissions })).toBeTruthy();
    expect(within(access).getByRole('checkbox', { name: 'Select all in Sales' })).toBeTruthy();
  });

  it('the customised picker\'s resource column is headed "Feature" (legacy key feature)', async () => {
    show(edit);
    await loaded();
    const access = region(EN.section_access);
    await userEvent.click(
      await within(access).findByRole('button', { name: EN.customise_permissions }),
    );
    await userEvent.click(within(access).getByRole('button', { name: /^Sales/ }));
    const table = within(access).getByRole('table', { name: 'Sales' });
    expect(within(table).getAllByRole('columnheader')[0]?.textContent).toBe('Feature');
  });

  it('a member three codes behind their role sees the alert; Re-apply applies at once', async () => {
    show(edit);
    await loaded();
    const behind = await screen.findByTestId('permission-picker-behind');
    expect(behind.textContent).toContain(
      'Jane Doe is missing 3 permissions the Employee role grants.',
    );
    await userEvent.click(within(behind).getByRole('button', { name: EN.reapply_role }));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(screen.queryByTestId('permission-picker-behind')).toBeNull();
    expect(screen.getByText('Employee grants 5 permissions in 2 modules')).toBeTruthy();
  });

  it('Re-apply has no dialog of its own (lead 2026-09-26): one click sets the picker to exactly the template, the form is dirty and the banner goes', async () => {
    // One fixture: Employee grants five codes; the member holds one of them and one outside it.
    api.detail = {
      status: HTTP_OK,
      body: detail({ permissions: ['sales.invoices.view', 'sales.invoices.delete'] }),
    };
    const user = userEvent.setup();
    show(edit);
    await loaded();
    const behind = await screen.findByTestId('permission-picker-behind');
    await user.click(within(behind).getByRole('button', { name: EN.reapply_role }));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(screen.queryByTestId('permission-picker-behind')).toBeNull();
    // Exactly the template: 5 permissions in 2 modules, and the form now has something to save.
    expect(screen.getByText('Employee grants 5 permissions in 2 modules')).toBeTruthy();
    expect(screen.getByText(COMMON.unsaved_changes)).toBeTruthy();
    expect(screen.getByRole('button', { name: SAVE }).hasAttribute('disabled')).toBe(false);
  });

  it('ONE diff: the banner counts what the save summary then lists — the removal open, the additions behind "Show N added" — and the lists are exactly the diff', async () => {
    api.detail = {
      status: HTTP_OK,
      body: detail({ permissions: ['sales.invoices.view', 'sales.invoices.delete'] }),
    };
    const user = userEvent.setup();
    show(edit);
    await loaded();
    const behind = await screen.findByTestId('permission-picker-behind');
    expect(behind.textContent).toContain(
      'Jane Doe is missing 4 permissions the Employee role grants and has 1 permission the role does not.',
    );
    const [missing, extra] = [...(behind.textContent.match(/\d+/g) ?? [])].map(Number);
    await user.click(within(behind).getByRole('button', { name: EN.reapply_role }));
    await user.click(screen.getByRole('button', { name: SAVE }));
    const open = await dialog();
    const lines = within(open).getByTestId('confirm-dialog-changes');
    expect(lines.textContent).toContain('Adds 4 permissions and removes 1.');
    const removed = [
      ...lines.querySelectorAll('[data-testid="permission-changes-removed"] li'),
    ].map((li) => li.textContent);
    expect(removed).toEqual(['Sales · Invoices · Delete']);
    const showAdded = within(lines).getByRole('button', { name: 'Show 4 added' });
    await user.click(showAdded);
    const added = [
      ...(document.getElementById(showAdded.getAttribute('aria-controls') ?? '')?.children ?? []),
    ].map((li) => li.textContent);
    expect(added).toEqual([
      'Sales · Estimates · View',
      'Sales · Invoices · Create',
      'Sales · Invoices · Edit',
      'Staff · Members · View',
    ]);
    // The banner's two numbers are the two lists' lengths.
    expect(added).toHaveLength(missing ?? -1);
    expect(removed).toHaveLength(extra ?? -1);
  });

  it('a member missing exactly one template code reads "is missing 1 permission" (singular)', async () => {
    api.detail = {
      status: HTTP_OK,
      body: detail({ permissions: EMPLOYEE_CODES.filter((code) => code !== 'staff.members.view') }),
    };
    show(edit);
    await loaded();
    const behind = await screen.findByTestId('permission-picker-behind');
    expect(behind.textContent).toContain(
      'Jane Doe is missing 1 permission the Employee role grants.',
    );
  });

  it('non-admin: the refusal exactly ONCE at the top of Access, the role select disabled, the picker read-only and reviewable, no Administrator checkbox, no roles request (UAT 12)', async () => {
    api.me = {
      status: HTTP_OK,
      body: me(false, [PERMISSIONS.staff.members.view, PERMISSIONS.staff.members.edit]),
    };
    show(edit);
    await loaded();
    const access = region(EN.section_access);
    await waitFor(() => {
      expect(within(access).getAllByText(EN.granting_admin_only)).toHaveLength(1);
    });
    expect(screen.getAllByText(EN.granting_admin_only)).toHaveLength(1);
    // Once, at the top: before the Role field.
    const notice = within(access).getByText(EN.granting_admin_only);
    const role = screen.getByRole('combobox', { name: EN.staff_add_edit_role });
    expect(notice.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(role.hasAttribute('disabled')).toBe(true);
    expect(role.textContent).toContain('Employee');
    expect(within(access).queryByRole('button', { name: EN.customise_permissions })).toBeNull();
    expect(within(access).queryByRole('button', { name: EN.reapply_role })).toBeNull();
    await userEvent.click(within(access).getByRole('button', { name: /^Sales/ }));
    const box = within(access).getByRole('checkbox', { name: 'Invoices View' });
    expect(box.getAttribute('aria-readonly')).toBe('true');
    expect(box.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('checkbox', { name: EN.staff_add_edit_administrator })).toBeNull();
    expect(requestsTo('/api/v1/identity/roles')).toHaveLength(0);
  });
});

describe('StaffMemberForm — a member may hold no role (flow parity: Perfex allows it)', () => {
  const NO_ROLE = EN.dropdown_non_selected_tex;

  it('clear: the Role select offers "Nothing selected"; choosing it saves roleId null, the summary lists "Role: Employee → Nothing selected" as an access change, and the picker opens straight into the accordion with no Re-apply', async () => {
    const user = userEvent.setup();
    show(edit);
    await loaded();
    await screen.findByTestId('permission-picker-behind');
    await user.click(await screen.findByRole('combobox', { name: EN.staff_add_edit_role }));
    await user.click(await screen.findByRole('option', { name: NO_ROLE }));
    const access = region(EN.section_access);
    expect(
      within(access).getByRole('combobox', { name: EN.staff_add_edit_role }).textContent,
    ).toContain(NO_ROLE);
    // No role to start from: the grouped accordion at once, like /setup/roles/new.
    expect(within(access).getByRole('searchbox', { name: EN.search_permissions })).toBeTruthy();
    expect(within(access).queryByRole('button', { name: EN.customise_permissions })).toBeNull();
    expect(within(access).queryByTestId('permission-picker-behind')).toBeNull();
    expect(within(access).queryByRole('button', { name: EN.reset_to_role })).toBeNull();
    await user.click(screen.getByRole('button', { name: SAVE }));
    const open = await dialog();
    const lines = within(open).getByTestId('confirm-dialog-changes');
    const first = lines.querySelector(':scope > li');
    expect(first?.querySelector('span')?.textContent).toBe(`Role: Employee → ${NO_ROLE}`);
    // Marked as an access change (the warning glyph), though no permission moved.
    expect(first?.querySelector('svg')).not.toBeNull();
    await user.click(within(open).getByTestId('confirm-dialog-confirm'));
    await closed();
    expect(saves()[0]?.body).toMatchObject({ roleId: null });
    expect(requestsTo('/api/v1/identity/roles/3').filter((r) => r.method === 'GET')).toHaveLength(
      1,
    );
  });

  it('set: a member with no role starts in the accordion; choosing a role applies its template and returns to the role summary', async () => {
    api.detail = { status: HTTP_OK, body: detail({ roleId: null, roleName: null }) };
    const user = userEvent.setup();
    show(edit);
    await loaded();
    const access = region(EN.section_access);
    const role = await within(access).findByRole('combobox', { name: EN.staff_add_edit_role });
    expect(role.textContent).toContain(NO_ROLE);
    expect(
      await within(access).findByRole('searchbox', { name: EN.search_permissions }),
    ).toBeTruthy();
    await user.click(role);
    await user.click(await screen.findByRole('option', { name: 'Employee' }));
    expect(
      await within(access).findByText('Employee grants 5 permissions in 2 modules'),
    ).toBeTruthy();
    expect(within(access).getByRole('button', { name: EN.customise_permissions })).toBeTruthy();
  });
});

describe('StaffMemberForm — instant detail and skeletons (D-35, D-39)', () => {
  it('opened from the list: the h1, the status badge and the Profile fields at once, Access as labelled field blocks; one detail request only', async () => {
    const id = 17;
    const path = `/api/v1/identity/members/${String(id)}` as const;
    pathname.current = `/setup/staff/${String(id)}`;
    seedRow(path, { ...ROW, staffId: id });
    api.detail = 'pending';
    show(<StaffMemberForm mode="edit" id={id} />, { swr: GLOBAL });
    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeTruthy();
    expect(screen.getByText(EN.staff_dt_active).getAttribute('data-status')).toBe('active');
    expect(screen.getByRole('textbox', { name: EN.staff_add_edit_firstname })).toHaveProperty(
      'value',
      'Jane',
    );
    const access = region(EN.section_access);
    expect(within(access).getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(within(access).getAllByTestId('skeleton-field').length).toBeGreaterThan(0);
    expect(within(access).queryByText(EN.granting_admin_only)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(requestsTo(path)).toHaveLength(1);
  });

  it('a permalink (no seed, the detail pending): the form skeleton with the badge shape, and no message', async () => {
    api.detail = 'pending';
    show(edit);
    const skeleton = await screen.findByTestId('page-skeleton');
    expect(skeleton.getAttribute('data-variant')).toBe('form');
    expect(within(skeleton).getByTestId('skeleton-badge')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('link', { name: COMMON.back_to_list })).toBeNull();
  });

  it('a failed detail read is an inline error with Retry for a retryable code, never a blank form', async () => {
    api.detail = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(edit);
    expect(await screen.findByTestId('inline-error')).toBeTruthy();
    expect(screen.getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('GuardedStaffMemberForm (UIK-03, D-39)', () => {
  it('while /me is pending: the form skeleton, and no refusal and no error', () => {
    api.me = 'pending';
    show(<GuardedStaffMemberForm mode="edit" id={JANE_ID} />);
    expect(screen.getByTestId('permission-pending').getAttribute('data-variant')).toBe('form');
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('permission-error')).toBeNull();
  });

  it('a /me 503 is an error, never "no access"', async () => {
    api.me = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(<GuardedStaffMemberForm mode="edit" id={JANE_ID} />);
    expect(await screen.findByTestId('permission-error')).toBeTruthy();
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('/setup/staff/new renders the create form under its own gate', async () => {
    pathname.current = '/setup/staff/new';
    show(<GuardedStaffMemberForm mode="create" />);
    expect(await screen.findByRole('heading', { level: 1, name: EN.new_staff })).toBeTruthy();
    expect(requests.some((r) => /\/members\/\d+$/.test(r.url.pathname))).toBe(false);
  });
});

describe('the shared permission-changes copy is ICU plurals (common)', () => {
  const tr = createTranslator({ locale: 'en', messages: commonEn, namespace: 'common' });
  it.each([
    [
      'permission_changes_summary',
      { added: 1, addedN: '1', removed: 0, removedN: '0' },
      'Adds 1 permission.',
      { added: 5, addedN: '5', removed: 1, removedN: '1' },
      'Adds 5 permissions and removes 1.',
    ],
    [
      'permission_changes_summary',
      { added: 0, addedN: '0', removed: 1, removedN: '1' },
      'Removes 1 permission.',
      { added: 0, addedN: '0', removed: 2, removedN: '2' },
      'Removes 2 permissions.',
    ],
    [
      'show_added_permissions',
      { count: 1, n: '1' },
      'Show 1 added',
      { count: 4, n: '4' },
      'Show 4 added',
    ],
    [
      'show_more_count',
      { count: 1, n: '1' },
      'Show 1 more',
      { count: 30, n: '30' },
      'Show 30 more',
    ],
  ] as const)('%s: one and other', (key, one, oneText, other, otherText) => {
    expect(commonEn.common[key]).toMatch(/\{\w+, plural, /);
    expect(tr(key, one)).toBe(oneText);
    expect(tr(key, other)).toBe(otherText);
  });
});

describe('StaffMemberForm — counts are ICU plurals (one / other in English; Arabic supplies its six forms later)', () => {
  const tr = createTranslator({ locale: 'en', messages: staffEn, namespace: 'staff' });
  const n = (count: number) => ({ count, n: String(count) });
  it.each([
    ['permissions_granted_count', n(1), '1 permission granted', n(7), '7 permissions granted'],
    [
      'create_summary_role',
      { role: 'Clerk', ...n(1) },
      'Role: Clerk, 1 permission',
      { role: 'Clerk', ...n(23) },
      'Role: Clerk, 23 permissions',
    ],
    [
      'role_grants_summary',
      { role: 'Clerk', ...n(1), modules: 1, m: '1' },
      'Clerk grants 1 permission in 1 module',
      { role: 'Clerk', ...n(5), modules: 2, m: '2' },
      'Clerk grants 5 permissions in 2 modules',
    ],
    [
      'behind_role',
      { name: 'Jane Doe', role: 'Clerk', missing: 1, missingN: '1', extra: 1, extraN: '1' },
      'Jane Doe is missing 1 permission the Clerk role grants and has 1 permission the role does not.',
      { name: 'Jane Doe', role: 'Clerk', missing: 4, missingN: '4', extra: 2, extraN: '2' },
      'Jane Doe is missing 4 permissions the Clerk role grants and has 2 permissions the role does not.',
    ],
  ] as const)('%s: one and other', (key, one, oneText, other, otherText) => {
    // The count selects an ICU plural form, so a translator can supply Arabic's six.
    expect(staffEn.staff[key]).toMatch(/\{\w+, plural, /);
    expect(tr(key, one)).toBe(oneText);
    expect(tr(key, other)).toBe(otherText);
  });
});

describe('StaffMemberForm — routes and RTL', () => {
  it('both route files are ≤ 30 lines, force-dynamic with the reason, params awaited, no @/hocs import (FE-01)', () => {
    const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'app', ...parts), 'utf8');
    const create = read('(shell)', 'setup', 'staff', 'new', 'page.tsx');
    const record = read('(shell)', 'setup', 'staff', '[id]', 'page.tsx');
    for (const source of [create, record]) {
      expect(source.trimEnd().split('\n').length).toBeLessThanOrEqual(30);
      expect(source).toMatch(/\/\/ .+\n(?:\/\/ .+\n)*export const dynamic = 'force-dynamic'/);
      expect(source).not.toMatch(/@\/hocs/);
    }
    expect(record).toMatch(/await props\.params/);
  });

  it('uses no physical-direction class under ar', async () => {
    const { container } = show(edit, { locale: 'ar' });
    await loaded().catch(() => undefined);
    await screen.findByRole('heading', { level: 1 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

// --- the save flow (D-25.4, D-28, D-29, D-36, D-25.3, D-40) ----------------------------------------

const RETURN_URL = '/setup/staff?cursor=abc&sort=-email';
const recordReturn = (url = RETURN_URL) => {
  sessionStorage.setItem('erp.list.return:/setup/staff', JSON.stringify({ url }));
};
const saves = () => requests.filter((r) => r.method === 'PATCH' || r.method === 'POST');
const dialog = () => screen.findByTestId('confirm-dialog');
const SAVE = 'Save staff member';
const byId = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`no #${id}`);
  return node;
};

/** Types a new phone number, as a member edits, and asks to save. */
async function editPhoneAndSubmit(user = userEvent.setup()) {
  await loaded();
  const phone = screen.getByRole('textbox', { name: EN.staff_add_edit_phonenumber });
  await user.clear(phone);
  await user.type(phone, '0559876543');
  await user.click(screen.getByRole('button', { name: SAVE }));
  return user;
}
async function confirmSave(user: ReturnType<typeof userEvent.setup>) {
  const open = await dialog();
  await user.click(within(open).getByTestId('confirm-dialog-confirm'));
}
const closed = () =>
  waitFor(() => {
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

/** Reads the member's detail and one list page from the app's cache, as the list screen does. */
function CacheProbe({ q }: { readonly q: string }): ReactElement {
  const one = useStaffMember(JANE_ID);
  const page = useList('/api/v1/identity/members', staffMemberSchema, { q });
  return (
    <>
      <output data-testid="probe-detail">{one.data?.phoneNumber ?? 'none'}</output>
      <output data-testid="probe-list">{page.data?.data[0]?.phoneNumber ?? 'none'}</output>
    </>
  );
}

describe('StaffMemberForm — a record that cannot be loaded offers a way back (lead 2026-09-27, D-28, D-31, D-39)', () => {
  const backLink = () => screen.getByRole('link', { name: COMMON.back_to_list });

  it('a permalink answered 404 ERP-IDENTITY-0005: the plain message, no Retry, and Back to list to the recorded list URL', async () => {
    recordReturn();
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0005') };
    show(edit);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-IDENTITY-0005']);
    expect(screen.queryByRole('button')).toBeNull();
    expect(backLink().getAttribute('href')).toBe(RETURN_URL);
  });

  it('a permalink whose read fails retryably (503): Retry AND Back to list — the list base when nothing is recorded', async () => {
    api.detail = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(edit);
    await screen.findByTestId('inline-error');
    expect(screen.getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(backLink().getAttribute('href')).toBe('/setup/staff');
  });

  it('server render: a permalink is the skeleton, never the error or its link, so readListReturn is never read on the server', () => {
    recordReturn();
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0005') };
    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={messagesFor('en')}>
        <SWRConfig value={ISOLATED}>{edit}</SWRConfig>
      </NextIntlClientProvider>,
    );
    expect(html).toContain('data-testid="page-skeleton"');
    expect(html).not.toContain(COMMON.back_to_list);
    expect(html).not.toContain('cursor=abc');
  });

  /** Opens member `id` from the list: its row seeded in the app's cache, the detail as `api.detail`. */
  const openSeeded = (id: number) => {
    pathname.current = `/setup/staff/${String(id)}`;
    seedRow(`/api/v1/identity/members/${String(id)}`, { ...ROW, staffId: id });
    show(<StaffMemberForm mode="edit" id={id} />, { swr: GLOBAL });
  };
  const firstNameBox = () => screen.getByRole('textbox', { name: EN.staff_add_edit_firstname });
  const submitButton = () => screen.getByRole('button', { name: SAVE });

  it('opened from the list, the detail answers 404: the whole page is the not-found state with Back to list — never the seeded form, never a skeleton', async () => {
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0005') };
    openSeeded(51);
    const error = await screen.findByTestId('inline-error');
    expect(error.textContent).toContain(EN.errors['ERP-IDENTITY-0005']);
    expect(backLink().getAttribute('href')).toBe('/setup/staff');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByTestId('page-skeleton')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('opened from the list, the detail fails retryably (503): the seeded Profile stays but locked, Access shows the error with Retry instead of its skeleton, and Retry loads it', async () => {
    const user = userEvent.setup();
    api.detail = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    openSeeded(52);
    const access = region(EN.section_access);
    const error = await within(access).findByTestId('access-error');
    const retry = within(error).getByRole('button', { name: COMMON.retry });
    expect(access.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(firstNameBox()).toHaveProperty('value', 'Jane');
    expect(firstNameBox()).toHaveProperty('disabled', true);
    expect(submitButton()).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: COMMON.back_to_list })).toHaveProperty(
      'disabled',
      false,
    );
    api.detail = { status: HTTP_OK, body: detail({ staffId: 52 }) };
    await user.click(retry);
    expect(
      await within(access).findByRole('combobox', { name: EN.staff_add_edit_role }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(firstNameBox()).toHaveProperty('disabled', false);
    });
  });

  it('opened from the list, nothing can be edited or saved until the detail arrives', async () => {
    api.detail = 'pending';
    openSeeded(53);
    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeTruthy();
    expect(firstNameBox()).toHaveProperty('disabled', true);
    expect(submitButton()).toHaveProperty('disabled', true);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  it('a submit event while the detail is missing opens no dialog and sends nothing', async () => {
    api.detail = 'pending';
    openSeeded(54);
    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeTruthy();
    fireEvent.submit(byId('staff-member'));
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });
});

describe("StaffMemberForm: the breadcrumb's record name after a failed read (D-39)", () => {
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
    pathname.current = `/setup/staff/${String(id)}`;
    seedRow(`/api/v1/identity/members/${String(id)}`, { ...ROW, staffId: id });
    return inShell(<StaffMemberForm mode="edit" id={id} />, GLOBAL);
  };

  it('a permalink answered 404 publishes no record name (null), so the breadcrumb stops loading (D-39)', async () => {
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0005') };
    const published = inShell(edit);
    await screen.findByTestId('inline-error');
    expect(published.mock.lastCall?.[0]).toBeNull();
  });

  it('opened from the list, the detail answers 404: the seeded name is withdrawn from the breadcrumb (null)', async () => {
    api.detail = { status: NOT_FOUND, body: problem(NOT_FOUND, 'ERP-IDENTITY-0005') };
    const published = openSeeded(55);
    await screen.findByTestId('inline-error');
    expect(published.mock.lastCall?.[0]).toBeNull();
  });

  it('opened from the list, the detail fails retryably (503): the breadcrumb keeps the seeded name', async () => {
    api.detail = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    const published = openSeeded(56);
    await screen.findByTestId('access-error');
    expect(published.mock.lastCall?.[0]).toBe('Jane Doe');
  });

  it('a permalink still loading publishes undefined, so the breadcrumb shows its skeleton', async () => {
    api.detail = 'pending';
    const published = inShell(edit);
    await screen.findByTestId('page-skeleton');
    expect(published).toHaveBeenCalled();
    expect(published.mock.lastCall?.[0]).toBeUndefined();
  });
});

describe('StaffMemberForm — every save is confirmed by what changes (D-25.4)', () => {
  it('a valid edit opens "Save changes to Jane Doe?" with focus on confirm, listing the change; "Back to form" closes it and sends nothing', async () => {
    show(edit);
    const user = await editPhoneAndSubmit();
    const open = await dialog();
    expect(within(open).getByRole('heading').textContent).toBe('Save changes to Jane Doe?');
    expect(document.activeElement).toBe(within(open).getByTestId('confirm-dialog-confirm'));
    expect(within(open).getByTestId('confirm-dialog-confirm').textContent).toBe(SAVE);
    expect(within(open).getByTestId('confirm-dialog-dismiss').textContent).toBe(
      COMMON.back_to_form,
    );
    expect(within(open).getByTestId('confirm-dialog-changes').textContent).toBe('Phone updated');
    expect(open.textContent).not.toContain('0559876543');
    await user.click(within(open).getByTestId('confirm-dialog-dismiss'));
    await closed();
    expect(saves()).toHaveLength(0);
  });

  it('access changes come first and the permission lines read as the audit records them (sorted, adds before removes)', async () => {
    show(edit);
    const user = userEvent.setup();
    await loaded();
    await user.click(screen.getByRole('checkbox', { name: EN.staff_add_edit_administrator }));
    await editPhoneAndSubmit(user);
    const lines = within(await dialog()).getByTestId('confirm-dialog-changes');
    const items = [...lines.querySelectorAll(':scope > li')].map(
      (li) => li.querySelector('span')?.textContent,
    );
    expect(items).toEqual(['Administrator: No → Yes', 'Removes 2 permissions.', 'Phone updated']);
    // Removals are listed openly, in the audit's order; there is nothing added, so no disclosure.
    expect(
      [...lines.querySelectorAll('[data-testid="permission-changes-removed"] li')].map(
        (li) => li.textContent,
      ),
    ).toEqual(['Sales · Invoices · View', 'Staff · Members · View']);
    expect(within(lines).queryByRole('button', { name: /^Show / })).toBeNull();
  });

  it('the save summary names an empty role, language and departments in words: "Nothing selected", "System Default", "None", never a dash', async () => {
    api.detail = { status: HTTP_OK, body: detail({ defaultLanguage: 'arabic' }) };
    const user = userEvent.setup();
    show(edit);
    await loaded();
    await user.click(await screen.findByRole('combobox', { name: EN.staff_add_edit_role }));
    await user.click(await screen.findByRole('option', { name: EN.dropdown_non_selected_tex }));
    await user.click(
      await screen.findByRole('combobox', { name: EN.localization_default_language }),
    );
    await user.click(await screen.findByRole('option', { name: EN.system_default_string }));
    const group = await screen.findByRole('group', { name: /^Member departments/ });
    await user.click(within(group).getByRole('checkbox', { name: 'Department 2' }));
    await user.click(screen.getByRole('button', { name: SAVE }));
    const text = (await dialog()).textContent;
    expect(text).toContain(EN.dropdown_non_selected_tex);
    expect(text).toContain(EN.system_default_string);
    expect(text).toContain(COMMON.none);
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('StaffMemberForm — after a save (D-28, D-36)', () => {
  it('confirm → one PATCH; the toast, the detail and the cached list page hold the saved record with NO list request, and the member is back on the recorded list URL', async () => {
    recordReturn();
    const user = userEvent.setup();
    show(
      <>
        {edit}
        <CacheProbe q="save-probe" />
      </>,
      { swr: GLOBAL },
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-list').textContent).toBe('0501234567');
    });
    const before = listReads().length;
    await editPhoneAndSubmit(user);
    await confirmSave(user);
    await closed();
    expect(saves().map((r) => [r.method, r.url.pathname])).toEqual([
      ['PATCH', '/api/v1/identity/members/7'],
    ]);
    expect(await screen.findByText(EN.toast_staff_saved)).toBeTruthy();
    expect(screen.getByTestId('probe-detail').textContent).toBe('0559876543');
    expect(screen.getByTestId('probe-list').textContent).toBe('0559876543');
    expect(push).toHaveBeenCalledWith(RETURN_URL, { scroll: false });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(listReads()).toHaveLength(before);
  });

  it('a tampered return URL sends the member to the list base, never away (T-3.2-73)', async () => {
    recordReturn('https://evil.example/staff');
    show(edit);
    const user = await editPhoneAndSubmit();
    await confirmSave(user);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/staff', { scroll: false });
    });
  });

  it('create: "Create staff member Jane Doe?" → one POST; success revalidates the list pages and returns to the list', async () => {
    pathname.current = '/setup/staff/new';
    recordReturn();
    api.save = { status: 201, body: detail({ staffId: 21 }) };
    const user = userEvent.setup();
    show(
      <>
        <StaffMemberForm mode="create" />
        <CacheProbe q="create-probe" />
      </>,
      { swr: GLOBAL },
    );
    await loaded();
    await waitFor(() => {
      expect(screen.getByTestId('probe-list').textContent).toBe('0501234567');
    });
    // Pasted, not typed: four long values typed key by key outran the 5 s budget under the full suite.
    await user.click(screen.getByRole('textbox', { name: EN.staff_add_edit_firstname }));
    await user.paste('Jane');
    await user.click(screen.getByRole('textbox', { name: EN.staff_add_edit_lastname }));
    await user.paste('Doe');
    await user.click(screen.getByRole('textbox', { name: EN.staff_add_edit_email }));
    await user.paste('jane@example.invalid');
    await user.click(byId('staff-member-password'));
    await user.paste('a-long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Create staff member' }));
    const open = await dialog();
    expect(within(open).getByRole('heading').textContent).toBe('Create staff member Jane Doe?');
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const before = listReads().length;
    await confirmSave(user);
    await closed();
    expect(saves().map((r) => [r.method, r.url.pathname])).toEqual([
      ['POST', '/api/v1/identity/members'],
    ]);
    await waitFor(() => {
      expect(listReads().length).toBeGreaterThan(before);
    });
    expect(push).toHaveBeenCalledWith(RETURN_URL, { scroll: false });
  });

  it("a save that changes the actor's own password sends them to /login (the api ended their sessions)", async () => {
    api.me = { status: HTTP_OK, body: me(true, [], JANE_ID) };
    const user = userEvent.setup();
    show(edit);
    await loaded();
    await user.type(byId('staff-member-password'), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: SAVE }));
    await confirmSave(user);
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/login?next=%2Fstaff');
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("a non-administrator's save carries no role, permissions or administrator field (ADR-0034 d.2)", async () => {
    api.me = {
      status: HTTP_OK,
      body: me(false, [PERMISSIONS.staff.members.view, PERMISSIONS.staff.members.edit]),
    };
    show(edit);
    const user = await editPhoneAndSubmit();
    await confirmSave(user);
    await closed();
    const body = saves()[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({ phoneNumber: '0559876543' });
    expect(Object.keys(body)).not.toContain('roleId');
    expect(Object.keys(body)).not.toContain('permissions');
    expect(Object.keys(body)).not.toContain('admin');
  });
});

describe('StaffMemberForm — when a save fails (D-29, UAT 7)', () => {
  it('a 400 with an email issue: the dialog closes, the message is under Email and in the summary, focus on the summary, the typed values intact', async () => {
    api.save = {
      status: 400,
      body: problem(400, 'ERP-VALIDATION-0001', [{ path: ['email'], message: 'raw server text' }]),
    };
    show(edit);
    const user = await editPhoneAndSubmit();
    await confirmSave(user);
    await closed();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(`${EN.staff_add_edit_email}: ${EN.enter_valid_email}`);
    expect(byId('staff-member-email-error').textContent).toBe(EN.enter_valid_email);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(document.activeElement).toBe(summary);
    expect(document.body.textContent).not.toContain('raw server text');
    expect(screen.getByRole('textbox', { name: EN.staff_add_edit_phonenumber })).toHaveProperty(
      'value',
      '0559876543',
    );
  });

  it('a 503: the dialog closes, the alert in the form says the edits are still here, with the plain reason and Retry; Retry re-sends the same body without the dialog', async () => {
    api.save = {
      status: SERVICE_UNAVAILABLE,
      body: problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    };
    show(edit);
    const user = await editPhoneAndSubmit();
    await confirmSave(user);
    await closed();
    const alert = await screen.findByTestId('form-server-error');
    expect(alert.textContent).toContain(COMMON.save_failed);
    expect(alert.textContent).not.toMatch(/ERP-|503/);
    expect(screen.getByRole('textbox', { name: EN.staff_add_edit_phonenumber })).toHaveProperty(
      'value',
      '0559876543',
    );
    api.save = { status: HTTP_OK, body: detail({ phoneNumber: '0559876543' }) };
    await user.click(within(alert).getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(saves()).toHaveLength(2);
    });
    expect(saves()[1]?.body).toEqual(saves()[0]?.body);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
  });

  it('a 403 refusal (ERP-IDENTITY-0004) stays inside the dialog in plain language, with Confirm disabled (UAT 7)', async () => {
    api.save = { status: 403, body: problem(403, 'ERP-IDENTITY-0004') };
    show(edit);
    const user = await editPhoneAndSubmit();
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-IDENTITY-0004']);
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('form-server-error')).toBeNull();
  });

  it('a 422 ERP-IDENTITY-0009 (a department chosen that no longer exists) stays inside the dialog in plain words, with Confirm disabled (D-55)', async () => {
    api.save = { status: 422, body: problem(422, 'ERP-IDENTITY-0009') };
    show(edit);
    const user = await editPhoneAndSubmit();
    await confirmSave(user);
    const error = await screen.findByTestId('confirm-dialog-error');
    expect(error.textContent).toBe(EN.errors['ERP-IDENTITY-0009']);
    expect(error.textContent).toBe(
      'One of the selected departments no longer exists. Remove it and save again.',
    );
    expect(screen.getByTestId('confirm-dialog-confirm').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('form-server-error')).toBeNull();
  });

  it('the submit is disabled while clean; while the save is pending it reads "Saving staff member…" and every control is disabled', async () => {
    api.save = 'pending';
    const user = userEvent.setup();
    show(edit);
    await loaded();
    expect(screen.getByRole('button', { name: SAVE }).hasAttribute('disabled')).toBe(true);
    await editPhoneAndSubmit(user);
    await confirmSave(user);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'Saving staff member…', hidden: true }),
      ).toHaveLength(2);
    });
    expect(document.querySelector('[data-slot="form-body"]')?.hasAttribute('disabled')).toBe(true);
  });
});

describe('StaffMemberForm — leaving (D-25.3, D-28, D-40)', () => {
  it('dirty + a sidebar link → "Discard changes?" naming the member; Keep editing stays; Discard navigates', async () => {
    const user = userEvent.setup();
    show(
      <>
        <a href="/admin/leads">Leads</a>
        {edit}
      </>,
    );
    await loaded();
    await user.type(screen.getByRole('textbox', { name: EN.staff_add_edit_phonenumber }), '9');
    await user.click(screen.getByRole('link', { name: 'Leads' }));
    let open = await dialog();
    expect(within(open).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(open.textContent).toContain("Your changes to Jane Doe haven't been saved.");
    await user.click(within(open).getByRole('button', { name: COMMON.keep_editing }));
    await closed();
    expect(assign).not.toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: 'Leads' }));
    open = await dialog();
    await user.click(within(open).getByRole('button', { name: COMMON.discard_changes }));
    // A Perfex path is a full navigation (the guard's own rule); a Node route would be router.push.
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/admin/leads');
    });
  });

  it('clean + "Back to list" → the recorded list URL at once; dirty + "Back to list" → the same question first', async () => {
    recordReturn();
    const user = userEvent.setup();
    show(edit);
    await loaded();
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    expect(push).toHaveBeenCalledWith(RETURN_URL);
    push.mockClear();
    await user.type(screen.getByRole('textbox', { name: EN.staff_add_edit_phonenumber }), '9');
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    expect(within(await dialog()).getByRole('heading').textContent).toBe(COMMON.discard_title);
    expect(push).not.toHaveBeenCalled();
  });

  it('no bare Save, Cancel, Confirm or Close label anywhere on the screen', async () => {
    show(edit);
    await editPhoneAndSubmit();
    await dialog();
    const labels = screen
      .getAllByRole('button', { hidden: true })
      .map((button) => button.textContent.trim());
    expect(labels.length).toBeGreaterThan(5);
    for (const bare of ['Save', 'Cancel', 'Confirm', 'Close']) expect(labels).not.toContain(bare);
  });
});

describe('StaffMemberForm: the page title (D-16, UI-SPEC G1)', () => {
  it('the title is the 24px page title: text-2xl font-semibold (D-16)', async () => {
    pathname.current = '/setup/staff/new';
    show(<StaffMemberForm mode="create" />);
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.className).toContain('text-2xl');
    expect(title.className).toContain('font-semibold');
    expect(title.className).not.toContain('text-xl');
  });
});
