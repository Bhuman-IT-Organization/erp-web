import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { TicketPrioritiesRow } from '@/features/ticket-priorities/schemas/ticket-priorities.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import en from '../messages/en.json';
import { TicketPrioritiesList } from './TicketPrioritiesList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded.
// Fixture data only (W0-05): never the live stack.
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;
const IN_USE = 'ERP-TICKETPRIORITIES-0001';
const EMAIL_DEFAULT = 'ERP-TICKETPRIORITIES-0002';
const EN = en['ticket-priorities'];

/** Perfex's four stock priorities plus one Arabic name (the name rules accept any character). */
const ROWS: readonly TicketPrioritiesRow[] = [
  { id: '1', name: 'Low' },
  { id: '2', name: 'Medium' },
  { id: '3', name: 'High' },
  { id: '4', name: 'Urgent' },
  { id: '5', name: 'عاجل' },
];

const listPage = (data: readonly TicketPrioritiesRow[]) => ({
  data,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: data.length,
    rangeStart: data.length === 0 ? 0 : 1,
    exportLimit: 10_000,
    printLimit: 1_000,
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
  title: code,
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

// Perfex's columns: ID and Priority Name (`ticket_priority_dt_name`); the actions column is the template's.
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

const LOADED: Answer = { status: HTTP_OK, body: listPage(ROWS) };
const EMPTY: Answer = { status: HTTP_OK, body: listPage([]) };

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

const openDelete = async (canvasElement: HTMLElement, name = 'Low'): Promise<HTMLElement> => {
  await userEvent.click(
    await within(canvasElement).findByRole('button', { name: `Delete ticket priority ${name}` }),
  );
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/TicketPriorities/TicketPrioritiesList',
  component: TicketPrioritiesList,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/ticket-priorities' } },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof TicketPrioritiesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `Loading`: the first answer is unknown: the list skeleton, and no message. */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** `Empty`: nothing yet and no search: Perfex's "no priorities found", the body and New Priority. */
export const Empty: Story = { decorators: [withApi(api(EMPTY))] };

/** A search that matches nothing: the query named, and Clear search. */
export const NoResults: Story = {
  decorators: [withApi(api(EMPTY))],
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

/** `Loaded`: five priorities, the Priority Name as the link, Edit and Delete on each row. */
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: 'Urgent' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'عاجل' })).toBeVisible();
    await expect(
      canvas.getByRole('columnheader', { name: EN.ticket_priority_dt_name }),
    ).toBeVisible();
  },
};

/** A priority nothing uses: "Delete ticket priority Low?", Keep / Delete in red. */
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Delete ticket priority Low?',
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** A ticket uses it: the api answers 409 `ERP-TICKETPRIORITIES-0001`, shown inside the dialog. */
export const DeleteUsedByTicket: Story = {
  ...DESKTOP,
  decorators: [
    withApi(api(LOADED, { status: HTTP_CONFLICT, body: problem(HTTP_CONFLICT, IN_USE) })),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'High');
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toHaveTextContent(
        EN.errors[IN_USE],
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

/** The email-piping default: 409 `ERP-TICKETPRIORITIES-0002`, with its own text, inside the dialog. */
export const DeleteEmailPipingDefault: Story = {
  ...DESKTOP,
  decorators: [
    withApi(api(LOADED, { status: HTTP_CONFLICT, body: problem(HTTP_CONFLICT, EMAIL_DEFAULT) })),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'Medium');
    await clickWhenReady(within(dialog).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toHaveTextContent(
        EN.errors[EMAIL_DEFAULT],
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
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

/** At 375 px: the name and the "Actions for …" kebab; the toolbar wraps. */
export const Mobile: Story = { ...MOBILE };

/** Arabic: the page mirrors; the actions stay main first, destructive last. */
export const Rtl: Story = { globals: { locale: 'ar' } };
