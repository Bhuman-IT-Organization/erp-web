// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION_CODES, PERMISSIONS } from '@/config/permissions';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { withPermission } from '../withPermission';

const COMMON = commonEn.common;
const OK = 200;
const UNAVAILABLE = 503;
const VIEW = PERMISSIONS.staff.members.view;
const VIEW_OWN = PERMISSIONS.crm.customers.viewOwn;
const RETRY_RANDOM = 0.005; // SWR retry delay = random() * base → a few ms
const SETTLE_MS = 100; // longer than any pinned retry delay: a flip back to the skeleton would be seen

/** The page's pathname, read by the HOC through `usePathname()` (D-15). */
const pathname = vi.hoisted(() => ({ current: '/setup/staff' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function Page() {
  return <p data-testid="page">{COMMON.retry}</p>;
}
const Guarded = withPermission(Page, { skeleton: 'list' });

const me = (isAdmin: boolean, permissions: readonly string[]) => ({
  staffId: 1,
  email: 'a@b.co',
  firstName: 'A',
  lastName: 'B',
  isAdmin,
  roleId: null,
  permissions,
  locale: null,
});

/** A private SWR cache per test, and no SWR retry: a 5xx settles into `error` at once. */
const renderAt = (path: string, adapter: AxiosAdapter) => {
  pathname.current = path;
  http.defaults.adapter = adapter;
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <Guarded />
    </SWRConfig>,
  );
};

/** `/me` never answers: the permissions stay unknown for the whole test. */
const pendingForever: AxiosAdapter = () => new Promise(() => undefined);

const expectNoMessage = (): void => {
  expect(screen.queryByTestId('permission-refused')).toBeNull();
  expect(screen.queryByTestId('permission-error')).toBeNull();
  expect(screen.queryByTestId('page')).toBeNull();
};

// `/me` is asked only once the tab's session is signed in (WR-08): seed one before each render.
beforeEach(() => {
  setSession({ accessToken: 't', csrfToken: 'c' });
});
// Unmount BEFORE the session resets (03.2 RESEARCH Pitfall 9): a still-mounted consumer would see
// `pending` and start a bootstrap after the test ended.
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
  vi.restoreAllMocks();
});

describe('withPermission', () => {
  it('while /me is pending: the declared skeleton, and neither a refusal nor an error (D-39)', async () => {
    renderAt('/setup/staff', pendingForever);
    const pending = screen.getByTestId('permission-pending');
    expect(pending.dataset.variant).toBe('list');
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expectNoMessage();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('permission-pending')).not.toBeNull();
    expectNoMessage();
  });

  it('a /me 503 is an error with Retry, never "no access"; Retry asks /me again (D-39, T-3.2-36)', async () => {
    const fake: FakeAdapter = fakeAdapter(UNAVAILABLE, problem(UNAVAILABLE, 'ERP-UPSTREAM-0001'));
    renderAt('/setup/staff', fake.adapter);
    const error = await screen.findByTestId('permission-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(screen.queryByTestId('permission-refused')).toBeNull();
    expect(screen.queryByTestId('page')).toBeNull();
    expect(fake.calls).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: COMMON.retry }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(2);
    });
    expect(fake.calls[1]?.url).toBe('/api/v1/auth/me');
  });

  it('renders the component when /me holds the code the map declares for /setup/staff', async () => {
    renderAt('/setup/staff', fakeAdapter(OK, me(false, [VIEW])).adapter);
    expect(await screen.findByTestId('page')).not.toBeNull();
  });

  it('renders NoAccessState — never a redirect — when /me lacks the code', async () => {
    const before = window.location.href;
    renderAt('/setup/staff', fakeAdapter(OK, me(false, [VIEW_OWN])).adapter);
    await screen.findByTestId('permission-refused');
    expect(screen.getByRole('heading', { name: COMMON.forbidden })).not.toBeNull();
    expect(screen.queryByTestId('permission-error')).toBeNull();
    expect(screen.queryByTestId('page')).toBeNull();
    expect(window.location.href).toBe(before);
  });

  it('/setup/roles (admin gate): a member holding every code but not the flag is refused', async () => {
    renderAt('/setup/roles', fakeAdapter(OK, me(false, PERMISSION_CODES)).adapter);
    expect(await screen.findByTestId('permission-refused')).not.toBeNull();
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('/setup/roles (admin gate): an administrator is admitted', async () => {
    renderAt('/setup/roles', fakeAdapter(OK, me(true, [])).adapter);
    expect(await screen.findByTestId('page')).not.toBeNull();
  });

  it('a path the map does not name is refused, even for an administrator (fail closed, T-3.2-33)', async () => {
    renderAt('/nowhere', fakeAdapter(OK, me(true, PERMISSION_CODES)).adapter);
    expect(await screen.findByTestId('permission-refused')).not.toBeNull();
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('/setup/staff/new resolves through routeGateOf: its own key, the view code', async () => {
    renderAt('/setup/staff/new', fakeAdapter(OK, me(false, [VIEW])).adapter);
    expect(await screen.findByTestId('page')).not.toBeNull();
    cleanup();
    renderAt('/setup/staff/new', fakeAdapter(OK, me(false, [VIEW_OWN])).adapter);
    expect(await screen.findByTestId('permission-refused')).not.toBeNull();
  });

  it('while SWR retries a failing /me, the skeleton never comes back after the error (D-39)', async () => {
    // SWR's own retry policy is ON here (no shouldRetryOnError override); a near-zero jitter makes
    // its 3 retries land in a few ms.
    vi.spyOn(Math, 'random').mockReturnValue(RETRY_RANDOM);
    const fake = fakeAdapter(UNAVAILABLE, problem(UNAVAILABLE, 'ERP-UPSTREAM-0001'));
    pathname.current = '/setup/staff';
    http.defaults.adapter = fake.adapter;
    let errorSeen = false;
    let pendingAfterError = false;
    const observer = new MutationObserver(() => {
      if (screen.queryByTestId('permission-error') !== null) errorSeen = true;
      else if (errorSeen && screen.queryByTestId('permission-pending') !== null) {
        pendingAfterError = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Guarded />
      </SWRConfig>,
    );
    // At least one automatic retry reaches the network (later ones may be deduped by SWR).
    await waitFor(() => {
      expect(fake.calls.length).toBeGreaterThanOrEqual(2);
    });
    await screen.findByTestId('permission-error');
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    observer.disconnect();
    expect(errorSeen).toBe(true);
    expect(pendingAfterError).toBe(false);
    expect(screen.queryByTestId('permission-refused')).toBeNull();
  });

  it('while a retry of a failed /me is in flight, the error stays and Retry is busy', async () => {
    const first = fakeAdapter(UNAVAILABLE, problem(UNAVAILABLE, 'ERP-UPSTREAM-0001'));
    let calls = 0;
    renderAt('/setup/staff', (config) => {
      calls += 1;
      return calls === 1 ? first.adapter(config) : new Promise(() => undefined);
    });
    await userEvent.click(await screen.findByRole('button', { name: COMMON.retry }));
    const busy = await screen.findByRole('button', { name: COMMON.retrying });
    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('permission-error')).not.toBeNull();
    expect(screen.queryByTestId('permission-pending')).toBeNull();
    expect(calls).toBe(2);
  });

  it('is named withPermission(X)', () => {
    expect(Guarded.displayName).toBe('withPermission(Page)');
  });
});
