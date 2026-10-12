// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyLink } from '@/components/molecules/LegacyLink';
import { forgetLegacySession, isLegacySessionOpen } from '@/lib/auth/legacy-session';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { HANDOFF_PATH } from '../../api/legacy-handoff';
import { LegacyLinkGuard } from '../LegacyLinkGuard';

beforeEach(() => {
  forgetLegacySession();
  clearSession();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LegacyLinkGuard', () => {
  it("the kit's LegacyLink on a page with no legacy session: the real handoff runs with the session's bearer, then the page goes to Perfex", async () => {
    setSession({ accessToken: 'live', csrfToken: 'c' });
    const fetchSpy = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
    renderWithProviders(
      <>
        <LegacyLinkGuard />
        <LegacyLink href="/admin/invoices">invoices</LegacyLink>
      </>,
    );
    await userEvent.click(screen.getByText('invoices'));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(`${window.location.origin}/admin/invoices`);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(HANDOFF_PATH);
    expect(isLegacySessionOpen()).toBe(true);
  });
});
