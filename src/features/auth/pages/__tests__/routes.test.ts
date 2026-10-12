import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEXT } from '@/lib/auth/safe-next';
import { routeProps } from '@/test/route-props';
import { LoginPage } from '../LoginPage';
import { LogoutPage } from '../LogoutPage';

/**
 * `/login` and `/logout` (ADR-0038): the login page reads `?next=` through the open-redirect guard
 * (T-1.3-19), asks the api about the session only when the session-present hint is set, and carries
 * the customer's brand; Perfex's Logout link (`?from=legacy`) signs out on arrival.
 */
const cookieNames = vi.hoisted(() => ({ present: new Set<string>() }));
const BRANDING = { companyName: 'Made-up Company' };

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ has: (name: string) => cookieNames.present.has(name) }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('@/features/branding/api/branding.server', () => ({
  getBranding: () => Promise.resolve(BRANDING),
}));
vi.mock('../LoginPage', () => ({ LoginPage: () => null }));
vi.mock('../LogoutPage', () => ({ LogoutPage: () => null }));

beforeEach(() => {
  cookieNames.present.clear();
});

describe('/login', () => {
  it('a same-origin ?next= is kept; no session hint renders the form at once; the brand is passed', async () => {
    const page = await import('../../../../../app/login/page');
    const element = await page.default(routeProps({}, { next: '/setup/taxes' }));
    expect(element.type).toBe(LoginPage);
    expect(element.props).toEqual({ next: '/setup/taxes', branding: BRANDING, resume: false });
    expect(await page.generateMetadata()).toEqual({ title: 'auth.page_title' });
  });

  it.each([['//evil.example/x'], ['https://evil.example'], [['/a', '/b']]])(
    '?next=%j falls back to the admin home (T-1.3-19)',
    async (next) => {
      const page = await import('../../../../../app/login/page');
      const element = await page.default(routeProps({}, { next }));
      expect(element.props).toMatchObject({ next: DEFAULT_NEXT });
    },
  );

  it('the session-present hint asks the api whether the session is live (resume)', async () => {
    cookieNames.present.add('erp_session_present');
    const page = await import('../../../../../app/login/page');
    expect((await page.default(routeProps({}))).props).toMatchObject({ resume: true });
  });
});

describe('/logout', () => {
  it("Perfex's Logout link (?from=legacy) signs out on arrival; a plain visit waits for the button", async () => {
    const page = await import('../../../../../app/logout/page');
    const legacy = await page.default(routeProps({}, { from: 'legacy' }));
    expect(legacy.type).toBe(LogoutPage);
    expect(legacy.props).toEqual({ auto: true });
    expect((await page.default(routeProps({}))).props).toEqual({ auto: false });
    expect(await page.generateMetadata()).toEqual({ title: 'auth.logout_title' });
  });
});
