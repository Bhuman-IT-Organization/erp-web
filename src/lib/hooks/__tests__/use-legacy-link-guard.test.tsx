// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetLegacySession,
  LEGACY_OPENED_KEY,
  openLegacySession,
} from '@/lib/auth/legacy-session';
import { clearSession, setSession } from '@/lib/auth/session';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useLegacyLinkGuard } from '../use-legacy-link-guard';

type Opener = (token: string) => Promise<boolean>;

function Page({
  open,
  navigate,
}: {
  open: Opener;
  navigate?: (href: string) => void;
}): ReactElement {
  useLegacyLinkGuard(open, navigate);
  return (
    <div>
      <a href="/admin/invoices">
        <span>perfex</span>
      </a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the guard's subject: a plain anchor to a Node page is left to the browser */}
      <a href="/setup/staff">node</a>
      <a href="/admin/new-tab" target="_blank">
        blank
      </a>
      <a href="/admin/file.pdf" download>
        download
      </a>
      <a href="https://other.example/admin/">other</a>
    </div>
  );
}

/** The browser's own follow, after every listener: records whether the guard took the click. */
const followed = vi.fn();
const onWindowClick = (event: MouseEvent): void => {
  followed(event.defaultPrevented);
  event.preventDefault();
};

function deferred() {
  let settle: (opened: boolean) => void = () => undefined;
  const open = vi.fn<(token: string) => Promise<boolean>>(
    () =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      }),
  );
  return {
    open,
    settle: (opened: boolean) => {
      settle(opened);
    },
  };
}

beforeEach(() => {
  forgetLegacySession();
  clearSession();
  window.sessionStorage.clear();
  followed.mockClear();
});
afterEach(() => {
  window.removeEventListener('click', onWindowClick);
});

/** Renders the page, then installs the "browser follow" listener so it runs after the guard's. */
function renderPage(open: Opener, navigate = vi.fn()) {
  const view = renderWithProviders(<Page open={open} navigate={navigate} />);
  window.addEventListener('click', onWindowClick);
  return { ...view, navigate };
}

const link = (name: string): HTMLElement => screen.getByText(name).closest('a') as HTMLElement;

describe('useLegacyLinkGuard', () => {
  it('a Perfex link while the handoff is pending: held (aria-busy), the shared flight awaited, then a full navigation', async () => {
    const h = deferred();
    void openLegacySession('t', h.open);
    const { navigate } = renderPage(h.open);
    await userEvent.click(screen.getByText('perfex'));
    expect(followed).toHaveBeenCalledWith(true);
    expect(link('perfex').getAttribute('aria-busy')).toBe('true');
    expect(navigate).not.toHaveBeenCalled();
    h.settle(true);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/invoices`);
    });
    expect(link('perfex').getAttribute('aria-busy')).toBeNull();
    expect(h.open).toHaveBeenCalledTimes(1);
  });

  it('a second click on a held link is swallowed: one navigation', async () => {
    const h = deferred();
    void openLegacySession('t', h.open);
    const { navigate } = renderPage(h.open);
    await userEvent.click(screen.getByText('perfex'));
    await userEvent.click(screen.getByText('perfex'));
    h.settle(true);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });

  it('never ran (a reload): hands off with the session token first, then navigates', async () => {
    setSession({ accessToken: 'live', csrfToken: 'c' });
    const open = vi.fn(() => Promise.resolve(true));
    const { navigate } = renderPage(open);
    await userEvent.click(screen.getByText('perfex'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    expect(open).toHaveBeenCalledWith('live');
  });

  it('the handoff fails again: navigates anyway (Perfex sends the member to /login, which resumes)', async () => {
    setSession({ accessToken: 'live', csrfToken: 'c' });
    const { navigate } = renderPage(() => Promise.resolve(false));
    await userEvent.click(screen.getByText('perfex'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/admin/invoices`);
    });
  });

  it('the session is open: the browser follows the link itself, no handoff', async () => {
    window.sessionStorage.setItem(LEGACY_OPENED_KEY, '1');
    const open = vi.fn(() => Promise.resolve(true));
    const { navigate } = renderPage(open);
    await userEvent.click(screen.getByText('perfex'));
    expect(followed).toHaveBeenCalledWith(false);
    expect(open).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['node', 'blank', 'download', 'other'])(
    'the %s link is never held, even with no session open',
    async (name) => {
      const open = vi.fn(() => Promise.resolve(true));
      const { navigate } = renderPage(open);
      await userEvent.click(screen.getByText(name));
      expect(followed).toHaveBeenCalledWith(false);
      expect(open).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('a modified click (new tab) and a click outside any link, or on no element, are left alone', async () => {
    const open = vi.fn(() => Promise.resolve(true));
    const { navigate } = renderPage(open);
    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('perfex'));
    await user.keyboard('{/Control}');
    await user.click(document.body);
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(followed).toHaveBeenNthCalledWith(1, false);
    expect(followed).toHaveBeenNthCalledWith(2, false);
    expect(followed).toHaveBeenNthCalledWith(3, false);
    expect(open).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a click another handler already took is left alone', async () => {
    const open = vi.fn(() => Promise.resolve(true));
    const { navigate } = renderPage(open);
    link('perfex').addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(screen.getByText('perfex'));
    expect(open).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('by default the held link follows with a full navigation', async () => {
    setSession({ accessToken: 'live', csrfToken: 'c' });
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
    renderWithProviders(<Page open={() => Promise.resolve(true)} />);
    window.addEventListener('click', onWindowClick);
    await userEvent.click(screen.getByText('perfex'));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(`${window.location.origin}/admin/invoices`);
    });
    assign.mockRestore();
  });

  it('unmount removes the window listener', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderPage(vi.fn(() => Promise.resolve(true)));
    unmount();
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function));
  });
});
