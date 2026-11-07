// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders } from '@/test/render';
import { useDeleteTodo, useFinishTodo, useSaveTodos } from '../use-save-todo';

const TODO = {
  id: '7',
  description: 'Call Ali',
  finished: false,
  dateAdded: '2026-10-02T20:30:15.000Z',
  dateFinished: null,
};

interface Reply {
  readonly status: number;
  readonly body?: unknown;
}
let reply: Reply;
let requests: { readonly method: string; readonly url: URL; readonly body: unknown }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const raw: unknown = config.data;
  requests.push({
    method: (config.method ?? 'get').toUpperCase(),
    url,
    body: typeof raw === 'string' ? JSON.parse(raw) : raw,
  });
  const response = {
    data: reply.body,
    status: reply.status,
    statusText: String(reply.status),
    headers: new AxiosHeaders(),
    config,
  };
  if (reply.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response));
}

const problem = (status: number, code: string) => ({
  status,
  body: { type: 'about:blank', status, title: code, code },
});

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  reply = { status: 200, body: TODO };
  http.defaults.adapter = respond;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

function mount<T>(use: () => T): { readonly current: () => T } {
  let latest: T | undefined;
  function Probe() {
    latest = use();
    return null;
  }
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <Probe />
    </SWRConfig>,
  );
  return {
    current: () => {
      if (latest === undefined) throw new Error('hook not rendered');
      return latest;
    },
  };
}

describe('useSaveTodo', () => {
  it('create POSTs the body to the todo resource path and returns the saved record', async () => {
    reply = { status: 201, body: TODO };
    const hook = mount(() => useSaveTodos(null));
    let outcome:
      Awaited<ReturnType<ReturnType<typeof hook.current>['create']['trigger']>> | undefined;
    await act(async () => {
      outcome = await hook.current().create.trigger({ description: 'Call Ali' });
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', body: { description: 'Call Ali' } });
    expect(requests[0]?.url.pathname).toBe('/api/v1/todo');
    expect(outcome?.ok).toBe(true);
    if (outcome?.ok === true) expect(outcome.data).toEqual(TODO);
  });

  it('update PATCHes the record path', async () => {
    const hook = mount(() => useSaveTodos('7'));
    await act(async () => {
      await hook.current().update.trigger({ description: 'New' });
    });
    expect(requests[0]).toMatchObject({ method: 'PATCH', body: { description: 'New' } });
    expect(requests[0]?.url.pathname).toBe('/api/v1/todo/7');
  });

  it('is never retried: a 503 answers a failure result and sends the request once', async () => {
    reply = problem(503, 'ERP-UPSTREAM-0001');
    const hook = mount(() => useSaveTodos(null));
    let outcome:
      Awaited<ReturnType<ReturnType<typeof hook.current>['create']['trigger']>> | undefined;
    await act(async () => {
      outcome = await hook.current().create.trigger({ description: 'x' });
    });
    expect(outcome?.ok).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('a 400 is a resolved failure carrying its code and issues for the form', async () => {
    reply = {
      status: 400,
      body: {
        type: 'about:blank',
        status: 400,
        title: 'x',
        code: 'ERP-VALIDATION-0001',
        issues: [{ path: ['description'], message: 'too small' }],
      },
    };
    const hook = mount(() => useSaveTodos(null));
    let outcome:
      Awaited<ReturnType<ReturnType<typeof hook.current>['create']['trigger']>> | undefined;
    await act(async () => {
      outcome = await hook.current().create.trigger({ description: 'x' });
    });
    expect(outcome?.ok).toBe(false);
    if (outcome?.ok === false) expect(outcome.code).toBe('ERP-VALIDATION-0001');
  });
});

describe('useFinishTodo', () => {
  it('PATCHes { finished } to the finished path', async () => {
    reply = {
      status: 200,
      body: { ...TODO, finished: true, dateFinished: '2026-10-03T08:00:00.000Z' },
    };
    const hook = mount(() => useFinishTodo('7'));
    let outcome: Awaited<ReturnType<ReturnType<typeof hook.current>['trigger']>> | undefined;
    await act(async () => {
      outcome = await hook.current().trigger({ finished: true });
    });
    expect(requests[0]).toMatchObject({ method: 'PATCH', body: { finished: true } });
    expect(requests[0]?.url.pathname).toBe('/api/v1/todo/7/finished');
    expect(outcome?.ok).toBe(true);
  });

  it('a 404 is a resolved failure, never thrown', async () => {
    reply = problem(404, 'ERP-CORE-0004');
    const hook = mount(() => useFinishTodo('9'));
    let outcome: Awaited<ReturnType<ReturnType<typeof hook.current>['trigger']>> | undefined;
    await act(async () => {
      outcome = await hook.current().trigger({ finished: true });
    });
    expect(outcome?.ok).toBe(false);
    if (outcome?.ok === false) expect(outcome.code).toBe('ERP-CORE-0004');
  });
});

describe('useDeleteTodo', () => {
  it('DELETEs the record and treats a 204 as success', async () => {
    reply = { status: 204 };
    const hook = mount(() => useDeleteTodo('7'));
    let outcome: Awaited<ReturnType<ReturnType<typeof hook.current>['trigger']>> | undefined;
    await act(async () => {
      outcome = await hook.current().trigger(undefined);
    });
    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.url.pathname).toBe('/api/v1/todo/7');
    expect(outcome?.ok).toBe(true);
  });

  it('a 404 is a resolved failure the dialog shows; a 503 is not retried', async () => {
    reply = problem(404, 'ERP-CORE-0004');
    const hook = mount(() => useDeleteTodo('7'));
    let outcome: Awaited<ReturnType<ReturnType<typeof hook.current>['trigger']>> | undefined;
    await act(async () => {
      outcome = await hook.current().trigger(undefined);
    });
    expect(outcome?.ok).toBe(false);

    reply = problem(503, 'ERP-UPSTREAM-0001');
    requests = [];
    await act(async () => {
      outcome = await hook.current().trigger(undefined);
    });
    expect(outcome?.ok).toBe(false);
    expect(requests).toHaveLength(1);
  });
});
