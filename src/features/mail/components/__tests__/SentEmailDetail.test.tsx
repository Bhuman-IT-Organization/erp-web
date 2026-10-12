// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { SentEmailResponse, TemplateListItem } from '@/features/mail/schemas/mail.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
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
import { GuardedSentEmailDetail, SentEmailDetail } from '../SentEmailDetail';

/**
 * One sent email (04.3 UI-SPEC § Sent email detail, § Resend, § States and stories): one `it` per
 * story, over a fake axios adapter on the shared instance. Synthetic entries only
 * (`user@example.test`, "550 5.1.1 synthetic").
 */
const EN = en.mail;
const COMMON = commonEn.common;
const ENTRY_PATH = '/api/v1/mail/sent-emails/41';
const TEMPLATES = '/api/v1/mail/templates';

const push = vi.fn<(href: string) => void>();
vi.mock('next/navigation', () => ({
  usePathname: () => '/setup/sent-emails/41',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
const crumbs = vi.fn<(label: string | null | undefined) => void>();
vi.mock('@/lib/hooks/use-breadcrumb-label', () => ({
  useBreadcrumbLabel: (label: string | null | undefined) => {
    crumbs(label);
  },
}));

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
  serverReply: '550 5.1.1 synthetic\nmailbox unavailable',
});
const RETRYING = record({
  status: 'retrying',
  attempts: 2,
  sentAt: null,
  nextTryAt: '2026-10-03T08:05:00.000Z',
  failureReason: 'timeout',
});
const template = (id: number, key: string): TemplateListItem => ({
  id: String(id),
  key,
  module: 'timesheets',
  audience: 'staff',
  active: true,
  locales: ['en'],
});
const templatesPage = (rows: readonly TemplateListItem[]) => ({
  data: rows,
  meta: { nextCursor: null, prevCursor: null, total: rows.length, modules: [], locales: ['en'] },
});
const ADMIN = {
  staffId: 1,
  email: 'admin@example.test',
  firstName: 'Some',
  lastName: 'One',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};
const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

type Reply = { readonly status: number; readonly body?: unknown } | 'pending';
let api: { me: Reply; entry: Reply | (() => Reply); templates: Reply; write: Reply };
let requests: { readonly method: string; readonly url: URL }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  requests.push({ method, url });
  const reply =
    url.pathname === '/api/v1/auth/me'
      ? api.me
      : method !== 'GET'
        ? api.write
        : url.pathname === TEMPLATES
          ? api.templates
          : typeof api.entry === 'function'
            ? api.entry()
            : api.entry;
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

function show(ui = <SentEmailDetail id="41" />, locale?: 'ar') {
  return renderWithProviders(
    <SWRConfig
      value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}
    >
      {ui}
      <Toaster />
    </SWRConfig>,
    locale === undefined ? {} : { locale },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  api = {
    me: { status: 200, body: ADMIN },
    entry: { status: 200, body: record() },
    templates: { status: 200, body: templatesPage([template(7, 'attendance_notice')]) },
    write: { status: 202, body: { id: '58' } },
  };
  http.defaults.adapter = respond;
  push.mockClear();
  crumbs.mockClear();
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  vi.useRealTimers();
});

const loaded = () => screen.findByTestId('sent-email-detail');
const valueOf = (term: string): HTMLElement => {
  const dt = screen.getAllByRole('term').find((node) => node.textContent === term);
  const dd = dt?.nextElementSibling;
  if (!(dd instanceof HTMLElement)) throw new Error(`no value for ${term}`);
  return dd;
};
const terms = () => screen.getAllByRole('term').map((node) => node.textContent);
const entryReads = () =>
  requests.filter((r) => r.method === 'GET' && r.url.pathname === ENTRY_PATH);

describe('SentEmailDetail: the states (FE-27, D-39)', () => {
  it('Loading: the form skeleton, no message', async () => {
    api.entry = 'pending';
    show();
    expect(await screen.findByTestId('sent-email-loading')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toContain(EN.sent_email_not_found);
  });

  it('Error: a 503 in plain words with Retry and Back to list; the crumb stops waiting', async () => {
    api.entry = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: COMMON.retry })).toBeTruthy();
    expect(screen.getByRole('link', { name: COMMON.back_to_list }).getAttribute('href')).toBe(
      '/setup/sent-emails',
    );
    expect(alert.textContent).not.toMatch(/ERP-/);
    expect(crumbs).toHaveBeenLastCalledWith(null);
  });

  it('NotFound: "This sent email no longer exists." with Back to list', async () => {
    api.entry = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show();
    expect(await screen.findByText(EN.sent_email_not_found)).toBeTruthy();
    expect(screen.getByRole('link', { name: COMMON.back_to_list })).toBeTruthy();
  });

  it('Loaded: the template name as title with the status badge, and the definition list of UI-SPEC', async () => {
    show();
    await loaded();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe(EN.template_names.attendance_notice);
    expect(
      screen.getByTestId('sent-email-title').querySelector('[data-status="done"]')?.textContent,
    ).toBe(EN.status_sent);
    expect(terms()).toEqual([
      EN.template,
      EN.recipient,
      EN.language,
      EN.queued_at,
      EN.sent_at,
      EN.attempts,
    ]);
    await waitFor(() => {
      expect(
        within(valueOf(EN.template))
          .getByRole('link', { name: EN.template_names.attendance_notice })
          .getAttribute('href'),
      ).toBe('/setup/email-templates/7');
    });
    expect(valueOf(EN.recipient).querySelector('bdi')?.textContent).toBe('user@example.test');
    expect(valueOf(EN.language).textContent).toBe('English');
    expect(valueOf(EN.attempts).textContent).toBe('1 of 8');
    expect(screen.getByTestId('sent-email-caption').textContent).toBe(EN.body_not_kept);
    expect(crumbs).toHaveBeenLastCalledWith(EN.template_names.attendance_notice);
  });

  it('a queued entry reads "Not sent" and offers no Resend', async () => {
    api.entry = { status: 200, body: record({ status: 'queued', sentAt: null, attempts: 0 }) };
    show();
    await loaded();
    expect(valueOf(EN.sent_at).textContent).toBe(EN.not_sent);
    expect(screen.queryByRole('button', { name: EN.resend })).toBeNull();
  });

  it('Failed: the reason sentence, and the collapsed server reply as text with its line breaks', async () => {
    api.entry = { status: 200, body: FAILED };
    show();
    await loaded();
    expect(valueOf(EN.error).textContent).toContain(EN.failure_reason.recipient_refused);
    const details = screen.getByText(EN.server_reply).closest('details');
    expect(details?.open).toBe(false);
    const reply = details?.querySelector('bdi');
    expect(reply?.textContent).toBe('550 5.1.1 synthetic\nmailbox unavailable');
    expect(reply?.className).toContain('whitespace-pre-line');
  });

  it('a reply holding markup renders its characters, never an element (T-4.3-16)', async () => {
    api.entry = { status: 200, body: record({ ...FAILED, serverReply: '<b>x</b>' }) };
    show();
    await loaded();
    const details = screen.getByText(EN.server_reply).closest('details');
    expect(details?.querySelector('b')).toBeNull();
    expect(details?.textContent).toContain('<b>x</b>');
  });

  it('no Error row and no disclosure on a sent entry', async () => {
    show();
    await loaded();
    expect(terms()).not.toContain(EN.error);
    expect(screen.queryByText(EN.server_reply)).toBeNull();
  });

  it('Retrying: Next try shown; the entry is read again every pollMs and no longer once it is sent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const answers = [RETRYING, RETRYING, record()];
    let reads = 0;
    api.entry = () => {
      const body = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      return { status: 200, body };
    };
    show();
    await loaded();
    expect(terms()).toContain(EN.next_try_at);
    expect(valueOf(EN.error).textContent).toContain(EN.failure_reason.timeout);
    expect(entryReads()).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs);
    });
    await waitFor(() => {
      expect(entryReads()).toHaveLength(2);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs);
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('sent-email-title').querySelector('[data-status="done"]'),
      ).toBeTruthy();
    });
    expect(entryReads()).toHaveLength(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs * 3);
    });
    expect(entryReads()).toHaveLength(3);
  });

  it('Resent: "An earlier email" links to the original when it still exists, and is absent when not', async () => {
    api.entry = { status: 200, body: record({ resentFromId: '30', resentFromExists: true }) };
    show();
    await loaded();
    expect(
      within(valueOf(EN.resent_from))
        .getByRole('link', { name: EN.earlier_email })
        .getAttribute('href'),
    ).toBe('/setup/sent-emails/30');
    cleanup();
    api.entry = { status: 200, body: record({ resentFromId: '30', resentFromExists: false }) };
    show();
    await loaded();
    expect(terms()).not.toContain(EN.resent_from);
  });

  it('Test: a template test carries the Test badge and no Resend; a status-page test is titled "Test email" with no template link', async () => {
    api.entry = { status: 200, body: record({ isTest: true, templateActive: null }) };
    show();
    await loaded();
    expect(within(screen.getByTestId('sent-email-title')).getByText(EN.test_badge)).toBeTruthy();
    expect(screen.queryByRole('button', { name: EN.resend })).toBeNull();
    cleanup();
    requests = [];
    api.entry = {
      status: 200,
      body: record({ isTest: true, templateKey: null, templateActive: null }),
    };
    show();
    await loaded();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(EN.test_email_template);
    expect(within(valueOf(EN.template)).queryByRole('link')).toBeNull();
    expect(requests.filter((r) => r.url.pathname === TEMPLATES)).toHaveLength(0);
  });

  it('Resend from the entry: confirmed, then the page goes to the new entry permalink', async () => {
    api.entry = { status: 200, body: FAILED };
    show();
    await loaded();
    await userEvent.click(screen.getByRole('button', { name: EN.resend }));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: EN.resend_email }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/setup/sent-emails/58');
    });
    expect(await screen.findByText(EN.resent_toast)).toBeTruthy();
  });

  it('Back to list is the recorded list URL', async () => {
    show();
    await loaded();
    expect(screen.getByRole('link', { name: COMMON.back_to_list }).getAttribute('href')).toBe(
      '/setup/sent-emails',
    );
  });

  it('Rtl: no physical-direction class under ar', async () => {
    api.entry = { status: 200, body: FAILED };
    show(<SentEmailDetail id="41" />, 'ar');
    await loaded();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });

  it('Mobile: the definition list is one column below md', async () => {
    show();
    await loaded();
    const list = screen.getAllByRole('term')[0]?.closest('dl');
    expect(list?.className).toContain('grid-cols-1');
    expect(list?.className).toContain('md:grid-cols-2');
  });
});

describe('GuardedSentEmailDetail (administrator only, D-05)', () => {
  it('a member who is not an administrator gets the no-access state, and the entry is never read', async () => {
    api.me = { status: 200, body: { ...ADMIN, isAdmin: false } };
    show(<GuardedSentEmailDetail id="41" />);
    expect(await screen.findByTestId('permission-refused')).toBeTruthy();
    expect(entryReads()).toHaveLength(0);
  });

  it('an administrator sees the entry', async () => {
    show(<GuardedSentEmailDetail id="41" />);
    expect(await loaded()).toBeTruthy();
  });
});
