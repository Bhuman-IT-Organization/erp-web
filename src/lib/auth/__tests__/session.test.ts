import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function freshSession() {
  vi.resetModules();
  return import('../session');
}

describe('session (in-memory token holder, ADR-0005)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts empty', async () => {
    const s = await freshSession();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getCsrfToken()).toBeNull();
  });

  it('set -> get -> clear round trip', async () => {
    const s = await freshSession();
    s.setSession({ accessToken: 'at', csrfToken: 'ct' });
    expect(s.getAccessToken()).toBe('at');
    expect(s.getCsrfToken()).toBe('ct');
    s.clearSession();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getCsrfToken()).toBeNull();
  });

  it('a fresh module instance does not remember a previous session (nothing is persisted)', async () => {
    const first = await freshSession();
    first.setSession({ accessToken: 'at', csrfToken: 'ct' });
    const second = await freshSession();
    expect(second.getAccessToken()).toBeNull();
  });

  it('starts pending and each transition notifies subscribers (the status store)', async () => {
    const s = await freshSession();
    expect(s.getSessionStatus()).toBe('pending');
    const seen: string[] = [];
    s.subscribeSession(() => seen.push(s.getSessionStatus()));
    s.setSession({ accessToken: 'at', csrfToken: 'ct' });
    s.markSignedOut();
    expect(s.getAccessToken()).toBeNull();
    s.clearSession();
    expect(seen).toEqual(['signedIn', 'signedOut', 'pending']);
  });

  it('clearSession is a full reset: a new generation every time', async () => {
    const s = await freshSession();
    const before = s.getSessionGeneration();
    s.clearSession();
    expect(s.getSessionGeneration()).toBe(before + 1);
    s.setSession({ accessToken: 'at', csrfToken: 'ct' });
    expect(s.getSessionGeneration()).toBe(before + 1);
    s.clearSession();
    expect(s.getSessionGeneration()).toBe(before + 2);
  });

  it('an unsubscribed listener is not notified again', async () => {
    const s = await freshSession();
    const listener = vi.fn();
    const unsubscribe = s.subscribeSession(listener);
    s.setSession({ accessToken: 'at', csrfToken: 'ct' });
    unsubscribe();
    s.clearSession();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe('the bootstrap seam (setSessionRecovery / recoverSession)', () => {
    it('awaits the registered recovery while pending, and nothing once it settled', async () => {
      const s = await freshSession();
      const recovery = vi.fn(async () => {
        await Promise.resolve();
        s.setSession({ accessToken: 'at', csrfToken: 'ct' });
      });
      s.setSessionRecovery(recovery);

      await s.recoverSession();
      expect(s.getAccessToken()).toBe('at');
      // Settled now: a second caller asks the bootstrap for nothing.
      await s.recoverSession();
      expect(recovery).toHaveBeenCalledTimes(1);
    });

    it('resolves at once when no recovery is registered (a page that bootstraps nothing)', async () => {
      const s = await freshSession();
      await expect(s.recoverSession()).resolves.toBeUndefined();
      expect(s.getSessionStatus()).toBe('pending');
    });

    it('never rejects: a failing recovery is simply a session that does not exist', async () => {
      const s = await freshSession();
      s.setSessionRecovery(() => Promise.reject(new Error('boom')));
      await expect(s.recoverSession()).resolves.toBeUndefined();
      expect(s.getAccessToken()).toBeNull();
    });
  });

  describe('the renewal clock (quick task fix/quick-session-refresh)', () => {
    const NOW = 1_000_000;
    const LIFETIME_S = 900;
    const RENEW_AT = NOW + LIFETIME_S * 1000 * 0.8;

    it('renews at 80% of the lifetime the api stated, and not before', async () => {
      const s = await freshSession();
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      s.setSession({ accessToken: 'at', csrfToken: 'ct', expiresInS: LIFETIME_S });
      vi.restoreAllMocks();
      expect(s.getRenewAt()).toBe(RENEW_AT);
      expect(s.needsRenewal(RENEW_AT - 1)).toBe(false);
      expect(s.needsRenewal(RENEW_AT)).toBe(true);
    });

    it('has nothing to renew without a stated lifetime, signed out or reset', async () => {
      const s = await freshSession();
      s.setSession({ accessToken: 'at', csrfToken: 'ct' });
      expect(s.getRenewAt()).toBeNull();
      expect(s.needsRenewal(Number.MAX_SAFE_INTEGER)).toBe(false);
      s.setSession({ accessToken: 'at', csrfToken: 'ct', expiresInS: LIFETIME_S });
      s.markSignedOut();
      expect(s.getRenewAt()).toBeNull();
      s.setSession({ accessToken: 'at', csrfToken: 'ct', expiresInS: LIFETIME_S });
      s.clearSession();
      expect(s.needsRenewal(Number.MAX_SAFE_INTEGER)).toBe(false);
    });

    it('renewSession runs the registered single flight only for a live session, and never rejects', async () => {
      const s = await freshSession();
      const recovery = vi.fn(() => Promise.reject(new Error('boom')));
      s.setSessionRecovery(recovery);
      await s.renewSession();
      expect(recovery).not.toHaveBeenCalled();
      s.setSession({ accessToken: 'at', csrfToken: 'ct' });
      await expect(s.renewSession()).resolves.toBeUndefined();
      expect(recovery).toHaveBeenCalledTimes(1);
      s.markSignedOut();
      await s.renewSession();
      expect(recovery).toHaveBeenCalledTimes(1);
    });
  });

  it('the source uses no storage API (T-1.3-20)', () => {
    const source = readFileSync(fileURLToPath(new URL('../session.ts', import.meta.url)), 'utf8');
    for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
    expect(source).toContain('let accessToken');
  });
});
