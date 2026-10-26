// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FALLBACK_BRANDING, type Branding } from '@/features/branding';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { LoginLogo } from '../LoginLogo';

// Neutral fixture data: never a customer name or asset (W0-05).
const NAME = 'Example Company';
const withLogo: Branding = {
  ...FALLBACK_BRANDING,
  companyName: NAME,
  logoDarkUrl:
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
};
const nameOnly: Branding = { ...FALLBACK_BRANDING, companyName: NAME };

const classes = (element: HTMLElement): string[] => element.className.split(' ');
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

describe('LoginLogo (lead 2026-09-26: never stretched, never blown up)', () => {
  it('shows any logo at its natural size and aspect ratio, capped by the card width and a height, never widened to the card', () => {
    renderWithProviders(<LoginLogo branding={withLogo} />);
    const logo = classes(screen.getByTestId('brand-logo'));
    // Natural size: both dimensions auto, so a small logo stays small and a tall one stays tall.
    expect(logo).toEqual(expect.arrayContaining(['h-auto', 'w-auto', 'object-contain']));
    // Capped: never wider than the card, never taller than the cap (the form stays on screen).
    expect(logo).toEqual(expect.arrayContaining(['max-w-full', 'max-h-32']));
    // The defect: `w-full` scaled every logo up to the 448 px card (a 1:2 logo became 448 × 896).
    expect(logo).not.toContain('w-full');
  });

  it('without a logo the company name is text in the legacy heading style', () => {
    renderWithProviders(<LoginLogo branding={nameOnly} />);
    const name = screen.getByTestId('brand-name');
    expect(name.textContent).toBe(NAME);
    expect(classes(name)).toEqual(expect.arrayContaining(['text-3xl', 'font-bold']));
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<LoginLogo branding={withLogo} />, { locale: 'ar' });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
