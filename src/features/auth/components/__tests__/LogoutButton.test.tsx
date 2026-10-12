// @vitest-environment happy-dom
import { configure } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import type { ApiAdapter } from '@/lib/api/call-api';
import { isLegacySessionOpen, LEGACY_OPENED_KEY } from '@/lib/auth/legacy-session';
import { SIGNED_OUT_AT_KEY } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import authAr from '../../messages/ar.json';
import authEn from '../../messages/en.json';
import { LogoutButton } from '../LogoutButton';

const LOGIN_OK = {
  accessToken: 'eyJ.access',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf-2',
  user: { staffId: 7, email: 'a@b.c', firstName: 'A', lastName: 'B', isAdmin: false },
};

/** Answers csrf (GET), refresh (POST) and logout (POST, 204) in turn. */
function stackAdapter() {
  const csrf = fakeAdapter(200, { csrfToken: 'csrf-1' });
  const refreshed = fakeAdapter(200, LOGIN_OK);
  const loggedOut = fakeAdapter(204);
  let n = 0;
  const adapter = vi.fn((config: Parameters<typeof csrf.adapter>[0]) => {
    n += 1;
    if (n === 1) return csrf.adapter(config);
    if (n === 2) return refreshed.adapter(config);
    return loggedOut.adapter(config);
  });
  return { adapter, calls: () => [...csrf.calls, ...refreshed.calls, ...loggedOut.calls] };
}

/** csrf answers a token, refresh answers `refresh`, logout answers `logout`. */
function routedAdapter(
  refresh: ReturnType<typeof fakeAdapter>,
  logout: ReturnType<typeof fakeAdapter>,
) {
  const csrf = fakeAdapter(200, { csrfToken: 'csrf-1' });
  const adapter: ApiAdapter = (config) => {
    if (config.url === '/api/v1/auth/csrf') return csrf.adapter(config);
    if (config.url === '/api/v1/auth/refresh') return refresh.adapter(config);
    return logout.adapter(config);
  };
  return { adapter, calls: () => [...csrf.calls, ...refresh.calls, ...logout.calls] };
}

const neverAnswers: ApiAdapter = () => new Promise(() => undefined);
const LEGACY_LOGOUT_URL = /\/admin\/authentication\/logout\?legacy=1$/;

describe('LogoutButton', () => {
  beforeEach(() => {
    resetApiStatus();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    configure({ reactStrictMode: false });
  });

  it('renders "Sign out" from the auth messages', () => {
    renderWithProviders(<LogoutButton />);
    expect(screen.getByTestId('logout-button').textContent).toBe('Sign out');
  });

  it('is disabled and reads "Signing out…" while busy, revokes csrf → refresh → logout, then navigates to the legacy logout', async () => {
    const stack = stackAdapter();
    const navigate = vi.fn();
    renderWithProviders(<LogoutButton adapter={stack.adapter} navigate={navigate} />);
    await userEvent.setup().click(screen.getByTestId('logout-button'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    const button = screen.getByTestId('logout-button');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.textContent).toBe('Signing out…');
    expect(stack.calls().map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/auth/csrf',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
    ]);
    expect(navigate.mock.calls[0]?.[0]).toMatch(/\/admin\/authentication\/logout\?legacy=1$/);
  });

  it("runs its csrf → refresh → logout inside the tab's refresh lock, so it never overlaps a renewal (WR-07)", async () => {
    const lock = { names: [] as string[], held: false };
    Object.defineProperty(window.navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name: string, cb: () => Promise<unknown>) => {
          lock.names.push(name);
          lock.held = true;
          try {
            return await cb();
          } finally {
            lock.held = false;
          }
        },
      },
    });
    const heldAt: boolean[] = [];
    const stack = stackAdapter();
    const adapter: ApiAdapter = (config) => {
      heldAt.push(lock.held);
      return stack.adapter(config);
    };
    const navigate = vi.fn();
    try {
      renderWithProviders(<LogoutButton adapter={adapter} navigate={navigate} />);
      await userEvent.setup().click(screen.getByTestId('logout-button'));
      await waitFor(() => {
        expect(navigate).toHaveBeenCalledTimes(1);
      });
    } finally {
      Reflect.deleteProperty(window.navigator, 'locks');
    }
    expect(lock.names).toEqual(['erp-session-refresh']);
    expect(heldAt).toEqual([true, true, true]);
  });

  it('under ar the label is the Arabic string', () => {
    renderWithProviders(<LogoutButton />, { locale: 'ar' });
    expect(screen.getByTestId('logout-button').textContent).toBe(authAr.auth.logout_button);
  });

  it("auto (Perfex's Logout link): signs out on arrival with no click, csrf → refresh → logout then the legacy logout with ?legacy=1, exactly once under StrictMode", async () => {
    const stack = stackAdapter();
    const navigate = vi.fn();
    configure({ reactStrictMode: true });
    renderWithProviders(<LogoutButton auto adapter={stack.adapter} navigate={navigate} />);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(stack.calls().map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/auth/csrf',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
    ]);
    expect(navigate.mock.calls[0]?.[0]).toMatch(LEGACY_LOGOUT_URL);
  });

  it('auto: while it signs out, a skeleton-shaped busy state reading "Signing out…" and no Sign out button (D-39)', () => {
    const { container } = renderWithProviders(
      <LogoutButton auto adapter={neverAnswers} navigate={vi.fn()} />,
    );
    const pending = screen.getByTestId('logout-auto-pending');
    expect(pending.getAttribute('role')).toBe('status');
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expect(pending.textContent).toBe(authEn.auth.signing_out);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(1);
    expect(screen.queryByTestId('logout-button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('auto: a refused refresh still ends at the legacy logout (the member asked to leave)', async () => {
    const routed = routedAdapter(fakeAdapter(401, problem(401, 'ERP-AUTH-0002')), fakeAdapter(204));
    const navigate = vi.fn();
    renderWithProviders(<LogoutButton auto adapter={routed.adapter} navigate={navigate} />);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    expect(routed.calls().map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/auth/csrf',
      'POST /api/v1/auth/refresh',
    ]);
    expect(navigate.mock.calls[0]?.[0]).toMatch(LEGACY_LOGOUT_URL);
  });

  it('writes the signed-out stamp before it navigates, even when the api logout fails', async () => {
    const routed = routedAdapter(
      fakeAdapter(200, LOGIN_OK),
      fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001')),
    );
    let stampAgeAtNavigate: number | null = null;
    const navigate = vi.fn(() => {
      const stamp = window.sessionStorage.getItem(SIGNED_OUT_AT_KEY);
      stampAgeAtNavigate = stamp === null ? null : Math.abs(Date.now() - Number(stamp));
    });
    renderWithProviders(<LogoutButton adapter={routed.adapter} navigate={navigate} />);
    await userEvent.setup().click(screen.getByTestId('logout-button'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    expect(routed.calls().map((c) => `${c.method} ${c.url}`)).toContain('POST /api/v1/auth/logout');
    expect(stampAgeAtNavigate).not.toBeNull();
    expect(stampAgeAtNavigate).toBeLessThan(1000);
  });

  it("forgets this tab's legacy handoff before it navigates, so the next sign-in hands off afresh", async () => {
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
    let openAtNavigate: boolean | null = null;
    const navigate = vi.fn(() => {
      openAtNavigate = isLegacySessionOpen();
    });
    const routed = routedAdapter(fakeAdapter(200, LOGIN_OK), fakeAdapter(204));
    renderWithProviders(<LogoutButton adapter={routed.adapter} navigate={navigate} />);
    await userEvent.setup().click(screen.getByTestId('logout-button'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    expect(openAtNavigate).toBe(false);
  });
});
