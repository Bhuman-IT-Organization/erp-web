// @vitest-environment happy-dom
import { cleanup, configure } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { resetApiStatus } from '@/lib/api/api-status';
import { forgetLegacySession } from '@/lib/auth/legacy-session';
import type { ApiAdapter } from '@/lib/api/call-api';
import { clearSession, RESUMED_AT_KEY, SIGNED_OUT_AT_KEY } from '@/lib/auth/session';
import { fakeAdapter, networkFailureAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { physicalClassesIn, renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import authEn from '../../messages/en.json';
import { LoginForm } from '../LoginForm';
import { LoginResume } from '../LoginResume';
import { LogoutButton } from '../LogoutButton';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const EN = authEn.auth;
const OK = 200;
const CSRF_URL = '/api/v1/auth/csrf';
const REFRESH_URL = '/api/v1/auth/refresh';
const T0 = 1_000_000_000;
const GUARD_MS = 30_000;
const RESUMED = { accessToken: 'a-resumed', csrfToken: 'c2' };

/** csrf answers a token; refresh answers with the case's double. Counts both. */
function sessionAdapter(refresh: FakeAdapter): {
  adapter: ApiAdapter;
  count: (url: string) => number;
} {
  const csrf = fakeAdapter(OK, { csrfToken: 'c1' });
  const urls: string[] = [];
  const adapter: ApiAdapter = (config) => {
    urls.push(config.url ?? '');
    return config.url === CSRF_URL ? csrf.adapter(config) : refresh.adapter(config);
  };
  return { adapter, count: (url) => urls.filter((u) => u === url).length };
}

/** The tab's sessionStorage, in memory. */
function memoryStorage(seed: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const neverAnswers: ApiAdapter = () => new Promise(() => undefined);

const LOGIN_OK = {
  accessToken: 'a-login',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'c-login',
  user: { staffId: 7, email: 'a@b.co', firstName: 'A', lastName: 'B', isAdmin: false },
};

/** A full navigation: the page unmounts and the tab's in-memory session starts over (ADR-0005). */
function navigateAway(): void {
  cleanup();
  clearSession();
  forgetLegacySession();
  installLocks();
}

/** The sign-out as it ran for the lead: csrf, refresh and logout all answered, then the stamp. */
async function signOutByClick(): Promise<void> {
  const csrf = fakeAdapter(OK, { csrfToken: 'c1' });
  const refreshed = fakeAdapter(OK, LOGIN_OK);
  const loggedOut = fakeAdapter(204);
  const adapter: ApiAdapter = (config) =>
    config.url === CSRF_URL
      ? csrf.adapter(config)
      : config.url === REFRESH_URL
        ? refreshed.adapter(config)
        : loggedOut.adapter(config);
  const navigate = vi.fn();
  renderWithProviders(<LogoutButton adapter={adapter} navigate={navigate} />);
  await userEvent.setup().click(screen.getByTestId('logout-button'));
  await waitFor(() => {
    expect(navigate).toHaveBeenCalledTimes(1);
  });
}

/** A normal sign-in through the form: login 200, handoff 204, then the navigation to next. */
async function signInThroughTheForm(): Promise<void> {
  const navigate = vi.fn();
  renderWithProviders(
    <LoginForm
      next="/admin/"
      adapter={fakeAdapter(OK, LOGIN_OK).adapter}
      writeLocale={vi.fn()}
      handoff={() => Promise.resolve(true)}
      navigate={navigate}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(EN.admin_auth_login_email), 'a@b.co');
  await user.type(screen.getByLabelText(EN.admin_auth_login_password), 'pw');
  await user.click(screen.getByRole('button', { name: EN.admin_auth_login_button }));
  await waitFor(() => {
    expect(navigate).toHaveBeenCalledTimes(1);
  });
}

/** Opens /login with a live session and reports what the resume did, and whether the form ever showed. */
async function openLoginWithALiveSession() {
  let formSeen = false;
  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-testid="login-form"]') !== null) formSeen = true;
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const api = sessionAdapter(fakeAdapter(OK, RESUMED));
  const handoff = vi.fn(() => Promise.resolve(true));
  const navigate = vi.fn();
  renderWithProviders(
    <LoginResume next="/admin/" adapter={api.adapter} handoff={handoff} navigate={navigate} />,
  );
  await waitFor(() => {
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  observer.disconnect();
  return { api, handoff, navigate, formSeen };
}

// The FIFO stand-in for navigator.locks, as use-session.test.tsx installs it.
function fifoLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request(_name: string, cb: () => Promise<unknown>) {
      const run = tail.then(cb);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

function installLocks(): void {
  Object.defineProperty(window.navigator, 'locks', { value: fifoLocks(), configurable: true });
}

beforeEach(() => {
  resetApiStatus();
  clearSession();
  forgetLegacySession();
  toast.dismiss();
  installLocks();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clearSession();
  Reflect.deleteProperty(window.navigator, 'locks');
  configure({ reactStrictMode: false });
});

describe('LoginResume', () => {
  it.each([
    ['401 ERP-AUTH-0002', () => fakeAdapter(401, problem(401, 'ERP-AUTH-0002'))],
    ['401 ERP-AUTH-0003', () => fakeAdapter(401, problem(401, 'ERP-AUTH-0003'))],
    ['503 ERP-UPSTREAM-0001', () => fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'))],
    ['a network failure', () => networkFailureAdapter()],
  ])(
    'with the presence cookie but %s on the refresh: the form, with no handoff and no navigation (a stale cookie never loops)',
    async (_label, refresh) => {
      const api = sessionAdapter(refresh());
      const handoff = vi.fn(() => Promise.resolve(true));
      const navigate = vi.fn();
      renderWithProviders(
        <LoginResume
          next="/admin/"
          adapter={api.adapter}
          handoff={handoff}
          navigate={navigate}
          storage={memoryStorage()}
        />,
      );
      expect(await screen.findByTestId('login-form')).toBeDefined();
      expect(handoff).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(api.count(CSRF_URL)).toBe(1);
      expect(api.count(REFRESH_URL)).toBe(1);
    },
  );

  it('while the api is asked: a skeleton shaped like the login card, busy, with no form and no message (D-39)', () => {
    const { container } = renderWithProviders(
      <LoginResume next="/admin/" adapter={neverAnswers} storage={memoryStorage()} />,
    );
    const pending = screen.getByTestId('login-resume-pending');
    expect(pending.getAttribute('role')).toBe('status');
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(8);
    expect(screen.queryByTestId('login-form')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a live session and a Perfex next: the handoff a sign-in runs, with the recovered token, awaited, then a full navigation to next, and the form never shows, under StrictMode', async () => {
    let formSeen = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-testid="login-form"]') !== null) formSeen = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const api = sessionAdapter(fakeAdapter(OK, RESUMED));
    const handoff = vi.fn(() => Promise.resolve(true));
    const navigate = vi.fn();
    const route = vi.fn();
    configure({ reactStrictMode: true });
    renderWithProviders(
      <LoginResume
        next="/admin/invoices?q=a"
        adapter={api.adapter}
        handoff={handoff}
        navigate={navigate}
        route={route}
        storage={memoryStorage()}
      />,
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    observer.disconnect();
    expect(api.count(CSRF_URL)).toBe(1);
    expect(api.count(REFRESH_URL)).toBe(1);
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(handoff).toHaveBeenCalledWith('a-resumed');
    expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/invoices?q=a`);
    expect(route).not.toHaveBeenCalled();
    expect(formSeen).toBe(false);
    expect(screen.queryByTestId('login-form')).toBeNull();
  });

  it('a live session and a Node next: the client-side router goes there at once, the handoff runs once in the background, and the resume is stamped', async () => {
    const api = sessionAdapter(fakeAdapter(OK, RESUMED));
    const handoff = vi.fn(() => new Promise<boolean>(() => undefined));
    const navigate = vi.fn();
    const route = vi.fn();
    const storage = memoryStorage();
    configure({ reactStrictMode: true });
    renderWithProviders(
      <LoginResume
        next="/setup/staff?q=a"
        adapter={api.adapter}
        handoff={handoff}
        navigate={navigate}
        route={route}
        storage={storage}
      />,
    );
    await waitFor(() => {
      expect(route).toHaveBeenCalledExactlyOnceWith('/setup/staff?q=a');
    });
    expect(handoff).toHaveBeenCalledExactlyOnceWith('a-resumed');
    expect(navigate).not.toHaveBeenCalled();
    expect(storage.getItem(RESUMED_AT_KEY)).not.toBeNull();
  });

  it('a Node next whose background handoff fails: the toast with the handoff_failed message and Retry, no bounce back to the form', async () => {
    const handoff = vi.fn<(token: string) => Promise<boolean>>();
    handoff.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const route = vi.fn();
    renderWithProviders(
      <>
        <LoginResume
          next="/setup/staff"
          adapter={sessionAdapter(fakeAdapter(OK, RESUMED)).adapter}
          handoff={handoff}
          navigate={vi.fn()}
          route={route}
          storage={memoryStorage()}
        />
        <Toaster />
      </>,
    );
    expect(await screen.findByText(EN.handoff_failed)).toBeDefined();
    expect(route).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('login-error')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(handoff).toHaveBeenCalledTimes(2);
    });
    expect(handoff).toHaveBeenLastCalledWith('a-resumed');
  });

  it('the handoff fails: the handoff-failed message with Retry and no navigation; Retry hands off again and navigates', async () => {
    const api = sessionAdapter(fakeAdapter(OK, RESUMED));
    const handoff = vi.fn<(token: string) => Promise<boolean>>();
    handoff.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const navigate = vi.fn();
    renderWithProviders(
      <LoginResume
        next="/admin/"
        adapter={api.adapter}
        handoff={handoff}
        navigate={navigate}
        storage={memoryStorage()}
      />,
    );
    expect((await screen.findByTestId('login-error')).textContent).toBe(EN.handoff_failed);
    expect(navigate).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByTestId('handoff-retry'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    expect(handoff).toHaveBeenCalledTimes(2);
    expect(handoff).toHaveBeenLastCalledWith('a-resumed');
    expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/`);
  });

  it('back within 30 s of an automatic resume in this tab: the handoff-failed state instead of another handoff, so /login never loops', async () => {
    let now = T0;
    const clock = () => now;
    const storage = memoryStorage();
    const handoff = vi.fn(() => Promise.resolve(true));
    const navigate = vi.fn();
    const first = renderWithProviders(
      <LoginResume
        next="/admin/"
        adapter={sessionAdapter(fakeAdapter(OK, RESUMED)).adapter}
        handoff={handoff}
        navigate={navigate}
        storage={storage}
        now={clock}
      />,
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    first.unmount();
    clearSession();
    now = T0 + 1_000;
    renderWithProviders(
      <LoginResume
        next="/admin/"
        adapter={sessionAdapter(fakeAdapter(OK, RESUMED)).adapter}
        handoff={handoff}
        navigate={navigate}
        storage={storage}
        now={clock}
      />,
    );
    expect((await screen.findByTestId('login-error')).textContent).toBe(EN.handoff_failed);
    expect(screen.getByTestId('handoff-retry')).toBeDefined();
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);

    // The boundary, on fresh storage: 29 999 ms refuses, 30 000 ms hands off.
    for (const [age, handsOff] of [
      [GUARD_MS - 1, false],
      [GUARD_MS, true],
    ] as const) {
      cleanup();
      clearSession();
      forgetLegacySession();
      const boundary = vi.fn(() => Promise.resolve(true));
      renderWithProviders(
        <LoginResume
          next="/admin/"
          adapter={sessionAdapter(fakeAdapter(OK, RESUMED)).adapter}
          handoff={boundary}
          navigate={vi.fn()}
          storage={memoryStorage({ [RESUMED_AT_KEY]: String(now - age) })}
          now={clock}
        />,
      );
      if (handsOff) {
        await waitFor(() => {
          expect(boundary).toHaveBeenCalledTimes(1);
        });
      } else {
        expect((await screen.findByTestId('login-error')).textContent).toBe(EN.handoff_failed);
        expect(boundary).not.toHaveBeenCalled();
      }
    }
  });

  it('session storage that cannot be read: no automatic handoff (the safe side), the handoff-failed state with Retry', async () => {
    const handoff = vi.fn(() => Promise.resolve(true));
    const navigate = vi.fn();
    const unreadable: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => {
        throw new Error('storage denied');
      },
    };
    renderWithProviders(
      <LoginResume
        next="/admin/"
        adapter={sessionAdapter(fakeAdapter(OK, RESUMED)).adapter}
        handoff={handoff}
        navigate={navigate}
        storage={unreadable}
      />,
    );
    expect((await screen.findByTestId('login-error')).textContent).toBe(EN.handoff_failed);
    expect(screen.getByTestId('handoff-retry')).toBeDefined();
    expect(handoff).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses no physical-direction class under ar, the skeleton included', async () => {
    const pending = renderWithProviders(
      <LoginResume next="/admin/" adapter={neverAnswers} storage={memoryStorage()} />,
      { locale: 'ar' },
    );
    expect(screen.getByTestId('login-resume-pending')).toBeDefined();
    expect(physicalClassesIn(pending.container)).toEqual([]);
    cleanup();
    clearSession();
    // The never-answering flight above still holds the fake lock; a new tab gets a fresh one.
    installLocks();
    const refused = renderWithProviders(
      <LoginResume
        next="/admin/"
        adapter={sessionAdapter(fakeAdapter(401, problem(401, 'ERP-AUTH-0002'))).adapter}
        handoff={vi.fn(() => Promise.resolve(false))}
        storage={memoryStorage()}
      />,
      { locale: 'ar' },
    );
    expect(await screen.findByTestId('login-form')).toBeDefined();
    expect(physicalClassesIn(refused.container)).toEqual([]);
  });

  it('right after a sign-out in this tab: the form with no handoff and no navigation, even though the refresh succeeds (a failed api logout is never undone)', async () => {
    const handoff = vi.fn(() => Promise.resolve(true));
    const navigate = vi.fn();
    renderWithProviders(
      <LoginResume
        next="/admin/"
        adapter={sessionAdapter(fakeAdapter(OK, RESUMED)).adapter}
        handoff={handoff}
        navigate={navigate}
        storage={memoryStorage({ [SIGNED_OUT_AT_KEY]: String(T0 - (GUARD_MS - 1)) })}
        now={() => T0}
      />,
    );
    expect(await screen.findByTestId('login-form')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(handoff).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    cleanup();
    clearSession();
    const later = vi.fn(() => Promise.resolve(true));
    renderWithProviders(
      <LoginResume
        next="/admin/"
        adapter={sessionAdapter(fakeAdapter(OK, RESUMED)).adapter}
        handoff={later}
        navigate={vi.fn()}
        storage={memoryStorage({ [SIGNED_OUT_AT_KEY]: String(T0 - GUARD_MS) })}
        now={() => T0}
      />,
    );
    await waitFor(() => {
      expect(later).toHaveBeenCalledTimes(1);
    });
  });

  it("the lead's sequence: signed out, signed back in through the form, then /login within 30 s with a live session: the resume runs (one csrf, one refresh, one handoff, a navigation) and the form never shows", async () => {
    await signOutByClick();
    expect(window.sessionStorage.getItem(SIGNED_OUT_AT_KEY)).not.toBeNull();
    navigateAway();
    await signInThroughTheForm();
    navigateAway();
    const opened = await openLoginWithALiveSession();
    expect(opened.api.count(CSRF_URL)).toBe(1);
    expect(opened.api.count(REFRESH_URL)).toBe(1);
    expect(opened.handoff).toHaveBeenCalledTimes(1);
    expect(opened.handoff).toHaveBeenCalledWith('a-resumed');
    expect(opened.navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/`);
    expect(opened.formSeen).toBe(false);
  });

  it('resumed, signed out, signed back in, then /login within 30 s: the resume runs again, since a sign-in is not a loop', async () => {
    const first = await openLoginWithALiveSession();
    expect(first.handoff).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RESUMED_AT_KEY)).not.toBeNull();
    navigateAway();
    await signOutByClick();
    navigateAway();
    await signInThroughTheForm();
    navigateAway();
    const again = await openLoginWithALiveSession();
    expect(again.handoff).toHaveBeenCalledTimes(1);
    expect(again.navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/`);
    expect(again.formSeen).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
