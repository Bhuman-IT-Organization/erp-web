// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { NoAccessState } from '../NoAccessState';

const COMMON = commonEn.common;

describe('NoAccessState', () => {
  it('renders common.forbidden as the heading and common.forbidden_body', () => {
    renderWithProviders(<NoAccessState />);
    expect(screen.getByRole('heading', { name: COMMON.forbidden })).not.toBeNull();
    expect(screen.getByText(COMMON.forbidden_body)).not.toBeNull();
  });

  it('links to the Perfex dashboard at /admin, named common.go_to_dashboard', () => {
    renderWithProviders(<NoAccessState />);
    const link = screen.getByRole('link', { name: COMMON.go_to_dashboard });
    expect(link.getAttribute('href')).toBe('/admin');
  });

  it('carries the permission-refused test id', () => {
    renderWithProviders(<NoAccessState />);
    expect(screen.getByTestId('permission-refused')).not.toBeNull();
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<NoAccessState />, { locale: 'ar' });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
