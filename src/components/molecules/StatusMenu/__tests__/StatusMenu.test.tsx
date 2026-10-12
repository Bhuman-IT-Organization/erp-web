// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { StatusBadge } from '@/components/molecules/StatusBadge';
import { StatusMenu, type StatusMenuOption } from '../StatusMenu';

/** K24 (04.7 UI-SPEC § Kit additions, § Status marks) over made-up statuses. */
const OPTIONS: readonly StatusMenuOption[] = [
  { value: 'a', label: 'Packed' },
  { value: 'b', label: 'On the road' },
  { value: 'c', label: 'Handed over' },
];
const TRIGGER = 'Change status of DN-0042';

function renderMenu(
  extra: Partial<Parameters<typeof StatusMenu>[0]> = {},
  locale: 'en' | 'ar' = 'en',
) {
  const onMark = vi.fn();
  const view = renderWithProviders(
    <StatusMenu
      status="pending"
      label="On the road"
      options={OPTIONS}
      current="b"
      onMark={onMark}
      triggerLabel={TRIGGER}
      {...extra}
    />,
    { locale },
  );
  return { onMark, view };
}

describe('StatusMenu', () => {
  it('Plain: without options it renders exactly the StatusBadge, no button', () => {
    const plain = renderWithProviders(<StatusMenu status="done" label="Handed over" />);
    const html = plain.container.innerHTML;
    plain.unmount();
    const badge = renderWithProviders(<StatusBadge status="done" label="Handed over" />);
    expect(html).toBe(badge.container.innerHTML);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('without onMark it is the plain badge too', () => {
    renderWithProviders(<StatusMenu status="done" label="Handed over" options={OPTIONS} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Handed over')).toBeTruthy();
  });

  it('WithMenu: the badge, then a 32px ghost chevron-down trigger named by triggerLabel, 4px apart', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: TRIGGER });
    expect(trigger.getAttribute('data-variant')).toBe('ghost');
    expect(trigger.className).toContain('size-8');
    expect(trigger.querySelector('[data-icon-name="chevron-down"]')).not.toBeNull();
    const row = trigger.parentElement;
    expect(row?.className).toContain('gap-1');
    expect(row?.firstElementChild?.textContent).toBe('On the road');
  });

  it('Open: the items read "Mark as" each option except the current, in order; choosing one calls onMark once and closes', async () => {
    const { onMark } = renderMenu();
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Mark as Packed',
      'Mark as Handed over',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Mark as Handed over' }));
    expect(onMark).toHaveBeenCalledTimes(1);
    expect(onMark).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('the menu is 256px wide, not the 32px trigger width the primitive defaults to (screenshot review)', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    expect(screen.getByRole('menu').className.split(/\s+/)).toContain('w-64');
  });

  it('the caption is the first row and not a menuitem', async () => {
    renderMenu({ caption: 'The customer is e-mailed about each change.' });
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    const menu = screen.getByRole('menu');
    const caption = within(menu).getByText('The customer is e-mailed about each change.');
    expect(caption.getAttribute('role')).not.toBe('menuitem');
    expect(caption.closest('[role="menuitem"]')).toBeNull();
    expect(menu.firstElementChild).toBe(caption);
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
  });

  it('Pending: the trigger is disabled, named "Changing status…", and the menu cannot open', async () => {
    renderMenu({ pending: true });
    const trigger = screen.getByRole('button', { name: 'Changing status…' });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keyboard: Enter and Space open, arrows move, Escape closes and returns focus to the trigger', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: TRIGGER });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await userEvent.keyboard(' ');
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    const first = document.activeElement;
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).not.toBe(first);
    expect(items).toContain(document.activeElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Rtl: the trigger follows the badge with no physical-direction class under ar, closed and open', async () => {
    const { view } = renderMenu({ caption: 'The customer is e-mailed about each change.' }, 'ar');
    expect(physicalClassesIn(view.container)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    expect(physicalClassesIn(screen.getByRole('menu'))).toEqual([]);
  });
});
