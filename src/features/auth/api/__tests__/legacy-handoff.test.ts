import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiStatus, resetApiStatus } from '@/lib/api/api-status';
import { HANDOFF_PATH, handoffToLegacy } from '../legacy-handoff';

function respond(status: number) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: typeof url === 'string' ? url : 'non-string', init });
    return Promise.resolve(new Response(null, { status }));
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe('handoffToLegacy', () => {
  beforeEach(() => {
    resetApiStatus();
  });

  it('204 -> true', async () => {
    expect(await handoffToLegacy('tok', respond(204).fetchImpl)).toBe(true);
  });

  it('401 -> false', async () => {
    expect(await handoffToLegacy('tok', respond(401).fetchImpl)).toBe(false);
  });

  it('405 -> false', async () => {
    expect(await handoffToLegacy('tok', respond(405).fetchImpl)).toBe(false);
  });

  it('a rejection -> false, without throwing', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    expect(await handoffToLegacy('tok', failing)).toBe(false);
  });

  it('POSTs to /erp_sso/handoff with the bearer header, credentials include, no token in the URL', async () => {
    const { fetchImpl, calls } = respond(204);
    await handoffToLegacy('secret-token', fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(HANDOFF_PATH);
    expect(calls[0]?.url).not.toContain('secret-token');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.credentials).toBe('include');
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe(
      'Bearer secret-token',
    );
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a failed handoff does not mark the API unreachable (legacy is a different upstream)', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    await handoffToLegacy('tok', failing);
    expect(getApiStatus().reachable).toBe(true);
  });
});
