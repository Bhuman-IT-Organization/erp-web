// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_ID } from '@/components/organisms/Sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import shellEn from '@/features/shell/messages/en.json';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { Topbar } from '../Topbar';

const EN = shellEn.shell;

vi.mock('next/navigation', () => ({ usePathname: () => '/setup/staff' }));

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

/** `Topbar` reads the sidebar context `PageShell` mounts, so a lone mount supplies its own. */
const renderTopbar = (locale?: 'ar') =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SidebarProvider>
        <Topbar writeLocale={() => undefined} />
        <div id={SIDEBAR_ID} />
      </SidebarProvider>
    </SWRConfig>,
    locale === undefined ? {} : { locale },
  );

beforeEach(() => {
  setSession({ accessToken: 't', csrfToken: 'c' });
  answerMe();
});

// Unmount BEFORE the session resets (RESEARCH Pitfall 9).
afterEach(() => {
  cleanup();
  delete http.defaults.adapter;
  clearSession();
});

describe('Topbar', () => {
  it('flips the toggle aria-expanded and points aria-controls at the sidebar', async () => {
    renderTopbar();
    const toggle = screen.getByTestId('sidebar-toggle');
    expect(toggle.getAttribute('aria-controls')).toBe(SIDEBAR_ID);
    expect(toggle.getAttribute('aria-label')).toBe(EN.toggle_sidebar);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(toggle);
    expect(screen.getByTestId('sidebar-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('holds exactly the hamburger, the breadcrumbs and the account menu (D-09)', async () => {
    renderTopbar();
    await screen.findByTestId('account-menu');
    expect(screen.getByRole('navigation', { name: EN.breadcrumb_nav })).not.toBeNull();
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'));
    expect(buttons).toEqual(['sidebar-toggle', 'account-menu']);
    // No separate language button, profile menu or logout link any more.
    for (const testid of ['language-switch', 'profile-menu', 'logout']) {
      expect(screen.queryByTestId(testid)).toBeNull();
    }
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/logout'),
    ).toEqual([]);
  });

  it('carries nothing from the dropped D-06 set', async () => {
    renderTopbar();
    await screen.findByTestId('account-menu');
    for (const testid of ['global-search', 'quick-create', 'timers', 'todo', 'notifications']) {
      expect(screen.queryByTestId(testid)).toBeNull();
    }
  });

  it('uses no physical-direction class under ar', async () => {
    const { container } = renderTopbar('ar');
    await screen.findByTestId('account-menu');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
