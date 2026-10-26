// @vitest-environment happy-dom

import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';

import { useSaveLeadStatuses } from '../use-save-lead-statuses';

const ITEM = {
  id: '7',
  name: 'Interested',
  color: '#28B8DA',
  statusorder: 1,
  isdefault: 0,
  isConfiguredDefault: false,
  usage: {
    leads: 0,
    emailIntegration: 0,
  },
};

const FORM = {
  name: 'Interested',
  color: '#28B8DA',
  statusorder: 1,
};

function Probe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveLeadStatuses(id);
  const mutation = id === null ? create : update;
  const { result } = mutation;

  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger(FORM)}>
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

function show(id: string | null) {
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Probe id={id} />
    </SWRConfig>,
  );
}

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useSaveLeadStatuses', () => {
  it('creates a lead status using POST', async () => {
    const writes = fakeAdapter(201, ITEM);
    http.defaults.adapter = writes.adapter;

    show(null);

    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(await screen.findByText('Interested')).toBeTruthy();

    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['POST', '/api/v1/lead-statuses', FORM],
    ]);
  });

  it('updates an existing lead status using PATCH', async () => {
    const writes = fakeAdapter(200, ITEM);
    http.defaults.adapter = writes.adapter;

    show('7');

    await userEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(await screen.findByText('Interested')).toBeTruthy();

    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['PATCH', '/api/v1/lead-statuses/7', FORM],
    ]);
  });

  it('does not retry a failed save automatically', async () => {
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
