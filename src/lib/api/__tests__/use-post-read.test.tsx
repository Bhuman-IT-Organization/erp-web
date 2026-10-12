// @vitest-environment happy-dom
import type { AxiosAdapter } from 'axios';
import { useState } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import { CLIENT_TIMINGS } from '../client-timings';
import { http } from '../http';
import { usePostRead } from '../use-post-read';

/**
 * The POST read door (04.3 PATTERNS M7): the hook idiom of `use-common-api.test.tsx` (a fake adapter
 * on the shared instance, one SWR cache per render, `Math.random` pinned so a retry lands at once).
 */
const preview = z.object({ subject: z.string() });
interface Draft {
  readonly locale: string;
  readonly message: string;
}

function Probe({ body }: { readonly body: Draft | null }) {
  const { data, error, isLoading } = usePostRead('/api/v1/things/1/preview', preview, body);
  return (
    <output
      data-testid="probe"
      data-loading={String(isLoading)}
      data-status={error?.status ?? ''}
      data-code={error?.code ?? ''}
    >
      {data?.subject ?? ''}
    </output>
  );
}

/** A probe whose body changes on click: same content (a new object) or new content. */
function Switching() {
  const [body, setBody] = useState<Draft>({ locale: 'en', message: 'one' });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBody({ locale: 'en', message: body.message });
        }}
      >
        same
      </button>
      <button
        type="button"
        onClick={() => {
          setBody({ locale: 'en', message: 'two' });
        }}
      >
        other
      </button>
      <Probe body={body} />
    </>
  );
}

function isolated(ui: React.ReactElement) {
  return renderWithProviders(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);
}

const RETRY_RANDOM = 0.005;

let fake: FakeAdapter | undefined;
const useNetwork = (adapter: FakeAdapter) => {
  fake = adapter;
  http.defaults.adapter = adapter.adapter;
};

describe('usePostRead (the one POST read, M7)', () => {
  beforeEach(() => {
    resetApiStatus();
    vi.spyOn(Math, 'random').mockReturnValue(RETRY_RANDOM);
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
    vi.restoreAllMocks();
  });

  it('POSTs the body once to the path and returns the schema-parsed data', async () => {
    useNetwork(fakeAdapter(200, { subject: 'Hello' }));
    isolated(<Probe body={{ locale: 'en', message: 'Hi' }} />);
    expect(screen.getByTestId('probe').dataset.loading).toBe('true');
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('Hello');
    });
    expect(screen.getByTestId('probe').dataset.loading).toBe('false');
    expect(fake?.calls).toHaveLength(1);
    expect(fake?.calls[0]?.method).toBe('POST');
    expect(fake?.calls[0]?.url).toBe('/api/v1/things/1/preview');
    expect(fake?.calls[0]?.data).toEqual({ locale: 'en', message: 'Hi' });
  });

  it('a null body asks nothing and is not loading', async () => {
    useNetwork(fakeAdapter(200, { subject: 'Hello' }));
    isolated(<Probe body={null} />);
    expect(screen.getByTestId('probe').dataset.loading).toBe('false');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake?.spy).not.toHaveBeenCalled();
  });

  it('a new body object with the same content asks nothing again (the key is the serialised body)', async () => {
    useNetwork(fakeAdapter(200, { subject: 'Hello' }));
    isolated(<Switching />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('Hello');
    });
    await userEvent.click(screen.getByRole('button', { name: 'same' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake?.spy).toHaveBeenCalledTimes(1);
  });

  it('a different body asks again and keeps the previous data while it loads', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const first = fakeAdapter(200, { subject: 'First' });
    const second = fakeAdapter(200, { subject: 'Second' });
    const adapter: AxiosAdapter = (config) => {
      calls += 1;
      if (calls === 1) return first.adapter(config);
      return new Promise((resolve) => {
        release = () => {
          resolve(second.adapter(config));
        };
      });
    };
    http.defaults.adapter = adapter;
    isolated(<Switching />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('First');
    });
    await userEvent.click(screen.getByRole('button', { name: 'other' }));
    await waitFor(() => {
      expect(calls).toBe(2);
    });
    // The old answer stays on screen while the new one is on its way (keepPreviousData).
    expect(screen.getByTestId('probe').textContent).toBe('First');
    release?.();
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('Second');
    });
    expect(second.calls[0]?.data).toEqual({ locale: 'en', message: 'two' });
  });

  it('a 4xx is an error with its code and is never retried', async () => {
    useNetwork(fakeAdapter(400, problem(400, 'ERP-VALIDATION-0001')));
    isolated(<Probe body={{ locale: 'en', message: 'Hi' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.status).toBe('400');
    });
    expect(screen.getByTestId('probe').dataset.code).toBe('ERP-VALIDATION-0001');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake?.spy).toHaveBeenCalledTimes(1);
  });

  it('a 5xx is retried by the SWR policy and isLoading stays false once the error is known (D-39)', async () => {
    useNetwork(fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001')));
    isolated(<Probe body={{ locale: 'en', message: 'Hi' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('probe').dataset.status).toBe('503');
    });
    expect(screen.getByTestId('probe').dataset.loading).toBe('false');
    await waitFor(
      () => {
        expect(fake?.spy.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: CLIENT_TIMINGS.swr.errorRetryMaxMs },
    );
    expect(screen.getByTestId('probe').dataset.loading).toBe('false');
  });
});
