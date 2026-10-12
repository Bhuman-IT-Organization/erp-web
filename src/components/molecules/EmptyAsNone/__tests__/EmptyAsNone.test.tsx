// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { EmptyAsNone } from '../EmptyAsNone';

/** The kit's empty value (UI-SPEC: an empty value reads "None"), now a molecule (plan 04.6-04). */
const NONE = commonEn.common.none;

describe('EmptyAsNone', () => {
  it('an empty string reads "None" in muted text', () => {
    renderWithProviders(<EmptyAsNone value="" />);
    const none = screen.getByText(NONE);
    expect(none.className).toContain('text-muted-foreground');
  });

  it('a text and a <bdi> holding a text render as given', () => {
    const { container } = renderWithProviders(
      <>
        <EmptyAsNone value="x" />
        <EmptyAsNone value={<bdi>GR-0001</bdi>} />
      </>,
    );
    expect(screen.getByText('x')).toBeTruthy();
    expect(container.querySelector('bdi')?.textContent).toBe('GR-0001');
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('an empty <bdi> reads "None" too', () => {
    renderWithProviders(<EmptyAsNone value={<bdi>{''}</bdi>} />);
    expect(screen.getByText(NONE)).toBeTruthy();
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<EmptyAsNone value="" />, { locale: 'ar' });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
