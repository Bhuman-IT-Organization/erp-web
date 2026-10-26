// @vitest-environment happy-dom
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FALLBACK_BRANDING, type Branding } from '@/features/branding/api/branding.fetch';
import { renderWithProviders, screen } from '@/test/render';
import { BrandLogo } from '../BrandLogo';

// Neutral fixture data: never a customer name or asset (W0-05).
const NAME = 'Acme';
const LOGO = '/uploads/company/logo.png';
const LOGO_DARK = '/uploads/company/logo-dark.png';

const withLogo: Branding = { ...FALLBACK_BRANDING, companyName: NAME, logoUrl: LOGO };
const withBoth: Branding = { ...withLogo, logoDarkUrl: LOGO_DARK };
const nameOnly: Branding = { ...FALLBACK_BRANDING, companyName: NAME };

const imageDescriptors = {
  complete: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete'),
  naturalWidth: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth'),
};

beforeEach(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 100,
  });
});

afterEach(() => {
  for (const [key, descriptor] of Object.entries(imageDescriptors)) {
    if (descriptor === undefined) Reflect.deleteProperty(HTMLImageElement.prototype, key);
    else Object.defineProperty(HTMLImageElement.prototype, key, descriptor);
  }
});

describe('BrandLogo', () => {
  it('with a logo renders <img alt=companyName src=logoUrl data-testid=brand-logo>', () => {
    renderWithProviders(<BrandLogo branding={withLogo} />);
    const img = screen.getByTestId('brand-logo');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe(LOGO);
    expect(img.getAttribute('alt')).toBe(NAME);
    expect(screen.queryByTestId('brand-name')).toBeNull();
  });

  it('without a logo renders the company name as text (data-testid=brand-name)', () => {
    renderWithProviders(<BrandLogo branding={nameOnly} className="text-3xl" />);
    const name = screen.getByTestId('brand-name');
    expect(name.textContent).toBe(NAME);
    expect(name.getAttribute('class')).toBe('text-3xl');
    expect(screen.queryByTestId('brand-logo')).toBeNull();
  });

  it('the dark variant prefers logoDarkUrl', () => {
    renderWithProviders(<BrandLogo branding={withBoth} variant="dark" />);
    expect(screen.getByTestId('brand-logo').getAttribute('src')).toBe(LOGO_DARK);
  });

  it('the dark variant falls back to logoUrl when no dark logo was uploaded', () => {
    renderWithProviders(<BrandLogo branding={withLogo} variant="dark" />);
    expect(screen.getByTestId('brand-logo').getAttribute('src')).toBe(LOGO);
  });

  it('the light variant falls back to logoDarkUrl when only that one exists', () => {
    renderWithProviders(
      <BrandLogo branding={{ ...nameOnly, logoDarkUrl: LOGO_DARK }} variant="light" />,
    );
    expect(screen.getByTestId('brand-logo').getAttribute('src')).toBe(LOGO_DARK);
  });

  it('falls back to the alternate logo and then the company name when logo files are missing', () => {
    renderWithProviders(<BrandLogo branding={withBoth} variant="dark" />);
    fireEvent.error(screen.getByTestId('brand-logo'));
    expect(screen.getByTestId('brand-logo').getAttribute('src')).toBe(LOGO);

    fireEvent.error(screen.getByTestId('brand-logo'));
    expect(screen.getByTestId('brand-name').textContent).toBe(NAME);
    expect(screen.queryByTestId('brand-logo')).toBeNull();
  });
});
