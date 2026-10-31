// Storybook examples for the Lead Statuses form.

import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';

import { LeadStatusesForm } from './LeadStatusesForm';

const RECORD = {
  id: '7',
  name: 'Interested',
  statusorder: 2,
  color: '#28B8DA',
  isdefault: 0,
  isConfiguredDefault: false,
  usage: {
    leads: 0,
    lastLeadStatus: 0,
    emailIntegration: 0,
    webToLead: 0,
  },
};

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';

function problem(status: number, code: string, issues?: unknown): Answer {
  return {
    status,
    body: {
      type: 'about:blank',
      status,
      title: code,
      code,
      ...(issues === undefined ? {} : { issues }),
    },
  };
}

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

  return Promise.reject(
    new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response),
  );
}

function withApi(
  save: Answer = { status: 201, body: RECORD },
  read: Answer = { status: 200, body: RECORD },
): Decorator {
  return function ApiDecorator(Story) {
    setSession({
      accessToken: 'story',
      csrfToken: 'story',
    });

    const adapter: ApiAdapter = (config) => {
      const isRead = (config.method ?? 'get').toUpperCase() === 'GET';

      return respond(config, isRead ? read : save);
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
  title: 'Features/LeadStatuses/LeadStatusesForm',
  component: LeadStatusesForm,
  args: {
    id: null,
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/setup/lead-statuses/new',
      },
    },
  },
} satisfies Meta<typeof LeadStatusesForm>;

export default meta;

type Story = StoryObj<typeof meta>;

async function fillAndSubmit(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);

  const input = await canvas.findByRole('textbox', {
    name: 'Status Name',
  });

  await userEvent.type(input, 'New status');

  await userEvent.click(
    canvas.getByRole('button', {
      name: 'Create lead status',
    }),
  );
}

async function confirmSave(): Promise<HTMLElement> {
  const dialog = await within(document.body).findByTestId('confirm-dialog');

  const confirm = within(dialog).getByTestId('confirm-dialog-confirm');

  await waitFor(async () => {
    await expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
  });

  await userEvent.click(confirm);

  return dialog;
}

// Normal Add form
export const Default: Story = {
  decorators: [withApi()],
};

// Existing status form
export const Edit: Story = {
  args: {
    id: '7',
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/setup/lead-statuses/7',
      },
    },
  },
  decorators: [withApi()],
};

// Loading an existing status
export const Loading: Story = {
  args: {
    id: '7',
  },
  decorators: [withApi(undefined, 'pending')],
};

// FE-27: Save request has not finished
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await fillAndSubmit(canvasElement);
    const dialog = await confirmSave();

    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-confirm')).toBeDisabled();
    });
  },
};

// FE-27: Backend returns field validation errors
export const FieldErrors: Story = {
  decorators: [
    withApi(
      problem(400, 'ERP-VALIDATION-0001', [
        {
          path: ['name'],
          message: 'Name is invalid',
        },
      ]),
    ),
  ],
  play: async ({ canvasElement }) => {
    await fillAndSubmit(canvasElement);
    await confirmSave();

    await within(canvasElement).findByTestId('error-summary');
  },
};

// FE-27: Backend is temporarily unavailable
export const ServerError: Story = {
  decorators: [withApi(problem(503, 'ERP-UPSTREAM-0001'))],
  play: async ({ canvasElement }) => {
    await fillAndSubmit(canvasElement);
    const dialog = await confirmSave();

    await within(dialog).findByTestId('confirm-dialog-error');
  },
};

/** Form displayed at a mobile viewport of 375px. */
export const Mobile: Story = {
  args: { id: '7' },
  decorators: [withApi()],
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/setup/lead-statuses/7',
      },
    },
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
};

/** Arabic locale for checking right-to-left form layout. */
export const Rtl: Story = {
  decorators: [withApi()],
  globals: { locale: 'ar' },
};
