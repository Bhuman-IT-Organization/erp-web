import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { expect, fireEvent, screen, userEvent, waitFor, within } from 'storybook/test';
import { PageShell } from '@/components/templates/PageShell';
import type { TemplateResponse } from '@/features/mail/schemas/mail.schema';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';
import { expectFitsShell, shellViewport, type ShellWidth } from '@/test/in-shell';
import { EmailTemplateForm } from './EmailTemplateForm';

// A fake axios adapter on the shared instance; synthetic templates and wording only (W0-05).
const LONG_DASH = String.fromCharCode(0x2014);
const EN = {
  subject: 'Template 1: {staff_name} checked in',
  message:
    'Hello {staff_name},\n\nThis is Template 1, a made-up wording long enough to wrap over several lines of the message box so the layout shows how a real paragraph sits in the editor.\n\n{link}',
};
const AR = { subject: 'Template 1 ar {staff_name}', message: 'Hello ar {staff_name},\n\n{link}' };
const RECORD: TemplateResponse = {
  id: '7',
  key: 'new_leave_application_send_to_notification_recipient',
  module: 'timesheets',
  audience: 'staff_or_contact',
  active: true,
  formattingDropped: false,
  locales: ['en', 'ar'],
  mergeFields: [
    { token: 'staff_name', kind: 'text' },
    { token: 'staff_id', kind: 'text' },
    { token: 'date_time', kind: 'text' },
    { token: 'link', kind: 'url' },
  ],
  versions: { en: EN, ar: AR },
  sendTest: { configured: true, recipient: 'user@example.test' },
  etag: '"abc"',
};
const email = (dir: 'ltr' | 'rtl', lang: string, text: string): string =>
  `<!doctype html><html dir="${dir}" lang="${lang}"><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif"><div style="height:4px;background:#171717"></div><div style="max-width:600px;margin:0 auto;padding:24px"><div style="font-size:20px;font-weight:600;color:#171717">Company 1</div><p style="margin:24px 0;font-size:16px;line-height:24px;color:#171717">${text}</p><p style="margin:0 0 24px;font-size:16px;line-height:24px"><a href="https://example.test/x" style="color:#171717;text-decoration:underline">https://example.test/x</a></p><hr style="border:0;border-top:1px solid #e5e5e5"><div style="font-size:12px;color:#737373">Company 1</div></div></body></html>`;
const PREVIEW = {
  subject: 'Template 1: Staff name checked in',
  html: email('ltr', 'en', 'Hello Staff name,'),
};
const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'user@example.test',
  firstName: 'Admin',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});

type Answer = { readonly status: number; readonly body?: unknown } | 'pending';
const problem = (status: number, code: string, issues?: unknown): Answer => ({
  status,
  body: { type: 'about:blank', status, title: code, code, ...(issues ? { issues } : {}) },
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

interface Api {
  readonly read?: Answer;
  readonly save?: Answer;
  readonly preview?: Answer;
  readonly who?: ReturnType<typeof me>;
}

function withApi({
  read = { status: 200, body: RECORD },
  save = { status: 200, body: { ...RECORD, etag: '"def"' } },
  preview = { status: 200, body: PREVIEW },
  who = me(true),
}: Api = {}): Decorator {
  return function ApiDecorator(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    const adapter: ApiAdapter = (config) => {
      const path = (config.url ?? '').split('?')[0] ?? '';
      const method = (config.method ?? 'get').toUpperCase();
      if (path === '/api/v1/auth/me') return respond(config, { status: 200, body: who });
      if (path.endsWith('/preview')) return respond(config, preview);
      if (path === '/api/v1/mail/templates/7')
        return respond(config, method === 'GET' ? read : save);
      return respond(config, problem(404, 'ERP-CORE-0004'));
    };
    http.defaults.adapter = adapter;
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

const PATH = {
  nextjs: { appDirectory: true, navigation: { pathname: '/setup/email-templates/7' } },
};
const MOBILE = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;

const meta = {
  title: 'Features/Mail/EmailTemplateForm',
  component: EmailTemplateForm,
  args: { id: '7' },
  parameters: PATH,
  decorators: [
    withApi(),
    (Story, { parameters }) =>
      parameters.inShell === true ? (
        <Story />
      ) : (
        <div className="p-4 md:p-6">
          <Story />
        </div>
      ),
  ],
} satisfies Meta<typeof EmailTemplateForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const field = (root: HTMLElement, name: RegExp) =>
  within(root).findByRole<HTMLInputElement>('textbox', { name });

/** Replaces a field's wording, then presses Save. */
async function changeAndSave(root: HTMLElement, name: RegExp, value: string): Promise<void> {
  await fireEvent.change(await field(root, name), { target: { value } });
  await userEvent.click(within(root).getByRole('button', { name: 'Save email template' }));
}

/** The summary's confirm, once it takes input. */
async function confirm(): Promise<void> {
  const dialog = await screen.findByTestId('confirm-dialog');
  const button = within(dialog).getByTestId('confirm-dialog-confirm');
  await waitFor(async () => {
    await expect(getComputedStyle(button).pointerEvents).not.toBe('none');
  });
  await userEvent.click(button);
}

/** While the record is unknown: the form skeleton, no message (D-39). */
export const Loading: Story = { decorators: [withApi({ read: 'pending' })] };

/** The editor: Details, English and Arabic, the save bar; the preview below it under `xl`. */
export const Edit: Story = {};

/** FE-27 `Pending`: confirmed, not answered: "Saving email template…", disabled. */
export const Pending: Story = {
  decorators: [withApi({ save: 'pending' })],
  play: async ({ canvasElement }) => {
    await changeAndSave(canvasElement, /^Subject \(English\)/, 'Template 1 new');
    await confirm();
    await expect(
      (await screen.findAllByRole('button', { name: 'Saving email template…' })).length,
    ).toBeGreaterThan(0);
  },
};

/** FE-27 `FieldErrors`: the English subject and message are required (the asterisk on both). */
export const FieldErrors: Story = {
  play: async ({ canvasElement }) => {
    await fireEvent.change(await field(canvasElement, /^Subject \(English\)/), {
      target: { value: '' },
    });
    await changeAndSave(canvasElement, /^Email message \(English\)/, '');
    await expect(await within(canvasElement).findByTestId('error-summary')).toBeInTheDocument();
  },
};

/** FE-27 `ServerError`: a 503, the form alert with Retry, the edits kept. */
export const ServerError: Story = {
  decorators: [withApi({ save: problem(503, 'ERP-UPSTREAM-0001') })],
  play: async ({ canvasElement }) => {
    await changeAndSave(canvasElement, /^Subject \(English\)/, 'Template 1 new');
    await confirm();
    await expect(await within(canvasElement).findByTestId('form-server-error')).toBeInTheDocument();
  },
};

/** A permalink to a template that is gone: the plain message and Back to list. */
export const NotFound: Story = {
  decorators: [withApi({ read: problem(404, 'ERP-CORE-0004') })],
};

/** No Arabic version yet: the optional helper; the preview offers English for Arabic readers. */
export const ArabicEmpty: Story = {
  decorators: [withApi({ read: { status: 200, body: { ...RECORD, versions: { en: EN } } } })],
};

/** An Arabic subject without a message: "Fill in both...". */
export const VersionPairError: Story = {
  play: async ({ canvasElement }) => {
    await changeAndSave(canvasElement, /^Email message \(Arabic\)/, '');
    await expect(await within(canvasElement).findByTestId('error-summary')).toBeInTheDocument();
  },
};

/** A token that is not this template's: the message names it. */
export const UnknownMergeField: Story = {
  play: async ({ canvasElement }) => {
    await changeAndSave(canvasElement, /^Email message \(Arabic\)/, 'Hello ar {staff_nme}');
    await expect(
      await within(canvasElement).findAllByText(/\{staff_nme\} isn't a merge field/),
    ).not.toHaveLength(0);
  },
};

/** A long dash: refused on the field, never replaced. */
export const LongDash: Story = {
  play: async ({ canvasElement }) => {
    await changeAndSave(canvasElement, /^Subject \(English\)/, `Template 1 ${LONG_DASH} new`);
    await expect(await within(canvasElement).findByTestId('error-summary')).toBeInTheDocument();
  },
};

/** The summary: Active first with the alert mark, the updated field, the removed version. */
export const SaveSummary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Active' }));
    await fireEvent.change(await field(canvasElement, /^Subject \(Arabic\)/), {
      target: { value: '' },
    });
    await fireEvent.change(await field(canvasElement, /^Email message \(Arabic\)/), {
      target: { value: '' },
    });
    await changeAndSave(canvasElement, /^Subject \(English\)/, 'Template 1 new');
    const dialog = await screen.findByTestId('confirm-dialog');
    await expect(dialog).toHaveTextContent('Arabic version removed');
  },
};

/** A 412: the summary refuses in the template's words; the form keeps "Reload email template". */
export const Stale: Story = {
  decorators: [withApi({ save: problem(412, 'ERP-CORE-0013') })],
  play: async ({ canvasElement }) => {
    await changeAndSave(canvasElement, /^Subject \(English\)/, 'Template 1 mine');
    await confirm();
    const dialog = await screen.findByTestId('confirm-dialog');
    await waitFor(async () => {
      await expect(within(dialog).getByTestId('confirm-dialog-error')).toBeInTheDocument();
    });
    await userEvent.keyboard('{Escape}');
    await expect(await within(canvasElement).findByTestId('record-stale')).toBeInTheDocument();
  },
};

/** The seeded wording had formatting in Perfex: the neutral notice. */
export const FormattingDropped: Story = {
  decorators: [withApi({ read: { status: 200, body: { ...RECORD, formattingDropped: true } } })],
};

/** A member with view only: every field disabled, no save, no test; the preview still renders. */
export const ReadOnly: Story = {
  decorators: [withApi({ who: me(false, ['settings.emailTemplates.view']) })],
};

/** No module defines the template any more: the notice and a read-only editor. */
export const Undefined: Story = {
  decorators: [withApi({ read: { status: 200, body: { ...RECORD, mergeFields: [] } } })],
};

/** The real page in the app shell (lead 2026-10-03): the sidebar, the top bar and the editor. */
function shellStory(
  parameters: Record<string, unknown>,
  globals: Record<string, unknown>,
  play?: Story['play'],
): Story {
  return {
    render: (args) => (
      <PageShell>
        <EmailTemplateForm {...args} />
      </PageShell>
    ),
    parameters: { ...parameters, inShell: true, ...PATH },
    globals,
    ...(play === undefined ? {} : { play }),
  };
}

/** Waits for the editor and its preview, then the shell's layout proofs. */
const fits: NonNullable<Story['play']> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await canvas.findByTitle(/^Preview of /);
  await expectFitsShell(canvasElement, { short: ['Template Title', 'Send a test to me'] });
};

/** At 375 in the shell: one column, the preview (400px) after the form, the save bar wrapping. */
export const Mobile: Story = shellStory(MOBILE.parameters, MOBILE.globals, fits);

/** The Arabic interface in the shell: the page mirrors, the preview sits at the inline end. */
export const Rtl: Story = shellStory(
  shellViewport(1366).parameters,
  { ...shellViewport(1366).globals, locale: 'ar' },
  fits,
);

/** The Arabic interface: the English version's inputs stay left to right. */
export const RtlEnglishVersion: Story = {
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    const subject = await field(canvasElement, /^Subject \(English\)/);
    await expect(subject.getAttribute('dir')).toBe('ltr');
  },
};

/** The English interface: the Arabic version reads right to left, and focusing it previews Arabic. */
export const ArabicVersionInEnglish: Story = {
  decorators: [
    withApi({
      preview: {
        status: 200,
        body: {
          subject: 'Template 1 ar Staff name',
          html: email('rtl', 'ar', 'Hello ar Staff name,'),
        },
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const message = await field(canvasElement, /^Email message \(Arabic\)/);
    await expect(message.getAttribute('dir')).toBe('rtl');
    message.focus();
    await expect(
      await within(canvasElement).findByTitle(/^Preview of .* in Arabic$/),
    ).toBeInTheDocument();
  },
};

/** The real page in the app shell, the sidebar open, at one width. */
function inShell(width: ShellWidth): Story {
  const viewport = shellViewport(width);
  return shellStory(viewport.parameters, viewport.globals, async (context) => {
    await fits(context);
    const trail = within(within(context.canvasElement).getByTestId('breadcrumbs'));
    await expect(trail.getByText('Email')).toBeInTheDocument();
    await expect(trail.getByText('Email Templates')).toHaveAttribute(
      'href',
      '/setup/email-templates',
    );
  });
}

export const InShell1024: Story = inShell(1024);
export const InShell1280: Story = inShell(1280);
export const InShell1366: Story = inShell(1366);
