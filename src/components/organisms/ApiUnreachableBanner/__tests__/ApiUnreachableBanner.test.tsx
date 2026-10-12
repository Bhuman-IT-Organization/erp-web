// @vitest-environment happy-dom
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { markUnreachable, resetApiStatus } from '@/lib/api/api-status';
import commonAr from '@/messages/common/ar.json';
import commonEn from '@/messages/common/en.json';
import { renderWithProviders, screen } from '@/test/render';
import { ApiUnreachableBanner } from '../ApiUnreachableBanner';

const EN = commonEn.common;
const AR = commonAr.common;
const RETRY_AFTER_S = 30;

describe('ApiUnreachableBanner', () => {
  afterEach(() => {
    resetApiStatus();
  });

  it('renders nothing while the api is reachable', () => {
    const { container } = renderWithProviders(<ApiUnreachableBanner />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('api-unreachable')).toBeNull();
  });

  it('after markUnreachable(30) renders role=status with the api_unreachable_in text carrying 30', () => {
    renderWithProviders(<ApiUnreachableBanner />);
    act(() => {
      markUnreachable(RETRY_AFTER_S);
    });
    const banner = screen.getByTestId('api-unreachable');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toBe(
      EN.api_unreachable_in.replace('{seconds}', String(RETRY_AFTER_S)),
    );
    expect(banner.textContent).toContain('30');
  });

  it('markUnreachable(null) renders the api_unreachable text without a delay', () => {
    renderWithProviders(<ApiUnreachableBanner />);
    act(() => {
      markUnreachable(null);
    });
    expect(screen.getByRole('status').textContent).toBe(EN.api_unreachable);
  });

  it("the root banner hides itself while a shell header is on the page; the shell's own copy does not (lead 2026-10-07)", () => {
    act(() => {
      markUnreachable(null);
    });
    const { unmount } = renderWithProviders(<ApiUnreachableBanner />);
    expect(screen.getByTestId('api-unreachable').className.split(' ')).toContain(
      '[body:has([data-page-header])_&]:hidden',
    );
    unmount();
    renderWithProviders(<ApiUnreachableBanner inShell />);
    expect(screen.getByTestId('api-unreachable').className).not.toContain(':hidden');
  });

  it('under ar renders the Arabic text and the document is rtl', () => {
    renderWithProviders(<ApiUnreachableBanner />, { locale: 'ar' });
    act(() => {
      markUnreachable(null);
    });
    expect(screen.getByRole('status').textContent).toBe(AR.api_unreachable);
    expect(document.documentElement.dir).toBe('rtl');
  });
});
