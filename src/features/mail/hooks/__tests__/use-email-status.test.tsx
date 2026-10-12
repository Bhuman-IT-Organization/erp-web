// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useEmailStatus } from '../use-email-status';

/** `GET /api/v1/mail/status` (D-02): the read-only mail setup, parsed by its schema. */
const STATUS = {
  configured: true,
  sender: { name: 'Company 1', address: 'noreply@example.test' },
  host: 'mail.example.test',
  port: 587,
  encryption: 'tls',
  server: { answering: true, since: null },
  lastSend: null,
  sendTest: { configured: true, recipient: 'admin@example.test' },
};

function Status() {
  const status = useEmailStatus();
  return <output data-testid="host">{status.data?.host ?? ''}</output>;
}

let fake: FakeAdapter;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  fake = fakeAdapter(200, STATUS);
  http.defaults.adapter = fake.adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useEmailStatus', () => {
  it('reads GET /api/v1/mail/status', async () => {
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Status />
      </SWRConfig>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('host').textContent).toBe('mail.example.test');
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/status');
    expect(fake.calls[0]?.method).toBe('GET');
  });
});
