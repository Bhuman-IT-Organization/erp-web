import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import type { ContractTypes } from '@/features/contract-types/schemas/contract-types.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { ContractTypesList } from './ContractTypesList';

// The transport seam the tests use: a fake axios adapter on the shared instance, set by a decorator
// before the story renders, with a private SWR cache per story and the tab's session seeded (a
// request is held until the session is known). Fixture data only (W0-05): never the live stack.
const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const TOTAL = 60;
const PAGE = 25;
const EXPORT_LIMIT = 10_000;
const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

const NO_USE = {
  purchaseRequests: 0,
  purchaseOrders: 0,
  purchaseQuotations: 0,
  shippingCharges: 0,
  expenses: 0,
  assets: 0,
};

const rows = (count: number): ContractTypes[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `r${String(i + 1)}`,
    name: `${NAMES[i % NAMES.length] ?? 'Alpha'} ${String(i + 1)}`,
    dateCreated: `2026-0${String((i % 9) + 1)}-0${String((i % 9) + 1)}T08:00:00.000Z`,
    usage: NO_USE,
  }));

const listPage = (data: readonly ContractTypes[], total = data.length) => ({
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
  title: 'Features/ContractTypes/ContractTypesList',
  component: ContractTypesList,
  // Expanded on purpose (Prettier keeps it): a long generated name or --prefix still fits.
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/setup/contract-types' } },
  },
  decorators: [withApi(LOADED)],
} satisfies Meta<typeof ContractTypesList>;

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

/** Arabic: the page mirrors; the pager and the toolbar follow the inline direction. */
export const Rtl: Story = { globals: { locale: 'ar' } };
