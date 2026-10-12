// @vitest-environment happy-dom
import { act, cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getAccessToken, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useResumeSession, useRunOnce, useSession, type ResumeHandlers } from '../use-session';

const OK = 200;
const UNAUTHORIZED = 401;
const CSRF_URL = '/api/v1/auth/csrf';
const REFRESH_URL = '/api/v1/auth/refresh';

/**
 * A stand-in for `navigator.locks`: FIFO like the real one, recording each name and whether the
 * lock is held while a request goes out. happy-dom may lack `locks`, so every test installs one
 * (or `undefined`) explicitly.
 */
interface FakeLocks {
  readonly names: string[];
  held: boolean;
  request: (name: string, cb: () => Promise<unknown>) => Promise<unknown>;
}

function fifoLocks(): FakeLocks {
  let tail: Promise<unknown> = Promise.resolve();
  const locks: FakeLocks = {
    names: [],
    held: false,
    request(name, cb) {
      locks.names.push(name);
      const run = tail.then(async () => {
        locks.held = true;
        try {
          return await cb();
        } finally {
          locks.held = false;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return locks;
}

function installLocks(value: FakeLocks | undefined): void {
  Object.defineProperty(window.navigator, 'locks', { value, configurable: true });
}

function refreshCount(fake: FakeAdapter): number {
  return fake.calls.filter((c) => c.url === REFRESH_URL).length;
}

function Probe({ adapter }: { readonly adapter: FakeAdapter['adapter'] }) {
  const { isReady, isSignedIn } = useSession({ adapter });
  return (
    <output data-testid="probe" data-ready={String(isReady)} data-signed-in={String(isSignedIn)} />
  );
}

// The in-memory token is module state shared by every test in the file: a late promise from a
// previous test could otherwise set it after this one started. Cleared on both edges.
beforeEach(() => {
  clearSession();
  installLocks(fifoLocks());
});
// Unmount BEFORE the session resets: Vitest runs this hook before the harness's own cleanup, and a
// still-mounted consumer would see `pending` and start a bootstrap after the test ended.
afterEach(() => {
  cleanup();
  clearSession();
  Reflect.deleteProperty(window.navigator, 'locks');
  configure({ reactStrictMode: false });
});

/**
 * StrictMode at the ROOT, as Next's `reactStrictMode` mounts the app. A `<StrictMode>` nested
 * inside `renderWithProviders`' providers does not double-invoke effects in React 19.2 (measured:
 * one effect run), so it would not reproduce the double mount.
 */
function strictRoot(): void {
  configure({ reactStrictMode: true });
}

describe('useSession', () => {
  it('runs fetchCsrf then refresh once and stores the access token', async () => {
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    expect(screen.getByTestId('probe').dataset.ready).toBe('true');
    expect(getAccessToken()).toBe('a1');
    // Exactly the two calls of the sequence, in order, and no more.
    expect(fake.calls.map((c) => c.url)).toEqual(['/api/v1/auth/csrf', '/api/v1/auth/refresh']);
  });

  it('is idempotent across re-renders: the sequence does not run again', async () => {
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    const { rerender } = renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    rerender(<Probe adapter={fake.adapter} />);
    rerender(<Probe adapter={fake.adapter} />);
    expect(fake.calls.length).toBe(2);
  });

  it('reports ready and not signed in when the csrf call fails', async () => {
    const fake = fakeAdapter(UNAUTHORIZED, { code: 'ERP-AUTH-0004' });
    renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.ready).toBe('true');
    });
    expect(screen.getByTestId('probe').dataset.signedIn).toBe('false');
    // It stops at the first failure: no refresh is attempted.
    expect(fake.calls.map((c) => c.url)).toEqual(['/api/v1/auth/csrf']);
    expect(getAccessToken()).toBeNull();
  });

  it('permits nothing before the sequence resolves', () => {
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    renderWithProviders(<Probe adapter={fake.adapter} />);
    expect(screen.getByTestId('probe').dataset.ready).toBe('false');
    expect(screen.getByTestId('probe').dataset.signedIn).toBe('false');
  });

  // WR-07: each refresh rotates the cookie, and the api treats a second refresh with the same
  // cookie as reuse — it revokes the family and signs the member out everywhere.
  it('runs ONE refresh under StrictMode (double mount)', async () => {
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    strictRoot();
    renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    expect(refreshCount(fake)).toBe(1);
  });

  it('runs ONE csrf and ONE refresh for two consumers mounted together', async () => {
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    renderWithProviders(
      <>
        <Probe adapter={fake.adapter} />
        <Probe adapter={fake.adapter} />
      </>,
    );
    await waitFor(() => {
      for (const probe of screen.getAllByTestId('probe')) {
        expect(probe.dataset.signedIn).toBe('true');
      }
    });
    expect(refreshCount(fake)).toBe(1);
    expect(fake.calls.filter((c) => c.url === CSRF_URL).length).toBe(1);
  });

  it("runs the whole csrf → refresh sequence inside navigator.locks 'erp-session-refresh'", async () => {
    const locks = fifoLocks();
    installLocks(locks);
    const base = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    const seen: { url: string; held: boolean }[] = [];
    const adapter: FakeAdapter['adapter'] = (config) => {
      seen.push({ url: config.url ?? '', held: locks.held });
      return base.adapter(config);
    };
    renderWithProviders(<Probe adapter={adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    expect(locks.names).toContain('erp-session-refresh');
    expect(seen.map((c) => c.url)).toEqual([CSRF_URL, REFRESH_URL]);
    expect(seen.every((c) => c.held)).toBe(true);
  });

  it('serialises two tabs: csrf, refresh, csrf, refresh — never two csrf calls first', async () => {
    const locks = fifoLocks();
    installLocks(locks);
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    // Two module instances are two tabs: each its own in-memory session, one shared lock.
    vi.resetModules();
    const tabA = await import('../use-session');
    vi.resetModules();
    const tabB = await import('../use-session');
    await Promise.all([
      tabA.bootstrapSession({ adapter: fake.adapter }),
      tabB.bootstrapSession({ adapter: fake.adapter }),
    ]);
    expect(fake.calls.map((c) => c.url)).toEqual([CSRF_URL, REFRESH_URL, CSRF_URL, REFRESH_URL]);
  });

  it('runs once and throws nothing where Web Locks are absent', async () => {
    installLocks(undefined);
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    strictRoot();
    renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    expect(refreshCount(fake)).toBe(1);
  });

  it('runs unlocked when navigator.locks.request rejects before granting the lock', async () => {
    installLocks({
      names: [],
      held: false,
      request: () => Promise.reject(new Error('lock manager unavailable')),
    });
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    expect(refreshCount(fake)).toBe(1);
  });

  it('resets on settle: after clearSession a new mount runs a new refresh', async () => {
    const fake = fakeAdapter(OK, { csrfToken: 'c1', accessToken: 'a1' });
    const { unmount } = renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    unmount();
    clearSession();
    renderWithProviders(<Probe adapter={fake.adapter} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.signedIn).toBe('true');
    });
    expect(refreshCount(fake)).toBe(2);
  });
});

/** Answers csrf with a token and refresh with `refresh`'s status and body. */
function refreshAdapter(refresh: FakeAdapter): FakeAdapter['adapter'] {
  const csrf = fakeAdapter(OK, { csrfToken: 'c1' });
  return (config) => (config.url === CSRF_URL ? csrf.adapter(config) : refresh.adapter(config));
}

function ResumeProbe({
  adapter,
  handlers,
}: {
  readonly adapter: FakeAdapter['adapter'];
  readonly handlers: ResumeHandlers;
}) {
  useResumeSession(handlers, { adapter });
  return null;
}

function OnceProbe({ ready, run }: { readonly ready: boolean; readonly run: () => void }) {
  useRunOnce(ready, run);
  return null;
}

describe('useResumeSession and useRunOnce', () => {
  it('useResumeSession reports a recovered session once, with its access token, under StrictMode', async () => {
    const refresh = fakeAdapter(OK, { accessToken: 'a-resumed', csrfToken: 'c2' });
    const handlers = { onSignedIn: vi.fn(), onSignedOut: vi.fn() };
    strictRoot();
    renderWithProviders(<ResumeProbe adapter={refreshAdapter(refresh)} handlers={handlers} />);
    await waitFor(() => {
      expect(handlers.onSignedIn).toHaveBeenCalledTimes(1);
    });
    expect(handlers.onSignedIn).toHaveBeenCalledWith('a-resumed');
    expect(handlers.onSignedOut).not.toHaveBeenCalled();
    expect(refresh.calls.length).toBe(1);
  });

  it('useResumeSession reports a refused refresh (401) as signed out, never as a session', async () => {
    const refresh = fakeAdapter(UNAUTHORIZED, problem(UNAUTHORIZED, 'ERP-AUTH-0002'));
    const handlers = { onSignedIn: vi.fn(), onSignedOut: vi.fn() };
    renderWithProviders(<ResumeProbe adapter={refreshAdapter(refresh)} handlers={handlers} />);
    await waitFor(() => {
      expect(handlers.onSignedOut).toHaveBeenCalledTimes(1);
    });
    expect(handlers.onSignedIn).not.toHaveBeenCalled();
  });

  it('useResumeSession ignores a sign-in made after its first answer (the form runs its own handoff)', async () => {
    const refresh = fakeAdapter(UNAUTHORIZED, problem(UNAUTHORIZED, 'ERP-AUTH-0002'));
    const handlers = { onSignedIn: vi.fn(), onSignedOut: vi.fn() };
    renderWithProviders(<ResumeProbe adapter={refreshAdapter(refresh)} handlers={handlers} />);
    await waitFor(() => {
      expect(handlers.onSignedOut).toHaveBeenCalledTimes(1);
    });
    act(() => {
      setSession({ accessToken: 'a-form', csrfToken: 'c-form' });
    });
    expect(handlers.onSignedIn).not.toHaveBeenCalled();
    expect(handlers.onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('useRunOnce runs its action once, the first time its condition holds, under StrictMode, and never again on re-render', () => {
    const run = vi.fn();
    strictRoot();
    const { rerender } = renderWithProviders(<OnceProbe ready={false} run={run} />);
    expect(run).not.toHaveBeenCalled();
    rerender(<OnceProbe ready run={run} />);
    expect(run).toHaveBeenCalledTimes(1);
    rerender(<OnceProbe ready={false} run={run} />);
    rerender(<OnceProbe ready run={run} />);
    rerender(
      <OnceProbe
        ready
        run={() => {
          run();
        }}
      />,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
