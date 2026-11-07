import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { TodosForm } from './TodoForm';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;

const RECORD = {
  id: 'a1',
  description: 'Review pending tasks',
  finished: false,
  dateAdded: '2026-11-01T10:00:00.000Z',
  dateFinished: null,
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

function withApi(
  save: Answer = { status: HTTP_OK, body: RECORD },
  read: Answer = { status: HTTP_OK, body: RECORD },
): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });

    const adapter: ApiAdapter = (config) =>
      respond(config, (config.method ?? 'get').toUpperCase() === 'GET' ? read : save);

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

const meta = {
  title: 'Features/Todo/TodoForm',
  component: TodosForm,
  args: { id: null },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/todo/new' },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TodosForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function typeAndSubmit(root: HTMLElement, submit = 'Create to do') {
  const canvas = within(root);
  await userEvent.type(
    await canvas.findByRole('textbox', { name: /^Description/ }),
    'Review pending tasks',
  );
  await userEvent.click(canvas.getByRole('button', { name: submit }));
}

async function confirmSummary(): Promise<void> {
  const dialog = await within(document.body).findByTestId('confirm-dialog');
  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');

  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });

  await userEvent.click(confirm);
}

/** New To Do form with an empty description. */
export const Default: Story = {
  decorators: [withApi()],
};

/** Edit an existing To Do. */
export const Edit: Story = {
  args: { id: 'a1' },
  decorators: [withApi()],
  parameters: {
    nextjs: {
      navigation: { pathname: '/setup/todo/a1' },
    },
  },
};

/** The record read is pending: the form skeleton is displayed. */
export const Loading: Story = {
  args: { id: 'a1' },
  decorators: [withApi(undefined, 'pending')],
  parameters: {
    nextjs: {
      navigation: { pathname: '/setup/todo/a1' },
    },
  },
};

/** Save confirmation is pending. */
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await typeAndSubmit(canvasElement);
    await confirmSummary();

    const buttons = await within(document.body).findAllByRole('button', {
      name: 'Creating to do…',
    });

    for (const button of buttons) {
      await expect(button).toBeDisabled();
    }
  },
};

/** Server validation error for the description field. */
export const FieldErrors: Story = {
  decorators: [
    withApi(
      problem(HTTP_BAD_REQUEST, 'ERP-VALIDATION-0001', [
        {
          path: ['description'],
          message: 'server text, never rendered',
        },
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

/** Server error: edits are retained and Retry is displayed. */
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

/** The record no longer exists. */
export const NotFound: Story = {
  args: { id: 'gone' },
  decorators: [
    withApi({ status: HTTP_OK, body: RECORD }, problem(HTTP_NOT_FOUND, 'ERP-CORE-0004')),
  ],
  parameters: {
    nextjs: {
      navigation: { pathname: '/setup/todo/gone' },
    },
  },
};

/** Arabic layout. */
export const Rtl: Story = {
  decorators: [withApi()],
  globals: { locale: 'ar' },
};
