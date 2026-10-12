// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import { AxiosHeaders } from 'axios';
import { useState } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestStateResponse } from '@/features/mail/schemas/mail.schema';
import { resetApiStatus } from '@/lib/api/api-status';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSendTest, useTestState } from '../use-test-send';

/**
 * "Send a test to me" (D-04, D-10): one `Idempotency-Key` per click, reused by the Retry of that
 * click; the state of the member's own test polled every `CLIENT_TIMINGS.mail.pollMs` through SWR
 * `refreshInterval` while queued or retrying (no effect), and `onFinal` called once.
 */
const DRAFT = { locale: 'en', subject: 'Template 1', message: 'Hello {staff_name}' };

function Sender({ mode }: { readonly mode: 'template' | 'status' }) {
  const sender = useSendTest(mode === 'template' ? '7' : null);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void sender.send(mode === 'template' ? DRAFT : undefined);
        }}
      >
        send
      </button>
      <button
        type="button"
        onClick={() => {
          void sender.retry();
        }}
      >
        retry
      </button>
      <output data-testid="pending">{String(sender.pending)}</output>
    </div>
  );
}

const state = (patch: Partial<TestStateResponse>): TestStateResponse => ({
  id: '31',
  status: 'queued',
  attempts: 0,
  maxAttempts: 8,
  nextTryAt: null,
  sentAt: null,
  failureReason: null,
  recipient: 'user@example.test',
  waitingForServer: false,
  ...patch,
});

function Poller({ onFinal }: { readonly onFinal: () => void }) {
  const [id, setId] = useState<string | null>(null);
  const test = useTestState(id, onFinal);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setId('31');
        }}
      >
        follow
      </button>
      <output data-testid="status">{test.data?.status ?? ''}</output>
    </div>
  );
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
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  vi.useRealTimers();
});

const keyOf = (index: number): string | undefined => fake.calls[index]?.headers['idempotency-key'];

describe('useSendTest', () => {
  beforeEach(() => {
    fake = fakeAdapter(202, { id: '31' });
    http.defaults.adapter = fake.adapter;
  });

  it('one click is one POST of the draft to templates/:id/test with an Idempotency-Key', async () => {
    show(<Sender mode="template" />);
    await userEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/templates/7/test');
    expect(fake.calls[0]?.method).toBe('POST');
    expect(fake.calls[0]?.data).toEqual(DRAFT);
    expect(keyOf(0)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('Retry re-sends the same click with the same key; a new click mints a new key', async () => {
    show(<Sender mode="template" />);
    await userEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(2);
    });
    expect(keyOf(1)).toBe(keyOf(0));
    expect(fake.calls[1]?.data).toEqual(DRAFT);
    await userEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(3);
    });
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it('Retry before any click is a first click: a fresh key', async () => {
    show(<Sender mode="template" />);
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    expect(fake.calls[0]?.data).toBeUndefined();
    expect(keyOf(0)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('status mode POSTs to status/test with no body', async () => {
    show(<Sender mode="status" />);
    await userEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/status/test');
    expect(fake.calls[0]?.data).toBeUndefined();
    expect(keyOf(0)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('useTestState', () => {
  it('reads the test every pollMs while queued or retrying, stops at sent, and calls onFinal once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const answers = [
      state({ status: 'queued' }),
      state({ status: 'retrying', attempts: 1, nextTryAt: '2026-10-03T10:00:30.000Z' }),
      state({ status: 'sent', attempts: 2, sentAt: '2026-10-03T10:00:31.000Z' }),
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
    const onFinal = vi.fn();
    show(<Poller onFinal={onFinal} />);
    await userEvent.click(screen.getByRole('button', { name: 'follow' }));
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
    expect(reads).toBe(2);
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
    expect(onFinal).toHaveBeenCalledTimes(1);
  });

  it('a null id asks nothing', async () => {
    fake = fakeAdapter(200, state({}));
    http.defaults.adapter = fake.adapter;
    show(<Poller onFinal={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.calls).toHaveLength(0);
  });
});
