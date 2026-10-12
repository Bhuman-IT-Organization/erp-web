// @vitest-environment happy-dom
import { act, cleanup, fireEvent } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { useState, type ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { physicalClassesIn, renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { TemplatePreview, type TemplatePreviewProps } from '../TemplatePreview';

/**
 * The live preview (04.3 UI-SPEC § Preview, § States and stories `TemplatePreview`; D-04, choice 3,
 * B10): the api's own rendering of the settled draft in a frame with an EMPTY sandbox, so nothing in
 * the html can run, submit, navigate or reach the app (T-4.3-14). One `it` per story.
 */
type Versions = Readonly<Record<string, { readonly subject: string; readonly message: string }>>;
const VERSIONS: Versions = {
  en: { subject: 'Template 1 for {staff_name}', message: 'Hello {staff_name}' },
  ar: { subject: 'Template 1 ar', message: 'Hello ar {staff_name}' },
};
const HTML = '<!doctype html><html dir="ltr" lang="en"><body><p>Hello Staff name</p></body></html>';
const AR_HTML = '<!doctype html><html dir="rtl" lang="ar"><body><p>Hello ar</p></body></html>';

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';
let replies: Reply[];
let requests: { url: string; data: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  requests.push({
    url: config.url ?? '',
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
  const reply = (replies.length > 1 ? replies.shift() : replies[0]) ?? 'pending';
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

const loaded = (subject: string, html = HTML): Reply => ({ status: 200, body: { subject, html } });

function Harness({
  versions = VERSIONS,
  locale: initial = 'en',
  test = null,
}: {
  readonly versions?: Versions;
  readonly locale?: string;
  readonly test?: TemplatePreviewProps['test'];
}): ReactElement {
  const [locale, setLocale] = useState(initial);
  const [message, setMessage] = useState(versions.en?.message ?? '');
  const draftOf = (one: string) =>
    one === 'en'
      ? { subject: versions.en?.subject ?? '', message }
      : (versions[one] ?? { subject: '', message: '' });
  return (
    <div>
      <input
        aria-label="message"
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
        }}
      />
      <output data-testid="locale">{locale}</output>
      <TemplatePreview
        templateId="7"
        templateName="Template 1"
        locales={['en', 'ar']}
        locale={locale}
        onLocaleChange={setLocale}
        draftOf={draftOf}
        test={test}
        canViewLog
      />
    </div>
  );
}

function show(props: Parameters<typeof Harness>[0] = {}, locale?: 'ar') {
  return renderWithProviders(
    <SWRConfig
      value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}
    >
      <Harness {...props} />
    </SWRConfig>,
    locale === undefined ? {} : { locale },
  );
}

const frame = (): HTMLIFrameElement => screen.getByTitle<HTMLIFrameElement>(/^Preview of /);

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  replies = [loaded('Template 1 for Staff name')];
  http.defaults.adapter = respond;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  vi.useRealTimers();
});

describe('TemplatePreview', () => {
  it('Loading: the email-shaped skeleton in the frame area, no message', () => {
    replies = ['pending'];
    show();
    expect(screen.getByTestId('preview-skeleton')).toBeTruthy();
    expect(screen.queryByText("We couldn't show the preview. Try again.")).toBeNull();
    expect(screen.queryByText(/^Nothing to preview yet/)).toBeNull();
    expect(screen.queryByTitle(/^Preview of /)).toBeNull();
  });

  it('Error: the inline error with Retry, only after the failure', async () => {
    replies = [
      { status: 503, body: { type: 'x', status: 503, title: 'x', code: 'ERP-UPSTREAM-0001' } },
    ];
    show();
    expect(await screen.findByText("We couldn't show the preview. Try again.")).toBeTruthy();
    replies = [loaded('Template 1 for Staff name')];
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(frame().getAttribute('srcdoc')).toBe(HTML);
    });
  });

  it('Loaded: the api html as the frame srcdoc, its title, the subject line and the caption', async () => {
    show();
    await waitFor(() => {
      expect(frame().getAttribute('srcdoc')).toBe(HTML);
    });
    expect(frame().getAttribute('title')).toBe('Preview of Template 1 in English');
    expect(screen.getByText('Subject: Template 1 for Staff name')).toBeTruthy();
    expect(
      screen.getByText(
        "Sample data, and links don't open here. Real emails use the record's values.",
      ),
    ).toBeTruthy();
    expect(requests).toEqual([
      {
        url: '/api/v1/mail/templates/7/preview',
        data: {
          locale: 'en',
          subject: 'Template 1 for {staff_name}',
          message: 'Hello {staff_name}',
        },
      },
    ]);
  });

  it('B10, T-4.3-14: the sandbox is empty (no allow-* token), so a script in the html never runs', async () => {
    const pwned = vi.fn();
    Object.assign(window, { pwned });
    const html =
      '<p>&lt;script&gt;parent.pwned()&lt;/script&gt;</p><script>parent.pwned()</script>';
    replies = [loaded('Template 1', html)];
    show();
    await waitFor(() => {
      expect(frame().getAttribute('srcdoc')).toBe(html);
    });
    expect(frame().getAttribute('sandbox')).toBe('');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pwned).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });

  it('Updating: the old frame stays, the card is aria-busy and "Updating preview…" is announced', async () => {
    replies = [loaded('Template 1 for Staff name'), 'pending'];
    show();
    await waitFor(() => {
      expect(frame().getAttribute('srcdoc')).toBe(HTML);
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'message' }), {
      target: { value: 'Hello again' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('template-preview').getAttribute('aria-busy')).toBe('true');
    });
    expect(frame().getAttribute('srcdoc')).toBe(HTML);
    const updating = screen.getByText('Updating preview…');
    expect(updating.className).toContain('sr-only');
    expect(updating.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('Empty: an empty English message makes no request and says what to do', async () => {
    show({ versions: { en: { subject: 'Template 1', message: '' } } });
    expect(
      screen.getByText('Nothing to preview yet. Write the email message to see it here.'),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toHaveLength(0);
  });

  it('FallbackToEnglish: an empty Arabic version previews English with the caption', async () => {
    show({ versions: { en: VERSIONS.en ?? { subject: '', message: '' } }, locale: 'ar' });
    expect(screen.getByText('Recipients who use Arabic get the English version.')).toBeTruthy();
    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(requests[0]?.data).toEqual({
      locale: 'en',
      subject: 'Template 1 for {staff_name}',
      message: 'Hello {staff_name}',
    });
  });

  it('Arabic: the Arabic version is requested, the subject line and the frame read right to left', async () => {
    replies = [loaded('Template 1 ar', AR_HTML)];
    show({ locale: 'ar' });
    await waitFor(() => {
      expect(frame().getAttribute('srcdoc')).toBe(AR_HTML);
    });
    expect(requests[0]?.data).toEqual({
      locale: 'ar',
      subject: 'Template 1 ar',
      message: 'Hello ar {staff_name}',
    });
    const subject = screen.getByText('Subject: Template 1 ar');
    expect(subject.getAttribute('dir')).toBe('rtl');
    expect(subject.getAttribute('lang')).toBe('ar');
    expect(frame().getAttribute('title')).toBe('Preview of Template 1 in Arabic');
  });

  it('the Language radios choose the previewed locale', async () => {
    show();
    const group = screen.getByRole('radiogroup', { name: 'Language' });
    expect(group).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Arabic' }));
    expect(screen.getByTestId('locale').textContent).toBe('ar');
  });

  it('typing three characters within 300 ms makes ONE more preview request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    show();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(requests).toHaveLength(1);
    const box = screen.getByRole('textbox', { name: 'message' });
    for (const value of ['Hello {staff_name}a', 'Hello {staff_name}ab', 'Hello {staff_name}abc']) {
      fireEvent.change(box, { target: { value } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    expect(requests).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.list.searchDebounceMs);
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.data).toEqual({
      locale: 'en',
      subject: 'Template 1 for {staff_name}',
      message: 'Hello {staff_name}abc',
    });
  });

  it('Send a test to me sits in the card only when a test is offered', () => {
    const { unmount } = show({ test: { configured: true, recipient: 'user@example.test' } });
    expect(screen.getByRole('button', { name: 'Send a test to me' })).toBeTruthy();
    unmount();
    show();
    expect(screen.queryByRole('button', { name: 'Send a test to me' })).toBeNull();
  });

  it('Rtl: no physical-direction class under ar', async () => {
    const { container } = show({}, 'ar');
    await waitFor(() => {
      expect(frame()).toBeTruthy();
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
