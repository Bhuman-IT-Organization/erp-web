// @vitest-environment happy-dom
import { cleanup, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { useSaveEstimateRequestStatuses } from '../use-save-estimate-request-statuses';

const ITEM = {
  id: '7',
  name: 'Approved',
  color: '#008000',
  statusorder: 2,
  flag: null,
  total_request: 0,
};
const VALUES = { name: 'Approved', color: '#008000', statusorder: 2 };

function Probe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveEstimateRequestStatuses(id);
  const mutation = id === null ? create : update;
  const { result } = mutation;
  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger(VALUES)}>
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
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
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

describe('useSaveEstimateRequestStatuses', () => {
  it('creates with POST and returns the saved resource', async () => {
    const writes = fakeAdapter(201, ITEM);
    http.defaults.adapter = writes.adapter;
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Approved')).toBeTruthy();
    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['POST', '/api/v1/estimate-request-statuses', VALUES],
    ]);
  });

  it('updates with PATCH and does not invalidate list pages', async () => {
    const writes = fakeAdapter(200, ITEM);
    http.defaults.adapter = writes.adapter;
    show('7');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Approved')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['PATCH', '/api/v1/estimate-request-statuses/7', VALUES],
    ]);
  });

  it('does not retry a failed write', async () => {
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
