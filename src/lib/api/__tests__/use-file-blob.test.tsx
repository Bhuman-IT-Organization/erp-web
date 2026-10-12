// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import { http } from '../http';
import { useFileBlob } from '../use-file-blob';

/** The bytes of an api-only image (M7) through SWR, keyed on the path. */
const PATH = '/api/v1/files/7/content';

function Probe({ path, id }: { readonly path: typeof PATH | null; readonly id: string }) {
  const { blob, error, isLoading } = useFileBlob(path);
  return (
    <output
      data-testid={id}
      data-loading={String(isLoading)}
      data-error={error?.code ?? ''}
      data-size={blob === undefined ? '' : String(blob.size)}
    />
  );
}

let fake: FakeAdapter | undefined;
const use = (adapter: FakeAdapter) => {
  fake = adapter;
  http.defaults.adapter = adapter.adapter;
};

describe('useFileBlob', () => {
  beforeEach(() => {
    resetApiStatus();
    setSession({ accessToken: 'tok', csrfToken: 'csrf' });
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
    clearSession();
  });

  it('reads the bytes with the bearer once per path: two images of the same path share one request', async () => {
    use(fakeAdapter(200, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })));
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Probe path={PATH} id="a" />
        <Probe path={PATH} id="b" />
      </SWRConfig>,
    );
    expect(screen.getByTestId('a').dataset.loading).toBe('true');
    await waitFor(() => {
      expect(screen.getByTestId('a').dataset.size).toBe('3');
    });
    expect(screen.getByTestId('b').dataset.size).toBe('3');
    expect(fake?.calls.map((c) => c.url)).toEqual([PATH]);
    expect(fake?.calls[0]?.headers.authorization).toBe('Bearer tok');
  });

  it('a refusal is an error with its problem code, not loading', async () => {
    use(
      fakeAdapter(
        404,
        new Blob([JSON.stringify(problem(404, 'ERP-CORE-0004'))], { type: 'application/json' }),
      ),
    );
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Probe path={PATH} id="a" />
      </SWRConfig>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('a').dataset.error).toBe('ERP-CORE-0004');
    });
    expect(screen.getByTestId('a').dataset.loading).toBe('false');
  });

  it('a null path requests nothing and is not loading', async () => {
    use(fakeAdapter(200, new Blob(['x'])));
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Probe path={null} id="a" />
      </SWRConfig>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake?.calls).toEqual([]);
    expect(screen.getByTestId('a').dataset.loading).toBe('false');
  });
});
