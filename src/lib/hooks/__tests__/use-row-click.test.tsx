// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRowClick } from '../use-row-click';

/**
 * UI-SPEC § Table: the whole row opens the record, but the `<tr>` is not a control (jsx-a11y); a
 * native `<tbody>` listener clicks the row's `a[data-row-link]`. It fires BEFORE React's root
 * listener, so a React `stopPropagation` in `RowActions` cannot stop it: the listener itself skips
 * a click that landed on a control or inside `[data-row-ignore]`.
 */
afterEach(cleanup);

const opened = vi.fn<(href: string | null) => void>();

function Table() {
  const tbody = useRef<HTMLTableSectionElement>(null);
  useRowClick(tbody);
  return (
    <table>
      <tbody ref={tbody}>
        <tr>
          <td>
            <Link
              href="/setup/staff/1"
              data-row-link=""
              onClick={(event) => {
                event.preventDefault();
                opened(event.currentTarget.getAttribute('href'));
              }}
            >
              Ada
            </Link>
          </td>
          <td data-testid="plain-cell">ada@example.invalid</td>
          <td>
            <button type="button">Enlarge photo of Ada</button>
          </td>
          <td>
            <Link
              href="/elsewhere"
              onClick={(event) => {
                event.preventDefault();
              }}
            >
              Other link
            </Link>
          </td>
          <td>
            <input aria-label="Note" />
            <label htmlFor="x" data-testid="label">
              Label
            </label>
          </td>
          <td data-row-ignore="" data-testid="ignored-cell">
            <span data-testid="ignored-inner">between the actions</span>
          </td>
        </tr>
        <tr>
          <td>
            <Link
              href="/setup/staff/2"
              data-row-link=""
              onClick={(event) => {
                event.preventDefault();
                opened(event.currentTarget.getAttribute('href'));
              }}
            >
              Grace
            </Link>
          </td>
          <td data-testid="second-plain-cell">grace@example.invalid</td>
        </tr>
      </tbody>
    </table>
  );
}

describe('useRowClick (UI-SPEC § Table: the row delegates to its primary link)', () => {
  it("a click on a plain cell clicks THAT row's link", () => {
    opened.mockClear();
    render(<Table />);
    fireEvent.click(screen.getByTestId('plain-cell'));
    expect(opened.mock.calls).toEqual([['/setup/staff/1']]);
    fireEvent.click(screen.getByTestId('second-plain-cell'));
    expect(opened.mock.calls).toEqual([['/setup/staff/1'], ['/setup/staff/2']]);
  });

  it('a click on the primary link itself is the link, clicked once (never twice)', () => {
    opened.mockClear();
    render(<Table />);
    fireEvent.click(screen.getByRole('link', { name: 'Ada' }));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'a button (the thumbnail)',
      () => screen.getByRole('button', { name: 'Enlarge photo of Ada' }),
    ],
    ['another link', () => screen.getByRole('link', { name: 'Other link' })],
    ['an input', () => screen.getByRole('textbox', { name: 'Note' })],
    ['a label', () => screen.getByTestId('label')],
    ['an element inside [data-row-ignore]', () => screen.getByTestId('ignored-inner')],
    ['the [data-row-ignore] element itself', () => screen.getByTestId('ignored-cell')],
  ])('a click on %s does not open the row', (_what, target) => {
    opened.mockClear();
    render(<Table />);
    fireEvent.click(target());
    expect(opened).not.toHaveBeenCalled();
  });

  it('unmount removes the listener', () => {
    // After unmount React no longer runs the link's onClick, so watch the native click instead.
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const { unmount } = render(<Table />);
    const cell = screen.getByTestId('plain-cell');
    const tbody = cell.closest('tbody');
    fireEvent.click(cell);
    expect(linkClick).toHaveBeenCalledTimes(1);
    unmount();
    // Re-attach the detached tbody so a click can reach it: nothing may answer any more.
    if (tbody !== null) document.body.append(tbody);
    fireEvent.click(cell);
    expect(linkClick).toHaveBeenCalledTimes(1);
    tbody?.remove();
    linkClick.mockRestore();
  });
});
