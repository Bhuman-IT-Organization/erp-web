// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useDeletePaymentMode, usePaymentModeActive, usePaymentModes } from '../use-payment-modes';

const USAGE = {
  invoicePayments: 0,
  expenses: 0,
  creditNoteRefunds: 0,
  purchaseInvoicePayments: 0,
  purchaseOrderPayments: 0,
  debitNoteRefunds: 0,
  fixedEquipmentRefunds: 0,
  orderReturnRefunds: 0,
};
const ITEM = {
  id: 'a 1',
  name: 'Alpha',
  description: '',
  active: true,
  showOnPdf: false,
  selectedByDefault: false,
  invoicesOnly: false,
  expensesOnly: false,
  usage: USAGE,
  isCreditExpenseMode: false,
};

function Probe({ id }: { readonly id: string | null }) {
  const { data, error } = usePaymentModes(id);
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

describe('usePaymentModes', () => {
  it('reads GET /api/v1/payment-modes/:id, the id encoded, and parses the record', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show('a 1');
    expect(await screen.findByText('Alpha')).toBeTruthy();
    expect(reads.calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/v1/payment-modes/a%201'],
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
  const { trigger, result } = useDeletePaymentMode(id);
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

describe('useDeletePaymentMode', () => {
  it('DELETEs /api/v1/payment-modes/:id with no body, the id encoded, and a 204 is success', async () => {
    const writes = fakeAdapter(NO_CONTENT);
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['DELETE', '/api/v1/payment-modes/7', undefined],
    ]);
  });

  it('a 409 ERP-PAYMENTMODES-0001 (still in use) is a resolved failure, sent once', async () => {
    const writes = fakeAdapter(CONFLICT, problem(CONFLICT, 'ERP-PAYMENTMODES-0001'));
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-code')).toBe('ERP-PAYMENTMODES-0001');
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

function ActiveProbe({ id }: { readonly id: string }) {
  const active = usePaymentModeActive(id);
  return (
    <div>
      <button type="button" onClick={() => void active.trigger({ active: false })}>
        off
      </button>
      <output
        data-testid="active"
        data-ok={active.result === undefined ? '' : String(active.result.ok)}
        data-code={active.result?.ok === false ? active.result.code : ''}
      >
        {active.result?.ok === true ? String(active.result.data.active) : ''}
      </output>
    </div>
  );
}

const showActive = (id: string) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <ActiveProbe id={id} />
    </SWRConfig>,
  );

describe('usePaymentModeActive', () => {
  it('PATCHes { active } to /api/v1/payment-modes/:id/active, the id encoded, and parses { id, active }', async () => {
    const writes = fakeAdapter(200, { id: '7', active: false });
    http.defaults.adapter = writes.adapter;
    showActive('7');
    await userEvent.click(screen.getByRole('button', { name: 'off' }));
    expect(await screen.findByText('false')).toBeTruthy();
    // Nothing is invalidated: the list swaps the row in place, so no read follows the write.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['PATCH', '/api/v1/payment-modes/7/active', { active: false }],
    ]);
  });

  it('is NEVER retried: a 503 answers once and the result says it failed (ADR-0031 §5)', async () => {
    const writes = fakeAdapter(
      SERVICE_UNAVAILABLE,
      problem(SERVICE_UNAVAILABLE, 'ERP-UPSTREAM-0001'),
    );
    http.defaults.adapter = writes.adapter;
    showActive('7');
    await userEvent.click(screen.getByRole('button', { name: 'off' }));
    await waitFor(() => {
      expect(screen.getByTestId('active').getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes.calls).toHaveLength(1);
  });
});
