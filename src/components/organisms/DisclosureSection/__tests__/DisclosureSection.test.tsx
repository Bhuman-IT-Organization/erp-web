// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { DisclosureSection } from '../DisclosureSection';

function details(): HTMLDetailsElement {
  const node = screen.getByText('Social profiles').closest('details');
  if (node === null) throw new Error('no <details>');
  return node;
}

describe('DisclosureSection (finding 7, UI-SPEC choice 19)', () => {
  it('is a native <details> that is closed by default', () => {
    renderWithProviders(
      <DisclosureSection title="Social profiles" forceOpen={false}>
        <p>Inside</p>
      </DisclosureSection>,
    );
    expect(details().open).toBe(false);
    expect(details().querySelector('summary')?.textContent).toBe('Social profiles');
  });

  it('forceOpen opens it, so an error or a value inside is never hidden', () => {
    renderWithProviders(
      <DisclosureSection title="Social profiles" forceOpen>
        <p>Inside</p>
      </DisclosureSection>,
    );
    expect(details().open).toBe(true);
  });

  it('forced open, a click on the summary does not close it', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DisclosureSection title="Social profiles" forceOpen>
        <p>Inside</p>
      </DisclosureSection>,
    );
    await user.click(screen.getByText('Social profiles'));
    expect(details().open).toBe(true);
  });

  it('not forced, the user opens and closes it from the summary', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DisclosureSection title="Social profiles" forceOpen={false}>
        <p>Inside</p>
      </DisclosureSection>,
    );
    await user.click(screen.getByText('Social profiles'));
    expect(details().open).toBe(true);
    await user.click(screen.getByText('Social profiles'));
    expect(details().open).toBe(false);
  });

  it('the summary is keyboard-activatable: a native <summary>, reached by Tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DisclosureSection title="Social profiles" forceOpen={false}>
        <p>Inside</p>
      </DisclosureSection>,
    );
    await user.tab();
    expect(document.activeElement?.tagName).toBe('SUMMARY');
  });

  it('uses no physical-direction class under ar, open or closed', () => {
    const { container } = renderWithProviders(
      <>
        <DisclosureSection title="أ" forceOpen={false}>
          <p>1</p>
        </DisclosureSection>
        <DisclosureSection title="ب" forceOpen>
          <p>2</p>
        </DisclosureSection>
      </>,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
