// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import shellEn from '@/features/shell/messages/en.json';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { AccountMenu, type AccountMenuProps } from '../AccountMenu';

const EN = shellEn.shell;
const NAME = 'Jane Doe';

const answerMe = (): void => {
  http.defaults.adapter = fakeAdapter(200, {
    staffId: 7,
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    isAdmin: false,
    roleId: null,
    permissions: [],
    locale: null,
  }).adapter;
};

const pendingMe: AxiosAdapter = () => new Promise(() => undefined);

const renderMenu = (props: AccountMenuProps = {}, locale?: 'ar') =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <AccountMenu writeLocale={() => undefined} {...props} />
    </SWRConfig>,
    locale === undefined ? {} : { locale },
  );

const trigger = (): Promise<HTMLElement> =>
  screen.findByRole('button', { name: EN.account_menu_for.replace('{name}', NAME) });

beforeEach(() => {
  setSession({ accessToken: 't', csrfToken: 'c' });
});

// Unmount BEFORE the session resets (RESEARCH Pitfall 9).
afterEach(() => {
  cleanup();
  delete http.defaults.adapter;
  clearSession();
});

describe('AccountMenu', () => {
  it('shows the initials in a 32 px circle, and the first name from md up', async () => {
    answerMe();
    renderMenu();
    const button = await trigger();
    const initials = button.querySelector('[data-testid="account-initials"]');
    expect(initials?.textContent).toBe('JD');
    expect(initials?.className).toContain('size-8');
    expect(initials?.className).toContain('rounded-full');
    const first = button.querySelector('[data-testid="account-first-name"]');
    expect(first?.textContent).toBe('Jane');
    expect(first?.className).toContain('hidden');
    expect(first?.className).toContain('md:inline');
  });

  it('opens identity, separator, My profile, Language, separator, Sign out — in that order (D-09)', async () => {
    answerMe();
    renderMenu();
    await userEvent.click(await trigger());
    const menu = await screen.findByRole('menu');
    const order = [...menu.children].map(
      (el) => el.getAttribute('data-testid') ?? el.getAttribute('role'),
    );
    expect(order).toEqual([
      'account-identity',
      'separator',
      'account-profile',
      'account-language',
      'separator',
      'account-logout',
    ]);
    const identity = screen.getByTestId('account-identity');
    expect(identity.textContent).toContain(NAME);
    expect(identity.querySelector('bdi')?.textContent).toBe('jane@example.com');
  });

  it('is non-modal: opening it never aria-hides the page around its still-focusable trigger (axe aria-hidden-focus)', async () => {
    answerMe();
    renderMenu();
    const button = await trigger();
    await userEvent.click(button);
    await screen.findByRole('menu');
    expect(button.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('My profile is a plain link to the Perfex profile page, marked as opening in Perfex', async () => {
    answerMe();
    renderMenu();
    await userEvent.click(await trigger());
    const profile = await screen.findByTestId('account-profile');
    expect(profile.tagName).toBe('A');
    expect(profile.getAttribute('href')).toBe('/admin/profile');
    expect(profile.textContent).toContain(EN.nav_my_profile);
    expect(profile.textContent).toContain(EN.opens_in_perfex);
    expect(profile.querySelector('[data-icon-name="external-link"]')).not.toBeNull();
  });

  it('Sign out is last, a link to /logout, and neutral in colour', async () => {
    answerMe();
    renderMenu();
    await userEvent.click(await trigger());
    const logout = await screen.findByTestId('account-logout');
    expect(logout.tagName).toBe('A');
    expect(logout.getAttribute('href')).toBe('/logout');
    expect(logout.textContent).toContain(EN.nav_logout);
    // The primitive's item carries `data-[variant=destructive]:` styles; neutral = that variant is off.
    expect(logout.getAttribute('data-variant')).not.toBe('destructive');
    expect(logout.className.split(' ')).not.toContain('text-destructive');
  });

  it('Language is a sub-menu of the locales in their own language plus System Default, the current one checked', async () => {
    answerMe();
    renderMenu();
    await userEvent.click(await trigger());
    await userEvent.click(await screen.findByTestId('account-language'));
    const english = await screen.findByTestId('locale-en');
    expect(english.textContent).toContain('English');
    expect(screen.getByTestId('locale-ar').textContent).toContain('العربية');
    expect(screen.getByTestId('locale-default').textContent).toContain(EN.system_default_string);
    expect(english.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('locale-ar').getAttribute('aria-checked')).toBe('false');
  });

  it('choosing a locale calls writeLocale with it; System Default calls it with null', async () => {
    answerMe();
    const writeLocale = vi.fn();
    renderMenu({ writeLocale });
    await userEvent.click(await trigger());
    await userEvent.click(await screen.findByTestId('account-language'));
    await userEvent.click(await screen.findByTestId('locale-ar'));
    expect(writeLocale).toHaveBeenLastCalledWith('ar');
    await userEvent.click(await trigger());
    await userEvent.click(await screen.findByTestId('account-language'));
    await userEvent.click(await screen.findByTestId('locale-default'));
    expect(writeLocale).toHaveBeenLastCalledWith(null);
  });

  it('while /me loads the trigger is a skeleton circle: no name and no menu (D-39)', () => {
    http.defaults.adapter = pendingMe;
    renderMenu();
    const loading = screen.getByTestId('account-loading');
    expect(loading.getAttribute('role')).toBe('status');
    expect(loading.querySelector('.rounded-full.size-8')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(NAME)).toBeNull();
  });

  it('uses no physical-direction class under ar', async () => {
    answerMe();
    const { container } = renderMenu({}, 'ar');
    await trigger();
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
