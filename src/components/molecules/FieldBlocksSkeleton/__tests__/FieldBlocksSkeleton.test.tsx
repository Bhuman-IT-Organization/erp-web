// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { FieldBlocksSkeleton } from '../FieldBlocksSkeleton';

describe('FieldBlocksSkeleton', () => {
  it('count=3 renders 3 blocks, each a label bar over a control bar, in the two-column grid', () => {
    renderWithProviders(<FieldBlocksSkeleton count={3} />);
    const fields = screen.getAllByTestId('skeleton-field');
    expect(fields).toHaveLength(3);
    expect(fields[0]?.parentElement?.className.split(' ')).toContain('md:grid-cols-2');
    for (const field of fields) {
      const [label, control] = Array.from(field.children);
      expect(label?.getAttribute('data-testid')).toBe('skeleton-field-label');
      expect(control?.getAttribute('data-testid')).toBe('skeleton-field-control');
    }
  });

  it('count=1 (one ChoiceField loading) fills its own cell: no second column', () => {
    renderWithProviders(<FieldBlocksSkeleton count={1} />);
    const grid = screen.getByTestId('skeleton-field').parentElement;
    expect(grid?.className.split(' ')).not.toContain('md:grid-cols-2');
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<FieldBlocksSkeleton count={2} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
