// @vitest-environment happy-dom
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { ErrorSummary } from '../ErrorSummary';

const COMMON = commonEn.common;

const ITEMS = [
  { fieldId: 'member-firstName', label: 'First Name', message: 'This field is required.' },
  { fieldId: 'member-email', label: 'Email', message: 'Enter a valid e-mail address.' },
];

describe('ErrorSummary (D-29)', () => {
  it('is an alert headed "Check these fields" with one link per item named "<label>: <message>"', () => {
    renderWithProviders(<ErrorSummary items={ITEMS} onSelect={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(COMMON.check_these_fields)).toBeDefined();
    const links = within(alert).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'First Name: This field is required.',
      'Email: Enter a valid e-mail address.',
    ]);
    expect(links[0]?.getAttribute('href')).toBe('#member-firstName');
  });

  it('a link calls onSelect with its fieldId and does not navigate', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<ErrorSummary items={ITEMS} onSelect={onSelect} />);
    const before = window.location.hash;
    await user.click(screen.getByRole('link', { name: 'Email: Enter a valid e-mail address.' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('member-email');
    expect(window.location.hash).toBe(before);
  });

  it('is focusable through its ref (tabIndex -1), so a failed submit can move focus to it', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithProviders(<ErrorSummary ref={ref} items={ITEMS} onSelect={vi.fn()} />);
    expect(ref.current?.getAttribute('tabindex')).toBe('-1');
    ref.current?.focus();
    expect(document.activeElement).toBe(screen.getByRole('alert'));
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<ErrorSummary items={ITEMS} onSelect={vi.fn()} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
