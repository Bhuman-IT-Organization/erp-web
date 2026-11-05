import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest, type NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { NODE_GATED_PREFIXES } from '../src/lib/auth/legacy-session';
import { safeNext } from '../src/lib/auth/safe-next';
import proxy, { config } from '../proxy';

/**
 * The gate's whole contract (FE-16, ADR-0032): no `erp_session_present` → `/login?next=<safe>`,
 * the cookie → straight through, and `erp_refresh` alone changes nothing (the proof the gate never
 * reads it). The reflected `?next=` goes through `safeNext` and is percent-encoded whole, so an
 * attacker-controlled query cannot become the redirect's authority (T-3.1-31).
 *
 * The matcher is asserted with Next's own `unstable_doesMiddlewareMatch` (the 16.3.5 docs name it
 * `unstable_doesProxyMatch`, which the installed package does not export): calling `proxy()`
 * directly never consults `config.matcher`, so a hand-rolled "outside the matcher" case would
 * prove nothing.
 */
const ORIGIN = 'http://localhost:8088';
const at = (url: string, cookie?: string): NextRequest =>
  new NextRequest(new URL(url, ORIGIN), { headers: cookie === undefined ? {} : { cookie } });

/** The `Location` of a redirect this gate produced, as origin-relative text. */
const locationOf = (response: NextResponse): string =>
  (getRedirectUrl(response) ?? '').replace(ORIGIN, '');

/** The `next` parameter of a redirect this gate produced, decoded. */
const nextOf = (location: string): string =>
  decodeURIComponent(location.slice('/login?next='.length));

const doesMatch = (url: string): boolean =>
  unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${url}` });

describe('proxy', () => {
  it('redirects a visitor with no session cookie to /login with the encoded original path', () => {
    const response = proxy(at('/setup/staff'));
    expect(response.status).toBe(302);
    // Absolute in the response object by necessity (a relative Location makes the adapter 500);
    // the adapter emits it relative on the wire (checked with a curl against :8088).
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/login?next=%2Fsetup%2Fstaff`);
    expect(locationOf(response)).toBe('/login?next=%2Fsetup%2Fstaff');
  });

  it('keeps the query string of the original path, encoded whole', () => {
    expect(locationOf(proxy(at('/setup/staff?q=ann')))).toBe(
      '/login?next=%2Fsetup%2Fstaff%3Fq%3Dann',
    );
  });

  it('lets a visitor who carries erp_session_present through', () => {
    const response = proxy(at('/setup/staff/12', 'erp_session_present=1'));
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('still redirects a request carrying only erp_refresh (the gate never reads it)', () => {
    const response = proxy(at('/setup/roles', 'erp_refresh=whatever'));
    expect(response.status).toBe(302);
    expect(locationOf(response)).toBe('/login?next=%2Fsetup%2Froles');
  });

  it.each([
    ['an absolute URL', '/setup/staff?next=https://evil.example.com/x'],
    ['a protocol-relative URL', '/setup/staff?next=//evil.example.com/x'],
    ['a backslash form', '/setup/staff?next=%5Cevil.example.com'],
  ])('%s cannot leave the origin: safeNext owns the reflected value', (_name, url) => {
    const location = locationOf(proxy(at(url)));
    expect(location.startsWith('/login?next=%2F')).toBe(true);
    expect(location).not.toContain('//evil.example.com');
    const next = nextOf(location);
    expect(next.startsWith('/') && !next.startsWith('//')).toBe(true);
    expect(safeNext(next)).toBe(next);
  });

  it('redirects an anonymous visitor on a /setup page to /login with a relative Location', () => {
    const response = proxy(at('/setup/expense-categories/new'));
    expect(response.status).toBe(302);
    const location = locationOf(response);
    expect(location).toBe('/login?next=%2Fsetup%2Fexpense-categories%2Fnew');
    expect(location.startsWith('/') && !location.startsWith('//')).toBe(true);
  });

  it('redirects an anonymous visitor on a Setup list and record page to /login, relative (T-4.2-61)', () => {
    for (const [path, next] of [
      ['/setup/cost-centers', '%2Fsetup%2Fcost-centers'],
      ['/setup/currencies/3', '%2Fsetup%2Fcurrencies%2F3'],
    ] as const) {
      expect(locationOf(proxy(at(path)))).toBe(`/login?next=${next}`);
    }
  });

  it('the matcher covers the shell path families, bare paths included', () => {
    expect(config.matcher).toEqual(['/setup/:path*']);
    for (const url of [
      '/setup/staff',
      '/setup/staff/new',
      '/setup/staff/42',
      '/setup/roles',
      '/setup/roles/3',
      '/setup/expense-categories',
      '/setup/expense-categories/new',
      '/setup/expense-categories/12',
      '/setup/taxes',
      '/setup/taxes/new',
      '/setup/taxes/7',
      '/setup/cost-centers',
      '/setup/cost-centers/new',
      '/setup/cost-centers/7',
      '/setup/payment-modes',
      '/setup/payment-modes/new',
      '/setup/payment-modes/7',
      '/setup/currencies',
      '/setup/currencies/new',
      '/setup/currencies/7',
    ]) {
      expect(doesMatch(url), `${url} must be inside the matcher`).toBe(true);
    }
  });

  it('the matcher leaves the unauthenticated routes and the asset paths alone', () => {
    for (const url of [
      '/login',
      '/logout',
      '/status',
      '/',
      '/_next/static/x.js',
      '/admin/staff',
      '/admin/expenses/categories',
      '/admin/taxes',
      '/admin/warehouse/setting',
      '/admin/cost_centers',
      '/admin/paymentmodes',
      '/admin/currencies',
      '/admin/departments',
      '/admin/clients/groups',
      '/admin/tickets/statuses',
      '/admin/tickets/priorities',
      '/admin/tickets/services',
      '/admin/tickets/predefined_replies',
      '/admin/spam_filters/view/tickets',
      '/admin/spam_filters/view/leads',
      '/admin/leads/sources',
      '/admin/leads/statuses',
      '/admin/contracts/types',
      '/admin/hr_profile/job_positions',
    ]) {
      expect(doesMatch(url), `${url} must stay outside the matcher`).toBe(false);
    }
  });
});

describe('the gate follows the menu (plan 04.2-27, lead 2026-10-04)', () => {
  it.each(['/setup/staff/12', '/setup/roles'])(
    '%s is inside the matcher and sends a visitor with no cookie to /login',
    (path) => {
      expect(doesMatch(path), `${path} must be inside the matcher`).toBe(true);
      const response = proxy(at(path));
      expect(response.status).toBe(302);
      expect(locationOf(response)).toBe(`/login?next=${encodeURIComponent(path)}`);
    },
  );
});

describe('the old paths are outside the gate (plan 04.2-27)', () => {
  it.each(['/staff', '/roles/3'])('%s does not match', (path) => {
    expect(doesMatch(path), `${path} must stay outside the matcher`).toBe(false);
  });
});

describe('the login tells Node pages from Perfex ones by these gates (quick 261009-lgn)', () => {
  it('NODE_GATED_PREFIXES is the matcher, one prefix per gate (Next needs the matcher as literals)', () => {
    expect(config.matcher).toEqual(NODE_GATED_PREFIXES.map((prefix) => `${prefix}/:path*`));
  });
});
