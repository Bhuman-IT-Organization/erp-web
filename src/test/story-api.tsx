import type { Decorator } from '@storybook/nextjs-vite';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import type { ApiAdapter } from '@/lib/api/call-api';
import { http } from '@/lib/api/http';
import { setSession } from '@/lib/auth/session';

/**
 * A story's fake api (plan 04.6-06): one function answers each request by its path, on the shared
 * axios instance, with made-up data only (W0-05). `'pending'` never answers (a loading story).
 */
export type StoryAnswer = { readonly status: number; readonly body?: unknown } | 'pending';
/** `method` (upper case) lets a story answer a write differently from the read of the same path. */
export type StoryRoute = (path: string, url: URL, method: string) => StoryAnswer;

export const ok = (body: unknown): StoryAnswer => ({ status: 200, body });

/** A problem-details refusal, as the api sends it. */
export const refused = (status: number, code: string): StoryAnswer => ({
  status,
  body: { type: 'about:blank', status, title: code, code },
});

/** The BE-19 list envelope over the rows given (one page, totals filled). */
export const listPage = (rows: readonly unknown[]) => ({
  data: rows,
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: rows.length,
    rangeStart: rows.length === 0 ? 0 : 1,
    exportLimit: 10_000,
    printLimit: 1000,
  },
});

/** `/auth/me` of a made-up member holding `permissions`. */
export const storyMe = (permissions: readonly string[], extra: object = {}) => ({
  staffId: 4,
  email: 'member@example.invalid',
  firstName: 'Staff',
  lastName: 'One',
  isAdmin: false,
  roleId: 2,
  permissions,
  locale: null,
  ...extra,
});

function respond(config: InternalAxiosRequestConfig, answer: StoryAnswer) {
  if (answer === 'pending') return new Promise<never>(() => undefined);
  const response = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (answer.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

/** The fake adapter itself (stories and screen tests): each request answered by `route`. */
export function routeAdapter(route: StoryRoute): ApiAdapter {
  return (config) => {
    const url = new URL(http.getUri(config), 'http://story.invalid');
    return respond(config, route(url.pathname, url, (config.method ?? 'get').toUpperCase()));
  };
}

/** The decorator: a session, the fake adapter, and a fresh SWR cache per story. */
export function withStoryApi(route: StoryRoute): Decorator {
  return function StoryApi(Story) {
    setSession({ accessToken: 'story', csrfToken: 'story' });
    http.defaults.adapter = routeAdapter(route);
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Story />
      </SWRConfig>
    );
  };
}

/** The 375px phone viewport (UI-SPEC § In-shell proofs, `Mobile`). */
export const MOBILE_375 = {
  parameters: {
    viewport: {
      options: { mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } } },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
} as const;
