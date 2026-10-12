import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, userEvent, within } from 'storybook/test';
import { PageShell } from '@/components/templates/PageShell';
import type { SentEmailResponse, TemplateListItem } from '@/features/mail/schemas/mail.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { expectFitsShell, shellViewport, type ShellWidth } from '@/test/in-shell';
import { SentEmailDetail } from './SentEmailDetail';

// A fake axios adapter on the shared instance; synthetic entries and made-up long values only (W0-05).
const LONG_ADDRESS = 'zz.regional.operations.field.service.team@example.test';
const REPLY =
  '550 5.1.1 synthetic: the mailbox zz.regional.operations.field.service.team@example.test does not exist\nsynthetic-mx.example.test rejected the recipient';

const record = (patch: Partial<SentEmailResponse> = {}): SentEmailResponse => ({
  id: '41',
  templateKey: 'attendance_notice',
  isTest: false,
  recipient: 'user@example.test',
  locale: 'en',
  status: 'sent',
  attempts: 1,
  maxAttempts: 8,
  nextTryAt: null,
  queuedAt: '2026-10-03T08:00:00.000Z',
  sentAt: '2026-10-03T08:00:02.000Z',
  failureReason: null,
  templateActive: true,
  waitingForServer: false,
  serverReply: null,
  resentFromId: null,
  resentFromExists: false,
  ...patch,
});
const FAILED = record({
  status: 'failed',
  attempts: 8,
  sentAt: null,
  failureReason: 'recipient_refused',
  serverReply: REPLY,
  recipient: LONG_ADDRESS,
  locale: 'ar',
});
const TEMPLATE: TemplateListItem = {
  id: '7',
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: true,
  locales: ['en', 'ar'],
};
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

function api(entry: Answer): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: 200, body: ADMIN });
    if ((config.method ?? 'get').toUpperCase() !== 'GET') {
      return respond(config, { status: 202, body: { id: '58' } });
    }
    if (path === '/api/v1/mail/templates') {
      return respond(config, {
        status: 200,
        body: {
          data: [TEMPLATE],
          meta: { nextCursor: null, prevCursor: null, total: 1, modules: [], locales: ['en'] },
        },
      });
    }
    return respond(config, entry);
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

const ok = (body: SentEmailResponse): Answer => ({ status: 200, body });
const DESKTOP = shellViewport(1280);
const MOBILE = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;
const PATH = { nextjs: { appDirectory: true, navigation: { pathname: '/setup/sent-emails/41' } } };

const meta = {
  title: 'Features/Mail/SentEmailDetail',
  component: SentEmailDetail,
  args: { id: '41' },
  parameters: PATH,
  decorators: [
    withApi(api(ok(record()))),
    (Story, { parameters }) =>
      parameters.inShell === true ? (
        <Story />
      ) : (
        <div className="p-6">
          <Story />
        </div>
      ),
  ],
} satisfies Meta<typeof SentEmailDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the form skeleton, no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Error`: a retryable failure in plain words with Retry and Back to list. */
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

/** FE-27 `Loaded`: the title with its status, the definition list, Back to list and Resend. */
export const Loaded: Story = { ...DESKTOP };

/** Gone (the 12-month retention): "This sent email no longer exists." */
export const NotFound: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api({
        status: 404,
        body: { type: 'about:blank', status: 404, title: 'x', code: 'ERP-CORE-0004' },
      }),
    ),
  ],
};

/** Failed: the reason sentence and the collapsed "Details from the mail server". */
export const Failed: Story = { ...DESKTOP, decorators: [withApi(api(ok(FAILED)))] };

/** The server's reply opened: its own words as text, line breaks kept. */
export const ServerReplyOpen: Story = {
  ...DESKTOP,
  decorators: [withApi(api(ok(FAILED)))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Details from the mail server'));
    await expect(canvas.getByText(/550 5\.1\.1 synthetic/)).toBeVisible();
  },
};

/** Retrying: Next try, the reason, and the page re-reading itself every 2 s. */
export const Retrying: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(
        ok(
          record({
            status: 'retrying',
            attempts: 2,
            sentAt: null,
            nextTryAt: '2026-10-03T08:05:00.000Z',
            failureReason: 'timeout',
          }),
        ),
      ),
    ),
  ],
};

/** A resend: "An earlier email" links to the original entry. */
export const Resent: Story = {
  ...DESKTOP,
  decorators: [withApi(api(ok(record({ resentFromId: '30', resentFromExists: true }))))],
};

/** A template test: the Test badge and no Resend. */
export const Test: Story = {
  ...DESKTOP,
  decorators: [withApi(api(ok(record({ isTest: true, templateActive: null }))))],
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
        <SentEmailDetail id="41" />
      </PageShell>
    ),
    decorators: [withApi(api(ok(FAILED)))],
    parameters: { ...parameters, inShell: true, ...PATH },
    globals,
    ...(play === undefined ? {} : { play }),
  };
}

/** At 375 in the shell: one-column definition list, the buttons wrapping. */
export const Mobile: Story = shellStory(
  MOBILE.parameters,
  MOBILE.globals,
  async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_ADDRESS);
  },
);

/** Arabic in the shell: the page mirrors; the address and the reply stay in <bdi>. */
export const Rtl: Story = shellStory(
  DESKTOP.parameters,
  { ...DESKTOP.globals, locale: 'ar' },
  async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_ADDRESS);
    await expectFitsShell(canvasElement, {});
  },
);

/** The real page in the app shell with the sidebar open and a long made-up address. */
function inShell(width: ShellWidth): Story {
  const viewport = shellViewport(width);
  return shellStory(viewport.parameters, viewport.globals, async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_ADDRESS);
    const trail = within(within(canvasElement).getByTestId('breadcrumbs'));
    await expect(trail.getByText('Email')).toBeInTheDocument();
    await expect(trail.getByText('Sent emails')).toHaveAttribute('href', '/setup/sent-emails');
    await expect(trail.getByText('Attendance notice')).toHaveAttribute('aria-current', 'page');
    await expectFitsShell(canvasElement, { short: ['Failed', '8 of 8'] });
  });
}

export const InShell1024: Story = inShell(1024);
export const InShell1280: Story = inShell(1280);
export const InShell1366: Story = inShell(1366);
