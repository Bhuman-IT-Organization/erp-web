// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, within } from '@/test/render';
import { ModuleDisabledState } from '../ModuleDisabledState';

/**
 * K12 (UI-SPEC § Module-disabled state, P-01): the `NoAccessState` anatomy with a 24px `lock` icon
 * and, for administrators only, who switched the module off and when. The caller passes the
 * translated texts; the details render only when given (T-4.2-41).
 */
const COMMON = commonEn.common;
// Fixture texts: the feature passes its own translated words (plan 15 owns the shell keys).
const HEADING = 'The sample module is disabled';
const BODY = 'The sample module is switched off for this system. Contact your administrator.';
const DETAILS = [
  { term: 'Switched off by', description: 'Sample admin' },
  { term: 'Switched off on', description: '2026-10-01 09:30' },
];

describe('ModuleDisabledState (K12)', () => {
  it("the heading is the page's only <h1>; the body follows it", () => {
    renderWithProviders(<ModuleDisabledState heading={HEADING} body={BODY} />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(HEADING);
    expect(screen.getByText(BODY).className).toContain('text-muted-foreground');
  });

  it('a 24px lock icon, hidden from assistive technology', () => {
    renderWithProviders(<ModuleDisabledState heading={HEADING} body={BODY} />);
    const lock = screen.getByTestId('module-disabled').querySelector('[data-icon-name="lock"]');
    expect(lock?.getAttribute('aria-hidden')).toBe('true');
    expect(lock?.getAttribute('class')).toContain('size-6');
  });

  it('without details there is no definition list', () => {
    renderWithProviders(<ModuleDisabledState heading={HEADING} body={BODY} />);
    expect(screen.getByTestId('module-disabled').querySelector('dl')).toBeNull();
  });

  it('details render as a <dl>, each term weight 600 followed by its description', () => {
    renderWithProviders(<ModuleDisabledState heading={HEADING} body={BODY} details={DETAILS} />);
    const list = screen.getByTestId('module-disabled').querySelector('dl');
    expect(list).not.toBeNull();
    const terms = [...(list?.querySelectorAll('dt') ?? [])];
    expect(terms.map((dt) => dt.textContent)).toEqual(['Switched off by', 'Switched off on']);
    expect(terms[0]?.className).toContain('font-semibold');
    expect(terms[0]?.nextElementSibling?.tagName).toBe('DD');
    expect(terms[0]?.nextElementSibling?.textContent).toBe('Sample admin');
  });

  it('"Go to the dashboard" links to /admin', () => {
    renderWithProviders(<ModuleDisabledState heading={HEADING} body={BODY} />);
    const link = within(screen.getByTestId('module-disabled')).getByRole('link', {
      name: COMMON.go_to_dashboard,
    });
    expect(link.getAttribute('href')).toBe('/admin');
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <ModuleDisabledState heading={HEADING} body={BODY} details={DETAILS} />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
