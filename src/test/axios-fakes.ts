import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import { vi } from 'vitest';

/**
 * Test doubles for the axios transport: a fake adapter records every request and answers with a
 * canned status/body/headers, exactly as the real http/xhr adapters would (non-2xx rejects with
 * an AxiosError carrying `response`). Used instead of a network by the `callApi` and auth tests.
 */
export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly data: unknown;
  readonly withCredentials: boolean | undefined;
  readonly timeout: number | undefined;
}

export interface FakeAdapter {
  readonly adapter: AxiosAdapter;
  readonly spy: ReturnType<typeof vi.fn>;
  readonly calls: RecordedRequest[];
}

function record(config: InternalAxiosRequestConfig): RecordedRequest {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(AxiosHeaders.from(config.headers).toJSON())) {
    if (typeof v === 'string') headers[k.toLowerCase()] = v;
  }
  return {
    url: config.url ?? '',
    method: (config.method ?? 'get').toUpperCase(),
    headers,
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    withCredentials: config.withCredentials,
    timeout: config.timeout,
  };
}

/** Answers every request with `status` and `body` (already-parsed JSON, as the real adapter yields). */
export function fakeAdapter(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): FakeAdapter {
  const calls: RecordedRequest[] = [];
  const spy = vi.fn((config: InternalAxiosRequestConfig) => {
    calls.push(record(config));
    const response = {
      data: body,
      status,
      statusText: String(status),
      headers: new AxiosHeaders(headers),
      config,
    };
    if (status >= 200 && status < 300) return Promise.resolve(response);
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${String(status)}`,
        'ERR_BAD_REQUEST',
        config,
        null,
        response,
      ),
    );
  });
  return { adapter: spy, spy, calls };
}

/** Rejects like a connection failure (no response). */
export function networkFailureAdapter(): FakeAdapter {
  const calls: RecordedRequest[] = [];
  const spy = vi.fn((config: InternalAxiosRequestConfig) => {
    calls.push(record(config));
    return Promise.reject(new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED', config));
  });
  return { adapter: spy, spy, calls };
}

export const problem = (status: number, code: string) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
});
