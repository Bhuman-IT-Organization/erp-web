// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { useState } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useResend } from '../use-resend';

/**
 * Resend (04.3 UI-SPEC § Resend, D-05, T-4.3-08): `POST sent-emails/:id/resend` with one
 * `Idempotency-Key` per dialog opening, reused by a retry inside that opening, so a double click or
 * a retry after a lost answer sends one email; a new opening mints a new key.
 */
function Resender() {
  const [open, setOpen] = useState(false);
  const resender = useResend('41', open);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
        }}
      >
        toggle
      </button>
      <button
        type="button"
        onClick={() => {
          void resender.resend();
        }}
      >
        resend
      </button>
      <output data-testid="pending">{String(resender.pending)}</output>
    </div>
  );
}

const show = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <Resender />
    </SWRConfig>,
  );

let fake: FakeAdapter;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  fake = fakeAdapter(202, { id: '42' });
  http.defaults.adapter = fake.adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

const keyOf = (index: number): string | undefined => fake.calls[index]?.headers['idempotency-key'];

describe('useResend', () => {
  it('POSTs sent-emails/:id/resend with no body and an Idempotency-Key', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await userEvent.click(screen.getByRole('button', { name: 'resend' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/sent-emails/41/resend');
    expect(fake.calls[0]?.method).toBe('POST');
    expect(fake.calls[0]?.data).toBeUndefined();
    expect(keyOf(0)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('one key per opening: a second send in the same opening reuses it, a new opening mints another', async () => {
    show();
    const toggle = screen.getByRole('button', { name: 'toggle' });
    const resend = screen.getByRole('button', { name: 'resend' });
    await userEvent.click(toggle);
    await userEvent.click(resend);
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    await userEvent.click(resend);
    await waitFor(() => {
      expect(fake.calls).toHaveLength(2);
    });
    expect(keyOf(1)).toBe(keyOf(0));
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    await userEvent.click(resend);
    await waitFor(() => {
      expect(fake.calls).toHaveLength(3);
    });
    expect(keyOf(2)).toMatch(/^[0-9a-f]{32}$/);
    expect(keyOf(2)).not.toBe(keyOf(0));
  });
});
