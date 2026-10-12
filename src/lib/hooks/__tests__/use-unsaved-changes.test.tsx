// @vitest-environment happy-dom
/* eslint-disable @next/next/no-html-link-for-pages -- the guard must catch a raw <a>: next/link renders one, and legacy Perfex links are one */
import { act, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { useUnsavedChanges } from '../use-unsaved-changes';

const { push } = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/setup/staff/12',
}));

/** A dirty-able record screen: links the shell and the page render, and the guard's outputs. */
function RecordScreen({ dirty }: { readonly dirty: boolean }): ReactElement {
  const guard = useUnsavedChanges(dirty);
  return (
    <>
      <a href="/setup/roles">roles</a>
      <a href="/admin/leads">legacy</a>
      <a href="/setup/roles" target="_blank" rel="noreferrer">
        new tab
      </a>
      <a href="/setup/roles" download>
        download
      </a>
      <a href="https://example.com/roles">external</a>
      <a href="/setup/staff/12">self</a>
      <a href="#photo">hash</a>
      <a href="http://[bad">malformed</a>
      <a href="/setup/staff/12?tab=2">
        <span>nested</span>
      </a>
      <a href="/.//evil.example">dot-slash</a>
      <a href={`${window.location.origin}//evil.example`}>origin double slash</a>
      <a href={`${window.location.origin}/setup/roles?tab=2#top`}>absolute same origin</a>
      <output data-testid="pending">{guard.pendingHref ?? 'none'}</output>
      <button
        type="button"
        onClick={() => {
          guard.requestLeave('/setup/staff?page=x');
        }}
      >
        back to list
      </button>
      <button type="button" onClick={guard.confirmLeave}>
        discard
      </button>
      <button type="button" onClick={guard.cancelLeave}>
        keep
      </button>
    </>
  );
}

/**
 * Dispatches a click and reports whether the page saw it. The guard stops an intercepted click in
 * the capture phase, so a bubble listener on `document` that runs means the click passed; it then
 * cancels the default itself, because happy-dom would otherwise follow the link.
 */
function clickLink(text: string, init: MouseEventInit = {}): 'intercepted' | 'passed' {
  const seen = { passed: false };
  const page = (event: Event) => {
    seen.passed = !event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener('click', page);
  const link = screen.getByText(text);
  // The guard sets state from a native listener: flush it as a real click would.
  act(() => {
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
    );
  });
  document.removeEventListener('click', page);
  return seen.passed ? 'passed' : 'intercepted';
}

function beforeUnloadPrevented(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const pending = (): string | null => screen.getByTestId('pending').textContent;

let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;

beforeEach(() => {
  window.history.replaceState(null, '', '/setup/staff/12');
  push.mockReset();
  assign = vi.fn<(url: string | URL) => void>();
  vi.spyOn(window.location, 'assign').mockImplementation(assign);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUnsavedChanges (D-25.3, D-40)', () => {
  it('clean: an in-app link navigates normally and no beforeunload prompt is armed', () => {
    renderWithProviders(<RecordScreen dirty={false} />);
    expect(clickLink('roles')).toBe('passed');
    expect(beforeUnloadPrevented()).toBe(false);
    expect(pending()).toBe('none');
  });

  it('dirty: reload and tab close get the browser prompt (beforeunload is default-prevented)', () => {
    renderWithProviders(<RecordScreen dirty />);
    expect(beforeUnloadPrevented()).toBe(true);
  });

  it('dirty: a Node link and a legacy link are stopped and become pendingHref', () => {
    renderWithProviders(<RecordScreen dirty />);
    expect(clickLink('roles')).toBe('intercepted');
    expect(pending()).toBe('/setup/roles');
    expect(clickLink('legacy')).toBe('intercepted');
    expect(pending()).toBe('/admin/leads');
    // A click on an element INSIDE the link is still the link (sidebar rows wrap icon and text).
    expect(clickLink('nested')).toBe('intercepted');
    expect(pending()).toBe('/setup/staff/12?tab=2');
    expect(push).not.toHaveBeenCalled();
  });

  it('dirty: modifier clicks, a middle click, target=_blank, download, another origin, the current page and a malformed href are NOT intercepted', () => {
    renderWithProviders(<RecordScreen dirty />);
    expect(clickLink('roles', { ctrlKey: true })).toBe('passed');
    expect(clickLink('roles', { metaKey: true })).toBe('passed');
    expect(clickLink('roles', { shiftKey: true })).toBe('passed');
    expect(clickLink('roles', { button: 1 })).toBe('passed');
    expect(clickLink('new tab')).toBe('passed');
    expect(clickLink('download')).toBe('passed');
    expect(clickLink('external')).toBe('passed');
    expect(clickLink('self')).toBe('passed');
    expect(clickLink('hash')).toBe('passed');
    expect(clickLink('malformed')).toBe('passed');
    expect(pending()).toBe('none');
  });

  it('dirty: a same-origin href whose path would start with // is NOT intercepted, so nothing protocol-relative reaches location.assign (T-3.2-46)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecordScreen dirty />);
    expect(clickLink('dot-slash')).toBe('passed');
    expect(clickLink('origin double slash')).toBe('passed');
    expect(pending()).toBe('none');
    await user.click(screen.getByRole('button', { name: 'discard' }));
    expect(assign).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('dirty: an absolute same-origin href is still intercepted as its relative path (T-3.2-46)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecordScreen dirty />);
    expect(clickLink('absolute same origin')).toBe('intercepted');
    expect(pending()).toBe('/setup/roles?tab=2#top');
    await user.click(screen.getByRole('button', { name: 'discard' }));
    expect(push).toHaveBeenCalledExactlyOnceWith('/setup/roles?tab=2#top');
    expect(assign).not.toHaveBeenCalled();
  });

  it('confirmLeave: a Node route goes through router.push, with the beforeunload guard already off', async () => {
    const user = userEvent.setup();
    let promptedDuringPush: boolean | null = null;
    push.mockImplementation(() => {
      promptedDuringPush = beforeUnloadPrevented();
    });
    renderWithProviders(<RecordScreen dirty />);
    clickLink('roles');
    await user.click(screen.getByRole('button', { name: 'discard' }));
    expect(push).toHaveBeenCalledExactlyOnceWith('/setup/roles');
    expect(assign).not.toHaveBeenCalled();
    expect(promptedDuringPush).toBe(false);
    expect(pending()).toBe('none');
  });

  it('confirmLeave: a legacy path goes through location.assign, with the beforeunload guard already off', async () => {
    const user = userEvent.setup();
    let promptedDuringAssign: boolean | null = null;
    assign.mockImplementation(() => {
      promptedDuringAssign = beforeUnloadPrevented();
    });
    renderWithProviders(<RecordScreen dirty />);
    clickLink('legacy');
    await user.click(screen.getByRole('button', { name: 'discard' }));
    expect(assign).toHaveBeenCalledExactlyOnceWith('/admin/leads');
    expect(push).not.toHaveBeenCalled();
    expect(promptedDuringAssign).toBe(false);
  });

  it('cancelLeave clears pendingHref and navigates nowhere', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecordScreen dirty />);
    clickLink('roles');
    await user.click(screen.getByRole('button', { name: 'keep' }));
    expect(pending()).toBe('none');
    expect(push).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(beforeUnloadPrevented()).toBe(true);
  });

  it('requestLeave ("Back to list"): clean navigates at once; dirty asks first', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<RecordScreen dirty={false} />);
    await user.click(screen.getByRole('button', { name: 'back to list' }));
    expect(push).toHaveBeenCalledExactlyOnceWith('/setup/staff?page=x');
    push.mockReset();
    rerender(<RecordScreen dirty />);
    await user.click(screen.getByRole('button', { name: 'back to list' }));
    expect(push).not.toHaveBeenCalled();
    expect(pending()).toBe('/setup/staff?page=x');
  });

  it('unmount removes both listeners', () => {
    const { unmount } = renderWithProviders(<RecordScreen dirty />);
    const link = screen.getByText('roles');
    unmount();
    document.body.append(link);
    expect(beforeUnloadPrevented()).toBe(false);
    expect(clickLink('roles')).toBe('passed');
    link.remove();
  });
});
