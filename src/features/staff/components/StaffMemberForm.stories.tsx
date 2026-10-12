import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SWRConfig } from 'swr';
import type { ApiAdapter } from '@/lib/api/call-api';
import { toSupportedLocale, type Locale } from '@/i18n/locales';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { setSession } from '@/lib/auth/session';
import commonAr from '@/messages/common/ar.json';
import commonEn from '@/messages/common/en.json';
import staffAr from '../messages/ar.json';
import staffEn from '../messages/en.json';
import { StaffMemberForm } from './StaffMemberForm';

// The transport seam, as in the tests: one fake axios adapter answers every read the form makes and
// the save. Neutral fixture data only. `vi` cannot enter a Storybook bundle, so the helpers are here.
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const MEMBER_ID = 4;
const SEEDED_ID = 14;
const SEEDED_NOT_FOUND_ID = 24;
const SEEDED_FAILURE_ID = 34;

const me = (isAdmin: boolean) => ({
  staffId: 9,
  email: 'actor@example.invalid',
  firstName: 'Actor',
  lastName: 'Person',
  isAdmin,
  roleId: null,
  permissions: ['staff.members.view', 'staff.members.edit'],
  locale: null,
});

const EMPLOYEE = [
  'accounting.bills.view',
  'sales.estimates.create',
  'sales.estimates.view',
  'sales.invoices.create',
  'sales.invoices.view',
  'staff.members.view',
];

const member = (staffId = MEMBER_ID) => ({
  staffId,
  email: 'ada@example.invalid',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phoneNumber: '555 0100',
  facebook: null,
  linkedin: null,
  skype: null,
  hourlyRate: 12.5,
  defaultLanguage: null,
  direction: null,
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
  // Three of the Employee role's six codes: the member is behind their role.
  permissions: ['sales.invoices.view', 'sales.estimates.view', 'staff.members.view'],
});

const CATALOGUE = {
  data: [
    {
      module: 'accounting',
      resources: [{ resource: 'bills', actions: actions('accounting.bills', ['view', 'create']) }],
    },
    {
      module: 'sales',
      resources: [
        { resource: 'invoices', actions: actions('sales.invoices', ['view', 'create', 'edit']) },
        { resource: 'estimates', actions: actions('sales.estimates', ['view', 'create']) },
      ],
    },
    {
      module: 'staff',
      resources: [{ resource: 'members', actions: actions('staff.members', ['view', 'edit']) }],
    },
  ],
  meta: { total: 9 },
};
function actions(feature: string, names: readonly string[]) {
  return names.map((action) => ({ action, code: `${feature}.${action}` }));
}
const ROLE_NAMES = ['Accountant', 'Clerk', 'Employee', 'Manager', 'Warehouse Supervisor'];
const ROLES = {
  data: Array.from({ length: 21 }, (_, index) => ({
    roleId: index + 1,
    name: ROLE_NAMES[index] ?? `Role ${String(index + 1)}`,
    memberCount: 1,
  })),
  meta: { nextCursor: null },
};
const DEPARTMENTS = {
  data: ['Sales', 'Support', 'Warehouse', 'Finance'].map((name, index) => ({
    departmentId: index + 1,
    name,
  })),
  meta: { total: 4 },
};
/** What the api really offers: the locales this deployment ships messages for. */
const LOCALES = {
  data: [
    { locale: 'en', legacyLanguage: 'english' },
    { locale: 'ar', legacyLanguage: 'arabic' },
  ],
  meta: { total: 2 },
};

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

interface Api {
  readonly isAdmin?: boolean;
  readonly detail?: Answer;
  readonly save?: Answer;
}

function respond(config: InternalAxiosRequestConfig, answer: Answer) {
  if (answer === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (answer.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

const problem = (status: number, code: string, issues?: unknown) => ({
  status,
  body: { type: 'about:blank', status, title: code, code, ...(issues ? { issues } : {}) },
});

function api(options: Api): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    const method = (config.method ?? 'get').toUpperCase();
    if (method === 'PATCH')
      return respond(config, options.save ?? { status: HTTP_OK, body: member() });
    if (method === 'POST') {
      return respond(config, options.save ?? { status: HTTP_CREATED, body: member(21) });
    }
    if (path === '/api/v1/auth/me')
      return respond(config, { status: HTTP_OK, body: me(options.isAdmin ?? true) });
    if (path === '/api/v1/identity/departments')
      return respond(config, { status: HTTP_OK, body: DEPARTMENTS });
    if (path === '/api/v1/identity/locales')
      return respond(config, { status: HTTP_OK, body: LOCALES });
    if (path === '/api/v1/identity/permissions/catalogue') {
      return respond(config, { status: HTTP_OK, body: CATALOGUE });
    }
    if (path === '/api/v1/identity/roles') return respond(config, { status: HTTP_OK, body: ROLES });
    if (path.startsWith('/api/v1/identity/roles/')) {
      const roleId = Number(path.split('/').at(-1));
      const name = ROLES.data[roleId - 1]?.name ?? 'Role';
      const permissions = roleId === 3 ? EMPLOYEE : EMPLOYEE.slice(0, 2);
      return respond(config, { status: HTTP_OK, body: { roleId, name, permissions } });
    }
    return respond(config, options.detail ?? { status: HTTP_OK, body: member() });
  };
}

/** Sets the transport and the session BEFORE the story renders, and isolates the SWR cache. */
function withApi(options: Api): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = api(options);
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/Staff/StaffMemberForm',
  component: StaffMemberForm,
  args: { mode: 'edit', id: MEMBER_ID },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/staff/4' } } },
  // Each story sets its own transport: a meta decorator would wrap every story in an isolated
  // cache, and `Seeded` needs the app's own cache, the one `seedRow` writes.
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaffMemberForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const firstName = (root: HTMLElement) =>
  within(root).findByRole('textbox', { name: /^First Name/ });
const submit = (root: HTMLElement) =>
  within(root).getByRole('button', { name: 'Save staff member' });
/** Makes the form dirty the way a member does, then asks to save. */
async function editAndSave(root: HTMLElement): Promise<void> {
  await firstName(root);
  const phone = within(root).getByRole('textbox', { name: 'Phone' });
  await userEvent.clear(phone);
  await userEvent.type(phone, '555 0199');
  await userEvent.click(submit(root));
}
/** The save summary's confirm, once the dialog takes pointer input (Radix disables it while it mounts). */
async function confirmSummary(): Promise<void> {
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });
  await userEvent.click(confirm);
}

/** An administrator on `/setup/staff/:id`: the sections, role-first permissions, a member behind their role. */
export const Default: Story = { decorators: [withApi({})] };

/** `/setup/staff/new`: empty, "Create staff member", the password required; no "In Perfex" section. */
export const Create: Story = {
  decorators: [withApi({})],
  parameters: { nextjs: { navigation: { pathname: '/setup/staff/new' } } },
  render: () => <StaffMemberForm mode="create" />,
};

/** A member with no role (Perfex allows it): the picker opens straight into the grouped accordion. */
export const NoRole: Story = {
  decorators: [
    withApi({ detail: { status: HTTP_OK, body: { ...member(), roleId: null, roleName: null } } }),
  ],
};

/** Two of the Employee codes and one outside the role: re-applying adds 5 and removes 1. */
const REAPPLY_API = withApi({
  detail: {
    status: HTTP_OK,
    body: { ...member(), permissions: ['sales.invoices.view', 'staff.members.edit'] },
  },
});

/** Clicks Re-apply role once the banner is there. */
async function reapply(canvasElement: HTMLElement): Promise<void> {
  const behind = await within(canvasElement).findByTestId('permission-picker-behind');
  await userEvent.click(within(behind).getByRole('button', { name: 'Re-apply role' }));
}

/** Waits for the save summary and its 100 ms fade-in. */
async function summaryOpen(): Promise<HTMLElement> {
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  await waitFor(async () => {
    await expect(dialog).toBeVisible();
  });
  return dialog;
}

/**
 * Re-apply role in one click (lead 2026-09-26): no dialog of its own — the picker takes the
 * template, the banner goes (the member now matches the role) and the form is dirty. The save
 * summary is the confirmation.
 */
export const ReapplyRole: Story = {
  decorators: [REAPPLY_API],
  play: async ({ canvasElement }) => {
    await reapply(canvasElement);
    const canvas = within(canvasElement);
    await canvas.findByText('Employee grants 6 permissions in 3 modules');
    await expect(canvas.queryByTestId('permission-picker-behind')).toBeNull();
    await expect(within(document.body).queryByTestId('confirm-dialog')).toBeNull();
    await expect(canvas.getByText('Unsaved changes')).toBeVisible();
  },
};

/** …then Save: the summary confirms it, "Adds 5 permissions and removes 1.", the removal open. */
export const ReapplyThenSave: Story = {
  decorators: [REAPPLY_API],
  play: async ({ canvasElement }) => {
    await reapply(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Save staff member' }));
    await summaryOpen();
  },
};

/** Fourteen permissions held; ticking Administrator removes them all (an administrator stores none). */
const MANY_API = withApi({
  detail: {
    status: HTTP_OK,
    body: {
      ...member(),
      permissions: Array.from(
        { length: 14 },
        (_, i) => `sales.r${String(i).padStart(2, '0')}.view`,
      ),
    },
  },
});

/** More than 10 removals: the first 10 open, then "Show 4 more" — nothing is confirmed unseen. */
export const SaveSummaryManyRemovals: Story = {
  decorators: [MANY_API],
  play: async ({ canvasElement }) => {
    await firstName(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('checkbox', { name: 'Administrator' }));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Save staff member' }));
    await summaryOpen();
  },
};

/** The same with the rest opened in place: "Show fewer". */
export const SaveSummaryManyRemovalsExpanded: Story = {
  decorators: [MANY_API],
  play: async (context) => {
    await SaveSummaryManyRemovals.play?.(context);
    const more = await within(document.body).findByRole('button', { name: 'Show 4 more' });
    await userEvent.click(more);
    await expect(more).toHaveAttribute('aria-expanded', 'true');
  },
};

/** UAT 12: not an administrator — the refusal once, a disabled role, a read-only reviewable picker. */
export const NonAdmin: Story = { decorators: [withApi({ isAdmin: false })] };

/** Member `id` opened from the list: its row seeded in the app's own cache, the detail `detail`. */
function withSeed(id: number, detail: Answer): Decorator {
  return function SeedDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = api({ detail });
    seedRow(`/api/v1/identity/members/${String(id)}`, {
      staffId: id,
      email: 'ada@example.invalid',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phoneNumber: '555 0100',
      isAdmin: false,
      roleId: 3,
      roleName: 'Employee',
      active: true,
      dateCreated: '2026-01-02T20:30:00.000Z',
      profileImageUrl: null,
      profileImagePreviewUrl: null,
      lastLogin: null,
    });
    return <Story />;
  };
}

/**
 * Opened from the list (D-35): the row's fields at once, locked, while Access shows its own field
 * blocks until the full record arrives (held open here).
 */
export const Seeded: Story = {
  args: { id: SEEDED_ID },
  decorators: [withSeed(SEEDED_ID, 'pending')],
};

/** The texts a story expects, in the locale it renders (the RTL screenshots open it under `ar`). */
const TEXTS: Record<Locale, { readonly staff: typeof staffEn.staff; readonly back: string }> = {
  en: { staff: staffEn.staff, back: commonEn.common.back_to_list },
  ar: { staff: staffAr.staff, back: commonAr.common.back_to_list },
};
const RETURN_KEY = 'erp.list.return:/setup/staff';

/** The not-found page: the plain message, no button, and ONE link — Back to list, to `href`. */
async function expectNotFound(root: HTMLElement, locale: unknown, href: string): Promise<void> {
  const texts = TEXTS[toSupportedLocale(locale)];
  const error = await within(root).findByTestId('inline-error');
  await expect(error).toHaveTextContent(texts.staff.errors['ERP-IDENTITY-0005']);
  await expect(within(root).queryByRole('button')).toBeNull();
  const links = within(root).getAllByRole('link');
  await expect(links).toHaveLength(1);
  await expect(links[0]).toHaveAccessibleName(texts.back);
  await expect(links[0]).toHaveAttribute('href', href);
}

/**
 * A permalink to a member who no longer exists (a 404, `ERP-IDENTITY-0005`): the plain message where
 * the form would be, no Retry, and "Back to list" to the list the member was opened from (lead
 * 2026-09-27, D-28).
 */
export const NotFound: Story = {
  decorators: [withApi({ detail: problem(HTTP_NOT_FOUND, 'ERP-IDENTITY-0005') })],
  beforeEach: () => {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ url: '/setup/staff?q=ada' }));
    return () => {
      sessionStorage.removeItem(RETURN_KEY);
    };
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/staff?q=ada');
  },
};

/**
 * Opened from the list, but the member is gone (a 404): the same not-found page as a permalink,
 * never the seeded form; "Back to list" to `/setup/staff`, nothing being recorded here.
 */
export const SeededNotFound: Story = {
  args: { id: SEEDED_NOT_FOUND_ID },
  decorators: [withSeed(SEEDED_NOT_FOUND_ID, problem(HTTP_NOT_FOUND, 'ERP-IDENTITY-0005'))],
  // Nothing recorded, whatever an earlier story in this tab left: the link is the list base.
  beforeEach: () => {
    sessionStorage.removeItem(RETURN_KEY);
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/staff');
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};

/**
 * Opened from the list, and the detail fails retryably (a 503): the row's fields stay, locked, and
 * Access shows the error with Retry where its blocks were — never blocks that never end (D-31, D-39).
 */
export const SeededNetworkFailure: Story = {
  args: { id: SEEDED_FAILURE_ID },
  decorators: [withSeed(SEEDED_FAILURE_ID, problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const label = TEXTS[toSupportedLocale(globals.locale)].staff.staff_add_edit_firstname;
    const error = await canvas.findByTestId('access-error');
    await expect(within(error).getAllByRole('button')).toHaveLength(1);
    const first = canvas.getByRole('textbox', { name: (name) => name.startsWith(label) });
    await expect(first).toBeDisabled();
    await expect(first).toHaveValue('Ada');
    await waitFor(async () => {
      await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    });
  },
};

/** A permalink before the record answers: the form skeleton with the badge shape (D-39). */
export const Loading: Story = { decorators: [withApi({ detail: 'pending' })] };

/** Every save is confirmed by what changes (D-25.4): the summary, access changes first. */
export const SaveSummary: Story = {
  decorators: [withApi({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await firstName(canvasElement);
    // A role change moves permissions both ways: 2 added, 3 removed.
    await userEvent.click(await canvas.findByRole('combobox', { name: 'Role' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'Warehouse Supervisor' }),
    );
    await canvas.findByText(/^Warehouse Supervisor grants/);
    await editAndSave(canvasElement);
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    // The dialog fades in over 100 ms.
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
  },
};

/** The texts the empty-values story looks for, in the locale it renders. */
const SUMMARY_TEXTS = {
  en: { staff: staffEn.staff, common: commonEn.common },
  ar: { staff: staffAr.staff, common: commonAr.common },
} as const;
const startsWith = (label: string) => (name: string) => name.startsWith(label);

/**
 * Role, language and departments emptied (UAT gap 6): the summary names each empty value in words,
 * "Nothing selected", "System Default" and "None", never a dash.
 */
export const SaveSummaryEmptyValues: Story = {
  decorators: [
    withApi({ detail: { status: HTTP_OK, body: { ...member(), defaultLanguage: 'arabic' } } }),
  ],
  play: async ({ canvasElement, globals }) => {
    const { staff, common } = SUMMARY_TEXTS[toSupportedLocale(globals.locale)];
    const canvas = within(canvasElement);
    const body = within(document.body);
    await canvas.findByRole('textbox', { name: startsWith(staff.staff_add_edit_firstname) });
    await userEvent.click(
      await canvas.findByRole('combobox', { name: startsWith(staff.staff_add_edit_role) }),
    );
    await userEvent.click(
      await body.findByRole('option', { name: staff.dropdown_non_selected_tex }),
    );
    // Three language options here (System Default, English, Arabic): the kit draws radios.
    await userEvent.click(await canvas.findByRole('radio', { name: staff.system_default_string }));
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Support' }));
    await userEvent.click(
      canvas.getByRole('button', {
        name: common.save_noun.replace('{noun}', staff.noun_staff_member),
      }),
    );
    const dialog = await summaryOpen();
    await expect(dialog).toHaveTextContent(staff.dropdown_non_selected_tex);
    await expect(dialog).toHaveTextContent(staff.system_default_string);
    await expect(dialog).toHaveTextContent(common.none);
    await expect(dialog.textContent).not.toContain(String.fromCharCode(0x2014));
  },
};

/** FE-27 `Pending`: confirmed, the save has not answered — "Saving staff member…". */
export const Pending: Story = {
  decorators: [withApi({ save: 'pending' })],
  play: async ({ canvasElement }) => {
    await editAndSave(canvasElement);
    await confirmSummary();
    await expect(
      await within(document.body).findByRole('button', { name: 'Saving staff member…' }),
    ).toBeDisabled();
  },
};

/** FE-27 `FieldErrors`: a 400 whose issue lands under Email and in the summary, focused. */
export const FieldErrors: Story = {
  decorators: [
    withApi({
      save: problem(HTTP_BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['email'], message: 'server text, never rendered' },
      ]),
    }),
  ],
  play: async ({ canvasElement }) => {
    await editAndSave(canvasElement);
    await confirmSummary();
    const summary = await within(canvasElement).findByTestId('error-summary');
    await waitFor(async () => {
      await expect(summary).toHaveFocus();
    });
  },
};

/** FE-27 `ServerError`: a 503 — the alert inside the form, the edits kept, and Retry. */
export const ServerError: Story = {
  decorators: [withApi({ save: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001') })],
  play: async ({ canvasElement }) => {
    await editAndSave(canvasElement);
    await confirmSummary();
    // The dialog fades out before the page is accessible again.
    await waitFor(async () => {
      await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    });
    const alert = await within(canvasElement).findByTestId('form-server-error');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** Arabic: the form mirrors; the labels are the Arabic pack's, placeholders where unreviewed. */
export const Rtl: Story = { decorators: [withApi({})], globals: { locale: 'ar' } };

/** 375 px: one column, the sticky save bar wraps. */
export const Mobile: Story = {
  decorators: [withApi({})],
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};
