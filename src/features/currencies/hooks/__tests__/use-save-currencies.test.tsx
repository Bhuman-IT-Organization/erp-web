// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import type { CurrenciesFormValues } from '../../schemas/currencies.schema';
import { useSaveCurrencies } from '../use-save-currencies';

/** The five fields the form sends on every save (an update rewrites all five, as Perfex's does). */
const BODY: CurrenciesFormValues = {
  name: 'CHF',
  symbol: 'Fr.',
  decimalSeparator: '.',
  thousandSeparator: "'",
  placement: 'before',
};
const ITEM = {
  id: 'a1',
  ...BODY,
  isBase: false,
  usage: {
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
  },
  lockUsage: { exchangeRates: 0, exchangeRateLogs: 0, payslipCodes: 0 },
  registeredUsage: {},
  canMakeBase: true,
};

function Probe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveCurrencies(id);
  const mutation = id === null ? create : update;
  const { result } = mutation;
  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger(BODY)}>
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

describe('useSaveCurrencies', () => {
  it('create POSTs the five fields to the resource path and answers the saved record', async () => {
    const writes = fakeAdapter(201, ITEM);
    http.defaults.adapter = writes.adapter;
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('CHF')).toBeTruthy();
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['POST', '/api/v1/currencies', BODY],
    ]);
  });

  it('update PATCHes the five fields to the record path and asks for nothing else: no list is invalidated (D-36)', async () => {
    const writes = fakeAdapter(200, ITEM);
    http.defaults.adapter = writes.adapter;
    show('a1');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('CHF')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['PATCH', '/api/v1/currencies/a1', BODY],
    ]);
  });

  it('a 409 ERP-CURRENCIES-0005 (the code locked) is a resolved failure, sent once', async () => {
    const writes = fakeAdapter(409, problem(409, 'ERP-CURRENCIES-0005'));
    http.defaults.adapter = writes.adapter;
    show('a1');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-code')).toBe('ERP-CURRENCIES-0005');
    });
    expect(writes.calls).toHaveLength(1);
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
