// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen } from '@/test/render';
import { EstimateRequestStatusesList } from '../EstimateRequestStatusesList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const LIST = {
  data: [
    {
      id: '7',
      name: 'Approved',
      color: '#008000',
      statusorder: 2,
      flag: null,
      total_request: 3,
    },
  ],
  meta: {
    nextCursor: null,
    prevCursor: null,
    total: 1,
    rangeStart: 1,
    exportLimit: 10_000,
    printLimit: 1_000,
  },
};

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('EstimateRequestStatusesList', () => {
  it('renders estimate request statuses and their request totals', async () => {
    http.defaults.adapter = fakeAdapter(200, LIST).adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusesList />
      </SWRConfig>,
    );

    expect(await screen.findByText('Approved')).toBeTruthy();
    expect(screen.getByText('Total 3')).toBeTruthy();
  });
});
