// @vitest-environment happy-dom

import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';

import { useDeleteLeadStatus, useLeadStatuses } from '../use-lead-statuses';

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

function ReadProbe({ id }: { readonly id: string | null }) {
  const { data, error } = useLeadStatuses(id);

  return (
    <output data-testid="item" data-code={error?.code ?? ''}>
      {data?.name ?? ''}
    </output>
  );
}

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteLeadStatus(id);

  return (
    <div>
      <button type="button" onClick={() => void trigger(undefined)}>
        delete
      </button>
      <output
        data-testid="result"
        data-ok={result === undefined ? '' : String(result.ok)}
        data-code={result?.ok === false ? result.code : ''}
      />
    </div>
  );
}

function show(ui: ReactElement) {
  return renderWithProviders(
    <SWRConfig
      value={{
        provider: () => new Map(),
        shouldRetryOnError: false,
      }}
    >
      {ui}
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

describe('useLeadStatuses', () => {
  it('fetches a lead status by ID', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;

    show(<ReadProbe id="7" />);

    expect(await screen.findByText('Interested')).toBeTruthy();

    expect(reads.calls.map((r) => [r.method, r.url])).toEqual([['GET', '/api/v1/lead-statuses/7']]);
  });

  it('does not fetch when ID is null', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;

    show(<ReadProbe id={null} />);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reads.calls).toEqual([]);
  });

  it('handles a status not found error', async () => {
    http.defaults.adapter = fakeAdapter(404, problem(404, 'ERP-CORE-0004')).adapter;

    show(<ReadProbe id="7" />);

    await waitFor(() => {
      expect(screen.getByTestId('item').getAttribute('data-code')).toBe('ERP-CORE-0004');
    });
  });
});

describe('useDeleteLeadStatus', () => {
  it('deletes a lead status successfully', async () => {
    const writes = fakeAdapter(204);
    http.defaults.adapter = writes.adapter;

    show(<DeleteProbe id="7" />);

    await userEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => {
      expect(screen.getByTestId('result').getAttribute('data-ok')).toBe('true');
    });

    expect(writes.calls.map((r) => [r.method, r.url])).toEqual([
      ['DELETE', '/api/v1/lead-statuses/7'],
    ]);
  });

  it('refuses deletion of a protected status', async () => {
    const writes = fakeAdapter(409, problem(409, 'ERP-LEADSTATUSES-0001'));
    http.defaults.adapter = writes.adapter;

    show(<DeleteProbe id="7" />);

    await userEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => {
      expect(screen.getByTestId('result').getAttribute('data-code')).toBe('ERP-LEADSTATUSES-0001');
    });

    expect(writes.calls).toHaveLength(1);
  });

  it('does not automatically retry failed deletion', async () => {
    const writes = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = writes.adapter;

    show(<DeleteProbe id="7" />);

    await userEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => {
      expect(screen.getByTestId('result').getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });

    expect(writes.calls).toHaveLength(1);
  });
});
