import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import en from '../messages/en.json';
import { ServicesList } from './ServicesList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, a private SWR cache per story and the tab's session seeded. A GET
// answers `list`; a DELETE answers `remove`. Fixture data only (W0-05).
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;

const ROWS = [
  { id: '3', name: 'Gold Support' },
  { id: '2', name: 'Billing' },
  { id: '1', name: 'Onboarding' },
];

const page = (rows: readonly { id: string; name: string }[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: 10_000,
    printLimit: 1_000,
  },
});

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

const problem = (status: number, code: string): Answer => ({
  status,
  body: { type: 'about:blank', status, title: code, code },
});

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

function withApi(
  list: Answer = { status: HTTP_OK, body: page(ROWS) },
  remove: Answer = { status: HTTP_NO_CONTENT },
): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const adapter: ApiAdapter = (config) =>
      respond(config, (config.method ?? 'get').toUpperCase() === 'DELETE' ? remove : list);
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/Services/ServicesList',
  component: ServicesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/services' } },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ServicesList>;

export default meta;
type Story = StoryObj<typeof meta>;
/** FE-27 `NoResults`: no services match the current search; offers Clear search. */
export const NoResults: Story = {
  decorators: [withApi({ status: HTTP_OK, body: page([]) })],
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/setup/services',
        query: { q: 'zz' },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const empty = await canvas.findByTestId('list-no-results');

    await expect(empty).toHaveTextContent('No services match “zz”');
    await expect(within(empty).getByRole('button', { name: 'Clear search' })).toBeVisible();
  },
};
/** FE-27 `Loading`: the list skeleton while the first answer is unknown; no empty or error text. */
export const Loading: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByTestId('list-loading')).toBeVisible();
  },
};

/** FE-27 `Empty`: no services yet, with the add action. */
export const Empty: Story = {
  decorators: [withApi({ status: HTTP_OK, body: page([]) })],
  play: async ({ canvasElement }) => {
    const empty = await within(canvasElement).findByTestId('list-empty');
    await expect(empty).toHaveTextContent(en.services.empty_heading);
  },
};

/** FE-27 `Error`: a 503 says the list could not load, in plain words, with Retry. */
export const Error: Story = {
  decorators: [withApi(problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement }) => {
    const error = await within(canvasElement).findByTestId('list-error');
    await expect(within(error).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** FE-27 `Loaded`: ID and Service Name; the name is the link; Edit and Delete on every row. */
export const Loaded: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', { name: 'Gold Support' })).toBeVisible();
    await expect(canvas.getByTestId('list-table')).toBeVisible();
  },
};

/** The delete confirmation: "Delete Gold Support?" with Keep and Delete, nothing sent until Delete. */
export const DeleteConfirm: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = (await canvas.findByRole('link', { name: 'Gold Support' })).closest('tr');
    if (row === null) throw new globalThis.Error('no row');
    const actions = within(within(row).getByTestId('row-actions-inline'));
    await userEvent.click(
      actions.getByRole('button', {
        name: en.services.delete_action_named.replace('{name}', 'Gold Support'),
      }),
    );
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(dialog).toBeVisible();
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** A delete a ticket still uses (409): the refusal reads inside the dialog and Delete is disabled. */
export const DeleteRefused: Story = {
  decorators: [withApi(undefined, problem(HTTP_CONFLICT, 'ERP-SERVICES-0001'))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = (await canvas.findByRole('link', { name: 'Gold Support' })).closest('tr');
    if (row === null) throw new globalThis.Error('no row');
    await userEvent.click(
      within(within(row).getByTestId('row-actions-inline')).getByRole('button', {
        name: en.services.delete_action_named.replace('{name}', 'Gold Support'),
      }),
    );
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
    await waitFor(async () => {
      await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
    });
    await userEvent.click(confirm);
    const error = await within(dialog).findByTestId('confirm-dialog-error');
    await expect(error.textContent).toBe(en.services.errors['ERP-SERVICES-0001']);
  },
};

/** At 375 px: the actions fold into the kebab; no horizontal overflow. */
export const Mobile: Story = {
  decorators: [withApi()],
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** Arabic: the list mirrors under RTL. */
export const Rtl: Story = { decorators: [withApi()], globals: { locale: 'ar' } };
