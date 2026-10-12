// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, configure } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { useState } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_ID } from '@/components/organisms/Sidebar';
import { withAuth } from '@/hocs/withAuth';
import shellEn from '@/features/shell/messages/en.json';
import commonEn from '@/messages/common/en.json';
import { markUnreachable, resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { useBreadcrumbCrumbs, useBreadcrumbLabel } from '@/lib/hooks/use-breadcrumb-label';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { PageShell } from '../PageShell';

const COMMON = commonEn.common;
/** One crumb a page adds after its route trail (plan 04.2-28); a constant, as a page passes it. */
const PERMISSIONS_CRUMB = [{ label: 'Permissions' }] as const;
const GLOBALS_CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const renderedHeader = (): HTMLElement => {
  answerMe();
  setSession({ accessToken: 't', csrfToken: 'c' });
  const { container } = renderWithProviders(
    <PageShell>
      <p data-testid="page-content">{COMMON.retry}</p>
    </PageShell>,
  );
  const header = container.querySelector<HTMLElement>('header');
  if (header === null) throw new Error('no header');
  return header;
};

vi.mock('next/navigation', () => ({ usePathname: () => '/setup/staff' }));

const answerMe = (): void => {
  http.defaults.adapter = fakeAdapter(200, {
    staffId: 1,
    email: 'a@b.co',
    firstName: 'Example',
    lastName: 'Person',
    isAdmin: true,
    roleId: null,
    permissions: [],
    locale: null,
  }).adapter;
};

const CSRF_URL = '/api/v1/auth/csrf';
const REFRESH_URL = '/api/v1/auth/refresh';
const ME_URL = '/api/v1/auth/me';
const ADMIN_ME = {
  staffId: 1,
  email: 'a@b.co',
  firstName: 'Example',
  lastName: 'Person',
  isAdmin: true,
  roleId: null,
  permissions: [],
  locale: null,
};

/**
 * A full navigation into the shell with no in-memory token: csrf → refresh (held until `release`)
 * → /me. Records the order of every request and the /me request's headers.
 */
function routedAdapter() {
  const csrf = fakeAdapter(200, { csrfToken: 'c1' });
  const refresh = fakeAdapter(200, { accessToken: 'a1', csrfToken: 'c2' });
  const me = fakeAdapter(200, ADMIN_ME);
  const urls: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? '';
    urls.push(url);
    if (url === CSRF_URL) return csrf.adapter(config);
    if (url === REFRESH_URL) {
      await gate;
      return refresh.adapter(config);
    }
    return me.adapter(config);
  };
  return {
    adapter,
    urls,
    me,
    release: () => {
      release();
    },
  };
}

beforeEach(() => {
  clearSession();
  // The shell's bootstrap takes the no-Web-Locks path here; the lock itself is use-session's test.
  Object.defineProperty(window.navigator, 'locks', { value: undefined, configurable: true });
});

// Unmount BEFORE the session resets: Vitest runs this hook before the harness's own cleanup, and a
// still-mounted shell would see `pending` and start a bootstrap with no adapter.
afterEach(() => {
  cleanup();
  delete http.defaults.adapter;
  clearSession();
  Reflect.deleteProperty(window.navigator, 'locks');
  configure({ reactStrictMode: false });
});

describe('PageShell', () => {
  it('puts the skip link first and points it at the one main landmark', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    const focusable = container.querySelector('a, button, input, select, textarea, [tabindex]');
    expect(focusable?.getAttribute('data-testid')).toBe('skip-link');
    expect(screen.getByTestId('skip-link').getAttribute('href')).toBe('#main');
    expect(screen.getByTestId('skip-link').textContent).toBe(COMMON.skip_to_content);
  });

  it('renders exactly one <main id="main"> and the header outside it', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    const mains = container.querySelectorAll('main');
    expect(mains.length).toBe(1);
    expect(mains[0]?.getAttribute('id')).toBe('main');
    // The header is a sibling of main, never inside it: nested landmarks read as one region.
    expect(container.querySelector('main header')).toBeNull();
    expect(container.querySelector('header')).not.toBeNull();
  });

  it('the content column may shrink below its content (min-w-0) and main never scrolls sideways itself, so a wide table scrolls in its own frame and the page never does', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    const main = container.querySelector('main');
    // The column beside the sidebar is a flex item: min-width auto would size it to its widest content.
    const column = main?.parentElement;
    expect(column?.className.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'flex-col']));
    expect(main?.className.split(' ')).toContain('min-w-0');
    expect(main?.className).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it('shows the api-unreachable banner at the top of the content column, never under the sidebar (lead 2026-10-07)', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    act(() => {
      markUnreachable(null);
    });
    const banner = screen.getByTestId('api-unreachable');
    expect(banner.textContent).toBe(COMMON.api_unreachable);
    // The column beside the sidebar holds it, before the sticky header; the root copy hides itself.
    expect(banner.parentElement).toBe(container.querySelector('main')?.parentElement);
    expect(banner.nextElementSibling?.tagName).toBe('HEADER');
    expect(banner.className).not.toContain('[body:has([data-page-header])_&]:hidden');
    act(() => {
      resetApiStatus();
    });
  });

  it('renders its children inside main', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    expect(screen.getByTestId('page-content').closest('main')?.getAttribute('id')).toBe('main');
  });

  it('sets no dir attribute — direction belongs to the locale, one level up', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    expect(container.querySelector('[dir]')).toBeNull();
  });

  it('keeps the SIDEBAR_ID wrapper around the sidebar and widens it to 288 px (D-37)', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    const wrapper = container.querySelector(`#${SIDEBAR_ID}`);
    expect(wrapper?.querySelector('[data-slot="sidebar"]')).not.toBeNull();
    const provider = container.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
    expect(provider?.style.getPropertyValue('--sidebar-width')).toBe('calc(var(--spacing) * 72)');
  });

  it('is open by default on desktop', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    expect(container.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')).toBe(
      'expanded',
    );
  });

  it('defaultOpen={false} (the sidebar_state cookie) renders the sidebar closed on desktop', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell defaultOpen={false}>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    expect(sidebar?.getAttribute('data-state')).toBe('collapsed');
    expect(sidebar?.getAttribute('data-collapsible')).toBe('offcanvas');
  });

  it('puts the brand in the sidebar header, not the topbar', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    renderWithProviders(
      <PageShell brand={<span data-testid="brand-stub" />}>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
    );
    const brand = screen.getByTestId('brand-stub');
    expect(brand.closest('[data-slot="sidebar-header"]')).not.toBeNull();
    expect(brand.closest('header')).toBeNull();
  });

  it('uses no physical-direction class under ar', () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    const { container } = renderWithProviders(
      <PageShell>
        <p data-testid="page-content">{COMMON.retry}</p>
      </PageShell>,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });

  // WR-08: after a full navigation there is no in-memory token. /me asked before the refresh
  // lands is a 401 SWR never retries, and the menu stays anonymous until the window refocuses.
  it('asks /me only once the session is signed in, with the bearer, and shows gated rows (Setup -> Staff: /setup/staff opens the Setup panel, D-16)', async () => {
    const routed = routedAdapter();
    http.defaults.adapter = routed.adapter;
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <PageShell>
          <p data-testid="page-content">{COMMON.retry}</p>
        </PageShell>
      </SWRConfig>,
    );
    await waitFor(() => {
      expect(routed.urls).toContain(REFRESH_URL);
    });
    expect(routed.urls.filter((u) => u === ME_URL)).toEqual([]);
    routed.release();
    // At /setup/staff the sidebar opens the Setup panel (D-16), so the gated row awaited is Setup -> Staff.
    expect(await screen.findByTestId('nav-staff')).not.toBeNull();
    expect(routed.me.calls.length).toBe(1);
    expect(routed.me.calls[0]?.headers.authorization).toBe('Bearer a1');
  });

  it('bootstraps once for the shell and a withAuth page under StrictMode', async () => {
    const routed = routedAdapter();
    routed.release();
    http.defaults.adapter = routed.adapter;
    const Page = withAuth(
      function Page() {
        return <p data-testid="page-content">{COMMON.retry}</p>;
      },
      { skeleton: 'list' },
    );
    configure({ reactStrictMode: true });
    renderWithProviders(
      <SWRConfig value={{ provider: () => new Map() }}>
        <PageShell>
          <Page />
        </PageShell>
      </SWRConfig>,
    );
    expect(await screen.findByTestId('page-content')).not.toBeNull();
    expect(routed.urls.filter((u) => u === REFRESH_URL).length).toBe(1);
  });

  it('the header stays on screen while the page scrolls: sticky at the top, a solid background, z-20, above the content and the bottom-pinned pager, below dialogs and the drawer (UAT 3)', () => {
    const header = renderedHeader();
    expect(header.hasAttribute('data-page-header')).toBe(true);
    expect(header.className.split(' ')).toEqual(
      expect.arrayContaining(['sticky', 'top-0', 'z-20', 'bg-background']),
    );
  });

  it("the header's height is --page-header-height, defined once in globals.css and used as the shell's scroll-padding, so a focused field never hides under it", () => {
    const header = renderedHeader();
    expect(header.className.split(' ')).toContain('h-(--page-header-height)');
    expect(GLOBALS_CSS).toContain('--page-header-height: calc(3rem + 1px);');
    const block = /html:has\(\[data-page-header\]\)\s*\{([^}]*)\}/.exec(GLOBALS_CSS)?.[1] ?? '';
    expect(block).toContain('scroll-padding-top: var(--page-header-height)');
  });

  it('holds the page crumbs beside the record label; a page that sets crumbs and leaves takes them with it (plan 04.2-28)', async () => {
    answerMe();
    setSession({ accessToken: 't', csrfToken: 'c' });
    function CrumbsPage() {
      useBreadcrumbLabel(undefined);
      useBreadcrumbCrumbs(PERMISSIONS_CRUMB);
      return <p data-testid="crumbs-page">page</p>;
    }
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button
            type="button"
            data-testid="leave"
            onClick={() => {
              setShown(false);
            }}
          />
          {shown ? <CrumbsPage /> : null}
        </>
      );
    }
    renderWithProviders(
      <PageShell>
        <Host />
      </PageShell>,
    );
    const bar = () => within(screen.getByTestId('breadcrumbs'));
    expect(bar().getByText(shellEn.shell.als_staff).getAttribute('href')).toBe('/setup/staff');
    expect(bar().getByText('Permissions').getAttribute('aria-current')).toBe('page');
    await userEvent.click(screen.getByTestId('leave'));
    expect(screen.queryByText('Permissions')).toBeNull();
    expect(bar().getByText(shellEn.shell.als_staff).getAttribute('aria-current')).toBe('page');
  });
});
