import { useEffect } from 'react';
import {
  ensureLegacySession,
  isLegacySessionOpen,
  isNodePage,
  type LegacyOpener,
} from '@/lib/auth/legacy-session';

const BUSY = 'aria-busy';

/** The default follow: a full navigation, as a plain `<a>` into Perfex does. */
function assign(href: string): void {
  window.location.assign(href);
}

/** A plain primary click nobody handled yet: a modified one opens a new tab or window. */
function isPlainClick(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

/** The plain same-tab `<a>` this click would follow, or null when the browser must handle it. */
function followedAnchor(event: MouseEvent): HTMLAnchorElement | null {
  if (!isPlainClick(event)) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute('download') || !['', '_self'].includes(anchor.target)) return null;
  return anchor;
}

/** A same-origin anchor into a page Perfex serves. */
function isPerfexLink(anchor: HTMLAnchorElement): boolean {
  const url = new URL(anchor.href);
  return url.origin === window.location.origin && !isNodePage(url.pathname);
}

/**
 * Every link into Perfex, wherever it is rendered (the kit's `LegacyLink`, a `legacy: true` nav row,
 * `TabLinks`, a feature's own `<a>`), waits for the tab's legacy session before the browser leaves
 * (quick 261009-lgn): one click listener on the window, mounted once by the shell, so no component
 * opts in. When the session is known open the click is left to the browser untouched; otherwise the
 * link is held (`aria-busy`, a second click swallowed), the shared handoff flight is awaited or rerun
 * (`ensureLegacySession`), and the page navigates either way: a session that still failed to open
 * sends the member through Perfex's own login redirect to `/login`, which resumes (ADR-0038).
 *
 * The listener is on the window, in the bubble phase, so it runs after React and `next/link`: a click
 * a component already handled (`defaultPrevented`) is never touched, nor is a modified click, a
 * `target`ed or `download` link, another origin, or a Node page.
 */
export function useLegacyLinkGuard(open: LegacyOpener, navigate = assign): void {
  // effect: subscribe: the one window click listener that holds a Perfex link until the session opens
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const anchor = followedAnchor(event);
      if (anchor === null || !isPerfexLink(anchor)) return;
      if (anchor.getAttribute(BUSY) !== 'true' && isLegacySessionOpen()) return;
      event.preventDefault();
      if (anchor.getAttribute(BUSY) === 'true') return;
      anchor.setAttribute(BUSY, 'true');
      void ensureLegacySession(open).then(() => {
        anchor.removeAttribute(BUSY);
        navigate(anchor.href);
      });
    };
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('click', onClick);
    };
  }, [open, navigate]);
}
