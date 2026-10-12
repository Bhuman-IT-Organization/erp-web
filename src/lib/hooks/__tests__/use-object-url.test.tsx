// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useObjectUrl } from '../use-object-url';

/** One object URL per Blob, revoked when the Blob changes and on unmount (T-4.2-48). */
describe('useObjectUrl', () => {
  let made = 0;
  let create = vi.fn<(source: Blob | MediaSource) => string>();
  let revoke = vi.fn<(url: string) => void>();
  beforeEach(() => {
    made = 0;
    create = vi.fn(() => {
      made += 1;
      return `blob:test/${String(made)}`;
    });
    revoke = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(create);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('undefined gives no URL and creates nothing', () => {
    const { result } = renderHook(() => useObjectUrl(undefined));
    expect(result.current).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates one URL for a Blob, keeps it across renders, revokes it when the Blob changes and on unmount', () => {
    const first = new Blob(['a']);
    const second = new Blob(['b']);
    const { result, rerender, unmount } = renderHook(
      ({ blob }: { blob: Blob | undefined }) => useObjectUrl(blob),
      { initialProps: { blob: first } },
    );
    expect(result.current).toBe('blob:test/1');
    rerender({ blob: first });
    expect(create).toHaveBeenCalledTimes(1);
    rerender({ blob: second });
    expect(result.current).toBe('blob:test/2');
    expect(revoke).toHaveBeenCalledWith('blob:test/1');
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:test/2');
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('going back to undefined revokes and gives no URL', () => {
    const initialProps: { blob: Blob | undefined } = { blob: new Blob(['a']) };
    const { result, rerender } = renderHook(
      ({ blob }: { blob: Blob | undefined }) => useObjectUrl(blob),
      { initialProps },
    );
    rerender({ blob: undefined });
    expect(result.current).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith('blob:test/1');
  });
});
