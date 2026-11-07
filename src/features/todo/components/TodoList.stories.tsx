import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import en from '../messages/en.json';
import { TodosList } from './TodoList';

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const HTTP_SERVICE_UNAVAILABLE = 503;

const UNFINISHED = [
  {
    id: '1',
    description: 'Review pending tasks',
    finished: false,
    dateAdded: '2026-11-01T10:00:00.000Z',
    dateFinished: null,
  },
  {
    id: '2',
    description: 'Prepare project report',
    finished: false,
    dateAdded: '2026-11-02T10:00:00.000Z',
    dateFinished: null,
  },
];

const FINISHED = [
  {
    id: '3',
    description: 'Complete documentation',
    finished: true,
    dateAdded: '2026-10-28T10:00:00.000Z',
    dateFinished: '2026-11-03T10:00:00.000Z',
  },
];

type TodoRow = (typeof UNFINISHED)[number] | (typeof FINISHED)[number];

type Answer =
  | {
      readonly status: number;
      readonly body?: unknown;
    }
  | 'pending';

const page = (rows: readonly TodoRow[], nextCursor: string | null = null) => ({
  data: rows,
  meta: {
    nextCursor,
    total: rows.length,
  },
});

const problem = (status: number, code: string): Answer => ({
  status,
  body: {
    type: 'about:blank',
    status,
    title: code,
    code,
  },
});

function respond(config: InternalAxiosRequestConfig, answer: Answer) {
  if (answer === 'pending') {
    return new Promise<never>(() => undefined);
  }

  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(),
    config,
  };

  if (answer.status < 300) {
    return Promise.resolve(response);
  }

  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

function withApi(
  unfinished: Answer = {
    status: HTTP_OK,
    body: page(UNFINISHED),
  },
  finished: Answer = {
    status: HTTP_OK,
    body: page(FINISHED),
  },
  mutation: Answer = { status: HTTP_OK },
  remove: Answer = { status: HTTP_NO_CONTENT },
): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });

    const adapter: ApiAdapter = (config) => {
      const method = (config.method ?? 'get').toUpperCase();
      const url = config.url ?? '';

      if (method === 'DELETE') {
        return respond(config, remove);
      }

      if (method === 'PATCH') {
        return respond(config, mutation);
      }

      if (url.includes('status=finished')) {
        return respond(config, finished);
      }

      return respond(config, unfinished);
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

const meta = {
  title: 'Features/Todo/TodosList',
  component: TodosList,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/setup/todo' },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TodosList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both panels show their loading skeleton while the API response is pending. */
export const Loading: Story = {
  decorators: [withApi('pending', 'pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('todos-unfinished')).toBeVisible();

    await expect(await canvas.findByTestId('todos-finished')).toBeVisible();
  },
};

/** Both panels show their empty messages when no records exist. */
export const Empty: Story = {
  decorators: [withApi({ status: HTTP_OK, body: page([]) }, { status: HTTP_OK, body: page([]) })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('todos-empty-unfinished')).toHaveTextContent(
      en.todo.empty_unfinished,
    );

    await expect(await canvas.findByTestId('todos-empty-finished')).toHaveTextContent(
      en.todo.empty_finished,
    );
  },
};

/** Both panels display their own records. */
export const Loaded: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Review pending tasks')).toBeVisible();

    await expect(await canvas.findByText('Complete documentation')).toBeVisible();

    await expect(canvas.getByTestId('todos-unfinished')).toBeVisible();

    await expect(canvas.getByTestId('todos-finished')).toBeVisible();
  },
};

/** A failed request displays the retry action in the affected panel. */
export const Error: Story = {
  decorators: [
    withApi(problem(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'), {
      status: HTTP_OK,
      body: page(FINISHED),
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = await canvas.findByTestId('todos-unfinished');

    await expect(within(panel).getByRole('button', { name: 'Retry' })).toBeVisible();

    await expect(await canvas.findByText('Complete documentation')).toBeVisible();
  },
};

/** Checking an unfinished to do sends the finish request. */
export const FinishTodo: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const checkbox = await canvas.findByRole('checkbox', {
      name: en.todo.mark_finished,
    });

    await userEvent.click(checkbox);

    await expect(checkbox).toBeChecked();
  },
};

/** Delete opens a confirmation dialog before sending the delete request. */
export const DeleteConfirm: Story = {
  decorators: [withApi()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const description = await canvas.findByText('Review pending tasks');
    const row = description.closest<HTMLElement>('[data-testid="todo-row"]');

    if (!(row instanceof HTMLElement)) {
      throw new globalThis.Error('Todo row not found');
    }

    await userEvent.click(
      within(row).getByRole('button', {
        name: en.todo.delete_action_named.replace('{name}', 'Review pending tasks'),
      }),
    );

    const dialog = await within(document.body).findByTestId('confirm-dialog');

    if (!dialog.isConnected) {
      throw new globalThis.Error('Confirmation dialog not found');
    }

    await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeEnabled();
  },
};

/** The API can refuse deletion with a conflict response. */
export const DeleteRefused: Story = {
  decorators: [withApi(undefined, undefined, undefined, problem(HTTP_CONFLICT, 'ERP-CORE-0004'))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const description = await canvas.findByText('Review pending tasks');
    const row = description.closest<HTMLElement>('[data-testid="todo-row"]');

    if (row === null) {
      throw new globalThis.Error('Todo row not found');
    }

    await userEvent.click(
      within(row).getByRole('button', {
        name: en.todo.delete_action_named.replace('{name}', 'Review pending tasks'),
      }),
    );

    const dialog = await within(document.body).findByTestId('confirm-dialog');

    await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));

    await expect(await within(dialog).findByTestId('confirm-dialog-error')).toBeVisible();
  },
};

/** The unfinished panel loads another page when Load more is clicked. */
export const LoadMore: Story = {
  decorators: [
    withApi(
      {
        status: HTTP_OK,
        body: page(UNFINISHED.slice(0, 1), 'next-page'),
      },
      {
        status: HTTP_OK,
        body: page(FINISHED),
      },
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await canvas.findByText('Review pending tasks');

    await userEvent.click(
      await canvas.findByRole('button', {
        name: en.todo.load_more,
      }),
    );
  },
};

/** At mobile width, both panels stack vertically. */
export const Mobile: Story = {
  decorators: [withApi()],
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
  globals: {
    viewport: { value: 'mobile375', isRotated: false },
  },
};

/** Arabic locale with RTL layout. */
export const Rtl: Story = {
  decorators: [withApi()],
  globals: { locale: 'ar' },
};
