// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { RowActions, type RowAction } from '../RowActions';

/**
 * UI-SPEC § Row actions (D-06, D-07, ui-kit-decisions §2). happy-dom applies no CSS, so both the
 * `md`+ buttons and the below-`md` kebab are in the DOM: each is queried inside its own test id,
 * and the breakpoint itself is the literal `hidden md:flex` / `md:hidden` pair.
 */
const COMMON = commonEn.common;
const NAME = 'Jane Doe';

const VIEW: RowAction = {
  id: 'view',
  label: 'View',
  ariaLabel: 'View Jane Doe',
  icon: 'eye',
  kind: 'main',
  href: '/setup/staff/7',
};
const edit = (onSelect = vi.fn()): RowAction => ({
  id: 'edit',
  label: 'Edit',
  ariaLabel: 'Edit Jane Doe',
  icon: 'pen-to-square',
  kind: 'neutral',
  onSelect,
});
const del = (onSelect = vi.fn()): RowAction => ({
  id: 'delete',
  label: 'Delete',
  ariaLabel: 'Delete Jane Doe',
  icon: 'trash-can',
  kind: 'destructive',
  onSelect,
});

function renderActions(actions: readonly RowAction[], locale: 'en' | 'ar' = 'en', compact = false) {
  const onRow = vi.fn();
  const view = renderWithProviders(
    // A stand-in for the list row's click handler: it must never fire from an action.
    <div data-testid="row" onClick={onRow}>
      <RowActions recordName={NAME} actions={actions} compact={compact} />
    </div>,
    { locale },
  );
  const inline = within(screen.getByTestId('row-actions-inline'));
  return { onRow, view, inline };
}

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);

describe('RowActions (UI-SPEC § Row actions)', () => {
  it('md+: the main action is a filled brand button with a visible label, named with the record (D-07)', () => {
    const { inline } = renderActions([VIEW]);
    const view = inline.getByRole('link', { name: 'View Jane Doe' });
    expect(view.textContent).toBe('View');
    expect(view.getAttribute('href')).toBe('/setup/staff/7');
    expect(view.getAttribute('data-variant')).toBe('default');
    expect(view.getAttribute('data-size')).toBe('default');
    expect(view.querySelector('[data-icon-name="eye"]')).not.toBeNull();
  });

  it('md+: neutral actions are ghost; destructive comes LAST, after a vertical separator, ghost and red with the trash icon', () => {
    renderActions([del(), edit(), VIEW]);
    const controls = [...screen.getByTestId('row-actions-inline').querySelectorAll('a, button')];
    expect(controls.map((c) => c.getAttribute('aria-label'))).toEqual([
      'View Jane Doe',
      'Edit Jane Doe',
      'Delete Jane Doe',
    ]);
    const [, editButton, deleteButton] = controls;
    expect(editButton?.getAttribute('data-variant')).toBe('ghost');
    expect(deleteButton?.getAttribute('data-variant')).toBe('ghost');
    expect(deleteButton?.className.split(' ')).toContain('text-destructive');
    expect(deleteButton?.querySelector('[data-icon-name="trash-can"]')).not.toBeNull();
    const separator = screen
      .getByTestId('row-actions-inline')
      .querySelector('[data-slot="separator"]');
    expect(separator?.getAttribute('data-orientation')).toBe('vertical');
    // The separator sits between the last neutral action and the first destructive one.
    expect(separator?.previousElementSibling).toBe(editButton);
    expect(separator?.nextElementSibling).toBe(deleteButton);
  });

  it('with no destructive action there is no separator', () => {
    renderActions([VIEW, edit()]);
    expect(
      screen.getByTestId('row-actions-inline').querySelector('[data-slot="separator"]'),
    ).toBeNull();
  });

  it('below md: one icon button named "Actions for Jane Doe" opens a menu with the same items and labels; destructive after a separator, variant destructive', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderActions([VIEW, edit(onEdit), del(onDelete)]);
    const kebab = screen.getByRole('button', {
      name: COMMON.actions_for.replace('{name}', NAME),
    });
    expect(kebab.querySelector('[data-icon-name="ellipsis-vertical"]')).not.toBeNull();
    expect(kebab.getAttribute('data-size')).toBe('icon');
    await userEvent.click(kebab);
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => [i.getAttribute('aria-label'), i.textContent])).toEqual([
      ['View Jane Doe', 'View'],
      ['Edit Jane Doe', 'Edit'],
      ['Delete Jane Doe', 'Delete'],
    ]);
    expect(items[0]?.getAttribute('href')).toBe('/setup/staff/7');
    expect(items[2]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[2]?.previousElementSibling?.getAttribute('data-slot')).toBe(
      'dropdown-menu-separator',
    );
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete Jane Doe' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('an action with onSelect calls it; a click on any action never reaches the row', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { inline, onRow } = renderActions([VIEW, edit(onEdit), del(onDelete)]);
    await userEvent.click(inline.getByRole('button', { name: 'Edit Jane Doe' }));
    await userEvent.click(inline.getByRole('button', { name: 'Delete Jane Doe' }));
    // A link click is also stopped (the row would open the same record a second time).
    inline.getByRole('link', { name: 'View Jane Doe' }).addEventListener('click', (e) => {
      e.preventDefault();
    });
    await userEvent.click(inline.getByRole('link', { name: 'View Jane Doe' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });

  it('the kebab menu is non-modal: opening it never aria-hides the page around its still-focusable trigger (axe aria-hidden-focus)', async () => {
    renderActions([VIEW, edit()]);
    const kebab = screen.getByRole('button', {
      name: COMMON.actions_for.replace('{name}', NAME),
    });
    await userEvent.click(kebab);
    await screen.findByRole('menu');
    expect(kebab.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('a click on the kebab or inside its menu never reaches the row', async () => {
    const { onRow } = renderActions([VIEW, edit()]);
    await userEvent.click(
      screen.getByRole('button', { name: COMMON.actions_for.replace('{name}', NAME) }),
    );
    const menu = await screen.findByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Edit Jane Doe' }));
    expect(onRow).not.toHaveBeenCalled();
  });

  it('the breakpoint is two literal class pairs (Tailwind sees only literal names)', () => {
    renderActions([VIEW]);
    expect(tokens(screen.getByTestId('row-actions-inline'))).toEqual(
      expect.arrayContaining(['hidden', 'md:flex']),
    );
    expect(tokens(screen.getByTestId('row-actions-menu'))).toContain('md:hidden');
    const source = readFileSync(
      join(process.cwd(), 'src/components/molecules/RowActions/RowActions.tsx'),
      'utf8',
    );
    expect(source).toContain('"hidden md:flex');
    expect(source).toContain('md:hidden');
    expect(source).not.toMatch(/`[^`]*\$\{[^}]*\}[^`]*(md|lg):/);
  });

  it('compact (the editable table, lead 2026-10-03): md+ shows only the main action, a quiet small outline button; the rest live in the "Actions for" menu at every width, destructive after a separator', async () => {
    const onDelete = vi.fn();
    const main = { ...edit(), kind: 'main' as const };
    const { inline } = renderActions([del(onDelete), main], 'en', true);
    const controls = [...screen.getByTestId('row-actions-inline').querySelectorAll('a, button')];
    expect(controls.map((c) => c.getAttribute('aria-label'))).toEqual(['Edit Jane Doe']);
    const editButton = inline.getByRole('button', { name: 'Edit Jane Doe' });
    expect(editButton.getAttribute('data-variant')).toBe('outline');
    expect(editButton.getAttribute('data-size')).toBe('sm');
    expect(inline.queryByRole('button', { name: 'Delete Jane Doe' })).toBeNull();
    // Shown at every width: no breakpoint class hides the menu at md+.
    expect(tokens(screen.getByTestId('row-actions-menu'))).not.toContain('md:hidden');
    await userEvent.click(
      screen.getByRole('button', { name: COMMON.actions_for.replace('{name}', NAME) }),
    );
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual([
      'Edit Jane Doe',
      'Delete Jane Doe',
    ]);
    expect(items[1]?.getAttribute('data-variant')).toBe('destructive');
    expect(items[1]?.previousElementSibling?.getAttribute('data-slot')).toBe(
      'dropdown-menu-separator',
    );
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete Jane Doe' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('compact with nothing beyond the main action: the menu shows below md only, and at md+ keeps its place invisible so the main action lines up with rows that have a menu (04.6-14 review)', () => {
    renderActions([{ ...edit(), kind: 'main' }], 'en', true);
    const menu = tokens(screen.getByTestId('row-actions-menu'));
    expect(menu).toContain('md:invisible');
    expect(menu).not.toContain('md:hidden');
  });

  it('uses no physical-direction class under ar', () => {
    const { view } = renderActions([VIEW, edit(), del()], 'ar');
    expect(physicalClassesIn(view.container)).toEqual([]);
  });
});
