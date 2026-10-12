// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { renderWithProviders } from '@/test/render';
import { DirectionProvider } from '../DirectionProvider';

/**
 * `<html dir>` flips the page, but Radix menus, selects and sub-menus read their direction from
 * React context (keyboard arrows, sub-menu side, alignment), not from the DOM. Without the one
 * provider they stay `ltr` in Arabic — the first case below is that defect, pinned.
 */
function OpenMenu(): ReactElement {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DirectionProvider', () => {
  it('without the provider a Radix menu stays ltr even under <html dir="rtl">', () => {
    document.documentElement.dir = 'rtl';
    render(<OpenMenu />);
    expect(screen.getByRole('menu').getAttribute('dir')).toBe('ltr');
  });

  it('under dir="rtl" a Radix menu renders its content rtl', () => {
    render(
      <DirectionProvider dir="rtl">
        <OpenMenu />
      </DirectionProvider>,
    );
    expect(screen.getByRole('menu').getAttribute('dir')).toBe('rtl');
  });

  it('renderWithProviders mounts it from the locale: rtl for ar, ltr for en', () => {
    const { unmount } = renderWithProviders(<OpenMenu />, { locale: 'ar' });
    expect(screen.getByRole('menu').getAttribute('dir')).toBe('rtl');
    unmount();
    renderWithProviders(<OpenMenu />, { locale: 'en' });
    expect(screen.getByRole('menu').getAttribute('dir')).toBe('ltr');
  });
});
