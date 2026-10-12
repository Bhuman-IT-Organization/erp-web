'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchCsrf, logout, refresh } from '@/features/auth/api/auth.endpoints';
import type { ApiAdapter } from '@/lib/api/call-api';
import { forgetLegacySession } from '@/lib/auth/legacy-session';
import { clearSession, SIGNED_OUT_AT_KEY } from '@/lib/auth/session';
import { useRunOnce, withRefreshLock } from '@/lib/hooks/use-session';

// Perfex ends `sp_session` here and redirects to its login, which Nginx sends to /login. `?legacy=1`
// because Nginx sends a plain GET of this path to /logout?from=legacy, this page (ADR-0038).
const LEGACY_LOGOUT = '/admin/authentication/logout?legacy=1';

interface LogoutButtonProps {
  /** Sign out on arrival, no click: Perfex's own Logout link (`/logout?from=legacy`, ADR-0038). */
  readonly auto?: boolean;
  /** Test seams only: a fake transport and a navigation double. */
  readonly adapter?: ApiAdapter;
  readonly navigate?: (href: string) => void;
}

/**
 * Revokes the Node session first (the in-memory token is gone after a full navigation, so one is
 * recovered through the refresh cookie + CSRF), then ends the CI session at the legacy logout.
 * Any step failing still navigates to the legacy logout: the user asked to leave. Before it
 * navigates it stamps the sign-out in this tab, so `/login` never turns it into a resume
 * (ADR-0038). With `auto` it runs on arrival, exactly once (useRunOnce), and shows a
 * skeleton-shaped "Signing out…" state instead of the button (D-39).
 */
export function LogoutButton({
  auto,
  adapter,
  navigate = (href) => {
    // A full navigation on purpose: the destination is the legacy PHP app behind the same Nginx
    // origin, not a Next.js page, so the router must not be used.
    window.location.assign(href);
  },
}: LogoutButtonProps = {}) {
  const t = useTranslations('auth');
  const [busy, setBusy] = useState(auto === true);

  async function signOut(): Promise<void> {
    setBusy(true);
    // Inside the tab's refresh lock: a renewal in flight (use-session) must finish rotating the
    // cookie before this refresh presents it, or the api sees reuse (WR-07).
    await withRefreshLock(async () => {
      const csrf = await fetchCsrf(adapter);
      if (!csrf.ok) return;
      const r = await refresh(csrf.data.csrfToken, adapter);
      if (r.ok) await logout(r.data.accessToken, r.data.csrfToken, adapter);
    });
    clearSession();
    forgetLegacySession();
    try {
      window.sessionStorage.setItem(SIGNED_OUT_AT_KEY, String(Date.now()));
    } catch {
      // No storage: LoginResume refuses to resume then anyway.
    }
    navigate(new URL(LEGACY_LOGOUT, window.location.origin).href);
  }

  useRunOnce(auto === true, () => {
    void signOut();
  });

  if (auto === true) {
    return (
      <div
        role="status"
        aria-busy="true"
        data-testid="logout-auto-pending"
        className="flex flex-col gap-1"
      >
        <p className="text-muted-foreground text-sm">{t('signing_out')}</p>
        {/* Where the Sign out button stands, at its height (h-8). */}
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  return (
    <Button
      type="button"
      data-testid="logout-button"
      disabled={busy}
      onClick={() => {
        void signOut();
      }}
    >
      {busy ? t('signing_out') : t('logout_button')}
    </Button>
  );
}
