import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, within } from 'storybook/test';
import type { PredefinedRepliesRow } from '@/features/predefined-replies/schemas/predefined-replies.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { PredefinedRepliesList } from './PredefinedRepliesList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known). Fixture data only (W0-05): never the live stack.
const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 60;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;
const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

const rows = (count: number): PredefinedRepliesRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `r${String(i + 1)}`,
    name: `${NAMES[i % NAMES.length] ?? 'Alpha'} ${String(i + 1)}`,
  }));

const listPage = (data: readonly PredefinedRepliesRow[], total = data.length) => ({
  data,
  meta: {
    nextCursor: data.length < total ? 'next' : null,
    prevCursor: null,
    total,
    rangeStart: data.length === 0 ? 0 : 1,
    exportLimit: EXPORT_LIMIT,
  },
});

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

function api(answer: Answer): ApiAdapter {
  return (config: InternalAxiosRequestConfig) => {
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
  };
}

function withApi(answer: Answer): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = api(answer);
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const LOADED: Answer = { status: HTTP_OK, body: listPage(rows(PAGE), TOTAL) };

const meta = {
  title: 'Features/PredefinedReplies/PredefinedRepliesList',
  component: PredefinedRepliesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/predefined-replies' } },
  },
  decorators: [withApi(LOADED)],
} satisfies Meta<typeof PredefinedRepliesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the first answer is unknown: the list skeleton, and no message (D-39). */
export const Loading: Story = { decorators: [withApi('pending')] };

/** FE-27 `Empty`: nothing yet and no search: the heading, the body and the create button (D-30). */
export const Empty: Story = { decorators: [withApi({ status: HTTP_OK, body: listPage([]) })] };

/** A search that matches nothing: the query named, and Clear search (D-30). */
export const NoResults: Story = {
  decorators: [withApi({ status: HTTP_OK, body: listPage([]) })],
  parameters: { nuqs: { searchParams: '?q=zz' } },
};

/** FE-27 `Error`: a retryable failure in plain language where the table goes, with Retry (D-31, D-32). */
export const Error: Story = {
  decorators: [
    withApi({
      status: HTTP_SERVICE_UNAVAILABLE,
      body: {
        type: 'about:blank',
        status: HTTP_SERVICE_UNAVAILABLE,
        title: 'x',
        code: 'ERP-UPSTREAM-0001',
      },
    }),
  ],
};

/** FE-27 `Loaded`: 25 of 60: Name links to the record and sorts; Created in the customer's format. */
export const Loaded: Story = {};

/** The list at a narrow viewport. */
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

/** The destructive confirmation for deleting a predefined reply. */
export const DeleteConfirm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameLink = await canvas.findByRole('link', { name: 'Alpha 1' });
    const row = nameLink.closest('tr');
    if (row === null) throw new globalThis.Error('Alpha 1 row was not rendered');
    await userEvent.click(
      within(within(row).getByTestId('row-actions-inline')).getByRole('button', {
        name: 'Delete predefined reply Alpha 1',
      }),
    );
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await expect(within(dialog).getByRole('heading')).toHaveTextContent('Delete Alpha 1?');
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** Arabic: the page mirrors; the pager and the toolbar follow the inline direction. */
export const Rtl: Story = { globals: { locale: 'ar' } };
