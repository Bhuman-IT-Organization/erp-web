'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { routeGateOf } from '@/config/route-gates';

/** What a form screen needs to ask "Discard changes?" before it is left (D-25.3). */
export interface UnsavedChangesGuard {
  /** Non-null → the screen renders `<ConfirmDialog kind="discard" open>`. */
  readonly pendingHref: string | null;
  /** "Back to list": asks when dirty, navigates at once when clean. */
  readonly requestLeave: (href: string) => void;
  /** Navigates to `pendingHref` (router.push for a Node route, location.assign otherwise), guard off first. */
  readonly confirmLeave: () => void;
  readonly cancelLeave: () => void;
}

/**
 * The in-app link a click would follow, as a same-origin relative href, or `null` when the click is
 * not ours to stop: a modifier or non-left button (a new tab or window), `target` other than
 * `_self`, `download`, another origin, a path that starts with `//`, a malformed href, or the page
 * already open (a hash link).
 */
function leavingHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target !== '' && anchor.target !== '_self') || anchor.hasAttribute('download')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(anchor.getAttribute('href') ?? '', window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // A same-origin path that begins with `//` (`/.//host`, `<origin>//host`) would read as
  // protocol-relative in location.assign, so the click is left to the browser, which follows it on
  // the origin (T-3.2-46).
  if (url.pathname.startsWith('//')) return null;
  if (url.pathname + url.search === window.location.pathname + window.location.search) return null;
  // The href is a path with one leading slash, so an intercepted link can only take the guard to a
  // page on this origin (T-3.2-46).
  return url.pathname + url.search + url.hash;
}

/**
 * The unsaved-changes guard (D-25.3). While `isDirty`:
 * - reload and tab close get the browser's own prompt through `beforeunload` (browsers allow no
 *   custom copy there);
 * - a click on an in-app `<a>` — the sidebar, breadcrumbs, row links, `next/link` and the legacy
 *   Perfex links alike — is stopped in the capture phase and becomes `pendingHref`, which the screen
 *   turns into the discard ConfirmDialog;
 * - "Back to list" calls `requestLeave`.
 *
 * On "Discard changes" the beforeunload guard is switched off first, then a Node route (one
 * `routeGateOf` knows) goes through `router.push` and anything else through `location.assign`.
 *
 * **Known limitation (D-40): browser Back is not guarded.** The App Router has no blocking
 * navigation API, and a history sentinel would fight the router, which keeps its tree in
 * `history.state` (src/README.md § The UI kit).
 */
export function useUnsavedChanges(isDirty: boolean): UnsavedChangesGuard {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Set just before the guard navigates, so its own location.assign does not prompt.
  const bypass = useRef(false);

  // effect: subscribe: beforeunload and a capture-phase click listener while the form is dirty (D-25.3); the App Router has no blocking navigation API (D-40)
  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (bypass.current) return;
      event.preventDefault();
    };
    const onClick = (event: MouseEvent): void => {
      const href = leavingHref(event);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [isDirty]);

  function navigate(href: string): void {
    bypass.current = true;
    const path = new URL(href, window.location.href).pathname;
    if (routeGateOf(path) === undefined) window.location.assign(href);
    else router.push(href);
  }

  return {
    pendingHref,
    requestLeave: (href) => {
      if (isDirty) setPendingHref(href);
      else navigate(href);
    },
    confirmLeave: () => {
      const href = pendingHref;
      setPendingHref(null);
      if (href !== null) navigate(href);
    },
    cancelLeave: () => {
      setPendingHref(null);
    },
  };
}
