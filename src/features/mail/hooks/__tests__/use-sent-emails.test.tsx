// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import { AxiosHeaders } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentEmailResponse, SentEmailRow } from '@/features/mail/schemas/mail.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useSentEmail, useSentEmails } from '../use-sent-emails';

/**
 * The sent-email log's reads (04.3 UI-SPEC § Sent emails log): the list envelope with its extra
 * `meta.templates` (every stored template key, the Template filter's options), which the list
 * template's own schema drops.
 */
const sentRow = (patch: Partial<SentEmailRow> = {}): SentEmailRow => ({
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
  ...patch,
});

const envelope = {
  data: [sentRow()],
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: 1,
    rangeStart: 1,
    templates: ['attendance_notice', 'remind_user_check_in'],
  },
};

function Facets({ params }: { readonly params: Record<string, string> | null }) {
  const list = useSentEmails(params);
  return <output data-testid="templates">{(list.data?.meta.templates ?? []).join(',')}</output>;
}

const show = (ui: React.ReactElement) =>
  renderWithProviders(
    <SWRConfig
      value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}
    >
      {ui}
    </SWRConfig>,
  );

let fake: FakeAdapter;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  fake = fakeAdapter(200, envelope);
  http.defaults.adapter = fake.adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  vi.useRealTimers();
});

describe('useSentEmails', () => {
  it('reads GET /api/v1/mail/sent-emails with its params and keeps meta.templates', async () => {
    show(<Facets params={{ limit: '1' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('templates').textContent).toBe(
        'attendance_notice,remind_user_check_in',
      );
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/sent-emails?limit=1');
    expect(fake.calls[0]?.method).toBe('GET');
  });

  it('null asks nothing', async () => {
    show(<Facets params={null} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.calls).toHaveLength(0);
  });
});

function Entry() {
  const entry = useSentEmail('41');
  return <output data-testid="status">{entry.data?.status ?? ''}</output>;
}

const detail = (patch: Partial<SentEmailResponse>): SentEmailResponse => ({
  ...sentRow(),
  serverReply: null,
  resentFromId: null,
  resentFromExists: false,
  ...patch,
});

describe('useSentEmail', () => {
  it('reads the entry every pollMs while queued or retrying and stops once it is sent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const answers = [
      detail({ status: 'queued', sentAt: null, attempts: 0 }),
      detail({ status: 'retrying', sentAt: null, nextTryAt: '2026-10-03T08:00:30.000Z' }),
      detail({ status: 'sent' }),
    ];
    let reads = 0;
    http.defaults.adapter = (config) => {
      const body = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      return Promise.resolve({
        data: body,
        status: 200,
        statusText: '200',
        headers: new AxiosHeaders(),
        config,
      });
    };
    show(<Entry />);
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('queued');
    });
    expect(reads).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs);
    });
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('retrying');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs);
    });
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('sent');
    });
    expect(reads).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs * 3);
    });
    expect(reads).toBe(3);
  });

  it('a failed entry is read once', async () => {
    fake = fakeAdapter(200, detail({ status: 'failed', sentAt: null, failureReason: 'timeout' }));
    http.defaults.adapter = fake.adapter;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show(<Entry />);
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('failed');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.mail.pollMs * 3);
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/sent-emails/41');
  });
});
