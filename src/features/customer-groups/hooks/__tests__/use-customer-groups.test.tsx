// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useCustomerGroups, useDeleteCustomerGroup } from '../use-customer-groups';

const ITEM = { id: 'a 1', name: 'Retail' };
function Probe({ id }: { readonly id: string | null }) {
  const { data, error } = useCustomerGroups(id);
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

describe('useCustomerGroups', () => {
  it('GETs and parses an encoded record path', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show('a 1');
    expect(await screen.findByText('Retail')).toBeTruthy();
    expect(reads.calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/v1/customer-groups/a%201'],
    ]);
  });
  it('does not request on the create screen and exposes read failures', async () => {
    const reads = fakeAdapter(404, problem(404, 'ERP-CORE-0004'));
    http.defaults.adapter = reads.adapter;
    const empty = show(null);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(reads.calls).toEqual([]);
    empty.unmount();
    show('gone');
    await waitFor(() => {
      expect(screen.getByTestId('item').getAttribute('data-code')).toBe('ERP-CORE-0004');
    });
  });
});

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteCustomerGroup(id);
  return (
    <>
      <button type="button" onClick={() => void trigger(undefined)}>
        delete
      </button>
      <output
        data-testid="delete"
        data-ok={result === undefined ? '' : String(result.ok)}
        data-code={result?.ok === false ? result.code : ''}
      />
    </>
  );
}
describe('useDeleteCustomerGroup', () => {
  it('DELETEs once and treats 204 as success', async () => {
    const writes = fakeAdapter(204);
    http.defaults.adapter = writes.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <DeleteProbe id="7" />
      </SWRConfig>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['DELETE', '/api/v1/customer-groups/7', undefined],
    ]);
  });
  it('returns the in-use 409 as a resolved failure without retrying', async () => {
    const writes = fakeAdapter(409, problem(409, 'ERP-CUSTOMERGROUPS-0001'));
    http.defaults.adapter = writes.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <DeleteProbe id="7" />
      </SWRConfig>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-code')).toBe(
        'ERP-CUSTOMERGROUPS-0001',
      );
    });
    expect(writes.calls).toHaveLength(1);
  });
});
