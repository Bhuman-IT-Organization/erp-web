import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { PageShell } from '@/components/templates/PageShell';
import type { TemplateListItem } from '@/features/mail/schemas/mail.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { expectFitsShell, shellViewport, type ShellWidth } from '@/test/in-shell';
import { EmailTemplatesList } from './EmailTemplatesList';

// A fake axios adapter on the shared instance; synthetic rows and made-up long values only (W0-05).
const LONG_KEY = 'zz_mod_a_weekly_summary_of_overtime_requests_waiting_for_approval';
const LONG_MODULE = 'zz_mod_a_regional_operations_and_field_service';
const LEAVE_NAME = 'New application (Send to notification recipient)';

const template = (id: number, patch: Partial<TemplateListItem> = {}): TemplateListItem => ({
  id: String(id),
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: true,
  locales: ['en', 'ar'],
  ...patch,
});
const ROWS: readonly TemplateListItem[] = [
  template(1),
  template(2, { key: 'remind_user_check_in', locales: ['en'], active: false }),
  template(3, { key: 'send_request_approval', audience: 'staff_or_contact' }),
  template(4, {
    key: 'new_leave_application_send_to_notification_recipient',
    audience: 'contact',
    locales: ['ar'],
  }),
  template(5, { key: LONG_KEY, module: LONG_MODULE, audience: null, locales: [] }),
];
const listPage = (rows: readonly TemplateListItem[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    modules: ['timesheets', LONG_MODULE],
    locales: ['en', 'ar'],
  },
});
const member = (isAdmin: boolean, permissions: readonly string[]) => ({
  staffId: 1,
  email: 'user@example.test',
  firstName: 'Admin',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});
const ADMIN = member(true, []);

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

function api(list: Answer, write: Answer = { status: 204 }, me: unknown = ADMIN): ApiAdapter {
  return (config) => {
    const path = (config.url ?? '').split('?')[0] ?? '';
    if (path === '/api/v1/auth/me') return respond(config, { status: 200, body: me });
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
const TIMESHEETS: Answer = { status: 200, body: listPage(ROWS.slice(0, 4)) };
const DESKTOP = shellViewport(1280);
const MOBILE = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;
const PATH = { nextjs: { appDirectory: true, navigation: { pathname: '/setup/email-templates' } } };

const meta = {
  title: 'Features/Mail/EmailTemplatesList',
  component: EmailTemplatesList,
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
} satisfies Meta<typeof EmailTemplatesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** FE-27 `Loading`: the list skeleton with the filter row, no message (D-39). */
export const Loading: Story = { decorators: [withApi(api('pending'))] };

/** FE-27 `Empty`: "No email templates yet", with Perfex's list one link away in the notice. */
export const Empty: Story = {
  ...DESKTOP,
  decorators: [withApi(api({ status: 200, body: listPage([]) }))],
};

/** A Module filter matching nothing: the kit's no-match heading and Clear search and filters. */
export const NoResults: Story = {
  ...DESKTOP,
  decorators: [withApi(api({ status: 200, body: listPage([]) }))],
  parameters: { ...PATH, nuqs: { searchParams: '?filter[module][in]=zz_mod_b' } },
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

/** FE-27 `Loaded` at 1280: the notice, the filters, Perfex's columns, the switch and a quiet Edit. */
export const Loaded: Story = { ...DESKTOP };

/** A member with the view code only: Active and Inactive badges, no switch, no group buttons. */
export const ViewOnly: Story = {
  ...DESKTOP,
  decorators: [
    withApi(api(LOADED, { status: 204 }, member(false, ['settings.emailTemplates.view']))),
  ],
};

/** One module in the filter: Enable All and Disable All, both outline, before the table. */
export const ModuleFiltered: Story = {
  ...DESKTOP,
  decorators: [withApi(api(TIMESHEETS, { status: 200, body: { changed: 1 } }))],
  parameters: { ...PATH, nuqs: { searchParams: '?filter[module][in]=timesheets' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Enable All' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Disable All' })).toBeInTheDocument();
  },
};

/** Disable All asks first, naming the count and the module. */
export const DisableAllDialog: Story = {
  ...DESKTOP,
  decorators: [withApi(api(TIMESHEETS, { status: 200, body: { changed: 4 } }))],
  parameters: { ...PATH, nuqs: { searchParams: '?filter[module][in]=timesheets' } },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', { name: 'Disable All' }),
    );
    const dialog = await screen.findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(dialog).toHaveTextContent('Stop sending 4 Timesheets emails?');
    });
    await expect(
      within(dialog).getByRole('button', { name: 'Keep templates active' }),
    ).toBeInTheDocument();
  },
};

/** The switch is disabled and busy while its write is in flight. */
export const SwitchPending: Story = {
  ...DESKTOP,
  decorators: [withApi(api(LOADED, 'pending'))],
  play: async ({ canvasElement }) => {
    const toggle = await within(canvasElement).findByRole('switch', {
      name: 'Active: Remind user check in',
    });
    await userEvent.click(toggle);
    await waitFor(async () => {
      await expect(toggle).toHaveAttribute('aria-busy', 'true');
    });
  },
};

/** A failed switch goes back and says so beside it. */
export const SwitchFailed: Story = {
  ...DESKTOP,
  decorators: [
    withApi(
      api(LOADED, {
        status: 503,
        body: { type: 'about:blank', status: 503, title: 'x', code: 'ERP-UPSTREAM-0001' },
      }),
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('switch', { name: 'Active: Remind user check in' }),
    );
    await expect(await canvas.findByText('Not saved. Try again.')).toBeInTheDocument();
  },
};

/** A supported language without a version: the alert badge "Arabic missing". */
export const TranslationMissing: Story = {
  ...shellViewport(1366),
  decorators: [withApi(api({ status: 200, body: listPage(ROWS.slice(1, 2)) }))],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Arabic missing')).toBeInTheDocument();
  },
};

/** Below md the three filters sit in the Filters sheet. */
export const FiltersMobileSheet: Story = {
  ...MOBILE,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Filters' }));
    const sheet = await screen.findByRole('dialog');
    await expect(within(sheet).getByRole('combobox', { name: 'Translation' })).toBeInTheDocument();
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
        <EmailTemplatesList />
      </PageShell>
    ),
    parameters: { ...parameters, inShell: true, ...PATH },
    globals,
    ...(play === undefined ? {} : { play }),
  };
}

/** At 375 in the shell: Template Name, Module, Active and the row menu; the filters in one button. */
export const Mobile: Story = shellStory(
  MOBILE.parameters,
  MOBILE.globals,
  async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Attendance notice')).toBeInTheDocument();
  },
);

/** Arabic in the shell: the page mirrors; keys and module names stay in <bdi>. */
export const Rtl: Story = shellStory(
  DESKTOP.parameters,
  { ...DESKTOP.globals, locale: 'ar' },
  async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_KEY);
    await expectFitsShell(canvasElement, { long: [LONG_KEY, LEAVE_NAME] });
  },
);

/** The real page in the app shell with the sidebar open and long made-up values. */
function inShell(width: ShellWidth): Story {
  const viewport = shellViewport(width);
  return shellStory(viewport.parameters, viewport.globals, async ({ canvasElement }) => {
    await within(canvasElement).findByText(LONG_KEY);
    const trail = within(within(canvasElement).getByTestId('breadcrumbs'));
    await expect(trail.getByText('Email')).toBeInTheDocument();
    await expect(trail.getByText('Email Templates')).toHaveAttribute('aria-current', 'page');
    await expectFitsShell(canvasElement, {
      short: ['Remind user check in', 'Staff or contact', 'Timesheets', 'English, Arabic'],
      long: [LONG_KEY, LEAVE_NAME, LONG_MODULE],
      headers: ['Template Name', 'Module', 'Sent to', 'Languages', 'Active'],
    });
  });
}

export const InShell1024: Story = inShell(1024);
export const InShell1280: Story = inShell(1280);
export const InShell1366: Story = inShell(1366);
