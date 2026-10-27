import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/safe-next';
import { SESSION_PRESENT_COOKIE } from '@/lib/auth/session';

/**
 * The server-side gate (FE-16, ADR-0032). Next 16 names this file `proxy.ts`; it is never
 * `middleware.ts`.
 *
 * It reads ONE cookie, `erp_session_present`, and nothing else:
 *
 * - it never reads `erp_refresh` — that cookie is `Path=/api/v1/auth/refresh`, so the Next server
 *   never receives it on a page request and could not read it if it wanted to (ADR-0005; widening
 *   the path is the alternative ADR-0032 rejects);
 * - it never calls `/api/v1/auth/me` — a round trip on every page request is the other alternative
 *   ADR-0032 rejects.
 *
 * `erp_session_present` is browser-writable and authorises NOTHING (T-3.1-30): its only job is to
 * keep an anonymous visitor off a shell page. Every api call behind the shell is guarded server
 * side and answers 401/403 regardless, and `withAuth` is the second layer, never the only one.
 */

/**
 * 302, not Next's default 307: the same status the Nginx `/admin/authentication` block returns, so
 * the browser treats both login redirects alike.
 *
 * The URL handed to `redirect` must be ABSOLUTE and that is forced, not chosen: Next's proxy
 * adapter parses whatever `Location` the response carries with `new NextURL(value)` and no base, so
 * a relative value throws `ERR_INVALID_URL` and the request 500s (measured on the standalone image,
 * plan 03.1-04). It is built from `request.nextUrl`, whose host is the `Host` header Nginx forwards
 * verbatim (`proxy_set_header Host $http_host`). The adapter then emits the header RELATIVE because
 * the origin matches the request's, so the wire carries `Location: /login?next=%2Fstaff` and the
 * port loss P8 warns about cannot happen.
 */
const REDIRECT_FOUND = 302;

/**
 * The paths this gate covers. It grows with each migrated screen; `/login`, `/logout` and `/status` stay outside.
 * Paths follow the menu (plan 04.2-27): `/setup/:path*` covers Setup > Staff, Setup > Roles,
 * every Wave 2a list (W2A) and the Setup > Email screens once. The old paths are redirected by
 * Nginx; no rule here may match a Perfex path.
 */
export const config = {
  matcher: ['/setup/:path*'],
};

export default function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_PRESENT_COOKIE)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const next = encodeURIComponent(safeNext(`${pathname}${search}`));
  return NextResponse.redirect(new URL(`/login?next=${next}`, request.nextUrl), REDIRECT_FOUND);
}
