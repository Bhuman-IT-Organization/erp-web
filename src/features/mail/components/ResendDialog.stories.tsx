import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { ResendDialog } from './ResendDialog';

// A fake axios adapter on the shared instance; a synthetic address only (W0-05).
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

function withApi(write: Answer): Decorator {
  const adapter: ApiAdapter = (config) => respond(config, write);
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

const meta = {
  title: 'Features/Mail/ResendDialog',
  component: ResendDialog,
  args: {
    entry: { id: '41', recipient: 'user@example.test', templateActive: true },
    open: true,
    onOpenChange: () => undefined,
    onResent: () => undefined,
  },
  decorators: [withApi({ status: 202, body: { id: '42' } })],
} satisfies Meta<typeof ResendDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The confirmation: the recipient named, what is sent, Back to the log and Resend email. */
export const Open: Story = {};

/** While the request is in flight: "Resending email…", both buttons disabled. */
export const Pending: Story = {
  decorators: [withApi('pending')],
  play: async () => {
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resend email' }));
    await expect(
      await within(dialog).findByRole('button', { name: 'Resending email…' }),
    ).toBeDisabled();
  },
};

/** The template is switched off: refused before any request. */
export const RefusedInactive: Story = {
  args: { entry: { id: '41', recipient: 'user@example.test', templateActive: false } },
  play: async () => {
    const dialog = await screen.findByTestId('confirm-dialog');
    await expect(within(dialog).getByRole('button', { name: 'Resend email' })).toBeDisabled();
  },
};

/** A live refusal: the email is still waiting to be sent. */
export const RefusedLive: Story = {
  decorators: [
    withApi({
      status: 409,
      body: { type: 'about:blank', status: 409, title: 'x', code: 'ERP-MAIL-0006' },
    }),
  ],
  play: async () => {
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resend email' }));
    await waitFor(async () => {
      await expect(dialog).toHaveTextContent('still waiting to be sent');
    });
  },
};

/** Arabic: the dialog mirrors; the address stays isolated left to right. */
export const Rtl: Story = { globals: { locale: 'ar' } };
