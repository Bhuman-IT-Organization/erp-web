// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveEstimateRequestStatuses } from '../use-save-estimate-request-statuses';

const STATUS = {
  id: '7',
  name: 'Approved',
  color: '#008000',
  statusorder: 2,
  flag: null,
  total_request: 0,
};
const VALUES = { name: 'Approved', color: '#008000', statusorder: 2 };

function SaveProbe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveEstimateRequestStatuses(id);
  const mutation = id === null ? create : update;
  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger(VALUES)}>
        save
      </button>
      <output
        data-testid="save"
        data-ok={mutation.result === undefined ? '' : String(mutation.result.ok)}
      >
        {mutation.result?.ok === true ? mutation.result.data.name : ''}
      </output>
    </div>
  );
}

const show = (id: string | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <SaveProbe id={id} />
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
  it.each([
    [null, 'POST', '/api/v1/estimate-request-statuses'],
    ['7', 'PATCH', '/api/v1/estimate-request-statuses/7'],
  ] as const)('sends the correct write for ID %s', async (id, method, url) => {
    const writes = fakeAdapter(200, STATUS);
    http.defaults.adapter = writes.adapter;
    show(id);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-ok')).toBe('true');
    });
    expect(
      writes.calls.map(({ method: actualMethod, url: actualUrl, data }) => [
        actualMethod,
        actualUrl,
        data,
      ]),
    ).toEqual([[method, url, VALUES]]);
  });

  it('does not retry a failed write', async () => {
    const writes = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = writes.adapter;
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-ok')).toBe('false');
    });
    expect(writes.calls).toHaveLength(1);
  });
});
