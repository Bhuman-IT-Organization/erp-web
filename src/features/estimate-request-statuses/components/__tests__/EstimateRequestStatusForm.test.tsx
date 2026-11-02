// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen } from '@/test/render';
import { EstimateRequestStatusForm } from '../EstimateRequestStatusForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('EstimateRequestStatusForm', () => {
  it('renders the create form fields', () => {
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
        <EstimateRequestStatusForm id={null} />
      </SWRConfig>,
    );

    expect(screen.getByRole('textbox', { name: 'Status Name' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Color' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Status Order' })).toBeTruthy();
  });
});
