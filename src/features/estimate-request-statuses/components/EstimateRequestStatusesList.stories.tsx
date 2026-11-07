import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import type { EstimateRequestStatusRow } from '@/features/estimate-request-statuses/schemas/estimate-request-statuses.schema';
import { EstimateRequestStatusesList } from './EstimateRequestStatusesList';

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const IN_USE = 'ERP-ESTIMATEREQUESTSTATUSES-0001';
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

function withApi(answer: Answer, remove: Answer = { status: HTTP_NO_CONTENT }): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = (config) =>
      respond(config, (config.method ?? 'get').toUpperCase() === 'DELETE' ? remove : answer);
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

export const NoResults: Story = {
  decorators: [
    withApi({
      status: HTTP_OK,
      body: { ...LIST, data: [], meta: { ...LIST.meta, total: 0, rangeStart: 0 } },
    }),
  ],
  parameters: { nuqs: { searchParams: '?q=missing' } },
};

async function openDelete(canvasElement: HTMLElement): Promise<HTMLElement> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Delete status Approved' }));
  return within(document.body).findByTestId('confirm-dialog');
}

const DESKTOP: Story = {
  parameters: {
    viewport: {
      options: {
        desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
  globals: { viewport: { value: 'desktop1280', isRotated: false } },
};

const MOBILE: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

export const DeleteConfirm: Story = {
  ...DESKTOP,
  decorators: [withApi({ status: HTTP_OK, body: LIST })],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await expect(within(dialog).getByRole('heading')).toHaveTextContent('Delete status Approved?');
  },
};

export const DeleteRefused: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      { status: HTTP_OK, body: LIST },
      {
        status: HTTP_CONFLICT,
        body: {
          type: 'about:blank',
          status: HTTP_CONFLICT,
          title: IN_USE,
          code: IN_USE,
        },
      },
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openDelete(canvasElement);
    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
    await expect(await within(dialog).findByTestId('confirm-dialog-error')).toBeVisible();
  },
};

const FLAGGED: EstimateRequestStatusRow = {
  ...RECORD,
  id: '8',
  name: 'Built in',
  flag: 'built-in',
};

export const FlaggedRow: Story = {
  ...MOBILE,
  decorators: [
    withApi({
      status: HTTP_OK,
      body: { ...LIST, data: [RECORD, FLAGGED], meta: { ...LIST.meta, total: 2 } },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Built in');
    await userEvent.click(await canvas.findByRole('button', { name: 'Actions for Built in' }));
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('menuitem', { name: 'Edit Built in' })).toBeVisible();
    });
    await expect(body.queryByRole('menuitem', { name: 'Delete status Built in' })).toBeNull();
  },
};

export const Mobile: Story = {
  decorators: [withApi({ status: HTTP_OK, body: LIST })],
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

export const Rtl: Story = {
  decorators: [withApi({ status: HTTP_OK, body: LIST })],
  globals: { locale: 'ar' },
};
