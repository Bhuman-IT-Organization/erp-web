// @vitest-environment happy-dom
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { resetApiStatus } from '@/lib/api/api-status';
import {
  forgetLegacySession,
  isLegacySessionOpen,
  LEGACY_OPENED_KEY,
} from '@/lib/auth/legacy-session';
import {
  clearSession,
  getAccessToken,
  getRenewAt,
  RESUMED_AT_KEY,
  setSession,
  SIGNED_OUT_AT_KEY,
} from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { physicalClassesIn, renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import authAr from '../../messages/ar.json';
import authEn from '../../messages/en.json';
import { LoginForm } from '../LoginForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const EN = authEn.auth;
const AR = authAr.auth;

const LOGIN_OK = {
  accessToken: 'eyJ.access',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf-1',
  user: { staffId: 7, email: 'a@b.co', firstName: 'A', lastName: 'B', isAdmin: false },
};

async function fillAndSubmit(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(EN.admin_auth_login_email), 'a@b.co');
  await user.type(screen.getByLabelText(EN.admin_auth_login_password), 'pw');
  await user.click(screen.getByRole('button', { name: EN.admin_auth_login_button }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    resetApiStatus();
    clearSession();
    forgetLegacySession();
    window.sessionStorage.clear();
    // sonner keeps its toasts in a module store: one test's toast must not show in the next.
    toast.dismiss();
  });

  it('renders the six legacy labels from en.json, byte for byte, and the two legacy links', () => {
    renderWithProviders(<LoginForm next="/admin/" />);
    expect(screen.getByLabelText('Email Address')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Login' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Forgot Password?' }).getAttribute('href')).toBe(
      '/admin/authentication/forgot_password',
    );
    expect(
      screen.getByRole('link', { name: EN.sign_in_with_active_directory }).getAttribute('href'),
    ).toBe('/admin/authentication?legacy=1');
    expect(screen.getByText('OR')).toBeDefined();
    expect(screen.getByTestId('login-form')).toBeDefined();
  });

  it('shows the validation copy through the message keys, never the key names', async () => {
    renderWithProviders(<LoginForm next="/admin/" />);
    await userEvent.setup().click(screen.getByRole('button', { name: EN.admin_auth_login_button }));
    const alerts = await screen.findAllByRole('alert');
    const texts = alerts.map((a) => a.textContent);
    expect(texts).toContain(EN.enter_valid_email);
    expect(texts).toContain(EN.enter_password);
    expect(texts).not.toContain('enter_valid_email');
  });

  it('401 ERP-AUTH-0001 → the errors.ERP-AUTH-0001 text in role=alert, no retry button', async () => {
    const fake = fakeAdapter(401, problem(401, 'ERP-AUTH-0001'));
    renderWithProviders(<LoginForm next="/admin/" adapter={fake.adapter} />);
    await fillAndSubmit();
    const alert = await screen.findByTestId('login-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(EN.errors['ERP-AUTH-0001']);
    expect(screen.queryByTestId('login-retry')).toBeNull();
    expect(fake.spy).toHaveBeenCalledTimes(1);
  });

  it('429 with retry-after 60 → the ERP-AUTH-0006 text with "60 seconds"', async () => {
    const fake = fakeAdapter(429, problem(429, 'ERP-AUTH-0006'), { 'retry-after': '60' });
    renderWithProviders(<LoginForm next="/admin/" adapter={fake.adapter} />);
    await fillAndSubmit();
    const alert = await screen.findByTestId('login-error');
    expect(alert.textContent).toBe('Too many failed attempts. Try again in 60 seconds');
  });

  it('503 ERP-UPSTREAM-0001 → retryable: the "Try again" button (common key) appears, transport called once', async () => {
    const fake = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    renderWithProviders(<LoginForm next="/admin/" adapter={fake.adapter} />);
    await fillAndSubmit();
    const alert = await screen.findByTestId('login-error');
    expect(alert.textContent).toBe('A system we depend on is unavailable. Try again shortly.');
    expect(screen.getByTestId('login-retry').textContent).toBe('Try again');
    expect(fake.spy).toHaveBeenCalledTimes(1);
  });

  it('RTL smoke test (client half): under ar the labels and the button read ar.json and no physical-direction class is rendered', () => {
    const { container } = renderWithProviders(<LoginForm next="/admin/" />, { locale: 'ar' });
    expect(screen.getByLabelText(AR.admin_auth_login_email)).toBeDefined();
    expect(screen.getByLabelText(AR.admin_auth_login_password)).toBeDefined();
    expect(screen.getByRole('button', { name: AR.admin_auth_login_button }).textContent).toBe(
      AR.admin_auth_login_button,
    );
    expect(screen.getByRole('link', { name: AR.admin_auth_login_fp })).toBeDefined();
    expect(screen.getByText('أو')).toBeDefined();
    expect(physicalClassesIn(container)).toEqual([]);
  });

  it('a successful login writes the locale cookie from user.locale BEFORE the handoff, then keeps the session', async () => {
    const fake = fakeAdapter(200, { ...LOGIN_OK, user: { ...LOGIN_OK.user, locale: 'ar' } });
    const order: string[] = [];
    const writeLocale = vi.fn((locale: string) => {
      order.push(`locale:${locale}`);
    });
    const handoff = vi.fn(() => {
      order.push('handoff');
      return Promise.resolve(false);
    });
    renderWithProviders(
      <LoginForm
        next="/admin/"
        adapter={fake.adapter}
        writeLocale={writeLocale}
        handoff={handoff}
      />,
    );
    await fillAndSubmit();
    const alert = await screen.findByTestId('login-error');
    expect(alert.textContent).toBe(EN.handoff_failed);
    expect(order).toEqual(['locale:ar', 'handoff']);
    expect(handoff).toHaveBeenCalledWith('eyJ.access');
    expect(getAccessToken()).toBe('eyJ.access');
    // The login response states the lifetime: the proactive renewal is scheduled from it.
    expect(getRenewAt()).not.toBeNull();
    expect(screen.getByTestId('handoff-retry').textContent).toBe('Retry');
  });

  it.each([
    ['null', null],
    ['unsupported', 'xx'],
    ['absent', undefined],
  ])('a user.locale that is %s writes no cookie', async (_label, locale) => {
    const user = locale === undefined ? LOGIN_OK.user : { ...LOGIN_OK.user, locale };
    const fake = fakeAdapter(200, { ...LOGIN_OK, user });
    const writeLocale = vi.fn();
    const handoff = vi.fn(() => Promise.resolve(false));
    renderWithProviders(
      <LoginForm
        next="/admin/"
        adapter={fake.adapter}
        writeLocale={writeLocale}
        handoff={handoff}
      />,
    );
    await fillAndSubmit();
    await screen.findByTestId('login-error');
    expect(writeLocale).not.toHaveBeenCalled();
    expect(handoff).toHaveBeenCalledTimes(1);
  });

  it("handoffFailed opens in the handoff-failed state: the message and Retry, and Retry hands off the session's token and navigates", async () => {
    setSession({ accessToken: 'a-live', csrfToken: 'c-live' });
    const handoff = vi.fn(() => Promise.resolve(true));
    const navigate = vi.fn();
    renderWithProviders(
      <LoginForm next="/admin/" handoffFailed handoff={handoff} navigate={navigate} />,
    );
    expect(screen.getByTestId('login-error').textContent).toBe(EN.handoff_failed);
    expect(handoff).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByTestId('handoff-retry'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    expect(handoff).toHaveBeenCalledWith('a-live');
    expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/`);
  });

  it("a successful sign-in clears this tab's signed-out and resumed stamps before the handoff; a refused one keeps them", async () => {
    window.sessionStorage.setItem(SIGNED_OUT_AT_KEY, String(Date.now()));
    window.sessionStorage.setItem(RESUMED_AT_KEY, String(Date.now()));
    const refused = renderWithProviders(
      <LoginForm
        next="/admin/"
        adapter={fakeAdapter(401, problem(401, 'ERP-AUTH-0001')).adapter}
      />,
    );
    await fillAndSubmit();
    await screen.findByTestId('login-error');
    expect(window.sessionStorage.getItem(SIGNED_OUT_AT_KEY)).not.toBeNull();
    expect(window.sessionStorage.getItem(RESUMED_AT_KEY)).not.toBeNull();
    refused.unmount();

    const seenAtHandoff: (string | null)[] = [];
    const handoff = vi.fn(() => {
      seenAtHandoff.push(
        window.sessionStorage.getItem(SIGNED_OUT_AT_KEY),
        window.sessionStorage.getItem(RESUMED_AT_KEY),
      );
      return Promise.resolve(true);
    });
    renderWithProviders(
      <LoginForm
        next="/admin/"
        adapter={fakeAdapter(200, LOGIN_OK).adapter}
        handoff={handoff}
        navigate={vi.fn()}
      />,
    );
    await fillAndSubmit();
    await waitFor(() => {
      expect(handoff).toHaveBeenCalledTimes(1);
    });
    expect(seenAtHandoff).toEqual([null, null]);
  });
  it('next is a Node page: the client-side router goes there at once while the handoff runs in the background', async () => {
    const pending = new Promise<boolean>(() => undefined);
    const handoff = vi.fn(() => pending);
    const navigate = vi.fn();
    const route = vi.fn();
    renderWithProviders(
      <LoginForm
        next="/setup/staff?q=a"
        adapter={fakeAdapter(200, LOGIN_OK).adapter}
        handoff={handoff}
        navigate={navigate}
        route={route}
      />,
    );
    await fillAndSubmit();
    await waitFor(() => {
      expect(route).toHaveBeenCalledWith('/setup/staff?q=a');
    });
    expect(handoff).toHaveBeenCalledExactlyOnceWith('eyJ.access');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('login-error')).toBeNull();
  });

  it('next is a Node page and the background handoff fails: a toast with the handoff_failed message and Retry, no bounce; Retry hands off again', async () => {
    const handoff = vi.fn<(token: string) => Promise<boolean>>();
    handoff.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const route = vi.fn();
    renderWithProviders(
      <>
        <LoginForm
          next="/setup/staff"
          adapter={fakeAdapter(200, LOGIN_OK).adapter}
          handoff={handoff}
          navigate={vi.fn()}
          route={route}
        />
        <Toaster />
      </>,
    );
    await fillAndSubmit();
    expect(await screen.findByText(EN.handoff_failed)).toBeDefined();
    expect(route).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('login-error')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(handoff).toHaveBeenCalledTimes(2);
    });
    expect(handoff).toHaveBeenLastCalledWith('eyJ.access');
    await waitFor(() => {
      expect(isLegacySessionOpen()).toBe(true);
    });
  });

  it('next is a Perfex page: waits for the handoff before the full navigation, and the router is never used', async () => {
    let settle: (opened: boolean) => void = () => undefined;
    const handoff = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
        }),
    );
    const navigate = vi.fn();
    const route = vi.fn();
    renderWithProviders(
      <LoginForm
        next="/admin/invoices"
        adapter={fakeAdapter(200, LOGIN_OK).adapter}
        handoff={handoff}
        navigate={navigate}
        route={route}
      />,
    );
    await fillAndSubmit();
    await waitFor(() => {
      expect(handoff).toHaveBeenCalledTimes(1);
    });
    expect(navigate).not.toHaveBeenCalled();
    settle(true);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/invoices`);
    });
    expect(route).not.toHaveBeenCalled();
  });

  it("a sign-in forgets the earlier session's legacy marker before handing off", async () => {
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
    const seen: boolean[] = [];
    const handoff = vi.fn(() => {
      seen.push(isLegacySessionOpen());
      return Promise.resolve(true);
    });
    renderWithProviders(
      <LoginForm
        next="/admin/"
        adapter={fakeAdapter(200, LOGIN_OK).adapter}
        handoff={handoff}
        navigate={vi.fn()}
      />,
    );
    await fillAndSubmit();
    await waitFor(() => {
      expect(handoff).toHaveBeenCalledTimes(1);
    });
    expect(seen).toEqual([false]);
  });
});
