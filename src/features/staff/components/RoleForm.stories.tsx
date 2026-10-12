import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SWRConfig } from 'swr';
import { PERMISSIONS } from '@/config/permissions';
import type { ApiAdapter } from '@/lib/api/call-api';
import { toSupportedLocale, type Locale } from '@/i18n/locales';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { setSession } from '@/lib/auth/session';
import commonAr from '@/messages/common/ar.json';
import commonEn from '@/messages/common/en.json';
import staffAr from '../messages/ar.json';
import staffEn from '../messages/en.json';
import { RoleForm } from './RoleForm';

// The transport seam, as in the tests: one fake axios adapter answers every read the form makes and
// the save. Neutral fixture data only. `vi` cannot enter a Storybook bundle, so the helpers are here.
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const ROLE_ID = 7;
const SEEDED_NOT_FOUND_ID = 27;
const SEEDED_FAILURE_ID = 37;
const SEEDED_LOADING_ID = 47;

const ME = {
  staffId: 9,
  email: 'actor@example.invalid',
  firstName: 'Actor',
  lastName: 'Person',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

const actions = (module: string, resource: string, verbs: readonly string[]) => ({
  resource,
  actions: verbs.map((action) => ({ action, code: `${module}.${resource}.${action}` })),
});
const CATALOGUE = {
  data: [
    {
      module: 'sales',
      resources: [
        actions('sales', 'invoices', ['view', 'create', 'edit', 'delete']),
        actions('sales', 'estimates', ['view', 'create']),
      ],
    },
    { module: 'accounting', resources: [actions('accounting', 'bills', ['view', 'create'])] },
    { module: 'staff', resources: [actions('staff', 'members', ['view', 'edit'])] },
  ],
  meta: { total: 10 },
};
const TEMPLATE = [
  'accounting.bills.view',
  'sales.estimates.view',
  'sales.invoices.create',
  'sales.invoices.view',
  'staff.members.view',
];
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
  {
    staffId: 6,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.invalid',
    active: true,
  },
];
/** 23 holders: the three above and 20 more, so the members card pages them (10 per page). */
const MANY_MEMBERS = [
  ...MEMBERS,
  ...Array.from({ length: 20 }, (_, index) => ({
    staffId: 100 + index,
    firstName: 'Clerk',
    lastName: `Number ${String(index + 1)}`,
    email: `clerk${String(index + 1)}@example.invalid`,
    active: true,
  })),
];
const role = (members: readonly unknown[] = []) => ({
  roleId: ROLE_ID,
  name: 'Warehouse Supervisor',
  permissions: TEMPLATE,
  members,
  memberCount: members.length,
});

/** A large catalogue and a role holding all 40 of one module: the summary a long save reads. */
const many = (module: string, count: number) => ({
  module,
  resources: Array.from({ length: count }, (_, i) =>
    actions(module, `r${String(i).padStart(2, '0')}`, ['view']),
  ),
});
const BIG_CATALOGUE = { data: [many('sales', 40), many('warehouse', 50)], meta: { total: 90 } };
const BIG_ROLE = {
  ...role(MEMBERS),
  permissions: BIG_CATALOGUE.data[0]?.resources.map((r) => r.actions[0]?.code ?? '') ?? [],
};

/** Two large modules from the real catalogue mirror (Payroll 11 resources, Fixed Equipment 25). */
const branch = (module: 'payroll' | 'fixedEquipment') => ({
  module,
  resources: Object.entries<Readonly<Record<string, string>>>(PERMISSIONS[module]).map(
    ([resource, verbs]) => ({
      resource,
      actions: Object.entries(verbs).map(([action, code]) => ({ action, code })),
    }),
  ),
});
const LARGE_BRANCHES = [branch('payroll'), branch('fixedEquipment')];
const LARGE_CODES = LARGE_BRANCHES.flatMap((b) => b.resources.flatMap((r) => r.actions));
const LARGE = { data: LARGE_BRANCHES, meta: { total: LARGE_CODES.length } };
/** A column per action any resource of the module has, plus the Feature column. */
const LARGE_HEADERS = LARGE_BRANCHES.map(
  (b) => new Set(b.resources.flatMap((r) => r.actions.map((a) => a.action))).size + 1,
).reduce((sum, count) => sum + count, 0);
const LARGE_ROLE = {
  ...role(),
  permissions: LARGE_CODES.filter((a) => a.action === 'view').map((a) => a.code),
};

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';
interface Api {
  readonly detail?: Answer;
  readonly save?: Answer;
  readonly catalogue?: unknown;
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
      return respond(config, options.save ?? { status: HTTP_OK, body: role() });
    if (method === 'POST') {
      return respond(config, options.save ?? { status: HTTP_CREATED, body: role() });
    }
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ME });
    if (path === '/api/v1/identity/permissions/catalogue') {
      return respond(config, { status: HTTP_OK, body: options.catalogue ?? CATALOGUE });
    }
    return respond(config, options.detail ?? { status: HTTP_OK, body: role() });
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
  title: 'Features/Staff/RoleForm',
  component: RoleForm,
  args: { mode: 'edit', id: ROLE_ID },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/roles/7' } } },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const roleName = (root: HTMLElement) => within(root).findByRole('textbox', { name: /^Role Name/ });
/** Makes the form dirty the way an administrator does, then asks to save. */
async function renameAndSave(root: HTMLElement): Promise<void> {
  const name = await roleName(root);
  await within(root).findByRole('searchbox', { name: 'Search permissions' });
  await userEvent.clear(name);
  await userEvent.type(name, 'Stock Lead');
  await userEvent.click(within(root).getByRole('button', { name: 'Save role' }));
}
/** The save summary, once it takes pointer input (Radix disables it while it mounts). */
async function summaryOpen(): Promise<HTMLElement> {
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });
  return dialog;
}
async function confirmSummary(): Promise<void> {
  const dialog = await summaryOpen();
  await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
}

/** `/setup/roles/:id`, a role nobody holds: Role Name and the picker open; no apply-to-members checkbox. */
export const Default: Story = { decorators: [withApi({})] };

/** `/setup/roles/new`: straight into the accordion (a role IS the template); "Create role". */
export const Create: Story = {
  decorators: [withApi({})],
  parameters: { nextjs: { navigation: { pathname: '/setup/roles/new' } } },
  render: () => <RoleForm mode="create" />,
};

/**
 * A role three members hold: Perfex's "Update all staff members…" checkbox under Role Name with its
 * warning as a footnote, and the members card beside the form (under it on a narrow page).
 */
export const WithMembers: Story = {
  decorators: [withApi({ detail: { status: HTTP_OK, body: role(MEMBERS) } })],
};

/** Every save is confirmed by what changes (D-25.4): apply-to-members first, as an access change. */
export const SaveSummary: Story = {
  decorators: [withApi({ detail: { status: HTTP_OK, body: role(MEMBERS) } })],
  play: async ({ canvasElement }) => {
    await roleName(canvasElement);
    await userEvent.click(
      within(canvasElement).getByRole('checkbox', {
        name: 'Update all staff members permissions that are using this role',
      }),
    );
    await renameAndSave(canvasElement);
    await summaryOpen();
  },
};

/**
 * A long summary (40 removed, 50 added, both lists opened): the dialog stays within the screen, the
 * title and the buttons fixed, only the list scrolling (lead 2026-09-26).
 */
export const SaveSummaryLong: Story = {
  decorators: [withApi({ detail: { status: HTTP_OK, body: BIG_ROLE }, catalogue: BIG_CATALOGUE })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await roleName(canvasElement);
    await userEvent.click(
      await canvas.findByRole('checkbox', {
        name: 'Update all staff members permissions that are using this role',
      }),
    );
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select all in Sales' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select all in Warehouse' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save role' }));
    const dialog = await summaryOpen();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show 30 more' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show 50 added' }));
  },
};

/** FE-27 `Pending`: confirmed, the save has not answered — "Saving role…". */
export const Pending: Story = {
  decorators: [withApi({ save: 'pending' })],
  play: async ({ canvasElement }) => {
    await renameAndSave(canvasElement);
    await confirmSummary();
    await expect(
      await within(document.body).findByRole('button', { name: 'Saving role…' }),
    ).toBeDisabled();
  },
};

/** FE-27 `FieldErrors`: a 400 on the name lands under Role Name and in the summary, focused. */
export const FieldErrors: Story = {
  decorators: [
    withApi({
      save: problem(HTTP_BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'server text, never rendered' },
      ]),
    }),
  ],
  play: async ({ canvasElement }) => {
    await renameAndSave(canvasElement);
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
    await renameAndSave(canvasElement);
    await confirmSummary();
    // The dialog fades out before the page is accessible again.
    await waitFor(async () => {
      await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    });
    const alert = await within(canvasElement).findByTestId('form-server-error');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** The texts a story expects, in the locale it renders (the RTL screenshots open it under `ar`). */
const TEXTS: Record<Locale, { readonly staff: typeof staffEn.staff; readonly back: string }> = {
  en: { staff: staffEn.staff, back: commonEn.common.back_to_list },
  ar: { staff: staffAr.staff, back: commonAr.common.back_to_list },
};
const RETURN_KEY = 'erp.list.return:/setup/roles';

/** The not-found page: the plain message, no button, and ONE link — Back to list, to `href`. */
async function expectNotFound(root: HTMLElement, locale: unknown, href: string): Promise<void> {
  const texts = TEXTS[toSupportedLocale(locale)];
  const error = await within(root).findByTestId('inline-error');
  await expect(error).toHaveTextContent(texts.staff.errors['ERP-IDENTITY-0008']);
  await expect(within(root).queryByRole('button')).toBeNull();
  const links = within(root).getAllByRole('link');
  await expect(links).toHaveLength(1);
  await expect(links[0]).toHaveAccessibleName(texts.back);
  await expect(links[0]).toHaveAttribute('href', href);
}

/**
 * A permalink to a role that no longer exists (a 404, `ERP-IDENTITY-0008`): the plain message where
 * the form would be, no Retry, and "Back to list" to the list the role was opened from (lead
 * 2026-09-27, D-28).
 */
export const NotFound: Story = {
  args: { mode: 'edit', id: 8 },
  decorators: [withApi({ detail: problem(HTTP_NOT_FOUND, 'ERP-IDENTITY-0008') })],
  parameters: { nextjs: { navigation: { pathname: '/setup/roles/8' } } },
  beforeEach: () => {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ url: '/setup/roles?q=war' }));
    return () => {
      sessionStorage.removeItem(RETURN_KEY);
    };
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/roles?q=war');
  },
};

/** Role `id` opened from the list: its row seeded in the app's own cache, the role `detail`. */
function withSeed(id: number, detail: Answer): Decorator {
  return function SeedDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = api({ detail });
    seedRow(`/api/v1/identity/roles/${String(id)}`, {
      roleId: id,
      name: 'Warehouse Supervisor',
      memberCount: 3,
    });
    return <Story />;
  };
}

/**
 * Opened from the list, but the role is gone (a 404): the same not-found page as a permalink, never
 * the seeded form; "Back to list" to `/setup/roles`, nothing being recorded here.
 */
export const SeededNotFound: Story = {
  args: { mode: 'edit', id: SEEDED_NOT_FOUND_ID },
  decorators: [withSeed(SEEDED_NOT_FOUND_ID, problem(HTTP_NOT_FOUND, 'ERP-IDENTITY-0008'))],
  // Nothing recorded, whatever an earlier story in this tab left: the link is the list base.
  beforeEach: () => {
    sessionStorage.removeItem(RETURN_KEY);
  },
  parameters: {
    nextjs: { navigation: { pathname: `/setup/roles/${String(SEEDED_NOT_FOUND_ID)}` } },
  },
  play: async ({ canvasElement, globals }) => {
    await expectNotFound(canvasElement, globals.locale, '/setup/roles');
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};

/**
 * Opened from the list, and the role fails retryably (a 503): Role Name stays, locked, and
 * Permissions shows the error with Retry where its blocks were; no members list is waited for.
 */
export const SeededNetworkFailure: Story = {
  args: { mode: 'edit', id: SEEDED_FAILURE_ID },
  decorators: [withSeed(SEEDED_FAILURE_ID, problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  parameters: { nextjs: { navigation: { pathname: `/setup/roles/${String(SEEDED_FAILURE_ID)}` } } },
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const label = TEXTS[toSupportedLocale(globals.locale)].staff.role_add_edit_name;
    const error = await canvas.findByTestId('permissions-error');
    await expect(within(error).getAllByRole('button')).toHaveLength(1);
    const name = canvas.getByRole('textbox', { name: (text) => text.startsWith(label) });
    await expect(name).toBeDisabled();
    await expect(name).toHaveValue('Warehouse Supervisor');
    await waitFor(async () => {
      await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    });
  },
};

/**
 * Two large modules of the real catalogue opened (Payroll and Fixed Equipment): the table with its
 * readable resource names ("Bonus KPI"), the fixed action columns, and a role holding every View.
 */
export const LargeModules: Story = {
  decorators: [withApi({ catalogue: LARGE, detail: { status: HTTP_OK, body: LARGE_ROLE } })],
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const picker = await canvas.findByTestId('permission-picker');
    for (const trigger of picker.querySelectorAll<HTMLElement>('[data-slot="accordion-trigger"]')) {
      await userEvent.click(trigger);
    }
    await waitFor(async () => {
      await expect(canvas.getAllByRole('table')).toHaveLength(2);
    });
    const names = canvas.getAllByRole('rowheader').map((cell) => cell.textContent);
    await expect(names).toContain('Bonus KPI');
    const headers = canvas.getAllByRole('columnheader', { hidden: true });
    if (toSupportedLocale(globals.locale) === 'en') {
      await expect(headers.map((header) => header.textContent)).toContain(
        staffEn.staff.permission_view_own,
      );
    } else {
      await expect(headers).toHaveLength(LARGE_HEADERS);
    }
  },
};

/** Arabic: the form mirrors; the labels are the Arabic pack's, placeholders where unreviewed. */
export const Rtl: Story = {
  decorators: [withApi({ detail: { status: HTTP_OK, body: role(MEMBERS) } })],
  globals: { locale: 'ar' },
};

/** 375 px: one column, the sticky save bar wraps. */
export const Mobile: Story = {
  decorators: [withApi({ detail: { status: HTTP_OK, body: role(MEMBERS) } })],
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/**
 * A role 23 members hold: the members card pages them 10 at a time with the kit Pager (no page-size
 * picker), beside the form from 63rem of content width.
 */
export const ManyMembers: Story = {
  decorators: [withApi({ detail: { status: HTTP_OK, body: role(MANY_MEMBERS) } })],
  play: async ({ canvasElement, globals }) => {
    const heading = TEXTS[toSupportedLocale(globals.locale)].staff.staff_which_are_using_role;
    const region = await within(canvasElement).findByRole('region', { name: heading });
    const table = await within(region).findByTestId('role-members');
    await expect(within(table).getAllByRole('link')).toHaveLength(10);
    await expect(within(region).getByTestId('pager-range')).toBeVisible();
    await expect(within(region).queryByRole('combobox')).toBeNull();
  },
};

/**
 * Opened from the list, the role still loading: the members card is its own skeleton under its real
 * heading, busy, with no message (D-39).
 */
export const SeededLoading: Story = {
  args: { mode: 'edit', id: SEEDED_LOADING_ID },
  decorators: [withSeed(SEEDED_LOADING_ID, 'pending')],
  parameters: { nextjs: { navigation: { pathname: `/setup/roles/${String(SEEDED_LOADING_ID)}` } } },
  play: async ({ canvasElement, globals }) => {
    const heading = TEXTS[toSupportedLocale(globals.locale)].staff.staff_which_are_using_role;
    const region = await within(canvasElement).findByRole('region', { name: heading });
    await expect(within(region).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    await expect(within(canvasElement).queryByRole('alert')).toBeNull();
  },
};
