// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureLegacySession,
  forgetLegacySession,
  isLegacySessionOpen,
  isNodePage,
  LEGACY_OPENED_KEY,
  NODE_GATED_PREFIXES,
  openLegacySession,
} from '../legacy-session';
import { clearSession, setSession } from '../session';

/** A handoff double the test settles by hand. */
function deferredHandoff() {
  const settles: ((opened: boolean) => void)[] = [];
  const open = vi.fn<(token: string) => Promise<boolean>>(
    () =>
      new Promise<boolean>((resolve) => {
        settles.push(resolve);
      }),
  );
  return { open, settle: (opened: boolean, i = settles.length - 1) => settles[i]?.(opened) };
}

beforeEach(() => {
  forgetLegacySession();
  clearSession();
  window.sessionStorage.clear();
});

describe('isNodePage', () => {
  it.each([
    ['/setup/staff?q=a', true],
    ['/setup', true],
    ['/admin/invoices#top', false],
    ['/admin/invoice_items/12', false],
    ['/admin/hr_profile/organizational_chart', false],
    ['/login', true],
    ['/logout?from=legacy', true],
    ['/status', true],
    ['/admin/', false],
    ['/admin/purchase/purchase_order/12', false],
    ['/sales/invoices', false],
    ['/setupx', false],
    ['/', false],
  ])('%s -> %s', (path, node) => {
    expect(isNodePage(path)).toBe(node);
  });

  it('the gated prefix is the proxy.ts gate', () => {
    expect(NODE_GATED_PREFIXES).toEqual(['/setup']);
  });
});

describe('openLegacySession', () => {
  it('one flight: a second call while the first is pending joins it, never a second handoff', async () => {
    const h = deferredHandoff();
    const a = openLegacySession('t1', h.open);
    const b = openLegacySession('t2', h.open);
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledWith('t1');
    expect(isLegacySessionOpen()).toBe(false);
    h.settle(true);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(isLegacySessionOpen()).toBe(true);
    expect(window.sessionStorage.getItem(LEGACY_OPENED_KEY)).not.toBeNull();
  });

  it('an opened session is not handed off again in this page', async () => {
    const open = vi.fn(() => Promise.resolve(true));
    await openLegacySession('t', open);
    expect(await openLegacySession('t', open)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a failed handoff leaves no flight and no marker: the next call hands off again', async () => {
    const open = vi.fn<(t: string) => Promise<boolean>>();
    open.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await openLegacySession('t', open)).toBe(false);
    expect(isLegacySessionOpen()).toBe(false);
    expect(window.sessionStorage.getItem(LEGACY_OPENED_KEY)).toBeNull();
    expect(await openLegacySession('t', open)).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('a handoff that rejects counts as failed and never throws', async () => {
    expect(await openLegacySession('t', () => Promise.reject(new Error('x')))).toBe(false);
  });

  it('a flight forgotten while pending (a sign-out) never marks the session open when it lands', async () => {
    const h = deferredHandoff();
    const flight = openLegacySession('t', h.open);
    forgetLegacySession();
    h.settle(true);
    expect(await flight).toBe(true);
    expect(isLegacySessionOpen()).toBe(false);
    expect(window.sessionStorage.getItem(LEGACY_OPENED_KEY)).toBeNull();
  });

  it('a forgotten failed flight leaves a newer flight alone', async () => {
    const h = deferredHandoff();
    const old = openLegacySession('t', h.open);
    forgetLegacySession();
    const fresh = openLegacySession('t', h.open);
    h.settle(false, 0);
    await old;
    expect(openLegacySession('t', h.open)).toBe(fresh);
    h.settle(true, 1);
    expect(await fresh).toBe(true);
  });

  it('storage that cannot be written still opens the session for this page', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(await openLegacySession('t', () => Promise.resolve(true))).toBe(true);
    expect(isLegacySessionOpen()).toBe(true);
    setItem.mockRestore();
  });
});

describe('isLegacySessionOpen', () => {
  it("a fresh page reads this tab's marker (a handoff that completed before a reload)", () => {
    expect(isLegacySessionOpen()).toBe(false);
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
    expect(isLegacySessionOpen()).toBe(true);
  });

  it('storage that cannot be read reads as not open (the safe side: hand off)', () => {
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
    const storage = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(isLegacySessionOpen()).toBe(false);
    storage.mockRestore();
  });

  it('forgetLegacySession clears the marker', () => {
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
    forgetLegacySession();
    expect(isLegacySessionOpen()).toBe(false);
  });

  it('forgetLegacySession survives storage that cannot be written', () => {
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => {
      forgetLegacySession();
    }).not.toThrow();
    removeItem.mockRestore();
  });
});

describe('ensureLegacySession', () => {
  it('already open: resolves true with no handoff', async () => {
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
    const open = vi.fn(() => Promise.resolve(true));
    expect(await ensureLegacySession(open)).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('a pending flight: awaits it, with no second handoff', async () => {
    const h = deferredHandoff();
    void openLegacySession('t', h.open);
    const ensured = ensureLegacySession(h.open);
    h.settle(true);
    expect(await ensured).toBe(true);
    expect(h.open).toHaveBeenCalledTimes(1);
  });

  it("a pending flight that fails: hands off again with the session's token", async () => {
    setSession({ accessToken: 'live', csrfToken: 'c' });
    const h = deferredHandoff();
    void openLegacySession('old', h.open);
    const ensured = ensureLegacySession(h.open);
    h.settle(false, 0);
    await vi.waitFor(() => {
      expect(h.open).toHaveBeenCalledTimes(2);
    });
    expect(h.open).toHaveBeenLastCalledWith('live');
    h.settle(true, 1);
    expect(await ensured).toBe(true);
  });

  it('never ran (a reload): hands off with the session token', async () => {
    setSession({ accessToken: 'live', csrfToken: 'c' });
    const open = vi.fn(() => Promise.resolve(true));
    expect(await ensureLegacySession(open)).toBe(true);
    expect(open).toHaveBeenCalledWith('live');
  });

  it('no session token: resolves false with no handoff', async () => {
    const open = vi.fn(() => Promise.resolve(true));
    expect(await ensureLegacySession(open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
