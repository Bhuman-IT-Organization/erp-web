// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen } from '@/test/render';
import { useContractTypes } from '../use-contract-types';

const NO_USE = {
  contracts: 0,
  goals: 0,
};
const ITEM = { id: 'a 1', name: 'Alpha', usage: NO_USE };

function Probe({ id }: { readonly id: string | null }) {
  const { data, error } = useContractTypes(id);
  return (
    <output data-testid="item" data-code={error?.code ?? ''}>
      {data?.name ?? ''}
    </output>
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

describe('useContractTypes', () => {
  it('reads GET /api/v1/contract-types/:id, the id encoded, and parses the record', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show('a 1');
    expect(await screen.findByText('Alpha')).toBeTruthy();
    expect(reads.calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/v1/contract-types/a%201'],
    ]);
  });

  it('a null id (the create screen) asks nothing', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show(null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.calls).toEqual([]);
  });

  it('a 404 is the error, never data', async () => {
    http.defaults.adapter = fakeAdapter(404, problem(404, 'ERP-HTTP-404')).adapter;
    show('a 1');
    const out = await screen.findByTestId('item');
    await screen.findByText('', { selector: '[data-code="ERP-HTTP-404"]' });
    expect(out.textContent).toBe('');
  });
});
