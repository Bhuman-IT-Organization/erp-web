// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { physicalClassesIn, renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import en from '../../messages/en.json';
import { ResendDialog, type ResendDialogProps } from '../ResendDialog';

/**
 * Resend (04.3 UI-SPEC § Resend, choice 9): a kind access confirmation naming the recipient; refused
 * up front when the row says the template is off; a live refusal stays in the dialog; one request per
 * opening (T-4.3-08). Synthetic address only.
 */
const EN = en.mail;
const RECIPIENT = 'user@example.test';
const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});

let fake: FakeAdapter;
let onResent: ReturnType<typeof vi.fn<(id: string) => void>>;
let onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>>;

function show(entry: Partial<ResendDialogProps['entry']> = {}, locale?: 'ar') {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <ResendDialog
        entry={{ id: '41', recipient: RECIPIENT, templateActive: true, ...entry }}
        open
        onOpenChange={onOpenChange}
        onResent={onResent}
      />
      <Toaster />
    </SWRConfig>,
    locale === undefined ? {} : { locale },
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  fake = fakeAdapter(202, { id: '42' });
  http.defaults.adapter = fake.adapter;
  onResent = vi.fn<(id: string) => void>();
  onOpenChange = vi.fn<(open: boolean) => void>();
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

const dialog = () => screen.findByTestId('confirm-dialog');
const confirmButton = () => screen.getByRole('button', { name: EN.resend_email });

describe('ResendDialog', () => {
  it('names the recipient, says what is sent, and offers Back to the log and Resend email', async () => {
    show();
    const box = await dialog();
    expect(screen.getByRole('heading').textContent).toContain(RECIPIENT);
    expect(screen.getByRole('heading').textContent).toContain('Resend this email to');
    expect(box.textContent).toContain(EN.resend_body);
    expect(screen.getByRole('button', { name: EN.back_to_log })).toBeTruthy();
    expect(confirmButton().hasAttribute('disabled')).toBe(false);
  });

  it('Resend email POSTs once with an Idempotency-Key, toasts "Email queued to resend" and hands over the new id', async () => {
    show();
    await dialog();
    await userEvent.click(confirmButton());
    await waitFor(() => {
      expect(onResent).toHaveBeenCalledWith('42');
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/sent-emails/41/resend');
    expect(fake.calls[0]?.headers['idempotency-key']).toMatch(/^[0-9a-f]{32}$/);
    expect(await screen.findByText(EN.resent_toast)).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a double click sends one request', async () => {
    let release: (() => void) | undefined;
    http.defaults.adapter = (config) => {
      fake.calls.push({
        url: config.url ?? '',
        method: 'POST',
        headers: {},
        data: undefined,
        withCredentials: undefined,
        timeout: undefined,
      });
      return new Promise((resolve) => {
        release = () => {
          resolve({ data: { id: '42' }, status: 202, statusText: '202', headers: {}, config });
        };
      });
    };
    show();
    await dialog();
    const user = userEvent.setup();
    await user.dblClick(confirmButton());
    expect(await screen.findByRole('button', { name: EN.resending_email })).toBeTruthy();
    release?.();
    await waitFor(() => {
      expect(onResent).toHaveBeenCalledTimes(1);
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('ResendRefusedInactive: a switched-off template is refused up front, confirm disabled, nothing sent', async () => {
    show({ templateActive: false });
    const box = await dialog();
    expect(box.textContent).toContain(EN.errors['ERP-MAIL-0004']);
    expect(confirmButton().hasAttribute('disabled')).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it('ResendRefusedLive: a 409 ERP-MAIL-0005 is shown in the dialog with confirm disabled', async () => {
    fake = fakeAdapter(409, problem(409, 'ERP-MAIL-0005'));
    http.defaults.adapter = fake.adapter;
    show();
    const box = await dialog();
    await userEvent.click(confirmButton());
    await waitFor(() => {
      expect(box.textContent).toContain(EN.errors['ERP-MAIL-0005']);
    });
    expect(confirmButton().hasAttribute('disabled')).toBe(true);
    expect(onResent).not.toHaveBeenCalled();
    expect(box.textContent).not.toMatch(/ERP-/);
  });

  it.each(['ERP-MAIL-0002', 'ERP-MAIL-0006'] as const)(
    'a live 409 %s reads its own words in the dialog',
    async (code) => {
      fake = fakeAdapter(409, problem(409, code));
      http.defaults.adapter = fake.adapter;
      show();
      const box = await dialog();
      await userEvent.click(confirmButton());
      await waitFor(() => {
        expect(box.textContent).toContain(EN.errors[code]);
      });
    },
  );

  it('a markup recipient is text, never an element (T-4.3-16)', async () => {
    show({ recipient: '<b>x</b>@example.test' });
    const box = await dialog();
    expect(box.querySelector('b')).toBeNull();
    expect(box.textContent).toContain('<b>x</b>@example.test');
  });

  it('Rtl: no physical-direction class under ar', async () => {
    show({}, 'ar');
    await dialog();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});
