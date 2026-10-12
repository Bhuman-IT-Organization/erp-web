// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonAr from '@/messages/common/ar.json';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { PasswordField } from '../PasswordField';

const COMMON = commonEn.common;
const ID = 'staff-password';

function input(): HTMLInputElement {
  const el = document.getElementById(ID);
  if (!(el instanceof HTMLInputElement)) throw new Error('no password input');
  return el;
}

describe('PasswordField', () => {
  it('renders type="password" with autocomplete new-password, and a reveal button named "Show password", aria-pressed false, controlling the input', () => {
    renderWithProviders(<PasswordField id={ID} />);
    expect(input().type).toBe('password');
    expect(input().getAttribute('autocomplete')).toBe('new-password');
    const reveal = screen.getByRole('button', { name: COMMON.show_password });
    expect(reveal.getAttribute('aria-pressed')).toBe('false');
    expect(reveal.getAttribute('aria-controls')).toBe(ID);
    expect(reveal.querySelector('[data-icon-name="eye"]')).not.toBeNull();
  });

  it('reveal: clicking makes type="text", names the button "Hide password", aria-pressed true, eye-slash; clicking again hides it', async () => {
    renderWithProviders(<PasswordField id={ID} />);
    await userEvent.click(screen.getByRole('button', { name: COMMON.show_password }));
    expect(input().type).toBe('text');
    const hide = screen.getByRole('button', { name: COMMON.hide_password });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    expect(hide.querySelector('[data-icon-name="eye-slash"]')).not.toBeNull();
    await userEvent.click(hide);
    expect(input().type).toBe('password');
  });

  it('keeps a caller autocomplete (a sign-in form passes current-password)', () => {
    renderWithProviders(<PasswordField id={ID} autoComplete="current-password" />);
    expect(input().getAttribute('autocomplete')).toBe('current-password');
  });

  it('forwards aria-invalid, aria-required, aria-describedby and disabled to the input; disabled also disables the reveal', () => {
    renderWithProviders(
      <PasswordField id={ID} aria-invalid aria-required aria-describedby="pw-help" disabled />,
    );
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-required')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe('pw-help');
    expect(input().disabled).toBe(true);
    expect(
      screen.getByRole('button', { name: COMMON.show_password }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('under ar: no physical-direction class; the reveal sits at the inline end (end-0) and the input reserves it (pe-10)', () => {
    const { container } = renderWithProviders(<PasswordField id={ID} />, { locale: 'ar' });
    expect(physicalClassesIn(container)).toEqual([]);
    const reveal = screen.getByRole('button', { name: commonAr.common.show_password });
    expect(reveal.className.split(' ')).toContain('end-0');
    expect(input().className.split(' ')).toContain('pe-10');
  });
});
