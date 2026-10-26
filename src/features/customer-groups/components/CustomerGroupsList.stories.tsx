import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { CustomerGroupsRow } from '@/features/customer-groups/schemas/customer-groups.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { CustomerGroupsList } from './CustomerGroupsList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known). Fixture data only: never the live stack.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 60;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;
const PRINT_LIMIT = 1_000;

const NAMES = [
  'Retail',
  'Wholesale',
  'Spare',
  'VIP',
  'Partners',
  'Partners',
  'Distributors',
  'Online',
  'Government',
  'Corporate',
];

/**
 * The ID descends, as the api orders it. Every third row has no Date Created (a Perfex row stored
 * without one); two rows share the name "Partners" (Perfex accepts it).
 */
const rows = (count: number): CustomerGroupsRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(TOTAL - i),
    name: i < NAMES.length ? (NAMES[i] ?? 'Spare') : `Customer group ${String(TOTAL - i)}`,
    dateCreated:
      i % 3 === 2 ? null : `2026-0${String((i % 9) + 1)}-1${String(i % 9)}T08:00:00.000Z`,
  }));

const listPage = (data: readonly CustomerGroupsRow[], total = data.length) => ({
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

const UNUSED_NAME = 'Spare';

const openDelete = async (canvasElement: HTMLElement, name = UNUSED_NAME): Promise<HTMLElement> => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: `Delete customer group ${name}` }),
  );
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/CustomerGroups/CustomerGroupsList',
  component: CustomerGroupsList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/customer-groups' } },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof CustomerGroupsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `Loading`: the first answer is unknown: the list skeleton, and no message. */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** `Empty`: nothing yet and no search: the heading, the body and Add Customer Group. */
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
 * `Loaded`: 25 of 60, the ID descending: ID, Name (the link) and Date Created (empty for a row
 * Perfex stored without one); no checkbox; two rows named "Partners".
 */
export const Loaded: Story = {};

/** "Delete customer group Spare?", Keep / Delete in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Delete customer group Spare?',
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
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

/** At 375 px: ID, Name and the "Actions for …" kebab (Date Created hidden); the toolbar wraps. */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; the actions stay main first, destructive last; the ID keeps its digits. */
export const Rtl: Story = { globals: { locale: 'ar' } };
