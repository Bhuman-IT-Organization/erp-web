import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { PageShell } from '@/components/templates/PageShell';
import type { SentEmailRow } from '@/features/mail/schemas/mail.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { expectFitsShell, shellViewport, type ShellWidth } from '@/test/in-shell';
import { SentEmailsList } from './SentEmailsList';

// A fake axios adapter on the shared instance; synthetic entries and made-up long values only (W0-05).
const LONG_ADDRESS = 'zz.regional.operations.field.service.team@example.test';
const LONG_KEY = 'zz_mod_a_weekly_summary_of_overtime_requests_waiting_for_approval';

const entry = (id: number, patch: Partial<SentEmailRow> = {}): SentEmailRow => ({
  id: String(id),
  templateKey: 'attendance_notice',
  isTest: false,
  recipient: `user${String(id)}@example.test`,
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
  ...patch,
});
const ROWS: readonly SentEmailRow[] = [
  entry(41),
  entry(42, {
    status: 'failed',
    attempts: 8,
    sentAt: null,
    failureReason: 'recipient_refused',
    locale: 'ar',
    recipient: LONG_ADDRESS,
  }),
  entry(43, {
    status: 'retrying',
    attempts: 2,
    sentAt: null,
    nextTryAt: '2026-10-03T08:05:00.000Z',
    templateKey: 'remind_user_check_in',
  }),
  entry(44, { isTest: true, templateActive: null }),
  entry(45, { isTest: true, templateKey: null, templateActive: null }),
  entry(46, { status: 'failed', templateActive: false, sentAt: null, templateKey: LONG_KEY }),
  entry(47, {
    status: 'queued',
    attempts: 0,
    sentAt: null,
    templateKey: 'new_leave_application_send_to_notification_recipient',
  }),
];
const listPage = (rows: readonly SentEmailRow[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    templates: ['attendance_notice', 'remind_user_check_in', LONG_KEY],
  },
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

function api(list: Answer, write: Answer = { status: 202, body: { id: '99' } }): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: 200, body: ADMIN });
    if ((config.method ?? 'get').toUpperCase() !== 'GET') return respond(config, write);
    return respond(config, list);
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

const LOADED: Answer = { status: 200, body: listPage(ROWS) };
const DESKTOP = shellViewport(1280);
const MOBILE = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;
const PATH = { nextjs: { appDirectory: true, navigation: { pathname: '/setup/sent-emails' } } };
const FILTERED =
  '?filter[template][in]=attendance_notice,status-test&filter[status][in]=failed,sent&filter[queuedAt][gte]=2026-10-01&filter[queuedAt][lte]=2026-10-03';

const meta = {
  title: 'Features/Mail/SentEmailsList',
  component: SentEmailsList,
  parameters: PATH,
  decorators: [
    withApi(api(LOADED)),
    (Story, { parameters }) =>
      parameters.inShell === true ? (
        <Story />
      ) : (
        <div className="p-6">
          <Story />
        </div>
      ),
  ],
} satisfies Meta<typeof SentEmailsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens the row menu of the entry sent to `recipient` and picks Resend. */
async function openResend(canvasElement: HTMLElement, recipient: string): Promise<HTMLElement> {
  const canvas = within(canvasElement);
  const row = (await canvas.findByText(recipient)).closest('tr');
  if (row === null) throw new globalThis.Error(`no row for ${recipient}`);
  await userEvent.click(
    within(row).getByRole('button', { name: (label) => label.startsWith('Actions for') }),
  );
  await userEvent.click(
    await screen.findByRole('menuitem', { name: `Resend email to ${recipient}` }),
  );
  return screen.findByTestId('confirm-dialog');
}

/** FE-27 `Loading`: the list skeleton with the filter row of four triggers, no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Empty`: "No emails sent yet", no action. */
export const Empty: Story = {
  ...DESKTOP,
  decorators: [withApi(api({ status: 200, body: listPage([]) }))],
};

/** A Status filter matching nothing: the kit's no-match heading and Clear search and filters. */
export const NoResults: Story = {
  ...DESKTOP,
  decorators: [withApi(api({ status: 200, body: listPage([]) }))],
  parameters: { ...PATH, nuqs: { searchParams: '?filter[status][in]=retrying' } },
};

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

/** FE-27 `Loaded` at 1280: the captions, the four filters, the six columns, a quiet View. */
export const Loaded: Story = { ...DESKTOP };

/** The four filters from a permalink: Template (with Test email), Status and the two days. */
export const WithFilters: Story = {
  ...DESKTOP,
  parameters: { ...PATH, nuqs: { searchParams: FILTERED } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('user41@example.test');
    await expect(canvas.getByRole('combobox', { name: 'Template' })).toHaveTextContent(
      'Template (2)',
    );
    await expect(canvas.getByLabelText('From date')).toHaveValue('2026-10-01');
    await expect(canvas.getByLabelText('To date')).toHaveValue('2026-10-03');
  },
};

/** Below md the four filters sit in the Filters sheet, the days full width. */
export const FiltersMobileSheet: Story = {
  ...MOBILE,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Filters' }));
    const sheet = await screen.findByRole('dialog');
    await expect(within(sheet).getByRole('combobox', { name: 'Template' })).toBeInTheDocument();
    await expect(within(sheet).getByLabelText('To date')).toHaveAttribute('type', 'date');
  },
};

/** Retrying: the pending badge with "Next try at {time}" under it. */
export const Retrying: Story = {
  ...DESKTOP,
  decorators: [withApi(api({ status: 200, body: listPage(ROWS.slice(2, 3)) }))],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/^Next try at /)).toBeInTheDocument();
  },
};

/** Failed: the alert badge (never red), and Resend in the row menu. */
export const Failed: Story = {
  ...DESKTOP,
  decorators: [withApi(api({ status: 200, body: listPage(ROWS.slice(1, 2)) }))],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Failed')).toBeInTheDocument();
  },
};

/** A template test with the Test badge; a status-page test reads "Test email". No Resend on either. */
export const TestEntry: Story = {
  ...DESKTOP,
  decorators: [withApi(api({ status: 200, body: listPage(ROWS.slice(3, 5)) }))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Test email')).toBeInTheDocument();
    await expect(canvas.getByTestId('test-badge')).toHaveTextContent('Test');
  },
};

/** Resend asks first, naming the recipient. */
export const ResendDialog: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openResend(canvasElement, 'user41@example.test');
    await waitFor(async () => {
      await expect(dialog).toHaveTextContent('Resend this email to');
    });
    await expect(within(dialog).getByRole('button', { name: 'Resend email' })).toBeEnabled();
  },
};

/** The row says the template is off: refused up front, Resend email disabled. */
export const ResendRefusedInactive: Story = {
  ...DESKTOP,
  play: async ({ canvasElement }) => {
    const dialog = await openResend(canvasElement, 'user46@example.test');
    await waitFor(async () => {
      await expect(dialog).toHaveTextContent('This template is switched off');
    });
    await expect(within(dialog).getByRole('button', { name: 'Resend email' })).toBeDisabled();
  },
};

/** A live 409: the record the email was about is gone; the refusal stays in the dialog. */
export const ResendRefusedLive: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, {
        status: 409,
        body: { type: 'about:blank', status: 409, title: 'x', code: 'ERP-MAIL-0005' },
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await openResend(canvasElement, 'user41@example.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resend email' }));
    await waitFor(async () => {
      await expect(dialog).toHaveTextContent('The record this email was about no longer exists');
    });
    await expect(within(dialog).getByRole('button', { name: 'Resend email' })).toBeDisabled();
  },
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
        <SentEmailsList />
      </PageShell>
    ),
    parameters: { ...parameters, inShell: true, ...PATH },
    globals,
    ...(play === undefined ? {} : { play }),
  };
}

/** At 375 in the shell: When, Template, Status and the row menu; the filters in one button. */
export const Mobile: Story = shellStory(
  MOBILE.parameters,
  MOBILE.globals,
  async ({ canvasElement }) => {
    await expect(
      (await within(canvasElement).findAllByText('Attendance notice')).length,
    ).toBeGreaterThan(0);
  },
);

/** Arabic in the shell: the page mirrors; addresses and keys stay in <bdi>. */
export const Rtl: Story = shellStory(
  DESKTOP.parameters,
  { ...DESKTOP.globals, locale: 'ar' },
  async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_ADDRESS);
    await expectFitsShell(canvasElement, { long: [LONG_ADDRESS, LONG_KEY] });
  },
);

/** The real page in the app shell with the sidebar open and long made-up values. */
function inShell(width: ShellWidth): Story {
  const viewport = shellViewport(width);
  return shellStory(viewport.parameters, viewport.globals, async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_ADDRESS);
    const trail = within(within(canvasElement).getByTestId('breadcrumbs'));
    await expect(trail.getByText('Email')).toBeInTheDocument();
    await expect(trail.getByText('Sent emails')).toHaveAttribute('aria-current', 'page');
    await expectFitsShell(canvasElement, {
      short: ['Remind user check in', 'Test email', 'Retrying'],
      long: [LONG_ADDRESS, LONG_KEY],
      headers: ['When', 'Template', 'Recipient', 'Language', 'Status', 'Attempts'],
    });
  });
}

export const InShell1024: Story = inShell(1024);
export const InShell1280: Story = inShell(1280);
export const InShell1366: Story = inShell(1366);
