// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import type { InternalAxiosRequestConfig } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useCurrencies, useDeleteCurrency, useMakeBaseCurrency } from '../use-currencies';

const USAGE = {
  invoices: 0,
  expenses: 0,
  proposals: 0,
  estimates: 0,
  customers: 0,
  creditNotes: 0,
  subscriptions: 0,
  purchaseOrders: 0,
  purchaseRequests: 0,
  purchaseQuotations: 0,
  purchaseInvoices: 0,
  debitNotes: 0,
  fafRequests: 0,
  vendors: 0,
  goodsReceipts: 0,
  goodsDeliveries: 0,
  packingLists: 0,
  orderReturns: 0,
  fixedEquipmentCarts: 0,
  payslipsFrom: 0,
  payslipsTo: 0,
  purchaseConvertedFrom: 0,
  purchaseConvertedTo: 0,
  fixedEquipmentLocations: 0,
};
const ITEM = {
  id: 'a 1',
  name: 'EUR',
  symbol: '€',
  decimalSeparator: ',',
  thousandSeparator: '.',
  placement: 'after',
  isBase: false,
  usage: USAGE,
  lockUsage: { exchangeRates: 0, exchangeRateLogs: 0, payslipCodes: 0 },
  registeredUsage: {},
  canMakeBase: true,
};

function Probe({ id }: { readonly id: string | null }) {
  const { data, error } = useCurrencies(id);
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

describe('useCurrencies', () => {
  it('reads GET /api/v1/currencies/:id, the id encoded, and parses the record', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show('a 1');
    expect(await screen.findByText('EUR')).toBeTruthy();
    expect(reads.calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/v1/currencies/a%201'],
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

const NO_CONTENT = 204;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteCurrency(id);
  return (
    <div>
      <button type="button" onClick={() => void trigger(undefined)}>
        delete
      </button>
      <output
        data-testid="delete"
        data-ok={result === undefined ? '' : String(result.ok)}
        data-code={result?.ok === false ? result.code : ''}
      />
    </div>
  );
}

const showDelete = (id: string) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <DeleteProbe id={id} />
    </SWRConfig>,
  );

const outcome = () => screen.getByTestId('delete');

describe('useDeleteCurrency (the resource useRemove)', () => {
  it('DELETEs /api/v1/currencies/:id with no body, the id encoded, and a 204 is success', async () => {
    const writes = fakeAdapter(NO_CONTENT);
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['DELETE', '/api/v1/currencies/7', undefined],
    ]);
  });

  it('a 409 ERP-CURRENCIES-0002 (the base) is a resolved failure, sent once', async () => {
    const writes = fakeAdapter(CONFLICT, problem(CONFLICT, 'ERP-CURRENCIES-0002'));
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-code')).toBe('ERP-CURRENCIES-0002');
    });
    expect(outcome().getAttribute('data-ok')).toBe('false');
    expect(writes.calls).toHaveLength(1);
  });

  it('is NEVER retried: a 503 answers once and the result says it failed (ADR-0031 §5)', async () => {
    const writes = fakeAdapter(
      SERVICE_UNAVAILABLE,
      problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    );
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes.calls).toHaveLength(1);
  });
});

function MakeBaseProbe({ id }: { readonly id: string }) {
  const makeBase = useMakeBaseCurrency(id);
  // A currencies read already in the cache: a success revalidates every key under the path.
  const list = useCurrencies('8');
  return (
    <div>
      <button type="button" onClick={() => void makeBase.trigger({})}>
        make base
      </button>
      <output
        data-testid="base"
        data-ok={makeBase.result === undefined ? '' : String(makeBase.result.ok)}
        data-code={makeBase.result?.ok === false ? makeBase.result.code : ''}
        data-list={list.data?.name ?? ''}
      >
        {makeBase.result?.ok === true ? String(makeBase.result.data.isBase) : ''}
      </output>
    </div>
  );
}

const showMakeBase = (id: string) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MakeBaseProbe id={id} />
    </SWRConfig>,
  );

/** One adapter for the probe: GET answers the record, PATCH answers `patch`. */
function routed(patchStatus: number, patchBody: unknown) {
  const reads = fakeAdapter(200, ITEM);
  const writes = fakeAdapter(patchStatus, patchBody);
  const calls: { method: string; url: string; data: unknown }[] = [];
  http.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    const method = (config.method ?? 'get').toUpperCase();
    calls.push({ method, url: config.url ?? '', data: config.data });
    return method === 'GET' ? reads.adapter(config) : writes.adapter(config);
  };
  return { calls, writes };
}

describe('useMakeBaseCurrency', () => {
  it('PATCHes {} to /api/v1/currencies/:id/base, the id encoded, parses { id, isBase: true } and revalidates the cached currencies pages', async () => {
    const net = routed(200, { id: '7', isBase: true });
    showMakeBase('7');
    await waitFor(() => {
      expect(screen.getByTestId('base').getAttribute('data-list')).toBe('EUR');
    });
    const readsBefore = net.calls.filter((c) => c.method === 'GET').length;
    await userEvent.click(screen.getByRole('button', { name: 'make base' }));
    expect(await screen.findByText('true')).toBeTruthy();
    expect(net.writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['PATCH', '/api/v1/currencies/7/base', {}],
    ]);
    await waitFor(() => {
      expect(net.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(readsBefore);
    });
  });

  it('a 409 ERP-CURRENCIES-0004 is a resolved failure, sent once, and asks no list again', async () => {
    const net = routed(CONFLICT, problem(CONFLICT, 'ERP-CURRENCIES-0004'));
    showMakeBase('7');
    await waitFor(() => {
      expect(screen.getByTestId('base').getAttribute('data-list')).toBe('EUR');
    });
    const readsBefore = net.calls.filter((c) => c.method === 'GET').length;
    await userEvent.click(screen.getByRole('button', { name: 'make base' }));
    await waitFor(() => {
      expect(screen.getByTestId('base').getAttribute('data-code')).toBe('ERP-CURRENCIES-0004');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(net.writes.calls).toHaveLength(1);
    expect(net.calls.filter((c) => c.method === 'GET')).toHaveLength(readsBefore);
  });

  it('is NEVER retried: a 503 answers once and the result says it failed (ADR-0031 §5)', async () => {
    const net = routed(SERVICE_UNAVAILABLE, problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'));
    showMakeBase('7');
    await userEvent.click(screen.getByRole('button', { name: 'make base' }));
    await waitFor(() => {
      expect(screen.getByTestId('base').getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(net.writes.calls).toHaveLength(1);
  });
});
