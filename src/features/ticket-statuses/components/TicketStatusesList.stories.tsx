import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { TicketStatusesList } from './TicketStatusesList';

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
    ticket_count: 7,
    isdefault: 1,
    statuscolor: '#03a9f4',
    statusorder: 1,
  },
  {
    ticketstatusid: '12',
    name: 'Waiting',
    ticket_count: 2,
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
  body: {
    data: ticketStatuses,
    meta: {
      nextCursor: null,
      prevCursor: null,
      total: ticketStatuses.length,
      rangeStart: 1,
      exportLimit: 500,
      printLimit: 250,
    },
  },
};

const noResults: Answer = {
  status: 200,
  body: {
    data: [],
    meta: {
      nextCursor: null,
      prevCursor: null,
      total: 0,
      rangeStart: 0,
      exportLimit: 500,
      printLimit: 250,
    },
  },
};

/** The dialog portals to `<body>`, outside the story canvas. */
const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

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

const openDelete = async (canvasElement: HTMLElement): Promise<HTMLElement> => {
  await userEvent.click(
    await within(canvasElement).findByRole('button', { name: 'Delete Waiting' }),
  );
  return page(canvasElement).findByTestId('confirm-dialog');
};

const meta = {
  title: 'Features/TicketStatuses/TicketStatusesList',
  component: TicketStatusesList,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/ticket-statuses' },
    },
  },
  decorators: [withApi(api(LOADED))],
} satisfies Meta<typeof TicketStatusesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  decorators: [withApi(api('pending'))],
};

export const Empty: Story = {
  decorators: [withApi(api({ status: 200, body: { data: [] } }))],
};

export const NoResults: Story = {
  decorators: [withApi(api(noResults))],
  parameters: { nuqs: { searchParams: '?q=zz' } },
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
export const DeleteConfirm: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByRole('heading')).toHaveTextContent(
        'Delete ticket status: Waiting?',
      );
    });
    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};
export const BuiltInStatusHasNoDelete: Story = {
  play: async ({ canvasElement }) => {
    const { expect, within } = await import('storybook/test');
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('link', { name: /Open/ })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Delete Open' })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Delete Waiting' })).toBeVisible();
  },
};
export const Mobile: Story = {
  globals: { viewport: 'mobile1' },
};
export const ArabicRTL: Story = {
  globals: { locale: 'ar' },
};
