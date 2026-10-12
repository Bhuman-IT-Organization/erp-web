import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getApiStatus,
  markReachable,
  markUnreachable,
  resetApiStatus,
  subscribeApiStatus,
} from '../api-status';

describe('apiStatus store', () => {
  beforeEach(() => {
    resetApiStatus();
  });

  it('starts reachable', () => {
    expect(getApiStatus()).toEqual({ reachable: true });
  });

  it('markUnreachable replaces the snapshot and notifies once', () => {
    const listener = vi.fn();
    subscribeApiStatus(listener);
    markUnreachable(30, 1_000);
    expect(getApiStatus()).toEqual({ reachable: false, retryAfterS: 30, since: 1_000 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('an identical markUnreachable does not notify again and keeps the snapshot reference', () => {
    const listener = vi.fn();
    subscribeApiStatus(listener);
    markUnreachable(30, 1_000);
    const first = getApiStatus();
    markUnreachable(30, 2_000);
    expect(getApiStatus()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a different retryAfterS is a state change', () => {
    const listener = vi.fn();
    subscribeApiStatus(listener);
    markUnreachable(null);
    markUnreachable(10);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getApiStatus()).toMatchObject({ reachable: false, retryAfterS: 10 });
  });

  it('markReachable flips back and notifies; a second call is a no-op', () => {
    const listener = vi.fn();
    subscribeApiStatus(listener);
    markUnreachable(null);
    markReachable();
    expect(getApiStatus()).toEqual({ reachable: true });
    expect(listener).toHaveBeenCalledTimes(2);
    markReachable();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const off = subscribeApiStatus(listener);
    off();
    markUnreachable(null);
    expect(listener).not.toHaveBeenCalled();
  });

  it('resetApiStatus restores the initial state', () => {
    markUnreachable(5);
    resetApiStatus();
    expect(getApiStatus()).toEqual({ reachable: true });
  });
});
