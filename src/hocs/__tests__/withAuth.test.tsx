// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/lib/api/http';
import { clearSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import { fakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { withAuth } from '../withAuth';
import { withPermission } from '../withPermission';

const COMMON = commonEn.common;
const OK = 200;
const UNAUTHORIZED = 401;

const pathname = vi.hoisted(() => ({ current: '/setup/staff' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function Page() {
  return <p data-testid="page">{COMMON.retry}</p>;
}
const Guarded = withAuth(Page, { skeleton: 'form' });

/** Never answers: the session stays `pending` for the whole test. */
const pendingForever: AxiosAdapter = () => new Promise(() => undefined);

beforeEach(() => {
  pathname.current = '/setup/staff';
  clearSession();
});
// Unmount BEFORE the session resets: Vitest runs this hook before the harness's own cleanup, and a
// still-mounted consumer would see `pending` and start a bootstrap after the test ended.
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('withAuth', () => {
  it('while the session is pending: the declared skeleton and no SignedOutState (D-39)', async () => {
    http.defaults.adapter = pendingForever;
    renderWithProviders(<Guarded />);
    const pending = screen.getByTestId('auth-pending');
    expect(pending.dataset.variant).toBe('form');
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('auth-refused')).toBeNull();
    expect(screen.queryByTestId('page')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('auth-refused')).toBeNull();
  });

  it('renders the component once a session exists', async () => {
    http.defaults.adapter = fakeAdapter(OK, { csrfToken: 'c', accessToken: 'a' }).adapter;
    renderWithProviders(<Guarded />);
    expect(await screen.findByTestId('page')).not.toBeNull();
    expect(screen.queryByTestId('auth-refused')).toBeNull();
  });

  it('renders SignedOutState — never a redirect — once the session is known absent', async () => {
    pathname.current = '/setup/staff/12';
    http.defaults.adapter = fakeAdapter(UNAUTHORIZED, { code: 'ERP-AUTH-0004' }).adapter;
    const before = window.location.href;
    renderWithProviders(<Guarded />);
    await screen.findByTestId('auth-refused');
    expect(screen.getByRole('heading', { name: COMMON.session_ended })).not.toBeNull();
    expect(screen.getByRole('link', { name: COMMON.sign_in }).getAttribute('href')).toBe(
      '/login?next=%2Fsetup%2Fstaff%2F12',
    );
    expect(screen.queryByTestId('page')).toBeNull();
    // A client redirect on top of proxy.ts is how a loop starts (FE-16).
    expect(window.location.href).toBe(before);
  });

  it('composed with withPermission, shows the same skeleton shape through both phases', async () => {
    // The session bootstraps (csrf → refresh), then /me never answers.
    http.defaults.adapter = (config) =>
      config.url === '/api/v1/auth/me'
        ? new Promise(() => undefined)
        : fakeAdapter(OK, { csrfToken: 'c', accessToken: 'a' }).adapter(config);
    const Both = withAuth(withPermission(Page, { skeleton: 'list' }), { skeleton: 'list' });
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Both />
      </SWRConfig>,
    );
    const auth = screen.getByTestId('auth-pending');
    const authShape = {
      variant: auth.dataset.variant,
      rows: auth.querySelectorAll('[data-testid="skeleton-row"]').length,
    };
    const permission = await screen.findByTestId('permission-pending');
    expect({
      variant: permission.dataset.variant,
      rows: permission.querySelectorAll('[data-testid="skeleton-row"]').length,
    }).toEqual(authShape);
    expect(authShape).toEqual({ variant: 'list', rows: 10 });
    await waitFor(() => {
      expect(screen.queryByTestId('auth-pending')).toBeNull();
    });
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('is named withAuth(X)', () => {
    expect(Guarded.displayName).toBe('withAuth(Page)');
  });
});
