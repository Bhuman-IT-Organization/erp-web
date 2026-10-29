// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useDeleteLeadSource, useLeadSources } from '../use-lead-sources';

const ITEM = {
  id: 'a 1',
  name: 'Web site',
  usage: { leads: 2, emailIntegrations: 0, webToLeadForms: 0 },
};

function RecordProbe({ id }: { readonly id: string | null }) {
  const { data, error } = useLeadSources(id);
  return (
    <output data-testid="record" data-code={error?.code ?? ''}>
      {data?.name ?? ''}
    </output>
  );
}

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteLeadSource(id);
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

const show = (id: string | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <RecordProbe id={id} />
    </SWRConfig>,
  );

const showDelete = (id: string) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <DeleteProbe id={id} />
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

describe('useLeadSources', () => {
  it('reads the detail path with an encoded id and parses the record', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show('a 1');
    expect(await screen.findByText('Web site')).toBeTruthy();
    expect(reads.calls.map((call) => [call.method, call.url])).toEqual([
      ['GET', '/api/v1/lead-sources/a%201'],
    ]);
  });

  it('does not request a record when the id is null', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;
    show(null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.calls).toEqual([]);
  });

  it('exposes a failed detail read as an error, not data', async () => {
    http.defaults.adapter = fakeAdapter(404, problem(404, 'ERP-HTTP-404')).adapter;
    show('7');
    const output = await screen.findByTestId('record');
    await waitFor(() => {
      expect(output.getAttribute('data-code')).toBe('ERP-HTTP-404');
    });
    expect(output.textContent).toBe('');
  });
});

describe('useDeleteLeadSource', () => {
  it('sends DELETE without a body and treats 204 as success', async () => {
    const writes = fakeAdapter(204);
    http.defaults.adapter = writes.adapter;
    showDelete('a 1');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['DELETE', '/api/v1/lead-sources/a%201', undefined],
    ]);
  });

  it('returns the in-use conflict once without retrying', async () => {
    const writes = fakeAdapter(409, problem(409, 'ERP-LEADSOURCES-0001'));
    http.defaults.adapter = writes.adapter;
    showDelete('7');
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-code')).toBe('ERP-LEADSOURCES-0001');
    });
    expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('false');
    expect(writes.calls).toHaveLength(1);
  });
});
