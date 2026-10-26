// import type { Meta, StoryObj } from '@storybook/nextjs-vite';
// import { TicketStatusList } from './TicketStatusList';

// const meta = {
//   title: 'Features/Ticket/TicketStatusList',
//   component: TicketStatusList,
//   parameters: {
//     nextjs: { appDirectory: true, navigation: { pathname: '/setup/ticket-statuses' } },
//   },
// } satisfies Meta<typeof TicketStatusList>;

// export default meta;
// type Story = StoryObj<typeof meta>;

// export const Loading: Story = {};
// export const Empty: Story = {};
// export const Error: Story = {};
// export const Loaded: Story = {};

import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { TicketStatusList } from './TicketStatusList';

const ADMIN = {
  staffId: 1,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'User',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: 'en',
};

const ticketStatuses = [
  {
    ticketstatusid: '11',
    name: 'Open',
    isdefault: 1,
    statuscolor: '#03a9f4',
    statusorder: 1,
  },
  {
    ticketstatusid: '12',
    name: 'Waiting',
    isdefault: 0,
    statuscolor: null,
    statusorder: null,
  },
];

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

  return Promise.reject(
    new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response),
  );
}

function api(list: Answer): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';

    if (path === '/api/v1/auth/me') {
      return respond(config, { status: 200, body: ADMIN });
    }

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

const LOADED: Answer = {
  status: 200,
  body: { data: ticketStatuses },
};

const meta = {
  title: 'Features/Ticket/TicketStatusList',
  component: TicketStatusList,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/ticket-statuses' },
    },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof TicketStatusList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  decorators: [withApi(api('pending'))],
};

export const Empty: Story = {
  decorators: [withApi(api({ status: 200, body: { data: [] } }))],
};

export const Error: Story = {
  decorators: [
    withApi(
      api({
        status: 503,
        body: {
          type: 'about:blank',
          status: 503,
          title: 'Service unavailable',
          code: 'ERP-UPSTREAM-0001',
        },
      }),
    ),
  ],
};

export const Loaded: Story = {};
