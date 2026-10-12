// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { forgetLegacySession, isLegacySessionOpen } from '@/lib/auth/legacy-session';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import authEn from '../../messages/en.json';
import { useBackgroundHandoff } from '../use-background-handoff';

type Opener = (token: string) => Promise<boolean>;

function Starter({ open, token }: { open: Opener; token: string }): ReactElement {
  const inBackground = useBackgroundHandoff(open);
  return (
    <button
      type="button"
      onClick={() => {
        inBackground(token);
      }}
    >
      start
    </button>
  );
}

function renderStarter(open: Opener, token = 'tok') {
  renderWithProviders(
    <>
      <Starter open={open} token={token} />
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  forgetLegacySession();
  clearSession();
  window.sessionStorage.clear();
  toast.dismiss();
});

describe('useBackgroundHandoff', () => {
  it('a handoff that opens the session shows nothing', async () => {
    const open = vi.fn<Opener>(() => Promise.resolve(true));
    renderStarter(open);
    await userEvent.click(screen.getByText('start'));
    await waitFor(() => {
      expect(isLegacySessionOpen()).toBe(true);
    });
    expect(open).toHaveBeenCalledExactlyOnceWith('tok');
    expect(screen.queryByText(authEn.auth.handoff_failed)).toBeNull();
  });

  it("a failure toasts handoff_failed with Retry; Retry hands off with the session's current token", async () => {
    setSession({ accessToken: 'renewed', csrfToken: 'c' });
    const open = vi.fn<Opener>();
    open.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderStarter(open);
    await userEvent.click(screen.getByText('start'));
    expect(await screen.findByText(authEn.auth.handoff_failed)).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(open).toHaveBeenLastCalledWith('renewed');
    });
  });

  it('Retry after the session ended hands off nothing', async () => {
    const open = vi.fn<Opener>(() => Promise.resolve(false));
    renderStarter(open);
    await userEvent.click(screen.getByText('start'));
    await screen.findByText(authEn.auth.handoff_failed);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
