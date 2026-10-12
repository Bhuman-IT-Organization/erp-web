// @vitest-environment happy-dom
import { cleanup, fireEvent } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { TemplateResponse } from '@/features/mail/schemas/mail.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { BreadcrumbLabelContext } from '@/lib/hooks/use-breadcrumb-label';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { EmailTemplateForm } from '../EmailTemplateForm';

/**
 * The template editor (04.3 UI-SPEC § Template editor, § States and stories `EmailTemplateForm`):
 * one `it` per story over a fake axios adapter on the shared instance, so the real read, preview,
 * save and stale paths run. Synthetic values only ("Template 1", `staff_name`, `link`).
 */
const LONG_DASH = String.fromCharCode(0x2014);
const VIEW = 'settings.emailTemplates.view';
const EDIT = 'settings.emailTemplates.edit';
const LIST_URL = '/setup/email-templates?filter[module][in]=timesheets';

const push = vi.fn<(href: string, options?: unknown) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/email-templates/7',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const EN = { subject: 'Template 1 for {staff_name}', message: 'Hello {staff_name}\n\n{link}' };
const AR = { subject: 'Template 1 ar', message: 'Hello ar {staff_name}' };
const RECORD: TemplateResponse = {
  id: '7',
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: true,
  formattingDropped: false,
  locales: ['en', 'ar'],
  mergeFields: [
    { token: 'staff_name', kind: 'text' },
    { token: 'link', kind: 'url' },
  ],
  versions: { en: EN, ar: AR },
  sendTest: { configured: true, recipient: 'user@example.test' },
  etag: '"abc"',
};
const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'user@example.test',
  firstName: 'Some',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});
const problem = (status: number, code: string, issues?: unknown) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
  ...(issues === undefined ? {} : { issues }),
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';
let api: { me: Reply; record: Reply | Reply[]; save: Reply; preview: Reply };
let requests: { method: string; path: string; body: unknown; ifMatch: string | undefined }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  requests.push({
    method,
    path: url.pathname,
    body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    ifMatch: AxiosHeaders.from(config.headers).get('If-Match')?.toString(),
  });
  const next = (one: Reply | Reply[]): Reply =>
    Array.isArray(one) ? ((one.length > 1 ? one.shift() : one[0]) ?? 'pending') : one;
  const reply =
    url.pathname === '/api/v1/auth/me'
      ? api.me
      : url.pathname.endsWith('/preview')
        ? api.preview
        : method === 'GET'
          ? next(api.record)
          : api.save;
  if (reply === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (reply.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

const saves = () => requests.filter((r) => r.method === 'PATCH');
const previews = () => requests.filter((r) => r.path.endsWith('/preview'));

function show(
  ui: ReactElement = <EmailTemplateForm id="7" />,
  { locale, onUrl }: { locale?: 'ar'; onUrl?: (query: string) => void } = {},
) {
  return renderWithProviders(
    <SWRConfig
      value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}
    >
      {ui}
      <Toaster />
    </SWRConfig>,
    {
      hasMemory: true,
      ...(locale === undefined ? {} : { locale }),
      ...(onUrl === undefined
        ? {}
        : {
            onUrlUpdate: (update: { readonly queryString: string }) => {
              onUrl(decodeURIComponent(update.queryString));
            },
          }),
    },
  );
}

const box = (name: RegExp) => screen.findByRole<HTMLInputElement>('textbox', { name });
const SUBJECT_EN = /^Subject \(English\)/;
const MESSAGE_EN = /^Email message \(English\)/;
const SUBJECT_AR = /^Subject \(Arabic\)/;
const MESSAGE_AR = /^Email message \(Arabic\)/;
const saveButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Save email template' });

/** Replaces a field's value as typing would, and marks the form dirty. */
async function setValue(name: RegExp, value: string): Promise<void> {
  fireEvent.change(await box(name), { target: { value } });
}

async function submitAndConfirm(): Promise<HTMLElement> {
  await userEvent.click(saveButton());
  const dialog = await screen.findByTestId('confirm-dialog');
  await userEvent.click(within(dialog).getByTestId('confirm-dialog-confirm'));
  return dialog;
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  push.mockReset();
  requests = [];
  sessionStorage.clear();
  api = {
    me: { status: 200, body: me(true) },
    record: { status: 200, body: RECORD },
    save: { status: 200, body: { ...RECORD, etag: '"def"' } },
    preview: { status: 200, body: { subject: 'Template 1 for Staff name', html: '<p>Hello</p>' } },
  };
  http.defaults.adapter = respond;
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('EmailTemplateForm', () => {
  it('Loading: the form skeleton while the record is unknown, no message', () => {
    api.record = 'pending';
    show();
    expect(screen.getByTestId('page-skeleton').dataset.variant).toBe('form');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('This email template no longer exists.')).toBeNull();
  });

  it('Edit: the name with its badge and meta line, Details, one section per locale, the preview', async () => {
    const published = vi.fn<(label: string | null | undefined) => void>();
    show(
      <BreadcrumbLabelContext.Provider value={published}>
        <EmailTemplateForm id="7" />
      </BreadcrumbLabelContext.Provider>,
    );
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.textContent).toBe('Attendance notice');
    expect(screen.getByText('Timesheets · Sent to Staff')).toBeTruthy();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith('Attendance notice');
    });
    expect(screen.getByText('Template Title')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'English' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Arabic' })).toBeTruthy();
    expect(
      screen.getByText('Required. Recipients whose language has no version get this one.'),
    ).toBeTruthy();
    expect((await box(SUBJECT_EN)).value).toBe(EN.subject);
    expect((await box(SUBJECT_AR)).getAttribute('dir')).toBe('rtl');
    expect(
      screen.getByRole('button', { name: 'Insert merge field into Email message (Arabic)' }),
    ).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(
      screen.getByRole('link', { name: 'Sent emails of this template' }).getAttribute('href'),
    ).toBe('/setup/sent-emails?filter[template][in]=attendance_notice');
    await waitFor(() => {
      expect(previews()).toHaveLength(1);
    });
    expect(screen.getByRole('button', { name: 'Send a test to me' })).toBeTruthy();
  });

  it('FieldErrors: the English subject and message are required, under each field and in the focused summary', async () => {
    show();
    await setValue(SUBJECT_EN, ' ');
    await setValue(MESSAGE_EN, '');
    await userEvent.click(saveButton());
    const summary = await screen.findByTestId('error-summary');
    expect(within(summary).getByRole('link', { name: /Subject \(English\)/ })).toBeTruthy();
    expect(summary.textContent).toContain('Enter a subject.');
    expect(summary.textContent).toContain('Enter the email message.');
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
    const englishLabels = screen
      .getAllByText('*')
      .filter((mark) => mark.closest('label')?.textContent.includes('(English)') === true);
    expect(englishLabels).toHaveLength(2);
    expect(saves()).toEqual([]);
  });

  it('Pending: confirmed, not answered: "Saving email template…" and disabled', async () => {
    api.save = 'pending';
    show();
    await setValue(SUBJECT_EN, 'Template 1 new');
    await submitAndConfirm();
    const busy = await screen.findAllByRole('button', { name: 'Saving email template…' });
    for (const button of busy) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('ServerError: a 503 is the form alert with Retry, the edits kept', async () => {
    api.save = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show();
    await setValue(SUBJECT_EN, 'Template 1 new');
    await submitAndConfirm();
    const alert = await screen.findByTestId('form-server-error');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect((await box(SUBJECT_EN)).value).toBe('Template 1 new');
    api.save = { status: 200, body: { ...RECORD, etag: '"def"' } };
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(saves()).toHaveLength(2);
    });
  });

  it('NotFound: a 404 read says the template no longer exists, with Back to list', async () => {
    api.record = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    const published = vi.fn<(label: string | null | undefined) => void>();
    show(
      <BreadcrumbLabelContext.Provider value={published}>
        <EmailTemplateForm id="7" />
      </BreadcrumbLabelContext.Provider>,
    );
    expect(await screen.findByText('This email template no longer exists.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to list' })).toBeTruthy();
    await waitFor(() => {
      expect(published).toHaveBeenLastCalledWith(null);
    });
  });

  it('ArabicEmpty: no Arabic version: the optional helper, empty fields', async () => {
    api.record = { status: 200, body: { ...RECORD, versions: { en: EN } } };
    show();
    expect(
      await screen.findByText(
        "Optional. When it's empty, recipients who use Arabic get the English version.",
      ),
    ).toBeTruthy();
    expect((await box(SUBJECT_AR)).value).toBe('');
  });

  it('VersionPairError: an Arabic subject without a message', async () => {
    show();
    await setValue(MESSAGE_AR, '');
    await userEvent.click(saveButton());
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(
      'Fill in both the subject and the message, or leave both empty.',
    );
    expect(within(summary).getByRole('link', { name: /Email message \(Arabic\)/ })).toBeTruthy();
  });

  it('UnknownMergeField: an api 400 lands under the Arabic message naming the token; nothing is reset', async () => {
    api.save = {
      status: 400,
      body: problem(400, 'ERP-VALIDATION-0001', [
        {
          path: ['versions', 'ar', 'message'],
          message: 'never shown',
          rule: 'unknown_merge_field',
          params: { token: 'x' },
        },
      ]),
    };
    show();
    await setValue(SUBJECT_EN, 'Template 1 new');
    await submitAndConfirm();
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(
      "{x} isn't a merge field of this template. Use Insert merge field to pick one.",
    );
    expect(summary.textContent).not.toContain('never shown');
    expect((await box(SUBJECT_EN)).value).toBe('Template 1 new');
  });

  it('LongDash: refused on the field, never replaced', async () => {
    show();
    await setValue(SUBJECT_AR, `Template 1 ${LONG_DASH} ar`);
    await userEvent.click(saveButton());
    const summary = await screen.findByTestId('error-summary');
    expect(summary.textContent).toContain(
      'Replace the long dash with a hyphen, a comma or a colon.',
    );
    expect((await box(SUBJECT_AR)).value).toBe(`Template 1 ${LONG_DASH} ar`);
  });

  it('SaveSummary: Active first with the alert icon, the updated field and the removed version; values never echoed', async () => {
    show();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Active' }));
    await setValue(SUBJECT_EN, 'Secret new subject');
    await setValue(SUBJECT_AR, '');
    await setValue(MESSAGE_AR, '');
    await userEvent.click(saveButton());
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Save changes to Attendance notice?',
    );
    const lines = within(dialog)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(lines[0]).toContain('Active');
    expect(lines[0]).toContain('Inactive');
    expect(lines).toContain('Subject (English) updated');
    expect(lines).toContain('Arabic version removed');
    expect(dialog.textContent).not.toContain('Secret new subject');
  });

  it('the save PATCHes Active and every version with If-Match, Arabic emptied as null; the toast; the exact list URL', async () => {
    sessionStorage.setItem(
      'erp.list.return:/setup/email-templates',
      JSON.stringify({ url: LIST_URL }),
    );
    show();
    await setValue(SUBJECT_AR, '');
    await setValue(MESSAGE_AR, '');
    await submitAndConfirm();
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(LIST_URL, { scroll: false });
    });
    expect(saves()).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/mail/templates/7',
        body: { active: true, versions: { en: EN, ar: null } },
        ifMatch: '"abc"',
      },
    ]);
    expect(await screen.findByText('Email template saved')).toBeTruthy();
  });

  it('Stale: a 412 refuses in the summary with the template words; the form keeps Reload through Discard changes?', async () => {
    api.save = { status: 412, body: problem(412, 'ERP-CORE-0013') };
    show();
    await setValue(SUBJECT_EN, 'Template 1 mine');
    const dialog = await submitAndConfirm();
    await waitFor(() => {
      expect(dialog.textContent).toContain(
        'This email template was changed by someone else since you opened it.',
      );
    });
    expect(within(dialog).getByTestId<HTMLButtonElement>('confirm-dialog-confirm').disabled).toBe(
      true,
    );
    await userEvent.keyboard('{Escape}');
    const stale = await screen.findByTestId('record-stale');
    expect(stale.textContent).toContain(
      'Someone else changed this email template after you opened it.',
    );
    expect((await box(SUBJECT_EN)).value).toBe('Template 1 mine');
    api.record = {
      status: 200,
      body: { ...RECORD, versions: { en: { ...EN, subject: 'Theirs' }, ar: AR }, etag: '"zzz"' },
    };
    await userEvent.click(within(stale).getByRole('button', { name: 'Reload email template' }));
    const discard = await screen.findByTestId('confirm-dialog');
    expect(within(discard).getByRole('heading').textContent).toBe('Discard changes?');
    await userEvent.click(within(discard).getByTestId('confirm-dialog-confirm'));
    await waitFor(async () => {
      expect((await box(SUBJECT_EN)).value).toBe('Theirs');
    });
    expect(screen.queryByTestId('record-stale')).toBeNull();
  });

  it('leaving dirty through Back to list asks "Discard changes?"; changing the preview language does not', async () => {
    const urls: string[] = [];
    show(undefined, { onUrl: (query) => urls.push(query) });
    await setValue(SUBJECT_EN, 'Template 1 new');
    await userEvent.click(screen.getByRole('radio', { name: 'Arabic' }));
    await waitFor(() => {
      expect(urls.at(-1)).toBe('?preview=ar');
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Discard changes?');
    expect(push).not.toHaveBeenCalled();
  });

  it('focusing an Arabic field selects Arabic in the preview (?preview=ar)', async () => {
    const urls: string[] = [];
    show(undefined, { onUrl: (query) => urls.push(query) });
    (await box(MESSAGE_AR)).focus();
    await waitFor(() => {
      expect(urls.at(-1)).toBe('?preview=ar');
    });
    expect(
      screen.getByRole<HTMLButtonElement>('radio', { name: 'Arabic' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('FormattingDropped: the neutral notice above the form', async () => {
    api.record = { status: 200, body: { ...RECORD, formattingDropped: true } };
    show();
    expect((await screen.findByTestId('formatting-dropped')).textContent).toContain(
      'This wording had formatting in Perfex.',
    );
  });

  it('ReadOnly: a member without edit sees every field disabled, no save, no test; the preview still renders', async () => {
    api.me = { status: 200, body: me(false, [VIEW]) };
    show();
    expect((await box(SUBJECT_EN)).disabled).toBe(true);
    expect((await box(MESSAGE_AR)).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('checkbox', { name: 'Active' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save email template' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send a test to me' })).toBeNull();
    expect(screen.queryByText('*')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sent emails of this template' })).toBeNull();
    await waitFor(() => {
      expect(previews()).toHaveLength(1);
    });
  });

  it('Undefined: no merge fields: the notice and a read-only editor, even with edit', async () => {
    api.me = { status: 200, body: me(false, [VIEW, EDIT]) };
    api.record = { status: 200, body: { ...RECORD, mergeFields: [] } };
    show();
    expect((await screen.findByTestId('template-undefined')).textContent).toContain(
      "This email's module no longer defines it, so it can't be edited or sent.",
    );
    expect((await box(SUBJECT_EN)).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save email template' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send a test to me' })).toBeNull();
  });

  it('RtlEnglishVersion: in the Arabic interface the English inputs stay left to right; no physical class', async () => {
    const { container } = show(undefined, { locale: 'ar' });
    const subject = await box(SUBJECT_EN);
    expect(subject.getAttribute('dir')).toBe('ltr');
    expect(subject.getAttribute('lang')).toBe('en');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
