// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedEquipmentDepreciationsHooks } from '@/features/fixed-equipment-depreciations/api/fixed-equipment-depreciations.endpoints';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveFixedEquipmentDepreciations } from '../use-save-fixed-equipment-depreciations';

const LIST = '/api/v1/fixed-equipment-depreciations';
const ITEM = { id: 'a1', name: 'Declining', term: 24 };
const BODY = { name: 'Declining', term: 24 };
const SETTLE_MS = 100;

interface Reply {
  readonly status: number;
  readonly body?: unknown;
}
let save: Reply;
let requests: { readonly method: string; readonly path: string; readonly body: unknown }[] = [];

const problem = (status: number, code: string, issues?: unknown) => ({
  type: 'about:blank',
  status,
  title: code,
  code,
  ...(issues === undefined ? {} : { issues }),
});

/** GET answers one list page; a POST or PATCH answers `save`. Every request is recorded. */
function respond(config: InternalAxiosRequestConfig) {
  const url = new URL(http.getUri(config), 'http://erp.invalid');
  const method = (config.method ?? 'get').toUpperCase();
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  requests.push({ method, path: url.pathname, body });
  const reply: Reply =
    method === 'GET' ? { status: 200, body: { data: [ITEM], meta: { nextCursor: null } } } : save;
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

const listReads = () => requests.filter((r) => r.method === 'GET' && r.path === LIST);
const writes = () => requests.filter((r) => r.method !== 'GET');

/** A list page mounted beside the save, as the list screen reads it. */
function ListProbe() {
  const { data } = fixedEquipmentDepreciationsHooks.useList({ q: 'save-hook', limit: 25 });
  return <output data-testid="list">{data?.data.map((row) => row.name).join(',')}</output>;
}

function Probe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveFixedEquipmentDepreciations(id);
  const mutation = id === null ? create : update;
  const { result } = mutation;
  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger(BODY)}>
        save
      </button>
      <output
        data-testid="save"
        data-code={result?.ok === false ? result.code : ''}
        data-issues={result?.ok === false ? JSON.stringify(result.issues ?? null) : ''}
      >
        {result?.ok === true ? result.data.name : ''}
      </output>
    </div>
  );
}

const show = (id: string | null, withList = false) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {withList ? <ListProbe /> : null}
      <Probe id={id} />
    </SWRConfig>,
  );

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  requests = [];
  save = { status: 200, body: ITEM };
  http.defaults.adapter = respond;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useSaveFixedEquipmentDepreciations', () => {
  it('create POSTs the list path with { name, term }, the months as a number', async () => {
    save = { status: 201, body: ITEM };
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Declining')).toBeTruthy();
    expect(writes()).toEqual([{ method: 'POST', path: LIST, body: BODY }]);
  });

  it('update PATCHes the record path, and a mounted list is NOT read again: the hook invalidates nothing', async () => {
    show('a1', true);
    await screen.findByText('Declining', { selector: '[data-testid="list"]' });
    const before = listReads().length;
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await screen.findByText('Declining', { selector: '[data-testid="save"]' });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(writes()).toEqual([{ method: 'PATCH', path: `${LIST}/a1`, body: BODY }]);
    expect(listReads()).toHaveLength(before);
  });

  it('update answered 404 ERP-CORE-0004 is a resolved failure carrying the code, sent once', async () => {
    save = { status: 404, body: problem(404, 'ERP-CORE-0004') };
    show('a1');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-code')).toBe('ERP-CORE-0004');
    });
    expect(writes()).toHaveLength(1);
  });

  it('a 400 ERP-VALIDATION-0001 carries its issues to the caller, sent once', async () => {
    const issues = [{ path: ['term'], message: 'raw server text' }];
    save = { status: 400, body: problem(400, 'ERP-VALIDATION-0001', issues) };
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-code')).toBe('ERP-VALIDATION-0001');
    });
    expect(JSON.parse(screen.getByTestId('save').getAttribute('data-issues') ?? 'null')).toEqual(
      issues,
    );
    expect(writes()).toHaveLength(1);
  });

  it('is NEVER retried: a 503 answers once and the result says it failed (ADR-0031 §5)', async () => {
    save = { status: 503, body: problem(503, 'ERP-UPSTREAM-0001') };
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });
    expect(writes()).toHaveLength(1);
  });
});
