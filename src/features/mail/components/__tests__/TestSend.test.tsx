// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { TestStateResponse } from '@/features/mail/schemas/mail.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { physicalClassesIn, renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { TestSend, type TestSendProps } from '../TestSend';

/**
 * "Send a test to me" (04.3 UI-SPEC § Send a test to me, § States and stories `TestSend`): one
 * `it` per story over a fake axios adapter, so the real send and the polled read run. The line is
 * the feedback (`aria-live="polite"`), never a toast. Synthetic values only.
 */
const DRAFT = { locale: 'en', subject: 'Template 1', message: 'Hello {staff_name}' };
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

type Reply =
  | { readonly status: number; readonly body?: unknown; readonly headers?: Record<string, string> }
  | 'pending'
  | 'network';
let api: { send: Reply; reads: TestStateResponse[] };
let requests: { method: string; url: string; data: unknown; key: string | undefined }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toUpperCase();
  const url = config.url ?? '';
  const headers = AxiosHeaders.from(config.headers);
  requests.push({
    method,
    url,
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    key: headers.get('Idempotency-Key')?.toString(),
  });
  const reply: Reply =
    method === 'GET'
      ? { status: 200, body: api.reads.length > 1 ? api.reads.shift() : api.reads[0] }
      : api.send;
  if (reply === 'pending') return new Promise<never>(() => undefined);
  if (reply === 'network') return Promise.reject(new AxiosError('down', 'ECONNREFUSED', config));
  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(reply.headers ?? {}),
    config,
  };
  if (reply.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

const TEMPLATE: TestSendProps = {
  mode: 'template',
  templateId: '7',
  draft: DRAFT,
  languageName: 'English',
  configured: true,
  recipient: EMAIL,
  variant: 'outline',
  canViewLog: true,
};

function show(
  props: Partial<TestSendProps> = {},
  locale?: 'ar',
): ReturnType<typeof renderWithProviders> {
  const ui: ReactElement = (
    <SWRConfig
      value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}
    >
      <TestSend {...TEMPLATE} {...props} />
      <Toaster />
    </SWRConfig>
  );
  return renderWithProviders(ui, locale === undefined ? {} : { locale });
}

const button = (): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>('button', { name: /^(Send a test to me|Sending test…)$/ });
const line = (): HTMLElement => screen.getByTestId('test-send-line');

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = { send: { status: 202, body: { id: '31' } }, reads: [state()] };
  http.defaults.adapter = respond;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  vi.useRealTimers();
});

describe('TestSend', () => {
  it('Idle: the caption names the language and the address in <bdi>; the line is polite', () => {
    show();
    expect(button().disabled).toBe(false);
    const caption = screen.getByText(/^Sends the English version shown above/);
    expect(caption.textContent).toBe(
      `Sends the English version shown above, with sample data and unsaved changes, to ${EMAIL}.`,
    );
    expect(caption.querySelector('bdi')?.textContent).toBe(EMAIL);
    expect(line().getAttribute('aria-live')).toBe('polite');
    expect(line().textContent).toBe('');
  });

  it('Pending: "Sending test…" and disabled', async () => {
    api.send = 'pending';
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(button().textContent).toBe('Sending test…');
    });
    expect(button().disabled).toBe(true);
  });

  it('one click sends one POST with an Idempotency-Key; a new click mints a new key', async () => {
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    });
    const [first] = requests;
    expect(first?.url).toBe('/api/v1/mail/templates/7/test');
    expect(first?.data).toEqual(DRAFT);
    expect(first?.key).toMatch(/^[0-9a-f]{32}$/);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });
    await userEvent.click(button());
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(2);
    });
    const posts = requests.filter((r) => r.method === 'POST');
    expect(posts[1]?.key).not.toBe(posts[0]?.key);
  });

  it('Queued: "Test email queued for {email}." with the link to the entry', async () => {
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toContain(`Test email queued for ${EMAIL}.`);
    });
    const link = screen.getByRole('link', { name: 'View in Sent emails' });
    expect(link.getAttribute('href')).toBe('/setup/sent-emails/31');
  });

  it('Retrying: "Test email not sent yet. Trying again at {time}."', async () => {
    api.reads = [state({ status: 'retrying', attempts: 1, nextTryAt: '2026-10-03T10:00:30.000Z' })];
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toMatch(/^Test email not sent yet\. Trying again at .+\./);
    });
  });

  it('Waiting: queued while the mail server is not answering', async () => {
    api.reads = [state({ waitingForServer: true })];
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toContain(
        "Waiting: the mail server isn't answering. The test is sent when it answers.",
      );
    });
  });

  it('Sent: the check icon and "Test email sent to {email} at {time}."', async () => {
    api.reads = [state({ status: 'sent', attempts: 1, sentAt: '2026-10-03T10:00:31.000Z' })];
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toMatch(/^Test email sent to user@example\.test at .+\./);
    });
    expect(line().querySelector('svg')).not.toBeNull();
  });

  it('Failed: "Test email not sent: {reason}"', async () => {
    api.reads = [state({ status: 'failed', attempts: 1, failureReason: 'recipient_refused' })];
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toContain(
        "Test email not sent: The mail server refused the recipient's address.",
      );
    });
  });

  it('polls every pollMs while queued or retrying, stops at sent, calls onFinal once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.reads = [
      state(),
      state({ status: 'retrying', attempts: 1, nextTryAt: '2026-10-03T10:00:30.000Z' }),
      state({ status: 'sent', attempts: 2, sentAt: '2026-10-03T10:00:31.000Z' }),
    ];
    const onFinal = vi.fn();
    show({ onFinal });
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toContain('queued');
    });
    const reads = (): number => requests.filter((r) => r.method === 'GET').length;
    expect(reads()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs);
    });
    await waitFor(() => {
      expect(reads()).toBe(2);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs);
    });
    await waitFor(() => {
      expect(line().textContent).toContain('Test email sent to');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs * 3);
    });
    expect(reads()).toBe(3);
    expect(onFinal).toHaveBeenCalledTimes(1);
  });

  it('NotConfigured: disabled from the start with the not-configured caption, nothing sent', async () => {
    show({ configured: false });
    expect(button().disabled).toBe(true);
    expect(
      screen.getByText("Email isn't configured for this system, so tests can't be sent."),
    ).toBeTruthy();
    expect(screen.queryByText(/^Sends the English version/)).toBeNull();
    await userEvent.click(button());
    expect(requests).toHaveLength(0);
  });

  it('TooMany: the 429 line with the seconds from Retry-After', async () => {
    api.send = {
      status: 429,
      body: { type: 'about:blank', status: 429, title: 'x', code: 'ERP-MAIL-0007' },
      headers: { 'retry-after': '120' },
    };
    show();
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toBe(
        "You've sent several test emails in a short time. Try again in 120 seconds.",
      );
    });
  });

  it('NetworkError: the inline error with Retry, which re-sends with the same key', async () => {
    api.send = 'network';
    show();
    await userEvent.click(button());
    const retry = await screen.findByRole('button', { name: 'Retry' });
    api.send = { status: 202, body: { id: '31' } };
    await userEvent.click(retry);
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(2);
    });
    const posts = requests.filter((r) => r.method === 'POST');
    expect(posts[1]?.key).toBe(posts[0]?.key);
    await waitFor(() => {
      expect(line().textContent).toContain('Test email queued for');
    });
  });

  it('the "View in Sent emails" link shows only when canViewLog; no toast is raised', async () => {
    show({ canViewLog: false });
    await userEvent.click(button());
    await waitFor(() => {
      expect(line().textContent).toContain('Test email queued for');
    });
    expect(screen.queryByRole('link', { name: 'View in Sent emails' })).toBeNull();
    expect(document.querySelector('[data-sonner-toast]')).toBeNull();
  });

  it('status mode: POSTs to status/test with no body; its caption names the address', async () => {
    show({ mode: 'status', variant: 'default' });
    expect(screen.getByText(/^Sends a short test email to/).textContent).toBe(
      `Sends a short test email to ${EMAIL}, your address.`,
    );
    await userEvent.click(button());
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    });
    expect(requests[0]?.url).toBe('/api/v1/mail/status/test');
    expect(requests[0]?.data).toBeUndefined();
  });

  it('Rtl: no physical-direction class under ar', () => {
    const { container } = show({}, 'ar');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
