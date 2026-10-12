import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, within } from 'storybook/test';
import type { TestStateResponse } from '@/features/mail/schemas/mail.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { TestSend } from './TestSend';

// A fake axios adapter on the shared instance; synthetic values only (W0-05).
const EMAIL = 'user@example.test';
const state = (patch: Partial<TestStateResponse> = {}): TestStateResponse => ({
  id: '31',
  status: 'queued',
  attempts: 0,
  maxAttempts: 8,
  nextTryAt: null,
  sentAt: null,
  failureReason: null,
  recipient: EMAIL,
  waitingForServer: false,
  ...patch,
});

type Answer =
  | { readonly status: number; readonly body?: unknown; readonly headers?: Record<string, string> }
  | 'pending'
  | 'network';

function respond(config: InternalAxiosRequestConfig, answer: Answer) {
  if (answer === 'pending') return new Promise<never>(() => undefined);
  if (answer === 'network') return Promise.reject(new AxiosError('down', 'ECONNREFUSED', config));
  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(answer.headers ?? {}),
    config,
  };
  if (answer.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

/** The send answers `send`; the test's state answers `read` (a sent or failed test stops polling). */
function withApi(send: Answer, read: TestStateResponse = state()): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const adapter: ApiAdapter = (config) =>
      (config.method ?? 'get').toUpperCase() === 'GET'
        ? respond(config, { status: 200, body: read })
        : respond(config, send);
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const ACCEPTED: Answer = { status: 202, body: { id: '31' } };

const meta = {
  title: 'Features/Mail/TestSend',
  component: TestSend,
  args: {
    mode: 'template',
    templateId: '7',
    draft: { locale: 'en', subject: 'Template 1', message: 'Hello {staff_name}' },
    languageName: 'English',
    configured: true,
    recipient: EMAIL,
    variant: 'outline',
    canViewLog: true,
  },
  decorators: [
    withApi(ACCEPTED),
    (Story) => (
      <div className="max-w-xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TestSend>;

export default meta;
type Story = StoryObj<typeof meta>;

const press = async (canvasElement: HTMLElement): Promise<void> => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Send a test to me' }));
};
const lineSays =
  (text: string): NonNullable<Story['play']> =>
  async ({ canvasElement }) => {
    await press(canvasElement);
    await expect(
      await within(canvasElement).findByText(text, { exact: false }),
    ).toBeInTheDocument();
  };

/** Before a send: the caption names the language and the member's own address. */
export const Idle: Story = {};

/** Sent, not answered: "Sending test…", disabled. */
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async ({ canvasElement }) => {
    await press(canvasElement);
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Sending test…' }),
    ).toBeDisabled();
  },
};

/** Queued: the line and the link to the log entry. */
export const Queued: Story = {
  decorators: [withApi(ACCEPTED, state())],
  play: lineSays('Test email queued for'),
};

/** Retrying: when the next try is. */
export const Retrying: Story = {
  decorators: [
    withApi(
      ACCEPTED,
      state({ status: 'retrying', attempts: 1, nextTryAt: '2026-10-03T10:00:30.000Z' }),
    ),
  ],
  play: lineSays('Trying again at'),
};

/** Queued while the mail server is not answering. */
export const Waiting: Story = {
  decorators: [withApi(ACCEPTED, state({ waitingForServer: true }))],
  play: lineSays('Waiting:'),
};

/** Sent: the check and the time. */
export const Sent: Story = {
  decorators: [
    withApi(ACCEPTED, state({ status: 'sent', attempts: 1, sentAt: '2026-10-03T10:00:31.000Z' })),
  ],
  play: lineSays('Test email sent to'),
};

/** Failed: the reason in plain words. */
export const Failed: Story = {
  decorators: [
    withApi(ACCEPTED, state({ status: 'failed', attempts: 1, failureReason: 'auth_failed' })),
  ],
  play: lineSays('Test email not sent:'),
};

/** Mail is not configured: the button is disabled from the start, and the caption says why. */
export const NotConfigured: Story = { args: { configured: false } };

/** Five tests in ten minutes: the line says when to try again. */
export const TooMany: Story = {
  decorators: [
    withApi({
      status: 429,
      body: { type: 'about:blank', status: 429, title: 'x', code: 'ERP-MAIL-0007' },
      headers: { 'retry-after': '120' },
    }),
  ],
  play: lineSays('Try again in 120 seconds'),
};

/** The network failed: the kit's inline error with Retry (the same key). */
export const NetworkError: Story = {
  decorators: [withApi('network')],
  play: async ({ canvasElement }) => {
    await press(canvasElement);
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
  },
};

/** The status page's form: primary, its own caption, no draft. */
export const StatusPage: Story = {
  args: { mode: 'status', variant: 'default', canViewLog: true },
};

/** The Arabic interface: the address stays left to right in <bdi>. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  decorators: [withApi(ACCEPTED, state())],
  play: async ({ canvasElement }) => {
    await press(canvasElement);
    await within(canvasElement).findByRole('link');
  },
};
