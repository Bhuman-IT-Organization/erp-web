import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { EstimateRequestStatusesList } from './EstimateRequestStatusesList';

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const RECORD = {
  id: '7',
  name: 'Approved',
  color: '#008000',
  statusorder: 2,
  flag: null,
  total_request: 3,
};
const LIST = {
  data: [RECORD],
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: 1,
    rangeStart: 1,
    exportLimit: 10_000,
    printLimit: 1_000,
  },
};

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

function withApi(answer: Answer): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = (config) => respond(config, answer);
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/EstimateRequestStatuses/EstimateRequestStatusesList',
  component: EstimateRequestStatusesList,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/estimate-request-statuses' },
    },
  },
} satisfies Meta<typeof EstimateRequestStatusesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { decorators: [withApi('pending')] };
export const Empty: Story = {
  decorators: [
    withApi({
      status: HTTP_OK,
      body: { ...LIST, data: [], meta: { ...LIST.meta, total: 0, rangeStart: 0 } },
    }),
  ],
};
export const Error: Story = {
  decorators: [
    withApi({
      status: HTTP_SERVICE_UNAVAILABLE,
      body: {
        type: 'about:blank',
        status: HTTP_SERVICE_UNAVAILABLE,
        title: 'Unavailable',
        code: 'ERP-UPSTREAM-0001',
      },
    }),
  ],
};
export const Loaded: Story = {
  decorators: [withApi({ status: HTTP_OK, body: LIST })],
};
