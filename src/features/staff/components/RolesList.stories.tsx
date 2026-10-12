import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { StaffRole } from '@/features/staff/schemas/staff.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { RolesList } from './RolesList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known, WR-08). Fixture data only (W0-05): never the live
// stack, whose database is a copy of production.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;
const EXPORT_LIMIT = 10_000;

const NAMES = [
  'Warehouse Supervisor',
  'Employee',
  'Accountant',
  'Sales Manager',
  'Purchasing Officer',
  'HR Officer',
  'Store Keeper',
  'Driver',
  'Technician',
  'Receptionist',
  'Project Manager',
  'Quality Inspector',
];

const roles: StaffRole[] = NAMES.map((name, i) => ({
  roleId: i + 1,
  name,
  // Warehouse Supervisor is held by 7 (the held delete); Project Manager by nobody (the race).
  memberCount: ((i + 1) * 7) % 11,
}));

const listPage = (rows: readonly StaffRole[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: EXPORT_LIMIT,
  },
});

const ADMIN = {
  staffId: 99,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'Person',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: 'x',
  code,
});

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

const LOADED: Answer = { status: HTTP_OK, body: listPage(roles) };

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

/** `/me` answers an administrator; a DELETE answers `remove`; the list answers `list`. */
function api(list: Answer, remove: Answer = { status: HTTP_NO_CONTENT }): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: HTTP_OK, body: ADMIN });
    if ((config.method ?? 'get').toUpperCase() === 'DELETE') return respond(config, remove);
    return respond(config, list);
  };
}

function withApi(adapter: ApiAdapter): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

/** The dialog portals to `<body>`, outside the story canvas. */
const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** Radix disables pointer events on <body> while the modal mounts: click once the dialog takes input. */
async function clickWhenReady(element: HTMLElement): Promise<void> {
  await waitFor(async () => {
    await expect(getComputedStyle(element).pointerEvents).not.toBe('none');
  });
  await userEvent.click(element);
}

/** The inline Delete exists from `md`; a story that clicks it declares a desktop width. */
const DESKTOP = {
  parameters: {
    viewport: {
      options: {
        desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
  globals: { viewport: { value: 'desktop1280', isRotated: false } },
} as const;

/** "Project Manager" is held by nobody; "Warehouse Supervisor" by 7 (the fixture's counts). */
const UNHELD = 'Project Manager';
const HELD = 'Warehouse Supervisor';

const openDelete = async (canvasElement: HTMLElement, role = UNHELD): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: `Delete role ${role}` }));
  return page(canvasElement).findByTestId('confirm-dialog');
};

/** The held role's delete: the count in the body, the refusal from the start, Delete disabled. */
const expectHeld = async (dialog: HTMLElement): Promise<void> => {
  await waitFor(async () => {
    await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
  });
  await expect(dialog).toHaveTextContent('7 staff members hold this role.');
  await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
};

const meta = {
  title: 'Features/Staff/RolesList',
  component: RolesList,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/setup/roles' } } },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof RolesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first answer is unknown: the list skeleton, and no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** No role yet and no search: "No roles yet" with New Role (D-30). */
export const Empty: Story = { decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))] };

/** A search that matches no role: the query named, and Clear search (D-30). */
export const NoResults: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

/** A retryable failure: plain language where the table goes, with Retry (D-31, D-32). */
export const Error: Story = {
  decorators: [
    withApi(
      api({
        status: HTTP_SERVICE_UNAVAILABLE,
        body: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
      }),
    ),
  ],
};

/** Every role, its member count as a second line, and the labelled Edit and Delete (UAT 6). */
export const Loaded: Story = {};

/** A role nobody holds: "Delete role Project Manager?", Keep role / Delete role in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Delete role Project Manager?',
      );
    });
  },
};

/**
 * A held role (the row says 7 hold it): the dialog says so, the refusal is shown from the start and
 * Delete role is disabled — no request that cannot succeed is sent (lead 2026-09-26).
 */
export const DeleteHeld: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    await expectHeld(await openDelete(canvasElement, HELD));
  },
};

/** The held role at 375 px: Delete from the "Actions for …" menu, the same refusal up front. */
export const DeleteHeldMobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: `Actions for ${HELD}` }));
    await userEvent.click(
      await page(canvasElement).findByRole('menuitem', { name: `Delete role ${HELD}` }),
    );
    await expectHeld(await page(canvasElement).findByTestId('confirm-dialog'));
  },
};

/**
 * The race: the list said nobody held the role, someone was given it since, and the api answers 409.
 * The reason stays inside and Delete role is disabled (UAT 7).
 */
export const DeleteRefused: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, { status: HTTP_CONFLICT, body: problem(HTTP_CONFLICT, 'ERP-IDENTITY-0006') }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    // The dialog fades in over 100 ms; the answer can land while it is still translucent.
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** Below `md`: Edit and Delete fold into the "Actions for …" kebab, Delete after a separator. */
export const Mobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** Arabic: the page mirrors; the actions stay main first, destructive last. */
export const Rtl: Story = { globals: { locale: 'ar' } };
