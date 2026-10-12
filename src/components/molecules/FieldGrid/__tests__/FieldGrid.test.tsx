// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { FieldGrid, fieldSpan } from '../FieldGrid';

const optionsOf = (count: number): { value: string; label: string }[] =>
  Array.from({ length: count }, (_, index) => ({
    value: String(index + 1),
    label: `Option ${String(index + 1)}`,
  }));

const ITEMS = [
  { key: 'first', span: 'short', node: <span>First</span> },
  { key: 'notes', span: 'full', node: <span>Notes</span> },
] as const;

describe('fieldSpan (the field kind decides its width, never the screen — UI-SPEC FieldGrid table)', () => {
  it('text, password and a single checkbox are short', () => {
    expect(fieldSpan('text')).toBe('short');
    expect(fieldSpan('password')).toBe('short');
    expect(fieldSpan('checkbox')).toBe('short');
  });

  it('a color (a text value with a picker swatch, D-15) is short', () => {
    expect(fieldSpan('color')).toBe('short');
  });

  it('textarea and custom are full width', () => {
    expect(fieldSpan('textarea')).toBe('full');
    expect(fieldSpan('custom')).toBe('full');
  });

  it('a single choice: 3 options short, 5 (a radio group of 4-6) full, 21 (a searchable select) short', () => {
    expect(fieldSpan('choice', optionsOf(3), false)).toBe('short');
    expect(fieldSpan('choice', optionsOf(5), false)).toBe('full');
    expect(fieldSpan('choice', optionsOf(21), false)).toBe('short');
  });

  it('any multiple choice is full width', () => {
    expect(fieldSpan('choice', optionsOf(2), true)).toBe('full');
    expect(fieldSpan('choice', optionsOf(21), true)).toBe('full');
  });

  it('a single choice whose options are still loading reserves the full width (lead decision 2026-09-26)', () => {
    expect(fieldSpan('choice', undefined, false)).toBe('full');
  });
});

describe('FieldGrid', () => {
  it('renders a full item with md:col-span-2 and a short item without it', () => {
    renderWithProviders(<FieldGrid items={ITEMS} />);
    const short = screen.getByText('First').parentElement;
    const full = screen.getByText('Notes').parentElement;
    expect(short?.className.split(' ')).not.toContain('md:col-span-2');
    expect(full?.className.split(' ')).toContain('md:col-span-2');
  });

  it('is one column below md and two from md, with a 24 px column and 16 px row gap', () => {
    const { container } = renderWithProviders(<FieldGrid items={ITEMS} />);
    const grid = container.firstElementChild;
    expect(grid?.className.split(' ')).toEqual(
      expect.arrayContaining(['grid', 'grid-cols-1', 'gap-y-4', 'md:grid-cols-2', 'md:gap-x-6']),
    );
  });

  it('alignInputs (opt-in, lead 2026-10-07): the fields of a row align to its bottom; default unchanged', () => {
    const grid = (view: ReturnType<typeof renderWithProviders>): string[] =>
      view.container.querySelector('[data-field]')?.parentElement?.className.split(' ') ?? [];
    const aligned = renderWithProviders(<FieldGrid items={ITEMS} alignInputs />);
    expect(grid(aligned)).toContain('md:items-end');
    aligned.unmount();
    expect(grid(renderWithProviders(<FieldGrid items={ITEMS} />))).not.toContain('md:items-end');
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<FieldGrid items={ITEMS} />, { locale: 'ar' });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
