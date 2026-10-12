// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { resetApiStatus } from '../api-status';
import { http } from '../http';
import { useUploadRules } from '../use-upload-rules';

/** `GET /api/v1/uploads/rules/:purpose` (plan 03): the caption and the browser checks of K8. */
const RULES = {
  purpose: 'demo.attachment',
  maxBytes: 67_108_864,
  maxFiles: 10,
  extensions: ['png', 'pdf'],
};

function Probe({ purpose }: { readonly purpose: string | null }) {
  const { data, isLoading } = useUploadRules(purpose);
  return (
    <output data-testid="rules" data-loading={String(isLoading)}>
      {data === undefined ? '' : JSON.stringify(data)}
    </output>
  );
}

let fake: FakeAdapter | undefined;

describe('useUploadRules', () => {
  beforeEach(() => {
    resetApiStatus();
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
  });

  it('reads /api/v1/uploads/rules/<purpose> and parses the four fields', async () => {
    fake = fakeAdapter(200, RULES);
    http.defaults.adapter = fake.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Probe purpose="demo.attachment" />
      </SWRConfig>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('rules').textContent).toBe(JSON.stringify(RULES));
    });
    expect(fake.calls.map((c) => c.url)).toEqual(['/api/v1/uploads/rules/demo.attachment']);
  });

  it('refuses an answer missing a field (an error, not data)', async () => {
    fake = fakeAdapter(200, { purpose: 'x', maxBytes: 1, maxFiles: 1 });
    http.defaults.adapter = fake.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <Probe purpose="x" />
      </SWRConfig>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('rules').dataset.loading).toBe('false');
    });
    expect(screen.getByTestId('rules').textContent).toBe('');
  });

  it('a null purpose requests nothing', async () => {
    fake = fakeAdapter(200, RULES);
    http.defaults.adapter = fake.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Probe purpose={null} />
      </SWRConfig>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.calls).toEqual([]);
  });
});
