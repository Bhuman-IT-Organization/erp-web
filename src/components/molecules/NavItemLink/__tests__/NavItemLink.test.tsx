// @vitest-environment happy-dom
import { useState, type ComponentProps, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavItem } from '@/config/navigation';
import shellEn from '@/features/shell/messages/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { NavItemLink } from '../NavItemLink';

const EN = shellEn.shell;

// A stand-in that marks every anchor next/link renders, so a test can tell a router link from a
// plain one: in the DOM both are `<a href>`.
vi.mock('next/link', () => ({
  default: function NextLink({ href, ...rest }: ComponentProps<'a'> & { href: string }) {
    return <a href={href} data-next-link="" {...rest} />;
  },
}));

const NODE_ITEM: NavItem = { id: 'staff', labelKey: 'shell.als_staff', href: '/setup/staff' };
const LEGACY_ITEM: NavItem = {
  id: 'sales_returns',
  labelKey: 'shell.sales_returns',
  href: '/admin/sales_returns',
  legacy: true,
};
const CONTAINER_ITEM: NavItem = { id: 'sales', labelKey: 'shell.als_sales', icon: 'bolt' };

describe('NavItemLink', () => {
  it('renders a Node item as a Next link with its label and no active marker', () => {
    renderWithProviders(<NavItemLink item={NODE_ITEM} active={false} />);
    const link = screen.getByTestId('nav-staff');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/setup/staff');
    expect(link.getAttribute('aria-current')).toBeNull();
    expect(link.className).toContain('border-s-transparent');
    expect(link.hasAttribute('data-next-link')).toBe(true);
    expect(screen.getByText(EN.als_staff)).not.toBeNull();
  });

  it('renders a legacy item as a plain <a href> to the Perfex URL, not a Next link (D-22)', () => {
    renderWithProviders(<NavItemLink item={LEGACY_ITEM} active={false} />);
    const link = screen.getByTestId('nav-sales_returns');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/admin/sales_returns');
    // Not rendered through next/link: no prefetch of ~197 Perfex pages, no double request.
    expect(link.hasAttribute('data-next-link')).toBe(false);
  });

  it('marks the active item with aria-current, weight 600 and the inline-start marker, never brand text', () => {
    renderWithProviders(<NavItemLink item={NODE_ITEM} active />);
    const link = screen.getByTestId('nav-staff');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('font-semibold');
    expect(link.className).toContain('border-s-sidebar-primary');
    expect(link.className).toContain('bg-sidebar-accent');
    expect(link.className).not.toContain('text-primary');
  });

  it('sizes a row at 36 px with 16 px inline padding (D-37)', () => {
    renderWithProviders(<NavItemLink item={NODE_ITEM} active={false} />);
    const link = screen.getByTestId('nav-staff');
    expect(link.className).toContain('h-9');
    expect(link.className).toContain('px-4');
  });

  it('gives a legacy item the external glyph and the hidden description, and nothing else', () => {
    const { container } = renderWithProviders(<NavItemLink item={LEGACY_ITEM} active={false} />);
    expect(screen.getByText(EN.opens_in_perfex)).not.toBeNull();
    expect(container.querySelector('[data-icon-name="external-link"]')).not.toBeNull();
    // The parity rule: no colour change and no opacity change, so it never reads as disabled.
    const link = screen.getByTestId('nav-sales_returns');
    expect(link.className).not.toContain('opacity');
    expect(link.className).not.toContain('text-muted');
  });

  it('renders a container with no href as a disclosure summary carrying a chevron', () => {
    const { container } = renderWithProviders(
      <details open>
        <NavItemLink item={CONTAINER_ITEM} active={false} />
      </details>,
    );
    const summary = screen.getByTestId('nav-sales');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.getAttribute('href')).toBeNull();
    expect(container.querySelector('[data-icon-name="chevron-right"]')).not.toBeNull();
  });

  it('has no collapsed mode: the label is never sr-only', () => {
    renderWithProviders(<NavItemLink item={NODE_ITEM} active={false} />);
    expect(screen.getByText(EN.als_staff).className).not.toContain('sr-only');
  });

  it("isolates the label's direction (bdi), so an English label on an Arabic page truncates at its end (UAT 4.6)", () => {
    const categories: NavItem = {
      id: 'expenses-categories',
      labelKey: 'shell.acs_expense_categories',
      href: '/setup/expense-categories',
    };
    renderWithProviders(<NavItemLink item={categories} active />, { locale: 'ar' });
    const label = screen.getByText(EN.acs_expense_categories);
    expect(label.tagName).toBe('BDI');
    expect(label.className.split(' ')).toContain('truncate');
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<NavItemLink item={LEGACY_ITEM} active />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });

  describe('keepInView (UAT 4.2 gap 3)', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    afterEach(() => {
      if (original !== undefined)
        Object.defineProperty(Element.prototype, 'scrollIntoView', original);
    });

    it('scrolls the row into its nearest scroll container once on mount, and not again on a re-render', async () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      /** The row under a parent that re-renders on demand, as the sidebar does on every keystroke. */
      function Rerendering(): ReactElement {
        const [renders, setRenders] = useState(0);
        return (
          <>
            <NavItemLink item={NODE_ITEM} active keepInView />
            <button
              type="button"
              onClick={() => {
                setRenders(renders + 1);
              }}
            >
              {String(renders)}
            </button>
          </>
        );
      }
      renderWithProviders(<Rerendering />);
      expect(scroll).toHaveBeenCalledOnce();
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      expect(scroll.mock.contexts[0]).toBe(screen.getByTestId('nav-staff'));
      await userEvent.click(screen.getByRole('button', { name: '0' }));
      expect(screen.getByRole('button', { name: '1' })).toBeTruthy();
      expect(scroll).toHaveBeenCalledOnce();
    });

    it('without keepInView it never scrolls', () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      renderWithProviders(<NavItemLink item={NODE_ITEM} active />);
      renderWithProviders(<NavItemLink item={LEGACY_ITEM} active={false} keepInView={false} />);
      expect(scroll).not.toHaveBeenCalled();
    });

    it('a legacy row scrolls too, and a missing scrollIntoView does not throw', () => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      expect(() =>
        renderWithProviders(<NavItemLink item={LEGACY_ITEM} active keepInView />),
      ).not.toThrow();
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      renderWithProviders(<NavItemLink item={{ ...LEGACY_ITEM, id: 'other' }} active keepInView />);
      expect(scroll).toHaveBeenCalledOnce();
    });
  });
});
