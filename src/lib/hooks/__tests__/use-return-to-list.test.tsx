// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readListReturn, recordListReturn, useRestoreListScroll } from '../use-return-to-list';

/**
 * D-28: Save and "Back to list" return to exactly where the user left the list — its URL (cursor,
 * sort, search, page size) and its scroll position. The URL is recorded in `sessionStorage` when a
 * row opens, and it is attacker-writable (any script on the origin, a crafted history), so reading
 * it back accepts only the list's own path (T-3.2-50).
 */
const KEY = 'erp.list.return:/setup/staff';
const go = (url: string) => {
  window.history.replaceState(null, '', url);
};

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sessionStorage.clear();
  go('/');
  scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recordListReturn / readListReturn (D-28, T-3.2-50)', () => {
  it("records the list's URL and scrollY when a row opens on /setup/staff?cursor=abc&sort=-email", () => {
    go('/setup/staff?cursor=abc&sort=-email');
    recordListReturn('/setup/staff');
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? 'null')).toEqual({
      url: '/setup/staff?cursor=abc&sort=-email',
      y: 640,
    });
    expect(readListReturn('/setup/staff')).toBe('/setup/staff?cursor=abc&sort=-email');
  });

  it('records nothing when the current page is not the list itself', () => {
    go('/setup/staff/12');
    recordListReturn('/setup/staff');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('with nothing recorded (a permalink) returns the list base', () => {
    expect(readListReturn('/setup/staff')).toBe('/setup/staff');
  });

  it.each([
    ['//evil.com'],
    ['//evil.com/staff'],
    ['/setup/staff/12'],
    ['https://x/staff'],
    ['/setup/staffers'],
    ['/setup/staff\\evil'],
    ['javascript:alert(1)'],
    ['/setup/roles?cursor=abc'],
  ])('a stored url %j is refused: the list base comes back', (url) => {
    sessionStorage.setItem(KEY, JSON.stringify({ url, y: 10 }));
    expect(readListReturn('/setup/staff')).toBe('/setup/staff');
  });

  it('a corrupt or foreign-shaped record is refused too', () => {
    for (const raw of ['{', '"x"', '{"url":42}', 'null']) {
      sessionStorage.setItem(KEY, raw);
      expect(readListReturn('/setup/staff')).toBe('/setup/staff');
    }
  });

  it('with no sessionStorage (a server render) it answers the list base and never throws', () => {
    vi.stubGlobal('sessionStorage', undefined);
    try {
      expect(readListReturn('/setup/staff')).toBe('/setup/staff');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the base itself and the base with a query are accepted', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ url: '/setup/staff', y: 0 }));
    expect(readListReturn('/setup/staff')).toBe('/setup/staff');
    sessionStorage.setItem(KEY, JSON.stringify({ url: '/setup/staff?q=jane&limit=50' }));
    expect(readListReturn('/setup/staff')).toBe('/setup/staff?q=jane&limit=50');
  });
});

describe('useRestoreListScroll (D-28)', () => {
  beforeEach(() => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ url: '/setup/staff?cursor=abc&sort=-email', y: 640 }),
    );
  });

  it('on the stored URL, once ready, scrolls to the stored y once and then forgets y', () => {
    go('/setup/staff?cursor=abc&sort=-email');
    const { rerender } = renderHook(
      ({ ready }) => {
        useRestoreListScroll('/setup/staff', ready);
      },
      { initialProps: { ready: false } },
    );
    expect(scrollTo).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
    rerender({ ready: true });
    renderHook(() => {
      useRestoreListScroll('/setup/staff', true);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // The URL stays recorded for "Back to list"; only the scroll is spent.
    expect(readListReturn('/setup/staff')).toBe('/setup/staff?cursor=abc&sort=-email');
  });

  it('with ready false it does not scroll', () => {
    go('/setup/staff?cursor=abc&sort=-email');
    renderHook(() => {
      useRestoreListScroll('/setup/staff', false);
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('on another URL of the same list (a new search) it does not scroll', () => {
    go('/setup/staff?q=other');
    renderHook(() => {
      useRestoreListScroll('/setup/staff', true);
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
