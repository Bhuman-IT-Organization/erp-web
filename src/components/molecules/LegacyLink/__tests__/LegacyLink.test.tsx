// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { LegacyLink } from '../LegacyLink';

/** K22 (UI-SPEC § Kit additions): a plain link to a Perfex page, same origin only (T-4.6-29). */
const OPENS = 'opens in Perfex';

describe('LegacyLink', () => {
  it('the common key reads "opens in Perfex"', () => {
    expect(commonEn.common).toHaveProperty('opens_in_perfex', OPENS);
  });

  it('a same-origin path is a plain <a> with the 12px glyph and the hidden "opens in Perfex"', () => {
    renderWithProviders(<LegacyLink href="/admin/purchase/purchase_order/12">PO-0012</LegacyLink>);
    const link = screen.getByRole('link', { name: `PO-0012 ${OPENS}` });
    expect(link.getAttribute('href')).toBe('/admin/purchase/purchase_order/12');
    expect(link.getAttribute('target')).toBeNull();
    const icon = link.querySelector('[data-icon-name="external-link"]');
    expect(icon?.getAttribute('class')).toContain('size-3');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText(OPENS).className).toContain('sr-only');
  });

  it.each([
    'https://elsewhere.example/x',
    '//host/x',
    '/\\host',
    'javascript:alert(1)',
    'admin/relative',
    '',
  ])('%s renders the text only, no link', (href) => {
    const { container } = renderWithProviders(<LegacyLink href={href}>PO-0012</LegacyLink>);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('PO-0012')).toBeTruthy();
    expect(screen.queryByText(OPENS)).toBeNull();
  });

  it('passes its className to the link', () => {
    renderWithProviders(
      <LegacyLink href="/admin/x" className="font-semibold">
        X
      </LegacyLink>,
    );
    expect(screen.getByRole('link').className).toContain('font-semibold');
  });

  it('Rtl: no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<LegacyLink href="/admin/x">X</LegacyLink>, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
