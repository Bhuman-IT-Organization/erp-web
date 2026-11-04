// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import {
  useDeleteFixedEquipmentDepreciation,
  useFixedEquipmentDepreciations,
} from '../use-fixed-equipment-depreciations';

const ITEM = { id: 'a 1', name: 'Straight line', term: 60 };
const NO_CONTENT = 204;
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;

function Probe({ id }: { readonly id: string | null }) {
  const { data, error } = useFixedEquipmentDepreciations(id);
  return (
    <output data-testid="item" data-code={error?.code ?? ''} data-term={String(data?.term ?? '')}>
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

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteFixedEquipmentDepreciation(id);
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

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useFixedEquipmentDepreciations', () => {
  it('reads GET /api/v1/fixed-equipment-depreciations/:id, the id encoded, and parses the record', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show('a 1');
    expect(await screen.findByText('Straight line')).toBeTruthy();
    expect(screen.getByTestId('item').getAttribute('data-term')).toBe('60');
    expect(reads.calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/v1/fixed-equipment-depreciations/a%201'],
    ]);
  });

  it('a null id (the create screen) asks nothing', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show(null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.calls).toEqual([]);
  });

  it('a 404 ERP-CORE-0004 is the error, never data', async () => {
    http.defaults.adapter = fakeAdapter(NOT_FOUND, problem(NOT_FOUND, 'ERP-CORE-0004')).adapter;
    show('a 1');
    const out = await screen.findByTestId('item');
    await screen.findByText('', { selector: '[data-code="ERP-CORE-0004"]' });
    expect(out.textContent).toBe('');
  });
});

describe('useDeleteFixedEquipmentDepreciation', () => {
  it('DELETEs /api/v1/fixed-equipment-depreciations/:id with no body and a 204 is success', async () => {
    const writes = fakeAdapter(NO_CONTENT);
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['DELETE', '/api/v1/fixed-equipment-depreciations/7', undefined],
    ]);
  });

  it('a 404 ERP-CORE-0004 is a resolved failure carrying the code, sent once', async () => {
    const writes = fakeAdapter(NOT_FOUND, problem(NOT_FOUND, 'ERP-CORE-0004'));
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(outcome().getAttribute('data-code')).toBe('ERP-CORE-0004');
    });
    expect(outcome().getAttribute('data-ok')).toBe('false');
    expect(writes.calls).toHaveLength(1);
  });

  it('is NEVER retried: a 503 answers once (ADR-0031 §5)', async () => {
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
