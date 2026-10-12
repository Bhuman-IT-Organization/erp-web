'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { handoffToLegacy } from '@/features/auth/api/legacy-handoff';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { useBackgroundHandoff } from '@/features/auth/hooks/use-background-handoff';
import type { ApiAdapter } from '@/lib/api/call-api';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { isNodePage, openLegacySession } from '@/lib/auth/legacy-session';
import { safeNext } from '@/lib/auth/safe-next';
import { RESUMED_AT_KEY, SIGNED_OUT_AT_KEY } from '@/lib/auth/session';
import { useResumeSession } from '@/lib/hooks/use-session';

type View = 'checking' | 'form' | 'handoff-failed';
type StampStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface LoginResumeProps {
  /** Already `safeNext`'d by the page; applied again here before navigating (defence in depth). */
  readonly next: string;
  /** Test and story seams only, as LoginForm has. */
  readonly adapter?: ApiAdapter;
  readonly handoff?: (accessToken: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  /** The client-side router's push (a Node `next`); a seam as LoginForm's. */
  readonly route?: (href: string) => void;
  /** Default `window.sessionStorage`, reached lazily inside the handler, never during render (SSR). */
  readonly storage?: StampStorage;
  readonly now?: () => number;
}

interface Stamps {
  readonly signedOutAt: string | null;
  readonly resumedAt: string | null;
}

/** This tab's two stamps, or `null` when session storage cannot be read (reaching it included). */
function readStamps(storage: StampStorage | undefined): Stamps | null {
  try {
    const s = storage ?? window.sessionStorage;
    return { signedOutAt: s.getItem(SIGNED_OUT_AT_KEY), resumedAt: s.getItem(RESUMED_AT_KEY) };
  } catch {
    return null;
  }
}

/**
 * The login card's skeleton, shaped like LoginForm so the card does not jump (D-39: no message, no
 * spinner). Sizes are the form's measured ones: 20 px labels 20 px above 38 px inputs, 42 px buttons.
 */
function LoginCardSkeleton(): ReactElement {
  const tc = useTranslations('common');
  return (
    <div role="status" aria-busy="true" data-testid="login-resume-pending">
      <span className="sr-only">{tc('loading')}</span>
      <Skeleton className="mb-5 h-5 w-28" />
      <Skeleton className="h-[38px] w-full" />
      <div className="mt-8 mb-5 flex items-end justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-[38px] w-full" />
      <Skeleton className="mt-6 h-[42px] w-full" />
      <div className="my-4 flex items-center gap-3">
        <div className="flex-1 border-t border-neutral-200" />
        <Skeleton className="h-5 w-6" />
        <div className="flex-1 border-t border-neutral-200" />
      </div>
      <Skeleton className="h-[42px] w-full" />
    </div>
  );
}

/**
 * `/login` with `erp_session_present` (ADR-0038). Perfex's `Authentication::admin()` sends a
 * signed-in staff member on to the dashboard; ours does too, but on the api's word, never the
 * cookie's: the card's skeleton shows while the tab's one bootstrap asks the api, a refreshed
 * session runs the same handoff a sign-in runs and navigates to `next`, and anything else shows
 * the form. The loop is closed three ways: a refused or unreachable refresh shows the form (and
 * ADR-0037 clears the flag), a failed handoff shows the handoff-failed state with Retry, and a
 * second automatic resume within `CLIENT_TIMINGS.login.resumeLoopGuardMs` in this tab (or storage
 * that cannot be read) shows that state instead of handing off again. Within
 * `CLIENT_TIMINGS.login.signedOutGuardMs` of a sign-out in this tab it shows the form, so a
 * sign-out whose api call failed is never undone by a resume.
 *
 * A Node `next` is entered at once through the client-side router and the handoff runs in the
 * background, as after a sign-in (quick 261009-lgn); a Perfex `next` still waits for it.
 */
export function LoginResume({
  next,
  adapter,
  handoff = handoffToLegacy,
  navigate = (href) => {
    // A full navigation on purpose, as LoginForm's: `next` leads into the legacy PHP app.
    window.location.assign(href);
  },
  route,
  storage,
  now = Date.now,
}: LoginResumeProps): ReactElement {
  const [view, setView] = useState<View>('checking');
  const router = useRouter();
  const inBackground = useBackgroundHandoff(handoff);
  const recent = (stamp: string | null, ms: number): boolean =>
    stamp !== null && now() - Number(stamp) < ms;

  async function resume(accessToken: string): Promise<void> {
    const stamps = readStamps(storage);
    if (stamps === null) {
      setView('handoff-failed');
      return;
    }
    if (recent(stamps.signedOutAt, CLIENT_TIMINGS.login.signedOutGuardMs)) {
      setView('form');
      return;
    }
    if (recent(stamps.resumedAt, CLIENT_TIMINGS.login.resumeLoopGuardMs)) {
      setView('handoff-failed');
      return;
    }
    const target = safeNext(next);
    if (isNodePage(target)) {
      stampResume();
      inBackground(accessToken);
      if (route === undefined) router.push(target);
      else route(target);
      return;
    }
    if (!(await openLegacySession(accessToken, handoff))) {
      setView('handoff-failed');
      return;
    }
    stampResume();
    navigate(new URL(target, window.location.origin).href);
  }

  function stampResume(): void {
    try {
      (storage ?? window.sessionStorage).setItem(RESUMED_AT_KEY, String(now()));
    } catch {
      // No storage: the next visit reads nothing and refuses to resume anyway (readStamps).
    }
  }

  useResumeSession(
    {
      onSignedIn: (token) => {
        void resume(token);
      },
      onSignedOut: () => {
        setView('form');
      },
    },
    adapter ? { adapter } : {},
  );

  if (view === 'checking') return <LoginCardSkeleton />;
  return (
    <LoginForm
      next={next}
      handoffFailed={view === 'handoff-failed'}
      handoff={handoff}
      navigate={navigate}
      {...(route ? { route } : {})}
      {...(adapter ? { adapter } : {})}
    />
  );
}
