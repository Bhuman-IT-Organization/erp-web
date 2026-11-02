// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveServices } from '../use-save-services';

const ITEM = {
  id: '7',
  name: 'Technical Support',
};

function Probe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveServices(id);
  const mutation = id === null ? create : update;
  const { result } = mutation;

  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger({ name: 'Technical Support' })}>
        save
      </button>

      <output
        data-testid="save"
        data-ok={result === undefined ? '' : String(result.ok)}
        data-code={result?.ok === false ? result.code : ''}
      >
        {result?.ok === true ? result.data.name : ''}
      </output>
    </div>
  );
}

const show = (id: string | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Probe id={id} />
    </SWRConfig>,
  );

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useSaveServices', () => {
  it('create POSTs the body to the services resource path and returns the saved record', async () => {
    const writes = fakeAdapter(201, ITEM);
    http.defaults.adapter = writes.adapter;

    show(null);

    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(await screen.findByText('Technical Support')).toBeTruthy();

    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['POST', '/api/v1/services', { name: 'Technical Support' }],
    ]);
  });

  it('update PATCHes the service path without invalidating the list', async () => {
    const writes = fakeAdapter(200, ITEM);
    http.defaults.adapter = writes.adapter;

    show('7');

    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(await screen.findByText('Technical Support')).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['PATCH', '/api/v1/services/7', { name: 'Technical Support' }],
    ]);
  });

  it('is never retried: a 503 returns a failure result and sends the request once', async () => {
    const writes = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = writes.adapter;

    show(null);

    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });

    expect(writes.calls).toHaveLength(1);
  });
});
