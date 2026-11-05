// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TodoStatus } from '@/features/todo/api/todo.endpoints';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { useTodo, useTodosPage } from '../use-todo';

const TODO = {
  id: '7',
  description: 'Call Ali',
  finished: false,
  dateAdded: '2026-10-02T20:30:15.000Z',
  dateFinished: null,
};
const PAGE = { data: [TODO], meta: { nextCursor: 'c1', total: 21 } };

interface Reply {
  readonly status: number;
  readonly body?: unknown;
}
let reply: Reply;
let requests: { readonly method: string; readonly url: URL }[] = [];

function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  requests.push({ method: (config.method ?? 'get').toUpperCase(), url });
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

function show(ui: React.ReactElement) {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>,
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  reply = { status: 200, body: PAGE };
  http.defaults.adapter = respond;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

function PageProbe({ status, cursor }: { status: TodoStatus; cursor: string | null }) {
  const result = useTodosPage(status, cursor);
  if (result.data !== undefined) return <div data-testid="out">{JSON.stringify(result.data)}</div>;
  if (result.error !== undefined) {
    return <div data-testid="error">{String(result.error.retryable)}</div>;
  }
  return <div data-testid="loading" />;
}

function OneProbe({ id }: { id: string | null }) {
  const result = useTodo(id);
  if (result.data !== undefined) return <div data-testid="out">{JSON.stringify(result.data)}</div>;
  if (result.error !== undefined) {
    return <div data-testid="error">{String(result.error.retryable)}</div>;
  }
  return <div data-testid="loading" />;
}

describe('useTodosPage', () => {
  it('reads one page of one panel and parses it', async () => {
    show(<PageProbe status="unfinished" cursor={null} />);
    const out = await screen.findByTestId('out');
    expect(JSON.parse(out.textContent)).toEqual(PAGE);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe('/api/v1/todo');
    expect(requests[0]?.url.searchParams.get('status')).toBe('unfinished');
    expect(requests[0]?.url.searchParams.get('limit')).toBe('20');
  });

  it('asks for the next page with the cursor of the previous one', async () => {
    show(<PageProbe status="finished" cursor="c1" />);
    await screen.findByTestId('out');
    expect(requests[0]?.url.searchParams.get('status')).toBe('finished');
    expect(requests[0]?.url.searchParams.get('cursor')).toBe('c1');
  });

  it('a 503 is a retryable error, never page data', async () => {
    reply = {
      status: 503,
      body: { type: 'about:blank', status: 503, title: 'x', code: 'ERP-UPSTREAM-0001' },
    };
    show(<PageProbe status="unfinished" cursor={null} />);
    expect((await screen.findByTestId('error')).textContent).toBe('true');
    expect(screen.queryByTestId('out')).toBeNull();
  });
});

describe('useTodo', () => {
  it('reads the to do by id and parses the record', async () => {
    reply = { status: 200, body: TODO };
    show(<OneProbe id="7" />);
    const out = await screen.findByTestId('out');
    expect(JSON.parse(out.textContent)).toEqual(TODO);
    expect(requests[0]?.url.pathname).toBe('/api/v1/todo/7');
  });

  it('a null id (the create screen) makes no request', async () => {
    show(<OneProbe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(requests).toHaveLength(0);
    expect(screen.queryByTestId('out')).toBeNull();
  });

  it("a 404 (not the caller's, or gone) is a non-retryable error, not data", async () => {
    reply = {
      status: 404,
      body: { type: 'about:blank', status: 404, title: 'x', code: 'ERP-CORE-0004' },
    };
    show(<OneProbe id="9" />);
    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('false');
    });
    expect(screen.queryByTestId('out')).toBeNull();
  });
});
