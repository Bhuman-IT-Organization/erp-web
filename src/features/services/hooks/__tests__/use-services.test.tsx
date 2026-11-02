// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useDeleteService, useServices } from '../use-services';

const NO_CONTENT = 204;
const CONFLICT = 409;
const SERVICE_UNAVAILABLE = 503;

const ITEM = {
  id: '7',
  name: 'Technical Support',
};

function Probe({ id }: { readonly id: string | null }) {
  const { data, error } = useServices(id);

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

describe('useServices', () => {
  it('reads the service by ID and parses the record', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;

    show('7');

    expect(await screen.findByText('Technical Support')).toBeTruthy();

    expect(reads.calls.map((call) => [call.method, call.url])).toEqual([
      ['GET', '/api/v1/services/7'],
    ]);
  });

  it('a null ID does not make an API request', async () => {
    const reads = fakeAdapter(200, ITEM);
    http.defaults.adapter = reads.adapter;

    show(null);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reads.calls).toEqual([]);
  });

  it('a 404 response is an error, not service data', async () => {
    http.defaults.adapter = fakeAdapter(404, problem(404, 'ERP-HTTP-404')).adapter;

    show('7');

    const output = await screen.findByTestId('item');

    await waitFor(() => {
      expect(output.getAttribute('data-code')).toBe('ERP-HTTP-404');
    });

    expect(output.textContent).toBe('');
  });
});

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteService(id);

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

describe('useDeleteService', () => {
  it('deletes a service and treats HTTP 204 as success', async () => {
    const writes = fakeAdapter(NO_CONTENT);
    http.defaults.adapter = writes.adapter;

    showDelete('7');

    await userEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => {
      expect(outcome().getAttribute('data-ok')).toBe('true');
    });

    expect(writes.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['DELETE', '/api/v1/services/7', undefined],
    ]);
  });

  it('a 409 response is a resolved failure and is sent once', async () => {
    const writes = fakeAdapter(CONFLICT, problem(CONFLICT, 'ERP-SERVICES-0001'));
    http.defaults.adapter = writes.adapter;

    showDelete('7');

    await userEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => {
      expect(outcome().getAttribute('data-code')).toBe('ERP-SERVICES-0001');
    });

    expect(outcome().getAttribute('data-ok')).toBe('false');
    expect(writes.calls).toHaveLength(1);
  });

  it('does not retry a 503 response', async () => {
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
