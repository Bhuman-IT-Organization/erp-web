// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusResponse, TestStateResponse } from '@/features/mail/schemas/mail.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import en from '../../messages/en.json';
import { EmailStatus, GuardedEmailStatus } from '../EmailStatus';

/**
 * Email status (04.3 UI-SPEC § Email status, D-02): the notices, the read-only Mail setup card, the
 * deployment caption with Perfex's link, and "Send a test to me". One `it` per story, over a fake
 * axios adapter. Synthetic values only (`mail.example.test`, `noreply@example.test`).
 */
const EN = en.mail;
const COMMON = commonEn.common;
const STATUS = '/api/v1/mail/status';

vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/email-status',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const status = (patch: Partial<StatusResponse> = {}): StatusResponse => ({
  configured: true,
  sender: { name: 'Company 1', address: 'noreply@example.test' },
  host: 'mail.example.test',
  port: 587,
  encryption: 'tls',
  server: { answering: true, since: null },
  lastSend: {
    id: '41',
    status: 'sent',
    at: '2026-10-03T08:00:02.000Z',
    failureReason: null,
  },
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
const testState = (patch: Partial<TestStateResponse> = {}): TestStateResponse => ({
  id: '60',
  status: 'sent',
  attempts: 1,
  maxAttempts: 8,
  nextTryAt: null,
  sentAt: '2026-10-03T09:00:00.000Z',
  failureReason: null,
  recipient: 'admin@example.test',
  waitingForServer: false,
  ...patch,
});
const me = (isAdmin: boolean, permissions: readonly string[] = []) => ({
  staffId: 1,
  email: 'admin@example.test',
  firstName: 'Some',
  lastName: 'One',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});
const problem = (s: number, code: string) => ({
  type: 'about:blank',
  status: s,
  title: code,
  code,
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';
let api: { me: Reply; status: Reply; test: Reply; send: Reply };
let requests: { readonly method: string; readonly url: URL }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  requests.push({ method, url });
  const reply =
    url.pathname === '/api/v1/auth/me'
      ? api.me
      : method !== 'GET'
        ? api.send
        : url.pathname === STATUS
          ? api.status
          : api.test;
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

function show(ui = <EmailStatus />, locale?: 'ar') {
  return renderWithProviders(
    <SWRConfig
      value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}
    >
      {ui}
    </SWRConfig>,
    locale === undefined ? {} : { locale },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: 200, body: me(true) },
    status: { status: 200, body: status() },
    test: { status: 200, body: testState() },
    send: { status: 202, body: { id: '60' } },
  };
  http.defaults.adapter = respond;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

const loaded = () => screen.findByTestId('mail-setup');
const valueOf = (term: string): HTMLElement => {
  const dt = screen.getAllByRole('term').find((node) => node.textContent === term);
  const dd = dt?.nextElementSibling;
  if (!(dd instanceof HTMLElement)) throw new Error(`no value for ${term}`);
  return dd;
};
const statusReads = () => requests.filter((r) => r.method === 'GET' && r.url.pathname === STATUS);

describe('EmailStatus: the states (FE-27, D-39)', () => {
  it('Loading: the form skeleton and no notice', async () => {
    api.status = 'pending';
    show();
    expect(await screen.findByTestId('email-status-loading')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toContain(EN.not_configured_notice);
  });

  it('Error: a 503 in plain words with Retry', async () => {
    api.status = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(alert.textContent).not.toMatch(/ERP-/);
  });

  it('Loaded: the title, Configured, the sender, host, port, encryption, the server and the last send', async () => {
    show();
    await loaded();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.email_status);
    expect(screen.getByRole('heading', { name: EN.mail_setup })).toBeTruthy();
    expect(valueOf(EN.status).querySelector('[data-status="done"]')?.textContent).toBe(
      EN.status_configured,
    );
    expect(valueOf(EN.sender).textContent).toBe('Company 1 <noreply@example.test>');
    expect(valueOf(EN.sender).querySelector('bdi')?.textContent).toBe('<noreply@example.test>');
    expect(valueOf(EN.settings_email_host).querySelector('bdi')?.textContent).toBe(
      'mail.example.test',
    );
    expect(valueOf(EN.settings_email_port).textContent).toBe('587');
    expect(valueOf(EN.settings_email_port).querySelector('.tabular-nums')).toBeTruthy();
    expect(valueOf(EN.smtp_encryption).textContent).toBe(EN.encryption_tls);
    expect(valueOf(EN.mail_server).textContent).toBe(EN.server_answering);
    const last = valueOf(EN.last_send);
    expect(last.textContent).toMatch(/^Sent at /);
    expect(within(last).getByRole('link', { name: EN.view_in_log }).getAttribute('href')).toBe(
      '/setup/sent-emails/41',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('SSL and None read as words', async () => {
    api.status = { status: 200, body: status({ encryption: 'ssl' }) };
    show();
    await loaded();
    expect(valueOf(EN.smtp_encryption).textContent).toBe(EN.encryption_ssl);
    cleanup();
    api.status = { status: 200, body: status({ encryption: 'none' }) };
    show();
    await loaded();
    expect(valueOf(EN.smtp_encryption).textContent).toBe(EN.smtp_encryption_none);
  });

  it('NotConfigured: the notice, Not configured, Sender None, and the test disabled with its caption', async () => {
    api.status = { status: 200, body: NOT_CONFIGURED };
    show();
    await loaded();
    const notice = screen.getByTestId('not-configured-notice');
    expect(notice.textContent).toContain(EN.not_configured_notice);
    expect(notice.querySelector('svg')).toBeTruthy();
    expect(valueOf(EN.status).querySelector('[data-status="alert"]')?.textContent).toBe(
      EN.status_not_configured,
    );
    expect(valueOf(EN.sender).textContent).toBe(COMMON.none);
    expect(valueOf(EN.settings_email_host).textContent).toBe(COMMON.none);
    expect(screen.getByRole('button', { name: EN.send_test_to_me }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(document.body.textContent).toContain(EN.test_not_configured);
  });

  it('Paused: the paused notice and "Not answering, sending is paused since {time}"', async () => {
    api.status = {
      status: 200,
      body: status({ server: { answering: false, since: '2026-10-03T07:00:00.000Z' } }),
    };
    show();
    await loaded();
    expect(screen.getByTestId('paused-notice').textContent).toContain(EN.paused_notice);
    expect(valueOf(EN.mail_server).textContent).toMatch(
      /^Not answering, sending is paused since .+/,
    );
  });

  it('NeverSent: Last send reads "Never"', async () => {
    api.status = { status: 200, body: status({ lastSend: null }) };
    show();
    await loaded();
    expect(valueOf(EN.last_send).textContent).toBe(EN.never);
  });

  it('LastFailed: "Failed at {time}: {reason}" with the link to the entry', async () => {
    api.status = {
      status: 200,
      body: status({
        lastSend: {
          id: '42',
          status: 'failed',
          at: '2026-10-03T08:00:00.000Z',
          failureReason: 'auth_failed',
        },
      }),
    };
    show();
    await loaded();
    const last = valueOf(EN.last_send);
    expect(last.textContent).toMatch(/^Failed at .+: /);
    expect(last.textContent).toContain(EN.failure_reason.auth_failed);
    expect(within(last).getByRole('link', { name: EN.view_in_log }).getAttribute('href')).toBe(
      '/setup/sent-emails/42',
    );
  });

  it('never shows a user name or a password (T-4.3-06)', async () => {
    show();
    await loaded();
    expect(document.body.textContent).not.toMatch(/user ?name|password/i);
    expect(screen.queryByLabelText(/user ?name|password/i)).toBeNull();
  });

  it('the deployment caption and Perfex SMTP Settings link show with settings.general.view', async () => {
    show();
    await loaded();
    expect(screen.getByTestId('deployment-caption').textContent).toContain(EN.deployment_caption);
    const link = screen.getByRole('link', {
      name: `${EN.perfex_smtp_settings} ${EN.opens_in_perfex}`,
    });
    expect(link.getAttribute('href')).toBe('/admin/settings?group=email');
  });

  it('the caption and the link stay hidden without settings.general.view', async () => {
    api.me = { status: 200, body: me(false, []) };
    show();
    await loaded();
    expect(screen.queryByTestId('deployment-caption')).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(EN.perfex_smtp_settings) })).toBeNull();
  });

  it('the Send Test Email card: the legacy heading, the caption with my address, the primary button', async () => {
    show();
    await loaded();
    const card = screen.getByTestId('test-card');
    expect(
      within(card).getByRole('heading', { name: EN.settings_send_test_email_heading }),
    ).toBeTruthy();
    expect(card.textContent).toContain(
      'Sends a short test email to admin@example.test, your address.',
    );
    expect(
      within(card).getByRole('button', { name: EN.send_test_to_me }).getAttribute('data-variant'),
    ).toBe('default');
  });

  it('a test sent from here POSTs status/test, and the status is read again once it is sent', async () => {
    show();
    await loaded();
    expect(statusReads()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: EN.send_test_to_me }));
    await waitFor(() => {
      expect(
        requests.some((r) => r.method === 'POST' && r.url.pathname === '/api/v1/mail/status/test'),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(statusReads()).toHaveLength(2);
    });
  });

  it('Mobile: the definition list is one column below md', async () => {
    show();
    await loaded();
    const list = screen.getAllByRole('term')[0]?.closest('dl');
    expect(list?.className).toContain('grid-cols-1');
    expect(list?.className).toContain('md:grid-cols-2');
  });

  it('Rtl: no physical-direction class under ar', async () => {
    api.status = { status: 200, body: NOT_CONFIGURED };
    show(<EmailStatus />, 'ar');
    await loaded();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });

  it('markup in a host or a sender is text (T-4.3-16)', async () => {
    api.status = {
      status: 200,
      body: status({ host: '<b>x</b>', sender: { name: '<i>y</i>', address: 'a@example.test' } }),
    };
    show();
    await loaded();
    expect(screen.getByTestId('mail-setup').querySelector('b, i')).toBeNull();
    expect(valueOf(EN.settings_email_host).textContent).toBe('<b>x</b>');
  });
});

describe('GuardedEmailStatus (administrator only, D-02)', () => {
  it('a member who is not an administrator gets the no-access state, and the status is never read', async () => {
    api.me = { status: 200, body: me(false, ['settings.general.view']) };
    show(<GuardedEmailStatus />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(statusReads()).toHaveLength(0);
  });

  it('an administrator sees the page', async () => {
    show(<GuardedEmailStatus />);
    expect(await loaded()).toBeTruthy();
  });
});
