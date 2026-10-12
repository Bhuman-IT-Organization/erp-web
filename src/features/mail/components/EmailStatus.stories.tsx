import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, within } from 'storybook/test';
import { PageShell } from '@/components/templates/PageShell';
import type { StatusResponse } from '@/features/mail/schemas/mail.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { expectFitsShell, shellViewport, type ShellWidth } from '@/test/in-shell';
import { EmailStatus } from './EmailStatus';

// A fake axios adapter on the shared instance; synthetic hosts and addresses only (W0-05).
const LONG_HOST = 'zz-regional-operations-outbound-relay.mail.example.test';

const status = (patch: Partial<StatusResponse> = {}): StatusResponse => ({
  configured: true,
  sender: { name: 'Company 1', address: 'noreply@example.test' },
  host: LONG_HOST,
  port: 587,
  encryption: 'tls',
  server: { answering: true, since: null },
  lastSend: { id: '41', status: 'sent', at: '2026-10-03T08:00:02.000Z', failureReason: null },
  sendTest: { configured: true, recipient: 'admin@example.test' },
  ...patch,
});
const NOT_CONFIGURED = status({
  configured: false,
  sender: null,
  host: null,
  port: null,
  encryption: null,
  lastSend: null,
  sendTest: { configured: false, recipient: 'admin@example.test' },
});
const ADMIN = {
  staffId: 1,
  email: 'admin@example.test',
  firstName: 'Admin',
  lastName: 'One',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
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

function api(answer: Answer): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: 200, body: ADMIN });
    if ((config.method ?? 'get').toUpperCase() !== 'GET') {
      return respond(config, { status: 202, body: { id: '60' } });
    }
    return respond(config, answer);
  };
}

function withApi(adapter: ApiAdapter): Decorator {
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

const ok = (body: StatusResponse): Answer => ({ status: 200, body });
const DESKTOP = shellViewport(1280);
const MOBILE = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;
const PATH = { nextjs: { appDirectory: true, navigation: { pathname: '/setup/email-status' } } };

const meta = {
  title: 'Features/Mail/EmailStatus',
  component: EmailStatus,
  parameters: PATH,
  decorators: [
    withApi(api(ok(status()))),
    (Story, { parameters }) =>
      parameters.inShell === true ? (
        <Story />
      ) : (
        <div className="p-6">
          <Story />
        </div>
      ),
  ],
} satisfies Meta<typeof EmailStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the form skeleton under the title, no notice (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Error`: a retryable failure in plain words with Retry. */
export const Error: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api({
        status: 503,
        body: { type: 'about:blank', status: 503, title: 'x', code: 'ERP-UPSTREAM-0001' },
      }),
    ),
  ],
};

/** FE-27 `Loaded`: Configured, the read-only setup, the deployment caption and the test card. */
export const Loaded: Story = { ...DESKTOP };

/** Not configured: the notice, the alert badge, None, and the test disabled with its caption. */
export const NotConfigured: Story = {
  ...DESKTOP,
  decorators: [withApi(api(ok(NOT_CONFIGURED)))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('not-configured-notice')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Send a test to me' })).toBeDisabled();
  },
};

/** The mail server is not answering: the paused notice and since when. */
export const Paused: Story = {
  ...DESKTOP,
  decorators: [
    withApi(api(ok(status({ server: { answering: false, since: '2026-10-03T07:00:00.000Z' } })))),
  ],
};

/** Nothing sent yet: Last send reads "Never". */
export const NeverSent: Story = {
  ...DESKTOP,
  decorators: [withApi(api(ok(status({ lastSend: null }))))],
};

/** The last send failed: "Failed at {time}: {reason}" with the link to the entry. */
export const LastFailed: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(
        ok(
          status({
            lastSend: {
              id: '42',
              status: 'failed',
              at: '2026-10-03T08:00:00.000Z',
              failureReason: 'auth_failed',
            },
          }),
        ),
      ),
    ),
  ],
};

/** The real page in the app shell (lead 2026-10-03): the sidebar, the breadcrumb bar and the page. */
function shellStory(
  parameters: Record<string, unknown>,
  globals: Record<string, unknown>,
  play?: Story['play'],
): Story {
  return {
    render: () => (
      <PageShell>
        <EmailStatus />
      </PageShell>
    ),
    parameters: { ...parameters, inShell: true, ...PATH },
    globals,
    ...(play === undefined ? {} : { play }),
  };
}

/** At 375 in the shell: the definition list in one column, both cards full width. */
export const Mobile: Story = shellStory(
  MOBILE.parameters,
  MOBILE.globals,
  async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_HOST);
  },
);

/** Arabic in the shell: the page mirrors; host and addresses stay in <bdi>. */
export const Rtl: Story = shellStory(
  DESKTOP.parameters,
  { ...DESKTOP.globals, locale: 'ar' },
  async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_HOST);
    await expectFitsShell(canvasElement, {});
  },
);

/** The real page in the app shell with the sidebar open; the breadcrumb names the page under Email. */
function inShell(width: ShellWidth): Story {
  const viewport = shellViewport(width);
  return shellStory(viewport.parameters, viewport.globals, async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(LONG_HOST);
    const trail = within(canvas.getByTestId('breadcrumbs'));
    await expect(trail.getByText('Email')).toBeInTheDocument();
    await expect(trail.getByText('Email status')).toHaveAttribute('aria-current', 'page');
    await expectFitsShell(canvasElement, {
      short: ['Configured', 'Answering', 'Send a test to me'],
    });
  });
}

export const InShell1024: Story = inShell(1024);
export const InShell1280: Story = inShell(1280);
export const InShell1366: Story = inShell(1366);
