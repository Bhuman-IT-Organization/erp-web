// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import {
  useDeleteEstimateRequestStatus,
  useEstimateRequestStatuses,
} from '../use-estimate-request-statuses';

const STATUS = {
  id: '7',
  name: 'Approved',
  color: '#008000',
  statusorder: 2,
  flag: null,
  total_request: 3,
};

function ReadProbe({ id }: { readonly id: string | null }) {
  const { data, error } = useEstimateRequestStatuses(id);
  return (
    <output data-testid="record" data-code={error?.code ?? ''}>
      {data?.name ?? ''}
    </output>
  );
}

function DeleteProbe() {
  const { trigger, result } = useDeleteEstimateRequestStatus('7');
  return (
    <div>
      <button type="button" onClick={() => void trigger(undefined)}>
        delete
      </button>
      <output data-testid="delete" data-ok={result === undefined ? '' : String(result.ok)} />
    </div>
  );
}

const show = (child: ReactNode) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{child}</SWRConfig>,
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

describe('useEstimateRequestStatuses', () => {
  it('reads the detail path with an encoded ID', async () => {
    const reads = fakeAdapter(200, STATUS);
    http.defaults.adapter = reads.adapter;
    show(<ReadProbe id="a 1" />);
    expect(await screen.findByText('Approved')).toBeTruthy();
    expect(reads.calls.map(({ method, url }) => [method, url])).toEqual([
      ['GET', '/api/v1/estimate-request-statuses/a%201'],
    ]);
  });

  it('skips the detail request when the ID is null', async () => {
    const reads = fakeAdapter(200, STATUS);
    http.defaults.adapter = reads.adapter;
    show(<ReadProbe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.calls).toEqual([]);
  });

  it('deletes the status with an empty body', async () => {
    const writes = fakeAdapter(204);
    http.defaults.adapter = writes.adapter;
    show(<DeleteProbe />);
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map(({ method, url, data }) => [method, url, data])).toEqual([
      ['DELETE', '/api/v1/estimate-request-statuses/7', undefined],
    ]);
  });

  it('surfaces a delete refusal as a failed result', async () => {
    const writes = fakeAdapter(409, problem(409, 'ERP-ESTIMATEREQUESTSTATUSES-0001'));
    http.defaults.adapter = writes.adapter;
    show(<DeleteProbe />);
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('false');
    });
    expect(writes.calls).toHaveLength(1);
  });
});
