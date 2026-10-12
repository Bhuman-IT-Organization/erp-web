'use client';

import type { ComponentType, ReactElement } from 'react';
import { PageSkeleton } from '@/components/organisms/PageSkeleton';
import { SignedOutState } from '@/components/organisms/SignedOutState';
import { useSession } from '@/lib/hooks/use-session';
import type { GuardOptions } from './withPermission';

/**
 * Renders `Component` once a session has been recovered, the page's own `PageSkeleton` variant while
 * it is being recovered, and `SignedOutState` only once the session is KNOWN to be absent (D-14,
 * D-39). Composed around `withPermission` with the same variant, the skeleton keeps one shape
 * through both phases.
 *
 * This is the SECOND layer and **never the only check**: `proxy.ts` has already refused an
 * anonymous visitor at the edge on `erp_session_present`, and the api answers 401/403 on every
 * call whatever the UI shows (FE-16). Hiding a screen is a courtesy to the member, not a control.
 *
 * A refusal renders a MESSAGE, never a redirect. `proxy.ts` redirects to `/login` and a client
 * redirect on top of it is how a loop starts: the proxy sends the visitor to the page, the page
 * sends them back, and neither side can tell whose turn it is.
 *
 * It calls the same `useSession()` as `PageShell`, which joins the shell's in-flight bootstrap or
 * reads the settled status: it can never start a second refresh in the same tab (WR-07). Once a
 * refresh ends the session, the api clears both session cookies (ADR-0037), so the next
 * navigation reaches `/login` through `proxy.ts` without any redirect here.
 */
export function withAuth<P extends object>(
  Component: ComponentType<P>,
  { skeleton }: GuardOptions,
): ComponentType<P> {
  function WithAuth(props: P): ReactElement {
    const { isReady, isSignedIn } = useSession();
    if (!isReady) return <PageSkeleton variant={skeleton} testId="auth-pending" />;
    if (!isSignedIn) return <SignedOutState />;
    return <Component {...props} />;
  }
  WithAuth.displayName = `withAuth(${Component.displayName ?? Component.name})`;
  return WithAuth;
}
