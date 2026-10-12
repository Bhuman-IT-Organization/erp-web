// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { ariaSortFor, SortableHeader } from '../SortableHeader';

const COMMON = commonEn.common;
const NAME = COMMON.sort_by.replace('{column}', 'Email');

function renderHeader(sort: string | null, locale: 'en' | 'ar' = 'en') {
  const onSort = vi.fn();
  const view = renderWithProviders(
    <SortableHeader label="Email" field="email" sort={sort} onSort={onSort} />,
    { locale },
  );
  return { onSort, view, button: screen.getByRole('button', { name: NAME }) };
}

describe('SortableHeader (D-18, UI-SPEC § Sorting)', () => {
  it.each([
    [null, 'email'],
    ['email', '-email'],
    ['-email', null],
    ['firstName', 'email'],
    ['-firstName', 'email'],
  ])(
    'with sort %j a click asks for %j (ascending → descending → the default)',
    async (sort, next) => {
      const { onSort, button } = renderHeader(sort);
      await userEvent.click(button);
      expect(onSort).toHaveBeenCalledTimes(1);
      expect(onSort).toHaveBeenCalledWith(next);
    },
  );

  it('ariaSortFor: ascending, descending, none (the value the <th> carries)', () => {
    expect(ariaSortFor('email', 'email')).toBe('ascending');
    expect(ariaSortFor('email', '-email')).toBe('descending');
    expect(ariaSortFor('email', null)).toBe('none');
    expect(ariaSortFor('email', 'firstName')).toBe('none');
    expect(ariaSortFor('email', '-emailAddress')).toBe('none');
  });

  it('is a button named "Sort by Email" that shows the visible label', () => {
    const { button } = renderHeader(null);
    expect(button.textContent).toBe('Email');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('wrap (opt-in, plan 04.7-11): the label may wrap at its words; the default keeps one line', () => {
    const view = renderWithProviders(
      <SortableHeader label="Email" field="email" sort={null} onSort={vi.fn()} wrap />,
    );
    expect(screen.getByRole('button', { name: NAME }).className.split(' ')).toEqual(
      expect.arrayContaining(['whitespace-normal', 'h-auto']),
    );
    view.unmount();
    const { button, view: plain } = renderHeader(null);
    expect(button.className.split(' ')).not.toContain('whitespace-normal');
    plain.unmount();
  });

  it('unsorted: the muted sort icon and the regular weight', () => {
    const { button } = renderHeader('firstName');
    const icon = button.querySelector('[data-icon-name]');
    expect(icon?.getAttribute('data-icon-name')).toBe('sort');
    expect(icon?.getAttribute('class')?.split(' ')).toContain('text-muted-foreground');
    expect(button.className.split(' ')).not.toContain('font-semibold');
  });

  it.each([
    ['email', 'arrow-up'],
    ['-email', 'arrow-down'],
  ])('sorted %j: the %s icon in the foreground and weight 600', (sort, iconName) => {
    const { button } = renderHeader(sort);
    const icon = button.querySelector('[data-icon-name]');
    expect(icon?.getAttribute('data-icon-name')).toBe(iconName);
    expect(icon?.getAttribute('class')?.split(' ')).not.toContain('text-muted-foreground');
    expect(button.className.split(' ')).toContain('font-semibold');
  });

  it('uses no physical-direction class under ar', () => {
    const { view } = renderHeader('email', 'ar');
    expect(physicalClassesIn(view.container)).toEqual([]);
  });
});
