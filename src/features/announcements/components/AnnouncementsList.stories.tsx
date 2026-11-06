import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { AnnouncementsRow } from '@/features/announcements/schemas/announcements.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { AnnouncementsList } from './AnnouncementsList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known). Fixture data only: never the live stack.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 60;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;
const PRINT_LIMIT = 1_000;

const NAMES = [
  'Maintenance',
  'Holidays',
  'Policy',
  'Townhall',
  'Benefits',
  'Benefits',
  'Training',
  'Outage',
  'Renovation',
  'Payroll',
];

/** The api returns announcements in its default order; two rows share the name "Benefits". */
const rows = (count: number): AnnouncementsRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(TOTAL - i),
    name: i < NAMES.length ? (NAMES[i] ?? 'Spare') : `Announcement ${String(TOTAL - i)}`,
    message: 'A message.',
    dateAdded: '2026-01-15T09:00:00.000Z',
    showToUsers: false,
    showToStaff: true,
    showName: false,
  }));

const listPage = (data: readonly AnnouncementsRow[], total = data.length) => ({
  data,
  meta: {
    nextCursor: data.length < total ? 'next' : null,
    prevCursor: null,
    total,
    rangeStart: data.length === 0 ? 0 : 1,
    exportLimit: EXPORT_LIMIT,
    printLimit: PRINT_LIMIT,
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

const LOADED: Answer = { status: HTTP_OK, body: listPage(rows(PAGE), TOTAL) };

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

const MOBILE = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;

const DELETE_NAME = 'Maintenance'; // unique in NAMES ("Benefits" appears twice)

const openDelete = async (canvasElement: HTMLElement, name = DELETE_NAME): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: `Delete announcement ${name}` }));
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/Announcements/AnnouncementsList',
  component: AnnouncementsList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/announcements' } },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof AnnouncementsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `Loading`: the first answer is unknown: the list skeleton, and no message. */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** `Empty`: nothing yet and no search: the heading, the body and New Announcement. */
export const Empty: Story = { decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))] };

/** A search that matches nothing: the query named, and Clear search. */
export const NoResults: Story = {
  decorators: [withApi(api({ status: HTTP_OK, body: listPage([]) }))],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

/** `Error`: a retryable failure in plain language where the table goes, with Retry. */
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

/**
 * `Loaded`: 25 of 60, Name (the link) and Date Added; no checkbox; two rows named "Benefits".
 */
export const Loaded: Story = {};

/** "Delete announcement Maintenance?", Keep / Delete in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        `Delete announcement ${DELETE_NAME}?`,
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** A delete in flight: the api has not answered, so the dialog keeps Delete disabled. */
export const Pending: Story = {
  ...DESKTOP,
  decorators: [withApi(api(LOADED, 'pending'))],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
    });
  },
};

/** The api refuses the delete (403): the reason stays inside the dialog, never the raw code. */
export const DeleteRefused: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, { status: HTTP_FORBIDDEN, body: problem(HTTP_FORBIDDEN, 'ERP-AUTH-0005') }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-error')).not.toHaveTextContent(
      'ERP-AUTH-0005',
    );
  },
};

/** The race: the row was deleted meanwhile (404). The dialog says so and the list asks again. */
export const DeleteNotFound: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, { status: HTTP_NOT_FOUND, body: problem(HTTP_NOT_FOUND, 'ERP-CORE-0004') }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-error')).toHaveTextContent(
      'no longer exists',
    );
  },
};
/** A network failure: the human message inside the dialog, Delete still enabled to retry. */
export const DeleteRetryable: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, {
        status: HTTP_SERVICE_UNAVAILABLE,
        body: problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-NETWORK-0001'),
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** At 375 px: Name and the "Actions for …" kebab; the toolbar wraps. */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; the actions stay main first and destructive last. */
export const Rtl: Story = { globals: { locale: 'ar' } };
