import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { EstimateRequestStatusForm } from './EstimateRequestStatusForm';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;
const RECORD = {
  id: '7',
  name: 'Approved',
  color: '#008000',
  statusorder: 2,
  flag: null,
  total_request: 0,
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

const problem = (status: number, code: string, issues?: unknown): Answer => ({
  status,
  body: { type: 'about:blank', status, title: code, code, ...(issues ? { issues } : {}) },
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

function withApi(save: Answer = { status: HTTP_CREATED, body: RECORD }): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const adapter: ApiAdapter = (config) => {
      const method = (config.method ?? 'get').toUpperCase();
      const answer =
        method === 'GET'
          ? {
              status: HTTP_OK,
              body: config.url?.endsWith('/7') ? RECORD : LIST,
            }
          : save;
      return respond(config, answer);
    };
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/EstimateRequestStatuses/EstimateRequestStatusForm',
  component: EstimateRequestStatusForm,
  args: { id: null },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/estimate_request-statuses/new' },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EstimateRequestStatusForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function submitAndConfirm(root: HTMLElement): Promise<void> {
  const canvas = within(root);
  await userEvent.type(await canvas.findByRole('textbox', { name: /Status Name/ }), 'Review');
  await userEvent.click(canvas.getByRole('button', { name: /Create/ }));
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });
  await userEvent.click(confirm);
}

export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await submitAndConfirm(canvasElement);
    await waitFor(async () => {
      const submit = within(canvasElement).getByRole('button', { name: /Creating/ });
      await expect(submit).toBeDisabled();
    });
  },
};

export const FieldErrors: Story = {
  decorators: [
    withApi(
      problem(HTTP_BAD_REQUEST, 'ERP-VALIDATION-0001', [
        { path: ['name'], message: 'server text, never rendered' },
      ]),
    ),
  ],
  play: async ({ canvasElement }) => {
    await submitAndConfirm(canvasElement);
    const summary = await within(canvasElement).findByTestId('error-summary');
    await waitFor(async () => {
      await expect(summary).toHaveFocus();
    });
  },
};

export const ServerError: Story = {
  decorators: [withApi(problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement }) => {
    await submitAndConfirm(canvasElement);
    await waitFor(async () => {
      await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    });
    const alert = await within(canvasElement).findByTestId('form-server-error');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};
