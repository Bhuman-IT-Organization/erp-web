import { expect, userEvent, within } from 'storybook/test';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';

import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';

import { LeadStatusesList } from './LeadStatusesList';

const ROW = {
  id: '7',
  name: 'Interested',
  color: '#28B8DA',
  statusorder: 2,
  isdefault: 0,
  isConfiguredDefault: false,
  usage: {
    leads: 0,
    lastLeadStatus: 0,
    emailIntegration: 0,
    webToLead: 0,
  },
};

const ROWS = [
  ROW,
  {
    ...ROW,
    id: '8',
    name: 'Customer',
    isdefault: 1,
  },
  {
    ...ROW,
    id: '9',
    name: 'Configured default',
    isConfiguredDefault: true,
  },
  {
    ...ROW,
    id: '10',
    name: 'Contacted',
    usage: {
      leads: 2,
      lastLeadStatus: 0,
      emailIntegration: 1,
      webToLead: 0,
    },
  },
];

const ADMIN = {
  staffId: 1,
  email: 'admin@example.invalid',
  firstName: 'Admin',
  lastName: 'User',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

function page(data: readonly unknown[]) {
  return {
    data,
    meta: {
      nextCursor: null,
      prevCursor: null,
      total: data.length,
      rangeStart: data.length > 0 ? 1 : 0,
      exportLimit: 10000,
      printLimit: 1000,
    },
  };
}

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';

function respond(config: InternalAxiosRequestConfig, reply: Reply) {
  if (reply === 'pending') {
    return new Promise<never>(() => undefined);
  }

  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(),
    config,
  };

  if (reply.status < 300) {
    return Promise.resolve(response);
  }

  return Promise.reject(
    new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response),
  );
}

function withApi(list: Reply, remove: Reply = { status: 204 }): Decorator {
  return function ApiDecorator(Story) {
    setSession({
      accessToken: 'story',
      csrfToken: 'story',
    });

    const adapter: ApiAdapter = (config) => {
      const path = (config.url ?? '').split('?')[0] ?? '';

      if (path === '/api/v1/auth/me') {
        return respond(config, {
          status: 200,
          body: ADMIN,
        });
      }

      if ((config.method ?? 'get').toUpperCase() === 'DELETE') {
        return respond(config, remove);
      }

      return respond(config, list);
    };

    http.defaults.adapter = adapter;

    return (
      <SWRConfig
        value={{
          provider: () => new Map(),
          shouldRetryOnError: false,
        }}
      >
        <Story />
      </SWRConfig>
    );
  };
}

const MOBILE = {
  parameters: {
    viewport: {
      options: {
        mobile375: {
          name: 'Mobile 375',
          styles: { width: '375px', height: '740px' },
        },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;

const openDelete = async (
  canvasElement: HTMLElement,
  name = 'Interested',
): Promise<HTMLElement> => {
  const canvas = within(canvasElement);

  await userEvent.click(await canvas.findByRole('button', { name: `Delete ${name}` }));

  return within(canvasElement.ownerDocument.body).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/LeadStatuses/LeadStatusesList',
  component: LeadStatusesList,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/setup/lead-statuses',
      },
    },
  },
} satisfies Meta<typeof LeadStatusesList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  decorators: [withApi('pending')],
};

export const Empty: Story = {
  decorators: [
    withApi({
      status: 200,
      body: page([]),
    }),
  ],
};

export const NoResults: Story = {
  decorators: [
    withApi({
      status: 200,
      body: page([]),
    }),
  ],
  parameters: {
    nuqs: { searchParams: '?q=zz' },
  },
};

export const Error: Story = {
  decorators: [
    withApi({
      status: 503,
      body: {
        type: 'about:blank',
        status: 503,
        title: 'Service unavailable',
        code: 'ERP-UPSTREAM-0001',
      },
    }),
  ],
};

export const Loaded: Story = {
  decorators: [
    withApi({
      status: 200,
      body: page(ROWS),
    }),
  ],
};

export const DeleteConfirm: Story = {
  decorators: [
    withApi({
      status: 200,
      body: page(ROWS),
    }),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);

    await expect(within(dialog).getByRole('heading')).toHaveTextContent('Delete Interested?');

    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

export const DeleteInUse: Story = {
  decorators: [
    withApi({
      status: 200,
      body: page(ROWS),
    }),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement, 'Contacted');

    await expect(within(dialog).findByTestId('confirm-dialog-error')).resolves.toBeVisible();

    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
  },
};

export const DeleteRefused: Story = {
  decorators: [
    withApi(
      {
        status: 200,
        body: page(ROWS),
      },
      {
        status: 409,
        body: {
          status: 409,
          code: 'ERP-LEADSTATUSES-0001',
          title: 'Conflict',
        },
      },
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);

    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));

    await expect(within(dialog).findByTestId('confirm-dialog-error')).resolves.toBeVisible();
  },
};

/** Lead Statuses list at mobile width (375px). */
export const Mobile: Story = { ...MOBILE };

/** Arabic locale for checking right-to-left layout. */
export const Rtl: Story = { globals: { locale: 'ar' } };
