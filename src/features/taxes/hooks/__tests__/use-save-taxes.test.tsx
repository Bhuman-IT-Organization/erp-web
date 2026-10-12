// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveTaxes } from '../use-save-taxes';

const USAGE = {
  items: 0,
  expenses: 0,
  subscriptions: 0,
  vendorItems: 0,
  purchaseLines: 0,
  warehouseLines: 0,
  fixedEquipmentLines: 0,
  salesReturnLines: 0,
  accounting: 0,
};
const ITEM = { id: 'a1', name: 'Beta', rate: '7.50', usage: USAGE, isDefault: false };

function Probe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveTaxes(id);
  const mutation = id === null ? create : update;
  const { result } = mutation;
  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger({ name: 'Beta', rate: '7.5' })}>
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

describe('useSaveTaxes', () => {
  it('create POSTs the body to the resource path and answers the saved record', async () => {
    const writes = fakeAdapter(201, ITEM);
    http.defaults.adapter = writes.adapter;
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Beta')).toBeTruthy();
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['POST', '/api/v1/taxes', { name: 'Beta', rate: '7.5' }],
    ]);
  });

  it('update PATCHes the record path and asks for nothing else: no list is invalidated (D-36)', async () => {
    const writes = fakeAdapter(200, ITEM);
    http.defaults.adapter = writes.adapter;
    show('a1');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Beta')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['PATCH', '/api/v1/taxes/a1', { name: 'Beta', rate: '7.5' }],
    ]);
  });

  it('is NEVER retried: a 503 answers once and the result says it failed (ADR-0031 §5)', async () => {
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
