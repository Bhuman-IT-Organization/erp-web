// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { PermissionChanges } from '../PermissionChanges';

const COMMON = commonEn.common;
const lines = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix} · r${String(i).padStart(2, '0')} · View`);

const removedBlock = () => screen.queryByTestId('permission-changes-removed');
const addedList = () => document.getElementById('pc-added');
const toggle = () => screen.queryByRole('button', { name: /^(Show|Hide) / });

describe('PermissionChanges (lead 2026-09-26: removals open, additions collapsed)', () => {
  it('removals are listed openly under "Removed", visible without any interaction', () => {
    renderWithProviders(
      <PermissionChanges
        id="pc"
        removed={['Sales · invoices · Delete']}
        added={lines('Sales', 2)}
      />,
    );
    const block = screen.getByTestId('permission-changes-removed');
    expect(within(block).getByText(COMMON.permissions_removed_heading)).toBeTruthy();
    const item = within(block).getByText('Sales · invoices · Delete');
    expect(item.closest('[hidden]')).toBeNull();
    expect(item.closest('details')).toBeNull();
  });

  it('additions sit behind a real disclosure button: hidden until clicked, aria-expanded flips, aria-controls names the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PermissionChanges id="pc" removed={[]} added={lines('Stock', 3)} />);
    const button = screen.getByRole('button', { name: 'Show 3 added' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('pc-added');
    expect(addedList()?.hidden).toBe(true);
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe(COMMON.hide_added_permissions);
    expect(addedList()?.hidden).toBe(false);
    expect([...(addedList()?.children ?? [])].map((li) => li.textContent)).toEqual(
      lines('Stock', 3),
    );
    await user.click(button);
    expect(addedList()?.hidden).toBe(true);
  });

  it('the disclosure button is 32 px (size default)', () => {
    renderWithProviders(<PermissionChanges id="pc" removed={[]} added={lines('Stock', 3)} />);
    const button = screen.getByRole('button', { name: 'Show 3 added' });
    expect(button.getAttribute('data-size')).toBe('default');
  });

  it('a block with nothing in it is absent, never empty', () => {
    renderWithProviders(<PermissionChanges id="pc" removed={[]} added={lines('Stock', 1)} />);
    expect(removedBlock()).toBeNull();
    expect(screen.getByRole('button', { name: 'Show 1 added' })).toBeTruthy();
  });

  it('with no additions there is no disclosure at all', () => {
    renderWithProviders(<PermissionChanges id="pc" removed={lines('Sales', 2)} added={[]} />);
    expect(toggle()).toBeNull();
    expect(addedList()).toBeNull();
    expect(removedBlock()?.querySelectorAll('li')).toHaveLength(2);
  });

  it('10 removals are all shown, with no "Show more" button', () => {
    renderWithProviders(<PermissionChanges id="pc" removed={lines('Sales', 10)} added={[]} />);
    const block = screen.getByTestId('permission-changes-removed');
    expect(within(block).getAllByRole('listitem')).toHaveLength(10);
    expect(within(block).queryByRole('button')).toBeNull();
  });

  it.each([
    [11, 'Show 1 more'],
    [40, 'Show 30 more'],
  ] as const)(
    '%i removals: the first 10, then a "Show N more" button that reveals EVERY other one in place (lead 2026-09-26: nothing confirmed unseen)',
    async (count, label) => {
      const user = userEvent.setup();
      const all = lines('Sales', count);
      renderWithProviders(<PermissionChanges id="pc" removed={all} added={[]} />);
      const block = screen.getByTestId('permission-changes-removed');
      const visible = () =>
        within(block)
          .getAllByRole('listitem')
          .filter((li) => li.closest('[hidden]') === null)
          .map((li) => li.textContent);
      expect(visible()).toEqual(all.slice(0, 10));
      const more = within(block).getByRole('button', { name: label });
      expect(more.getAttribute('aria-expanded')).toBe('false');
      const rest = document.getElementById(more.getAttribute('aria-controls') ?? '');
      expect(rest?.hidden).toBe(true);
      await user.click(more);
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(more.textContent).toBe(COMMON.show_fewer);
      expect(visible()).toEqual(all);
      await user.click(more);
      expect(visible()).toEqual(all.slice(0, 10));
    },
  );

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <PermissionChanges id="pc" removed={lines('Sales', 1)} added={lines('Stock', 1)} />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
