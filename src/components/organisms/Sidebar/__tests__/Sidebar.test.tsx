// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { PERMISSIONS } from '@/config/permissions';
import shellEn from '@/features/shell/messages/en.json';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import { fakeAdapter } from '@/test/axios-fakes';
import { physicalClassesIn, renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { Sidebar } from '../Sidebar';

const EN = shellEn.shell;
const COMMON = commonEn.common;

/**
 * The route, as a tiny external store so a case can navigate without remounting the sidebar (the
 * real `usePathname` re-renders on navigation the same way). Each case starts at `/`, a path no
 * menu item covers, so the sidebar opens on the Main Menu; since D-16 the panel follows the route,
 * and `/setup/staff` (a Setup item) opens on the Setup panel.
 */
const route = vi.hoisted(() => {
  let current = '/';
  const listeners = new Set<() => void>();
  return {
    get: (): string => current,
    set: (next: string): void => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: (): string => useSyncExternalStore(route.subscribe, route.get, route.get),
  };
});

/** `GET /api/v1/auth/me` is the only request the sidebar makes (through usePermissions). */
function withMe(me: {
  isAdmin: boolean;
  permissions: readonly string[];
  disabledModules?: readonly string[];
}): void {
  http.defaults.adapter = fakeAdapter(200, {
    staffId: 1,
    email: 'a@b.co',
    firstName: 'Example',
    lastName: 'Person',
    isAdmin: me.isAdmin,
    roleId: null,
    permissions: [...me.permissions],
    locale: null,
    disabledModules: [...(me.disabledModules ?? [])],
  }).adapter;
}

const pendingMe: AxiosAdapter = () => new Promise(() => undefined);

/** A private SWR cache per render, as `use-permissions.test.tsx` does: no cross-test bleed. */
const renderSidebar = ({ locale, open }: { locale?: 'ar'; open?: boolean } = {}) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SidebarProvider defaultOpen={open ?? true}>
        <Sidebar />
      </SidebarProvider>
    </SWRConfig>,
    locale === undefined ? {} : { locale },
  );

const primitive = (container: HTMLElement): HTMLElement | null =>
  container.querySelector('[data-slot="sidebar"]');

const searchBox = (): HTMLElement => screen.getByRole('textbox', { name: EN.search_menu });

const detailsOf = (id: string): HTMLDetailsElement | null =>
  screen.getByTestId(`nav-${id}`).closest('details');

// `/me` is asked only once the tab's session is signed in (WR-08): seed one before each render.
beforeEach(() => {
  route.set('/');
  setSession({ accessToken: 't', csrfToken: 'c' });
});

// Unmount BEFORE the session resets (RESEARCH Pitfall 9).
afterEach(() => {
  cleanup();
  delete http.defaults.adapter;
  clearSession();
});

describe('Sidebar', () => {
  it('shows every menu item to an administrator', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderSidebar();
    // An admin short-circuits `canAny`, so a gated row appears with no code held at all.
    expect(await screen.findByTestId('nav-accounting_banking')).not.toBeNull();
    expect(screen.getByTestId('main-menu').getAttribute('aria-label')).toBe(EN.main_menu);
  });

  it('shows a member only the items whose permission they hold', async () => {
    withMe({ isAdmin: false, permissions: [PERMISSIONS.accounting.banking.view] });
    renderSidebar();
    expect(await screen.findByTestId('nav-accounting_banking')).not.toBeNull();
    // Gated on a code this member does not hold.
    expect(screen.queryByTestId('nav-accounting_registers')).toBeNull();
  });

  it('hides an admin-only row from a member who holds every code', async () => {
    withMe({ isAdmin: false, permissions: [PERMISSIONS.accounting.banking.view] });
    renderSidebar();
    await screen.findByTestId('nav-accounting_banking');
    // `face-attendance` is `adminOnly` — Perfex gates it on is_admin(), which no code expresses.
    expect(screen.queryByTestId('nav-face-attendance')).toBeNull();
  });

  // A multi-step userEvent flow: about 1 s alone, measured at up to 9.5 s under full-suite parallel
  // load (quick 260927-m8a), so it gets an explicit timeout instead of the 5 s default.
  it('opens the Setup panel as a second panel and returns to the main menu (at /, which no item covers: /setup/staff now opens on Setup, D-16)', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderSidebar();
    await screen.findByTestId('main-menu');
    const toggle = screen.getByTestId('setup-panel-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(screen.getByTestId('setup-menu').getAttribute('aria-label')).toBe(EN.setup_menu);
    expect(screen.queryByTestId('main-menu')).toBeNull();
    expect(screen.getByTestId('setup-panel-toggle').getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(screen.getByTestId('setup-panel-toggle'));
    expect(screen.getByTestId('main-menu')).not.toBeNull();
  }, 20_000);

  describe('follows the route (D-16): the panel, the open ancestors and the active item', () => {
    const toggle = (): HTMLElement => screen.getByTestId('setup-panel-toggle');

    it('opens on the Setup panel at /setup/staff with Staff marked, since Staff is a Setup item (was Main Menu first)', async () => {
      route.set('/setup/staff');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('setup-menu');
      expect(screen.queryByTestId('main-menu')).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('nav-staff').getAttribute('aria-current')).toBe('page');
    });

    it.each(['/setup/expense-categories/new', '/setup/expense-categories/12'])(
      'at %s: the Setup panel, Finance open and Expenses Categories marked',
      async (pathname) => {
        route.set(pathname);
        withMe({ isAdmin: true, permissions: [] });
        renderSidebar();
        await screen.findByTestId('setup-menu');
        expect(detailsOf('finance')?.open).toBe(true);
        expect(screen.getByTestId('nav-expenses-categories').getAttribute('aria-current')).toBe(
          'page',
        );
        // Exactly one row is marked, and no unrelated container is opened.
        expect(document.querySelectorAll('[aria-current="page"]').length).toBe(1);
        expect(detailsOf('customers')?.open ?? false).toBe(false);
      },
    );

    it('marks the covering item on a record route (/setup/staff/12 marks Staff)', async () => {
      route.set('/setup/staff/12');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('setup-menu');
      expect(screen.getByTestId('nav-staff').getAttribute('aria-current')).toBe('page');
    });

    it('the user’s panel switch wins until the route changes, then the route’s panel returns', async () => {
      route.set('/setup/staff');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('setup-menu');
      await userEvent.click(toggle());
      expect(screen.getByTestId('main-menu')).not.toBeNull();
      // A re-render on the same route (a search typed and cleared) keeps the user's choice.
      await userEvent.type(searchBox(), 'x');
      await userEvent.keyboard('{Escape}');
      expect(screen.getByTestId('main-menu')).not.toBeNull();
      act(() => {
        route.set('/setup/roles');
      });
      expect(await screen.findByTestId('setup-menu')).not.toBeNull();
      expect(screen.queryByTestId('main-menu')).toBeNull();
      expect(screen.getByTestId('nav-roles').getAttribute('aria-current')).toBe('page');
    }, 20_000);

    it('a container the user closed stays closed on the same route, though it holds the active item', async () => {
      route.set('/setup/expense-categories/new');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('setup-menu');
      expect(detailsOf('finance')?.open).toBe(true);
      await userEvent.click(screen.getByTestId('nav-finance'));
      expect(detailsOf('finance')?.open).toBe(false);
      // A re-render (a search forces it open, Esc restores) keeps the user's close.
      await userEvent.type(searchBox(), EN.acs_expense_categories);
      expect(detailsOf('finance')?.open).toBe(true);
      await userEvent.keyboard('{Escape}');
      expect(detailsOf('finance')?.open).toBe(false);
    }, 20_000);

    it('a toggle that only echoes the rendered state is not saved: the route still leads after it', async () => {
      route.set('/setup/expense-categories');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('setup-menu');
      expect(detailsOf('finance')?.open).toBe(true);
      // A browser reports React's own open after the commit, as a toggle with the state unchanged.
      act(() => {
        detailsOf('finance')?.dispatchEvent(new Event('toggle'));
      });
      act(() => {
        route.set('/setup/staff');
      });
      await screen.findByTestId('setup-menu');
      expect(detailsOf('finance')?.open).toBe(false);
    });

    it('at /setup/cost-centers/new an administrator sees the Main Menu, no Setup panel, with Cost Centers marked (D-25: its page is under /setup, its item is not)', async () => {
      route.set('/setup/cost-centers/new');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('main-menu');
      expect(screen.queryByTestId('setup-menu')).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(screen.getByTestId('nav-cost-centers').getAttribute('aria-current')).toBe('page');
      expect(document.querySelectorAll('[aria-current="page"]').length).toBe(1);
    });

    it('a non-administrator does not see Cost Centers, on its own route either (the gate from ROUTE_GATES)', async () => {
      route.set('/setup/cost-centers/new');
      withMe({ isAdmin: false, permissions: [PERMISSIONS.accounting.banking.view] });
      renderSidebar();
      await screen.findByTestId('main-menu');
      expect(screen.queryByTestId('nav-cost-centers')).toBeNull();
      expect(screen.queryByTestId('setup-menu')).toBeNull();
    });

    it('stays on the Main Menu when the member cannot see the covering item', async () => {
      route.set('/setup/staff');
      withMe({ isAdmin: false, permissions: [PERMISSIONS.accounting.banking.view] });
      renderSidebar();
      await screen.findByTestId('main-menu');
      expect(screen.queryByTestId('setup-menu')).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('renders a legacy item with its external glyph', async () => {
    withMe({ isAdmin: true, permissions: [] });
    const { container } = renderSidebar();
    await screen.findByTestId('main-menu');
    expect(container.querySelector('[data-icon-name="external-link"]')).not.toBeNull();
  });

  it('is offcanvas, never an icon rail (D-10)', async () => {
    withMe({ isAdmin: true, permissions: [] });
    const { container } = renderSidebar({ open: false });
    await screen.findByTestId('main-menu');
    // The primitive writes its `collapsible` mode only while collapsed.
    expect(primitive(container)?.getAttribute('data-collapsible')).toBe('offcanvas');
    expect(container.querySelector('[data-collapsible="icon"]')).toBeNull();
  });

  it('docks on the left under en (inline start)', async () => {
    withMe({ isAdmin: true, permissions: [] });
    const { container } = renderSidebar();
    await screen.findByTestId('main-menu');
    expect(primitive(container)?.getAttribute('data-side')).toBe('left');
  });

  it('docks on the right under ar (inline start, UI-SPEC choice 31)', async () => {
    withMe({ isAdmin: true, permissions: [] });
    const { container } = renderSidebar({ locale: 'ar' });
    await screen.findByTestId('main-menu');
    expect(primitive(container)?.getAttribute('data-side')).toBe('right');
  });

  it('search covers both panels: a Setup match shows under the Setup Menu label (D-38)', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderSidebar();
    await screen.findByTestId('main-menu');
    await userEvent.type(searchBox(), 'staff');
    // The panel is still `main`, yet Setup → Staff is found, under its own group label.
    const setup = screen.getByTestId('setup-menu');
    expect(setup.textContent).toContain(EN.setup_menu);
    expect(screen.getByTestId('nav-staff')).not.toBeNull();
    expect(setup.contains(screen.getByTestId('nav-staff'))).toBe(true);
  });

  it('search shows matches from both panels and opens the parent of a matching child', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderSidebar();
    await screen.findByTestId('main-menu');
    await userEvent.type(searchBox(), 'setting');
    expect(
      screen.getByTestId('main-menu').contains(screen.getByTestId('nav-accounting_setting')),
    ).toBe(true);
    expect(screen.getByTestId('setup-menu').contains(screen.getByTestId('nav-settings'))).toBe(
      true,
    );
    // A matching child forces its container open.
    expect(detailsOf('accounting')?.open).toBe(true);
    // A non-matching sibling is filtered out.
    expect(screen.queryByTestId('nav-accounting_banking')).toBeNull();
  });

  it('search never reveals a gated item: the gate filters before matching (T-3.2-28)', async () => {
    withMe({ isAdmin: false, permissions: [PERMISSIONS.accounting.banking.view] });
    renderSidebar();
    await screen.findByTestId('nav-accounting_banking');
    await userEvent.type(searchBox(), EN.registers);
    expect(screen.queryByTestId('nav-accounting_registers')).toBeNull();
    expect(screen.getByTestId('menu-no-match').textContent).toBe(
      EN.no_menu_match.replace('{query}', EN.registers),
    );
  });

  it('no match shows the line with the query and a Clear search button that restores the menu', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderSidebar();
    await screen.findByTestId('main-menu');
    await userEvent.type(searchBox(), 'zzqx');
    expect(screen.getByTestId('menu-no-match').textContent).toBe(
      EN.no_menu_match.replace('{query}', 'zzqx'),
    );
    expect(screen.queryByTestId('nav-dashboard')).toBeNull();
    const clear = screen.getByTestId('menu-no-match-clear');
    expect(clear.textContent).toBe(COMMON.clear_search);
    await userEvent.click(clear);
    expect((searchBox() as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('nav-dashboard')).not.toBeNull();
    expect(screen.queryByTestId('menu-no-match')).toBeNull();
  });

  it('Esc clears the box and restores each container’s prior open or closed state', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderSidebar();
    await screen.findByTestId('main-menu');
    // Open one container by hand; leave accounting closed.
    await userEvent.click(screen.getByTestId('nav-manufacturing'));
    expect(detailsOf('manufacturing')?.open).toBe(true);
    expect(detailsOf('accounting')?.open).toBe(false);
    await userEvent.type(searchBox(), EN.banking);
    expect(detailsOf('accounting')?.open).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect((searchBox() as HTMLInputElement).value).toBe('');
    expect(detailsOf('accounting')?.open).toBe(false);
    expect(detailsOf('manufacturing')?.open).toBe(true);
  });

  it('announces the result count in a polite live region', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderSidebar();
    await screen.findByTestId('main-menu');
    await userEvent.type(searchBox(), 'staff');
    const live = screen.getByTestId('menu-result-count');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe(EN.menu_result_count.replace('{count}', '1'));
  });

  it('while permissions load: a 10-row skeleton under role=status, and no menu item and no message (D-39)', () => {
    http.defaults.adapter = pendingMe;
    renderSidebar();
    const loading = screen.getByTestId('sidebar-loading');
    expect(loading.getAttribute('role')).toBe('status');
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.textContent).toContain(COMMON.loading);
    expect(screen.getAllByTestId('sidebar-skeleton-row').length).toBe(10);
    expect(screen.queryByTestId('main-menu')).toBeNull();
    expect(screen.queryByTestId('nav-dashboard')).toBeNull();
    expect(screen.queryByTestId('menu-no-match')).toBeNull();
  });

  it('renders the brand in the header', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <SidebarProvider>
          <Sidebar brand={<span data-testid="brand-stub" />} />
        </SidebarProvider>
      </SWRConfig>,
    );
    await screen.findByTestId('main-menu');
    expect(screen.getByTestId('brand-stub').closest('[data-slot="sidebar-header"]')).not.toBeNull();
  });

  it('never stretches the brand: the header sizes its child by height and keeps its natural aspect ratio (lead 2026-09-26)', async () => {
    withMe({ isAdmin: true, permissions: [] });
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <SidebarProvider>
          <Sidebar brand={<span data-testid="brand-stub" />} />
        </SidebarProvider>
      </SWRConfig>,
    );
    await screen.findByTestId('main-menu');
    // The header is a flex column, which stretches a child to its full width whatever the logo's
    // shape; these pin the child to 32 px high, its own width (capped at the header), contained
    // and start-aligned — for a wide, square or tall logo alike (multibrand). Chrome measures it.
    const header = screen.getByTestId('brand-stub').parentElement;
    expect(header?.getAttribute('data-slot')).toBe('sidebar-header');
    expect(header?.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        '[&>*]:h-8',
        '[&>*]:w-auto',
        '[&>*]:max-w-full',
        '[&>*]:object-contain',
        '[&>*]:self-start',
      ]),
    );
  });

  describe('in the mobile drawer (below md, 375 px)', () => {
    interface HappyWindow {
      happyDOM: { setViewport: (v: { width: number; height: number }) => void };
    }
    const setWidth = (width: number): void => {
      (window as unknown as HappyWindow).happyDOM.setViewport({ width, height: 740 });
    };
    beforeEach(() => {
      setWidth(375);
    });
    afterEach(() => {
      setWidth(1024);
    });

    const drawer = (): Element | null => document.querySelector('[data-mobile="true"]');

    async function openDrawer(): Promise<void> {
      withMe({ isAdmin: true, permissions: [] });
      renderWithProviders(
        <SWRConfig value={{ provider: () => new Map() }}>
          <SidebarProvider>
            <SidebarTrigger />
            <Sidebar />
          </SidebarProvider>
        </SWRConfig>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
      await screen.findByTestId('main-menu');
      expect(drawer()).not.toBeNull();
    }

    it('the first Esc clears a non-empty search and keeps the drawer open; the next Esc closes it (lead 2026-09-26)', async () => {
      await openDrawer();
      await userEvent.type(searchBox(), 'staff');
      await userEvent.keyboard('{Escape}');
      expect((searchBox() as HTMLInputElement).value).toBe('');
      expect(drawer()).not.toBeNull();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => {
        expect(drawer()).toBeNull();
      });
    });

    it('Esc on an empty search closes the drawer at once', async () => {
      await openDrawer();
      await userEvent.click(searchBox());
      await userEvent.keyboard('{Escape}');
      await waitFor(() => {
        expect(drawer()).toBeNull();
      });
    });
  });

  it('uses no physical-direction class under ar', async () => {
    withMe({ isAdmin: true, permissions: [] });
    const { container } = renderSidebar({ locale: 'ar' });
    await screen.findByTestId('main-menu');
    await userEvent.type(searchBox(), 'a');
    expect(physicalClassesIn(container)).toEqual([]);
  });

  describe('keeps the marked row in view (UAT 4.2 gap 3)', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    let scroll = vi.fn();
    beforeEach(() => {
      scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
    });
    afterEach(() => {
      if (original !== undefined)
        Object.defineProperty(Element.prototype, 'scrollIntoView', original);
    });
    const scrolledRows = (): unknown[] => scroll.mock.contexts;

    it('after a navigation the newly marked row scrolls into view, on the Setup panel too', async () => {
      route.set('/setup/cost-centers');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('main-menu');
      scroll.mockClear();
      act(() => {
        route.set('/setup/expense-categories/12');
      });
      await screen.findByTestId('setup-menu');
      expect(scrolledRows()).toEqual([screen.getByTestId('nav-expenses-categories')]);
    });

    it('while searching no row scrolls: a search shows matches, not the route', async () => {
      route.set('/setup/cost-centers');
      withMe({ isAdmin: true, permissions: [] });
      renderSidebar();
      await screen.findByTestId('main-menu');
      scroll.mockClear();
      await userEvent.type(searchBox(), 'items');
      expect(scroll).not.toHaveBeenCalled();
    });
  });
});
