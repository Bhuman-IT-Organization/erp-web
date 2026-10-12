'use client';

import { usePathname } from 'next/navigation';
import type { ComponentType, ReactElement } from 'react';
import { InlineError } from '@/components/molecules/InlineError';
import { NoAccessState } from '@/components/organisms/NoAccessState';
import { PageSkeleton, type PageSkeletonVariant } from '@/components/organisms/PageSkeleton';
import { isAdminGate, routeGateOf } from '@/config/route-gates';
import { useErrorText } from '@/lib/errors/use-error-text';
import { usePermissions } from '@/lib/auth/use-permissions';

/** The page shape a guard waits in: the page declares it once, both HOCs render it (D-39). */
export type GuardSkeleton = PageSkeletonVariant;

export interface GuardOptions {
  readonly skeleton: GuardSkeleton;
}

/**
 * Renders `Component` when the member passes the gate `ROUTE_GATES` declares for the current
 * pathname (D-15): no page passes a code, so the page and the api cannot disagree about who may see
 * it. An administrator gate needs the flag; a code gate needs the code, or the flag (the api's own
 * bypass, ADR-0033 d.4, carried by `canAny`). A path the map does not name is REFUSED — fail closed
 * (T-3.2-33).
 *
 * Nothing is shown before its answer is known (D-39), in exactly this precedence: while `/me` is
 * loading, the page's own `PageSkeleton` variant; when `/me` has FAILED, an `InlineError` with Retry
 * for a retryable failure — an outage is never "no access" (RESEARCH Pitfall 7, T-3.2-36); only once
 * the permissions have arrived and the gate is absent, `NoAccessState`. "Loading" is the FIRST answer
 * only (`useCommonApi`): once `/me` has failed the error stays through SWR's automatic retries, and
 * its Retry is busy while any retry is in flight, so the skeleton never comes back.
 *
 * Like `withAuth`, this is the second layer and never the only check: the api guards every call
 * and answers 403 regardless of what the UI rendered (FE-16, D-16). A refusal is a MESSAGE, never a
 * redirect — a client redirect layered on `proxy.ts` is how a loop starts.
 *
 * Compose it inside a `'use client'` component file, never in a route file (`APP_IMPORT` forbids
 * `@/hocs`): `withAuth(withPermission(Page, { skeleton: 'list' }), { skeleton: 'list' })`.
 */
export function withPermission<P extends object>(
  Component: ComponentType<P>,
  { skeleton }: GuardOptions,
): ComponentType<P> {
  function WithPermission(props: P): ReactElement {
    const pathname = usePathname();
    const gate = routeGateOf(pathname);
    const { isLoading, error, isValidating, retry, isAdmin, canAny } = usePermissions();
    const errorText = useErrorText();
    if (isLoading) return <PageSkeleton variant={skeleton} testId="permission-pending" />;
    if (error !== undefined) {
      return (
        <InlineError
          testId="permission-error"
          message={errorText(error)}
          busy={isValidating}
          {...(error.retryable ? { onRetry: retry } : {})}
        />
      );
    }
    const allowed = gate === undefined ? false : isAdminGate(gate) ? isAdmin : canAny(gate);
    return allowed ? <Component {...props} /> : <NoAccessState />;
  }
  WithPermission.displayName = `withPermission(${Component.displayName ?? Component.name})`;
  return WithPermission;
}
