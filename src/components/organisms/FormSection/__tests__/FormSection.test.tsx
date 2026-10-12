// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, within } from '@/test/render';
import { FormSection } from '../FormSection';

const COMMON = commonEn.common;

describe('FormSection', () => {
  it('renders a section named by an h2 carrying the title, with its children', () => {
    renderWithProviders(
      <FormSection id="profile" title="Profile">
        <p>Body</p>
      </FormSection>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Profile' });
    expect(heading.className.split(' ')).toEqual(
      expect.arrayContaining(['text-lg', 'font-semibold']),
    );
    const section = screen.getByRole('region', { name: 'Profile' });
    expect(within(section).getByText('Body')).toBeDefined();
  });

  it('loading: the real heading over labelled field blocks under role status, and no children (D-35, D-39)', () => {
    renderWithProviders(
      <FormSection id="permissions" title="Permissions" loading={{ count: 4 }}>
        <p>Body</p>
      </FormSection>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Permissions' })).toBeDefined();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(within(status).getByText(COMMON.loading)).toBeDefined();
    expect(within(status).getAllByTestId('skeleton-field')).toHaveLength(4);
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <FormSection id="profile" title="الملف" loading={{ count: 2 }} />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
