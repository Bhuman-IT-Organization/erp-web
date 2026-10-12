// @vitest-environment happy-dom
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import {
  permissionSetDiff,
  PermissionPicker,
  type PermissionModule,
  type PermissionPickerLabels,
  type PermissionPickerProps,
} from '../PermissionPicker';

/** A neutral catalogue shaped like the staff feature's grouping (module → feature → capability). */
const CATALOGUE: readonly PermissionModule[] = [
  {
    id: 'sales',
    label: 'Sales',
    features: [
      {
        id: 'sales.invoices',
        label: 'Invoices',
        capabilities: [
          { code: 'sales.invoices.view', action: 'view', label: 'View' },
          { code: 'sales.invoices.create', action: 'create', label: 'Create' },
          { code: 'sales.invoices.delete', action: 'delete', label: 'Delete' },
        ],
      },
      {
        id: 'sales.estimates',
        label: 'Estimates',
        capabilities: [
          { code: 'sales.estimates.view', action: 'view', label: 'View' },
          { code: 'sales.estimates.edit', action: 'edit', label: 'Edit' },
        ],
      },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    features: [
      {
        id: 'stock.items',
        label: 'Items',
        capabilities: [
          { code: 'stock.items.view', action: 'view', label: 'View' },
          { code: 'stock.items.create', action: 'create', label: 'Create' },
        ],
      },
    ],
  },
  {
    id: 'orders',
    label: 'المَبيعات',
    features: [
      {
        id: 'orders.orders',
        label: 'الطلبات',
        capabilities: [{ code: 'orders.orders.view', action: 'view', label: 'عرض' }],
      },
    ],
  },
];

const LABELS: PermissionPickerLabels = {
  summary: (count, modules) =>
    `Employee grants ${String(count)} permissions in ${String(modules)} modules`,
  moduleCount: (granted, total) => `${String(granted)} of ${String(total)} granted`,
  customise: 'Customise these permissions',
  search: 'Search permissions',
  runningTotal: (count) => `${String(count)} permissions granted`,
  selectAllIn: (module) => `Select all in ${module}`,
  resetToRole: 'Reset to role',
  behindRole: (missing, extra) =>
    `Jane Doe is missing ${String(missing)} and has ${String(extra)} outside the Employee role.`,
  reapplyRole: 'Re-apply role',
  readOnlyNotice: 'Only an administrator can change roles and permissions.',
  featureColumn: 'Feature',
};

const GRANTED = ['sales.invoices.view', 'sales.invoices.create'];

function picker(extra: Partial<PermissionPickerProps> = {}): PermissionPickerProps {
  return {
    id: 'member-permissions',
    catalogue: CATALOGUE,
    value: GRANTED,
    onChange: vi.fn(),
    initialMode: 'edit',
    labels: LABELS,
    ...extra,
  };
}

/** A screen that owns the value, so a search or a toggle can be followed through re-renders. */
function Host(props: Partial<PermissionPickerProps>): ReactElement {
  const [value, setValue] = useState<readonly string[]>(props.value ?? GRANTED);
  return <PermissionPicker {...picker(props)} value={value} onChange={setValue} />;
}

const trigger = (name: RegExp): HTMLElement => screen.getByRole('button', { name });
const expanded = (name: RegExp): string | null => trigger(name).getAttribute('aria-expanded');

describe('PermissionPicker (ui-kit-decisions §1, UAT 12)', () => {
  it('summary: the role summary line, a collapsed accordion with "{granted} of {total}", no checkbox, and Customise switches to edit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PermissionPicker {...picker({ initialMode: 'summary' })} />);
    expect(screen.getByText(LABELS.summary(2, 1))).toBeDefined();
    expect(expanded(/^Sales/)).toBe('false');
    expect(expanded(/^Stock/)).toBe('false');
    expect(within(trigger(/^Sales/)).getByText(LABELS.moduleCount(2, 5))).toBeDefined();
    expect(within(trigger(/^Stock/)).getByText(LABELS.moduleCount(0, 2))).toBeDefined();
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    expect(screen.queryByRole('searchbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: LABELS.customise }));
    expect(screen.getByRole('searchbox', { name: LABELS.search })).toBeDefined();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('summary: an opened module lists what is granted, as text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PermissionPicker {...picker({ initialMode: 'summary' })} />);
    await user.click(trigger(/^Sales/));
    const region = screen.getByRole('region', { name: /^Sales/ });
    expect(within(region).getByText('Invoices')).toBeDefined();
    expect(within(region).getByText('View')).toBeDefined();
    expect(within(region).getByText('Create')).toBeDefined();
    expect(within(region).queryByText('Delete')).toBeNull();
    expect(within(region).queryByText('Estimates')).toBeNull();
  });

  it('edit: the running total, the search box, and a "Select all in <module>" checkbox BESIDE each trigger, not inside it', () => {
    renderWithProviders(<PermissionPicker {...picker()} />);
    expect(screen.getByText(LABELS.runningTotal(2))).toBeDefined();
    expect(screen.getByRole('searchbox', { name: LABELS.search })).toBeDefined();
    for (const label of ['Sales', 'Stock', 'المَبيعات']) {
      const box = screen.getByRole('checkbox', { name: LABELS.selectAllIn(label) });
      const button = trigger(new RegExp(`^${label}`));
      expect(button.contains(box)).toBe(false);
      expect(box.closest('button')).toBe(box);
    }
  });

  it('select-all: ticking adds every code of the module, unticking removes them, and a partial module is indeterminate (aria-checked="mixed")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const full = ['stock.items.view', 'stock.items.create', 'sales.invoices.view'];
    renderWithProviders(<PermissionPicker {...picker({ value: full, onChange })} />);
    const sales = screen.getByRole('checkbox', { name: LABELS.selectAllIn('Sales') });
    const stock = screen.getByRole('checkbox', { name: LABELS.selectAllIn('Stock') });
    const orders = screen.getByRole('checkbox', { name: LABELS.selectAllIn('المَبيعات') });
    expect(sales.getAttribute('aria-checked')).toBe('mixed');
    expect(stock.getAttribute('aria-checked')).toBe('true');
    expect(orders.getAttribute('aria-checked')).toBe('false');
    await user.click(sales);
    expect(onChange).toHaveBeenLastCalledWith([
      ...full,
      'sales.invoices.create',
      'sales.invoices.delete',
      'sales.estimates.view',
      'sales.estimates.edit',
    ]);
    await user.click(stock);
    expect(onChange).toHaveBeenLastCalledWith(['sales.invoices.view']);
  });

  it('each capability checkbox is named "<feature> <capability>" and toggles only its own code', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<PermissionPicker {...picker({ onChange })} />);
    await user.click(trigger(/^Sales/));
    const view = screen.getByRole('checkbox', { name: 'Invoices View' });
    expect(view.getAttribute('aria-checked')).toBe('true');
    await user.click(view);
    expect(onChange).toHaveBeenLastCalledWith(['sales.invoices.create']);
    await user.click(screen.getByRole('checkbox', { name: 'Estimates Edit' }));
    expect(onChange).toHaveBeenLastCalledWith([...GRANTED, 'sales.estimates.edit']);
  });

  it('search ignores diacritics and opens the matching module; non-matching features and modules are hidden; clearing restores them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host />);
    const box = screen.getByRole('searchbox', { name: LABELS.search });
    await user.type(box, 'مبيعات');
    expect(expanded(/^المَبيعات/)).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'الطلبات عرض' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Sales/ })).toBeNull();
    await user.clear(box);
    await user.type(box, 'invoices');
    expect(expanded(/^Sales/)).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Invoices View' })).toBeDefined();
    expect(screen.queryByRole('checkbox', { name: 'Estimates View' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Stock/ })).toBeNull();
    // A pattern character is a character, never a RegExp (T-3.2-48).
    await user.clear(box);
    await user.type(box, '(');
    expect(screen.queryByRole('button', { name: /^Sales/ })).toBeNull();
    await user.clear(box);
    expect(screen.getByRole('button', { name: /^Stock/ })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Estimates View' })).toBeDefined();
  });

  it('with roleTemplate: "Reset to role" hands back the template; 3 missing template codes show the behind-role alert whose Re-apply calls onReapplyRole', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onReapplyRole = vi.fn();
    const template = [
      ...GRANTED,
      'sales.invoices.delete',
      'stock.items.view',
      'stock.items.create',
    ];
    renderWithProviders(
      <PermissionPicker {...picker({ onChange, onReapplyRole, roleTemplate: template })} />,
    );
    expect(screen.getByText(LABELS.behindRole(3, 0))).toBeDefined();
    await user.click(screen.getByRole('button', { name: LABELS.reapplyRole }));
    expect(onReapplyRole).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: LABELS.resetToRole }));
    expect(onChange).toHaveBeenLastCalledWith(template);
  });

  it('Re-apply role is a 32 px button (size default)', () => {
    const template = [...GRANTED, 'sales.invoices.delete'];
    renderWithProviders(
      <PermissionPicker {...picker({ onReapplyRole: vi.fn(), roleTemplate: template })} />,
    );
    const button = screen.getByRole('button', { name: LABELS.reapplyRole });
    expect(button.getAttribute('data-size')).toBe('default');
  });

  it('the behind-role line states both halves of ONE diff: the template codes missing and the held codes outside it, never a net number', () => {
    // Held: 2 template codes and 1 outside it. Template: 5. Missing 3, outside 1 (the net would say 2).
    const held = [...GRANTED, 'sales.estimates.view'];
    const template = [
      ...GRANTED,
      'sales.invoices.delete',
      'stock.items.view',
      'stock.items.create',
    ];
    renderWithProviders(
      <PermissionPicker
        {...picker({ value: held, roleTemplate: template, onReapplyRole: vi.fn() })}
      />,
    );
    expect(screen.getByTestId('permission-picker-behind').textContent).toContain(
      LABELS.behindRole(3, 1),
    );
    const diff = permissionSetDiff(held, template);
    expect(diff).toEqual({
      added: ['sales.invoices.delete', 'stock.items.create', 'stock.items.view'],
      removed: ['sales.estimates.view'],
    });
  });

  it('holding every template code shows no behind-role alert', () => {
    renderWithProviders(
      <PermissionPicker {...picker({ roleTemplate: GRANTED, onReapplyRole: vi.fn() })} />,
    );
    expect(screen.queryByTestId('permission-picker-behind')).toBeNull();
  });

  it.each(['summary', 'edit'] as const)(
    'readOnly (%s) with a notice: the refusal once, and no Customise, select-all, Reset or Re-apply exists at all (UAT 12)',
    async (initialMode) => {
      const user = userEvent.setup();
      renderWithProviders(
        <PermissionPicker
          {...picker({
            initialMode,
            readOnly: true,
            roleTemplate: [...GRANTED, 'stock.items.view'],
            onReapplyRole: vi.fn(),
          })}
        />,
      );
      expect(screen.getAllByText(LABELS.readOnlyNotice ?? '')).toHaveLength(1);
      await user.click(trigger(/^Sales/));
      for (const name of [LABELS.customise, LABELS.resetToRole, LABELS.reapplyRole]) {
        expect(screen.queryByRole('button', { name })).toBeNull();
      }
      for (const label of ['Sales', 'Stock']) {
        expect(screen.queryByRole('checkbox', { name: LABELS.selectAllIn(label) })).toBeNull();
      }
    },
  );

  it('readOnly stays reviewable: Tab reaches the first permission, which is aria-readonly and not disabled, and Space or a click changes nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<PermissionPicker {...picker({ readOnly: true, onChange })} />);
    await user.click(trigger(/^Sales/));
    await user.tab();
    const first = screen.getByRole('checkbox', { name: 'Invoices View' });
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute('aria-readonly')).toBe('true');
    expect(first.hasAttribute('disabled')).toBe(false);
    await user.keyboard(' ');
    expect(first.getAttribute('aria-checked')).toBe('true');
    const unticked = screen.getByRole('checkbox', { name: 'Invoices Delete' });
    await user.click(unticked);
    expect(unticked.getAttribute('aria-checked')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('readOnly keeps search and expand usable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PermissionPicker {...picker({ readOnly: true })} />);
    await user.type(screen.getByRole('searchbox', { name: LABELS.search }), 'invoices');
    expect(expanded(/^Sales/)).toBe('true');
    expect(screen.queryByRole('checkbox', { name: 'Estimates View' })).toBeNull();
    await user.click(trigger(/^Sales/));
    expect(expanded(/^Sales/)).toBe('false');
  });

  it('readOnly without a notice renders no notice at all (the screen already states it)', () => {
    const labels = { ...LABELS, readOnlyNotice: undefined };
    renderWithProviders(<PermissionPicker {...picker({ readOnly: true, labels })} />);
    expect(screen.queryByText(LABELS.readOnlyNotice ?? '')).toBeNull();
    expect(screen.queryByTestId('permission-picker-readonly')).toBeNull();
  });

  it('a 507-code, 25-module catalogue mounts fewer than 60 checkboxes while every module is closed (assumption A6)', () => {
    const modules: PermissionModule[] = [];
    let made = 0;
    for (let m = 0; m < 25; m += 1) {
      const features = [];
      for (let f = 0; f < 7 && made < 507; f += 1) {
        const capabilities = [];
        for (let c = 0; c < 3 && made < 507; c += 1) {
          capabilities.push({
            code: `m${String(m)}.f${String(f)}.c${String(c)}`,
            action: `a${String(c)}`,
            label: `C${String(c)}`,
          });
          made += 1;
        }
        features.push({ id: `m${String(m)}.f${String(f)}`, label: `F${String(f)}`, capabilities });
      }
      modules.push({ id: `m${String(m)}`, label: `Module ${String(m)}`, features });
    }
    expect(made).toBe(507);
    renderWithProviders(<PermissionPicker {...picker({ catalogue: modules, value: [] })} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeLessThan(60);
    expect(boxes).toHaveLength(25);
  });

  it('uses no physical-direction class under ar', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <PermissionPicker
        {...picker({ roleTemplate: [...GRANTED, 'stock.items.view'], onReapplyRole: vi.fn() })}
      />,
      { locale: 'ar' },
    );
    await user.click(trigger(/^Sales/));
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

/**
 * A module whose resources have different actions, given in scrambled order, and the catalogue's
 * one module/resource name clash (`projects.projects`).
 */
const cap = (feature: string, action: string, label: string) => ({
  code: `${feature}.${action}`,
  action,
  label,
});
const MIXED: readonly PermissionModule[] = [
  {
    id: 'hr',
    label: 'HR',
    features: [
      {
        id: 'hr.leave',
        label: 'Leave',
        capabilities: [
          cap('hr.leave', 'approve', 'Approve'),
          cap('hr.leave', 'viewOwn', 'View (own)'),
          cap('hr.leave', 'delete', 'Delete'),
          cap('hr.leave', 'view', 'View'),
          cap('hr.leave', 'edit', 'Edit'),
          cap('hr.leave', 'create', 'Create'),
        ],
      },
      {
        id: 'hr.training',
        label: 'Training',
        capabilities: [cap('hr.training', 'assign', 'Assign'), cap('hr.training', 'view', 'View')],
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    features: [
      {
        id: 'projects.projects',
        label: 'Projects',
        capabilities: [
          cap('projects.projects', 'view', 'View'),
          cap('projects.projects', 'create', 'Create'),
        ],
      },
    ],
  },
];
const LEAVE_CODES = MIXED[0]?.features[0]?.capabilities.map((c) => c.code) ?? [];

const headersOf = (table: HTMLElement): string[] =>
  within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent);
const rowOf = (name: string): HTMLElement => {
  const header = screen.getAllByRole('rowheader').find((cell) => cell.textContent === name);
  const row = header?.closest<HTMLElement>('[role="row"]');
  if (row === null || row === undefined) throw new Error(`no row headed ${name}`);
  return row;
};

describe('PermissionPicker module table (lead 2026-09-27, UAT gap 3)', () => {
  it('an opened module is a table: a header row of its actions in the fixed order View, View (own), Create, Edit, Delete, then the others (lead 2026-09-27)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    expect(headersOf(screen.getByRole('table', { name: 'HR' }))).toEqual([
      'Feature',
      'View',
      'View (own)',
      'Create',
      'Edit',
      'Delete',
      'Approve',
      'Assign',
    ]);
  });

  it('an action a resource does not have is an empty cell, so each action stays in its own column', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    const headers = headersOf(screen.getByRole('table', { name: 'HR' }));
    const cells = within(rowOf('Training')).getAllByRole('cell');
    expect(cells).toHaveLength(headers.length - 1);
    cells.forEach((cell, index) => {
      const action = headers[index + 1] ?? '';
      if (action === 'View' || action === 'Assign') {
        expect(within(cell).getAllByRole('checkbox')).toHaveLength(1);
        expect(within(cell).getByRole('checkbox', { name: `Training ${action}` })).toBeDefined();
      } else {
        expect(cell.childElementCount, action).toBe(0);
        expect(cell.textContent, action).toBe('');
      }
    });
  });

  it('each row is headed by the resource\'s name, and its checkboxes keep the name "<feature> <capability>"', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    const row = rowOf('Leave');
    expect(within(row).getByRole('rowheader').textContent).toBe('Leave');
    expect(row.contains(screen.getByRole('checkbox', { name: 'Leave Approve' }))).toBe(true);
  });

  it('a row\'s "Select all in <module>: <feature>" ticks every action of that resource, unticking clears them, and a partly granted row is mixed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={['hr.leave.view']} />);
    await user.click(trigger(/^HR/));
    const toggle = screen.getByRole('checkbox', { name: 'Select all in HR: Leave' });
    expect(rowOf('Leave').contains(toggle)).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('mixed');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    for (const code of LEAVE_CODES) {
      const box = document.getElementById(`member-permissions-${code}`);
      expect(box?.getAttribute('aria-checked'), code).toBe('true');
    }
    expect(
      screen.getByRole('checkbox', { name: 'Training View' }).getAttribute('aria-checked'),
    ).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(LABELS.runningTotal(0))).toBeDefined();
    await user.click(trigger(/^Projects/));
    expect(screen.getAllByRole('checkbox', { name: 'Select all in Projects' })).toHaveLength(1);
    expect(
      screen.getAllByRole('checkbox', { name: 'Select all in Projects: Projects' }),
    ).toHaveLength(1);
  });

  it('read-only: the table has no row or module toggle, and its checkboxes stay reviewable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={['hr.leave.view']} readOnly />);
    await user.click(trigger(/^HR/));
    expect(screen.getByRole('table', { name: 'HR' })).toBeDefined();
    expect(screen.queryAllByRole('checkbox', { name: /^Select all in/ })).toEqual([]);
    const approve = screen.getByRole('checkbox', { name: 'Leave Approve' });
    expect(approve.getAttribute('aria-readonly')).toBe('true');
    expect(approve.hasAttribute('disabled')).toBe(false);
    await user.click(approve);
    expect(approve.getAttribute('aria-checked')).toBe('false');
  });

  it("a search hides rows, never columns: the header keeps the module's actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    const before = headersOf(screen.getByRole('table', { name: 'HR' }));
    await user.type(screen.getByRole('searchbox', { name: LABELS.search }), 'training');
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Training']);
    expect(headersOf(screen.getByRole('table', { name: 'HR' }))).toEqual(before);
  });

  it('below about 36rem of card width each resource stacks (the table from @xl, even with the sidebar open, lead 2026-09-27), and a table wider than its card scrolls in its own wrapper, never clipped', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    const table = screen.getByRole('table', { name: 'HR' });
    const scroll = table.parentElement;
    expect(scroll?.getAttribute('data-slot')).toBe('permission-table-scroll');
    expect(scroll?.classList.contains('overflow-x-auto')).toBe(true);
    expect(scroll?.classList.contains('p-1')).toBe(true);
    expect(scroll?.parentElement?.classList.contains('@container')).toBe(true);
    const [header, ...rows] = within(table).getAllByRole('row');
    if (header === undefined) throw new Error('no header row');
    expect(rows).toHaveLength(2);
    for (const row of [header, ...rows]) {
      const grid = [...row.classList].find((token) => token.startsWith('@xl:grid-cols-'));
      expect(grid).toBe(
        '@xl:grid-cols-[minmax(10rem,1fr)_repeat(var(--permission-columns),5.5rem)]',
      );
    }
    expect(header.classList.contains('hidden')).toBe(true);
    expect(header.classList.contains('@xl:grid')).toBe(true);
    for (const row of rows) {
      for (const token of ['flex', 'flex-wrap', '@xl:grid']) {
        expect(row.classList.contains(token), token).toBe(true);
      }
    }
    const labels = [...table.querySelectorAll('[id$="-label"]')];
    expect(labels).toHaveLength(8);
    for (const label of labels) expect(label.classList.contains('@xl:sr-only')).toBe(true);
  });

  it("an opened module's content follows its rows' height, so a card that narrows (the table stacking) never clips a row (screenshot at 1024)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    const inner = screen.getByRole('region', { name: /^HR/ }).firstElementChild;
    // The primitive fixes this box to the height Radix measured when the module opened.
    expect(inner?.classList.contains('h-auto')).toBe(true);
    expect(inner?.classList.contains('h-(--radix-accordion-content-height)')).toBe(false);
    expect(inner?.contains(screen.getByRole('table', { name: 'HR' }))).toBe(true);
  });

  it("the resource-name column stays pinned at the inline start while a wide table scrolls sideways, on a solid background that follows the row's hover (lead 2026-09-27)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    const table = screen.getByRole('table', { name: 'HR' });
    expect(table.classList.contains('isolate')).toBe(true);
    const [feature] = within(table).getAllByRole('columnheader');
    const names = within(table).getAllByRole('rowheader');
    expect(names).toHaveLength(2);
    for (const cell of [feature, ...names]) {
      for (const token of ['@xl:sticky', '@xl:start-0', '@xl:z-10', '@xl:bg-card']) {
        expect(cell?.classList.contains(token), token).toBe(true);
      }
    }
    for (const cell of names) {
      expect(cell.closest('[role="row"]')?.classList.contains('group/row')).toBe(true);
      expect(
        cell.classList.contains(
          '@xl:group-hover/row:bg-[color-mix(in_srgb,var(--muted)_50%,var(--card))]',
        ),
      ).toBe(true);
    }
  });

  it('a subtle divider marks the pinned column only while the table is scrolled sideways, in either direction', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Host catalogue={MIXED} value={[]} />);
    await user.click(trigger(/^HR/));
    const table = screen.getByRole('table', { name: 'HR' });
    const scroll = table.parentElement;
    if (scroll === null) throw new Error('no scroll wrapper');
    const [feature] = within(table).getAllByRole('columnheader');
    for (const cell of [feature, ...within(table).getAllByRole('rowheader')]) {
      expect(cell?.classList.contains('@xl:group-data-[scrolled]/scroll:border-e')).toBe(true);
    }
    expect(scroll.classList.contains('group/scroll')).toBe(true);
    const scrollTo = (left: number): void => {
      Object.defineProperty(scroll, 'scrollLeft', { configurable: true, value: left });
      fireEvent.scroll(scroll);
    };
    expect(scroll.hasAttribute('data-scrolled')).toBe(false);
    scrollTo(40);
    expect(scroll.hasAttribute('data-scrolled')).toBe(true);
    scrollTo(0);
    expect(scroll.hasAttribute('data-scrolled')).toBe(false);
    // Under RTL Chrome counts scrollLeft down from 0.
    scrollTo(-40);
    expect(scroll.hasAttribute('data-scrolled')).toBe(true);
  });
});
