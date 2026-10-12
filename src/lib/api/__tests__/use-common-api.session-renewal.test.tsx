// @vitest-environment happy-dom
import { AxiosHeaders, type AxiosAdapter } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clearSession, getAccessToken, setSession } from '@/lib/auth/session';
import '@/lib/hooks/use-session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import { http } from '../http';
import { useCommonApi } from '../use-common-api';

/**
 * The lead's screen, end to end through SWR (quick task fix/quick-session-refresh): a list read
 * answers 401 because the tab's access token expired while it sat idle. The transport runs the one
 * refresh before the read's failure reaches SWR, and SWR then re-runs the read with the new bearer.
 * D-39: no render shows the 401 while the refresh is in flight.
 */
const THINGS = '/api/v1/things';
const CSRF_PATH = '/api/v1/auth/csrf';
const REFRESH_PATH = '/api/v1/auth/refresh';
const item = z.object({ id: z.number() });

const renders: string[] = [];
function Probe() {
  const { data, error } = useCommonApi(THINGS, item);
  renders.push(String(error?.status ?? ''));
  return (
    <output data-testid="probe" data-status={error?.status ?? ''}>
      {data === undefined ? '' : String(data.id)}
    </output>
  );
}

function fakeApi() {
  const urls: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? '';
    urls.push(url);
    if (url === CSRF_PATH) return fakeAdapter(200, { csrfToken: 'c2' }).adapter(config);
    if (url === REFRESH_PATH) {
      await gate;
      return fakeAdapter(200, { accessToken: 'fresh', csrfToken: 'c3', expiresIn: 900 }).adapter(
        config,
      );
    }
    return AxiosHeaders.from(config.headers).get('authorization') === 'Bearer fresh'
      ? fakeAdapter(200, { id: 7 }).adapter(config)
      : fakeAdapter(401, problem(401, 'ERP-AUTH-0004')).adapter(config);
  };
  return {
    adapter,
    urls,
    release: () => {
      release();
    },
  };
}

beforeEach(() => {
  resetApiStatus();
  renders.length = 0;
  setSession({ accessToken: 'stale', csrfToken: 'c1' });
});
afterEach(() => {
  delete http.defaults.adapter;
  clearSession();
});

describe('an idle tab whose token expired (the lead report, 2026-10-02)', () => {
  it('shows no session-ended error while the refresh is in flight, then the read loads', async () => {
    const api = fakeApi();
    http.defaults.adapter = api.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Probe />
      </SWRConfig>,
    );

    await waitFor(() => {
      expect(api.urls).toContain(REFRESH_PATH);
    });
    expect(renders).not.toContain('401');

    api.release();
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('7');
    });
    expect(getAccessToken()).toBe('fresh');
    expect(api.urls.filter((u) => u === REFRESH_PATH)).toHaveLength(1);
    expect(api.urls.filter((u) => u === THINGS)).toHaveLength(2);
  });
});
