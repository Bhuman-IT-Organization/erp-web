import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { TicketStatusesForm } from './TicketStatusesForm';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVICE_UNAVAILABLE = 503;

const RECORD = {
  ticketstatusid: '7',
  name: 'Waiting',
  ticket_count: 3,
  statuscolor: '',
  statusorder: null,
  isdefault: 0,
};

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

const problem = (status: number, code: string, issues?: unknown): Answer => ({
  status,
  body: {
    type: 'about:blank',
    status,
    title: code,
    code,
    ...(issues ? { issues } : {}),
  },
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

function withApi(save: Answer = { status: HTTP_OK, body: RECORD }): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });

    const adapter: ApiAdapter = (config) =>
      respond(
        config,
        (config.method ?? 'get').toUpperCase() === 'GET' ? { status: HTTP_OK, body: RECORD } : save,
      );

    http.defaults.adapter = adapter;

    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const meta = {
  title: 'Features/TicketStatuses/TicketStatusesForm',
  component: TicketStatusesForm,
  args: { id: null },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/ticket-statuses/new' },
    },
  },
  decorators: [
    withApi(),
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TicketStatusesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function typeAndSubmit(root: HTMLElement): Promise<void> {
  const canvas = within(root);
  await userEvent.type(
    await canvas.findByRole('textbox', { name: /^Ticket Status Name/ }),
    'Waiting',
  );
  await userEvent.click(canvas.getByRole('button', { name: /Create ticket status/i }));
}

async function confirmSummary(): Promise<void> {
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
    await typeAndSubmit(canvasElement);
    await confirmSummary();

    const buttons = await within(document.body).findAllByRole('button', {
      name: /Creating ticket status/i,
    });

    for (const button of buttons) {
      await expect(button).toBeDisabled();
    }
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
    await typeAndSubmit(canvasElement);
    await confirmSummary();

    const summary = await within(canvasElement).findByTestId('error-summary');

    await waitFor(async () => {
      await expect(summary).toHaveFocus();
    });
  },
};

export const ServerError: Story = {
  decorators: [withApi(problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();

    await waitFor(async () => {
      await expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
    });

    const alert = await within(canvasElement).findByTestId('form-server-error');

    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

export const Loaded: Story = {
  args: { id: '7' },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/ticket-statuses/7' },
    },
  },
};

export const Mobile: Story = {
  globals: { viewport: 'mobile1' },
};

export const ArabicRTL: Story = {
  globals: { locale: 'ar' },
};
