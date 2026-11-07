import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { seedRow } from '@/lib/api/row-seed';
import { setSession } from '@/lib/auth/session';
import { EstimateRequestStatusesForm } from './EstimateRequestStatusesForm';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
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

function withApi(
  save: Answer = { status: HTTP_CREATED, body: RECORD },
  record: Answer = { status: HTTP_OK, body: RECORD },
): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const adapter: ApiAdapter = (config) => {
      const method = (config.method ?? 'get').toUpperCase();
      const answer =
        method === 'GET'
          ? config.url?.includes('/estimate-request-statuses/') && !config.url.endsWith('/export')
            ? record
            : { status: HTTP_OK, body: LIST }
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
  title: 'Features/EstimateRequestStatuses/EstimateRequestStatusesForm',
  component: EstimateRequestStatusesForm,
  args: { id: null },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/estimate-request-statuses/new' },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EstimateRequestStatusesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function submitAndConfirm(root: HTMLElement): Promise<HTMLElement> {
  const canvas = within(root);
  await userEvent.type(await canvas.findByRole('textbox', { name: /Status Name/ }), 'Review');
  await userEvent.click(canvas.getByRole('button', { name: /Create/ }));
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');
  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });
  await userEvent.click(confirm);
  return dialog;
}

export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    const dialog = await submitAndConfirm(canvasElement);
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
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

const EDIT = {
  args: { id: '7' },
  parameters: {
    nextjs: {
      navigation: { pathname: '/setup/estimate-request-statuses/7' },
    },
  },
} as const;

export const Default: Story = {
  decorators: [withApi()],
};

export const Edit: Story = {
  ...EDIT,
  decorators: [withApi()],
};

export const SaveSummary: Story = {
  ...EDIT,
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole('textbox', { name: /Status Name/ });
    await waitFor(async () => {
      await expect(name).toHaveValue('Approved');
    });
    await userEvent.clear(name);
    await userEvent.type(name, 'Reviewed');
    await userEvent.click(canvas.getByRole('button', { name: /Save/ }));
    const dialog = await within(document.body).findByTestId('confirm-dialog');
    await expect(within(dialog).getByTestId('confirm-dialog-changes')).toHaveTextContent(
      'Approved → Reviewed',
    );
  },
};

export const Loading: Story = {
  ...EDIT,
  decorators: [withApi(undefined, 'pending')],
};

export const Mobile: Story = {
  ...EDIT,
  decorators: [withApi()],
  parameters: {
    ...EDIT.parameters,
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

export const NotFound: Story = {
  args: { id: 'gone' },
  decorators: [
    withApi({ status: HTTP_CREATED, body: RECORD }, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004')),
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/estimate-request-statuses/gone' } },
  },
  play: async ({ canvasElement }) => {
    const error = await within(canvasElement).findByTestId('inline-error');
    await expect(error).toHaveTextContent('This status no longer exists.');
  },
};

export const SeededNotFound: Story = {
  args: { id: '8' },
  decorators: [
    function SeededDecorator(Story) {
      setSession({ accessToken: 'story', csrfToken: 'story' });
      http.defaults.adapter = (config) => respond(config, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004'));
      seedRow('/api/v1/estimate-request-statuses/8', { ...RECORD, id: '8' });
      return <Story />;
    },
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/setup/estimate-request-statuses/8' } },
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByTestId('inline-error');
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};

export const Rtl: Story = {
  decorators: [withApi()],
  globals: { locale: 'ar' },
};
