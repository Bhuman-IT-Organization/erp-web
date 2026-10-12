import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { expect, userEvent, within } from 'storybook/test';
import { Toaster } from '@/components/ui/sonner';
import type { ApiAdapter } from '@/lib/api/call-api';
import { forgetLegacySession } from '@/lib/auth/legacy-session';
import { LoginForm } from './LoginForm';

// The same seams the tests use: a fake transport in place of the network, and
// no-op doubles for the cookie write and the legacy handoff — nothing in Storybook navigates.
const noopWriteLocale = (): void => undefined;
const noopHandoff = (): Promise<boolean> => Promise.resolve(false);
const noopRoute = (): void => undefined;

// Neutral fixture credentials (zod 4's `z.email()` wants a two-letter TLD at least).
const EMAIL = 'a@b.co';
const PASSWORD = 'pw';
const HTTP_SERVICE_UNAVAILABLE = 503;

const HTTP_OK = 200;
const LOGIN_OK = {
  accessToken: 'story-access',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'story-csrf',
  user: { staffId: 7, email: EMAIL, firstName: 'A', lastName: 'B', isAdmin: false },
};

/** A transport that signs in: the login answers 200 with a session. */
const signedInAdapter: ApiAdapter = (config: InternalAxiosRequestConfig) =>
  Promise.resolve({
    data: LOGIN_OK,
    status: HTTP_OK,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  });

/** A transport that never answers: the form stays in its submitting state. */
const pendingAdapter: ApiAdapter = () => new Promise(() => undefined);

/** A transport answering every request with a problem-details body of `status`/`code`. */
function problemAdapter(status: number, code: string): ApiAdapter {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError(
        `Request failed with status code ${String(status)}`,
        'ERR_BAD_RESPONSE',
        config,
        null,
        {
          data: { type: 'about:blank', status, title: code, code },
          status,
          statusText: String(status),
          headers: new AxiosHeaders(),
          config,
        },
      ),
    );
}

const meta = {
  title: 'Features/Auth/LoginForm',
  component: LoginForm,
  args: { next: '/admin/', writeLocale: noopWriteLocale, handoff: noopHandoff, route: noopRoute },
  // LoginForm reads the app router (a Node `next` is entered through it); `route` stubs the push.
  parameters: { nextjs: { appDirectory: true } },
  // The shared handoff flight is module state shared by every story in the iframe.
  beforeEach: () => {
    forgetLegacySession();
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md bg-white p-8">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The form as `/login` renders it, before any interaction. */
export const Default: Story = {};

/** The same under `ar`: RTL mirror through the toolbar decorator, labels from `ar.json`. */
export const Arabic: Story = {
  globals: { locale: 'ar' },
};

/** FE-27 `Pending`: submitted, the transport has not answered; the submit button is disabled. */
export const Pending: Story = {
  args: { adapter: pendingAdapter },
  play: async ({ canvasElement }) => {
    await fillAndSubmit(canvasElement);
    await expect(submitButton(canvasElement)).toBeDisabled();
  },
};

/** FE-27 `FieldErrors`: submitted empty; the zod keys render as two `role="alert"` lines. */
export const FieldErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(submitButton(canvasElement));
    const alerts = await canvas.findAllByRole('alert');
    await expect(alerts).toHaveLength(2);
  },
};

/** FE-27 `ServerError`: a 503 `ERP-UPSTREAM-0001`; the error line and the "Try again" button. */
export const ServerError: Story = {
  args: { adapter: problemAdapter(HTTP_SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await fillAndSubmit(canvasElement);
    await expect(await canvas.findByTestId('login-error')).toBeVisible();
    await expect(canvas.getByTestId('login-retry')).toBeVisible();
  },
};

/**
 * Quick 261009-lgn: a sign-in into a Node page whose background handoff failed. The member is not
 * held on the form (Storybook stubs the router, so the form stays behind); the notice is a toast
 * with `handoff_failed` and Retry, and no `role="alert"` line appears in the form.
 */
export const NodeNextHandoffFailed: Story = {
  args: { next: '/setup/taxes', adapter: signedInAdapter },
  play: async ({ canvasElement }) => {
    await fillAndSubmit(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('button', { name: /retry|إعادة/i })).toBeVisible();
    await expect(within(canvasElement).queryByTestId('login-error')).toBeNull();
  },
};

/** The same under `ar`. */
export const NodeNextHandoffFailedRtl: Story = {
  ...NodeNextHandoffFailed,
  globals: { locale: 'ar' },
};

// The fields and the button are found by id / type, never by their (translated) label text.
function mustFind(root: HTMLElement, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (el === null) throw new Error(`missing ${selector}`);
  return el;
}

function submitButton(root: HTMLElement): HTMLElement {
  return mustFind(root, '[data-testid="login-form"] button[type="submit"]');
}

async function fillAndSubmit(canvasElement: HTMLElement): Promise<void> {
  await userEvent.type(mustFind(canvasElement, '#login-email'), EMAIL);
  await userEvent.type(mustFind(canvasElement, '#login-password'), PASSWORD);
  await userEvent.click(submitButton(canvasElement));
}
