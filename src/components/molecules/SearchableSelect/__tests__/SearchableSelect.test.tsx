// @vitest-environment happy-dom
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CommandItem } from '@/components/ui/command';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import {
  SearchableSelect,
  SearchPopover,
  type SearchableSelectProps,
  type SearchPopoverProps,
} from '../SearchableSelect';

const COMMON = commonEn.common;
const ID = 'department';
const LABEL = 'Department';

const OPTIONS = [
  { value: '1', label: 'Warehouse' },
  { value: '2', label: 'Accounts' },
  { value: '3', label: 'المُوظف' },
  { value: '4', label: 'Sales (East)' },
  { value: '5', label: 'Stores [B]' },
  { value: '6', label: 'Purchasing' },
  { value: '7', label: 'Reception' },
] as const;

function renderSelect(
  props: Partial<SearchableSelectProps> = {},
  locale: 'en' | 'ar' = 'en',
): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <>
      <label htmlFor={ID}>{LABEL}</label>
      <SearchableSelect id={ID} value={null} onChange={vi.fn()} options={OPTIONS} {...props} />
    </>,
    { locale },
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('combobox', { name: LABEL });
}

async function open(): Promise<void> {
  await userEvent.click(trigger());
}

describe('SearchableSelect', () => {
  it('with value null shows "Nothing selected" in muted text on a 32 px trigger', () => {
    renderSelect();
    expect(trigger().textContent).toContain(COMMON.dropdown_non_selected_tex);
    expect(trigger().querySelector('.text-muted-foreground')?.textContent).toBe(
      COMMON.dropdown_non_selected_tex,
    );
    expect(trigger().className.split(' ')).toContain('h-8');
    expect(trigger().querySelector('[data-icon-name="chevron-down"]')).not.toBeNull();
  });

  it('triggerText replaces the trigger text, chosen or not (a filter shows its label or "{label} ({count})")', () => {
    const { unmount } = renderSelect({ triggerText: 'Department' });
    expect(trigger().textContent).toContain('Department');
    expect(trigger().textContent).not.toContain(COMMON.dropdown_non_selected_tex);
    unmount();
    renderSelect({ value: '2', triggerText: 'Department (1)' });
    expect(trigger().textContent).toContain('Department (1)');
    expect(trigger().textContent).not.toContain('Accounts');
  });

  it('shows the chosen label on the trigger', () => {
    renderSelect({ value: '2' });
    expect(trigger().textContent).toContain('Accounts');
    expect(trigger().textContent).not.toContain(COMMON.dropdown_non_selected_tex);
  });

  it('opening shows the "Search…" box and the options; aria-expanded follows', async () => {
    renderSelect();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByPlaceholderText(COMMON.search_options)).not.toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length);
    const controls = trigger().getAttribute('aria-controls') ?? '';
    expect(document.getElementById(controls)?.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('typing "لموظف" matches the option labelled "المُوظف" (diacritics ignored, the sidebar matcher)', async () => {
    renderSelect();
    await open();
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'لموظف');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['المُوظف']);
  });

  it('ignores case', async () => {
    renderSelect();
    await open();
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'WAREHOUSE');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Warehouse']);
  });

  it('typing "zzz" shows "No matches" and no option', async () => {
    renderSelect();
    await open();
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'zzz');
    expect(screen.getByText(COMMON.no_matches)).not.toBeNull();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('"No matches" is outside the listbox, so an empty listbox has no non-option child (axe aria-required-children)', async () => {
    renderSelect();
    await open();
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'zzz');
    expect(screen.getByRole('listbox').textContent).not.toContain(COMMON.no_matches);
  });

  it('"Nothing selected" turns foreground while open: muted text on the open trigger’s muted fill fails AA (axe color-contrast)', () => {
    renderSelect();
    const placeholder = trigger().querySelector('.text-muted-foreground');
    expect(placeholder?.className.split(' ')).toContain(
      'group-aria-expanded/button:text-foreground',
    );
  });

  it('a search typed as "(" or "[" throws nothing and matches literally (never a RegExp, T-3.2-38)', async () => {
    renderSelect();
    await open();
    const box = screen.getByPlaceholderText(COMMON.search_options);
    await userEvent.type(box, '(');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sales (East)']);
    await userEvent.clear(box);
    // user-event reads "[" as a key descriptor; "[[" types one literal "[".
    await userEvent.type(box, '[[');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Stores [B]']);
  });

  it('choosing an option calls onChange once with its value and closes the popover', async () => {
    const onChange = vi.fn();
    renderSelect({ onChange });
    await open();
    await userEvent.click(screen.getByRole('option', { name: 'Accounts' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('the chosen option shows a check, and only that one', async () => {
    renderSelect({ value: '2' });
    await open();
    const checked = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('data-checked') === 'true')
      .map((o) => o.textContent);
    expect(checked).toEqual(['Accounts']);
    expect(screen.getByRole('option', { name: 'Accounts' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('never allows two values: onChange receives a single string each time', async () => {
    const onChange = vi.fn();
    renderSelect({ onChange, value: '1' });
    await open();
    await userEvent.click(screen.getByRole('option', { name: 'Accounts' }));
    await open();
    await userEvent.click(screen.getByRole('option', { name: 'Purchasing' }));
    expect(onChange.mock.calls).toEqual([['2'], ['6']]);
  });

  it('forwards aria-required, aria-invalid and aria-describedby to the combobox', () => {
    renderSelect({ required: true, invalid: true, describedBy: 'department-error' });
    expect(trigger().getAttribute('aria-required')).toBe('true');
    expect(trigger().getAttribute('aria-invalid')).toBe('true');
    expect(trigger().getAttribute('aria-describedby')).toBe('department-error');
  });

  it('disabled: the trigger is disabled and does not open', async () => {
    renderSelect({ disabled: true });
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(trigger());
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('detail (opt-in, 04.8-16): a second line under the label in the list, searched too; the trigger shows the label alone', async () => {
    const options = [
      { value: '41', label: 'Sample rate', detail: 'Valid to None · 5 in use · 2.50' },
      { value: '42', label: 'Sample rate', detail: 'Valid to None · 5 in use · 3.10' },
    ];
    renderSelect({ options, value: '42' });
    expect(screen.getByRole('combobox', { name: LABEL }).textContent).toBe('Sample rate');
    await userEvent.click(screen.getByRole('combobox', { name: LABEL }));
    expect(screen.getByText('Valid to None · 5 in use · 2.50')).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), '3.10');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option').textContent).toContain('3.10');
  });

  it('under ar: no physical-direction class, closed or open', async () => {
    const { container } = renderSelect({ value: '3' }, 'ar');
    expect(physicalClassesIn(container)).toEqual([]);
    await open();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});

/** A host for the shared popover alone: open, with the given extra props (K7, K9). */
function PopoverHost(props: Partial<SearchPopoverProps>): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <label htmlFor={ID}>{LABEL}</label>
      <SearchPopover
        id={ID}
        options={OPTIONS}
        open={open}
        onOpenChange={setOpen}
        summary={undefined}
        isChecked={() => false}
        onPick={vi.fn()}
        {...props}
      />
    </>
  );
}

describe('SearchPopover: the controlled search, footer and status the async picker and creatable chips use', () => {
  it('shouldFilter={false} shows every option whatever is typed (the server filters)', async () => {
    renderWithProviders(<PopoverHost shouldFilter={false} />);
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'zzz');
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length);
    expect(screen.queryByText(COMMON.no_matches)).toBeNull();
  });

  it('search and onSearchChange control the input', async () => {
    const onSearchChange = vi.fn();
    renderWithProviders(<PopoverHost search="Acc" onSearchChange={onSearchChange} />);
    const box = screen.getByPlaceholderText<HTMLInputElement>(COMMON.search_options);
    expect(box.value).toBe('Acc');
    await userEvent.type(box, 'o');
    expect(onSearchChange).toHaveBeenLastCalledWith('Acco');
  });

  it('the footer renders after the items inside the list and the arrow keys reach it', async () => {
    const onFooter = vi.fn();
    renderWithProviders(
      <PopoverHost
        options={OPTIONS.slice(0, 2)}
        footer={
          <CommandItem value="footer" forceMount onSelect={onFooter}>
            Footer row
          </CommandItem>
        }
      />,
    );
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Warehouse', 'Accounts', 'Footer row']);
    expect(screen.getByRole('listbox').textContent).toContain('Footer row');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Footer row' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await userEvent.keyboard('{Enter}');
    expect(onFooter).toHaveBeenCalledTimes(1);
  });

  it('emptyText replaces "No matches"', async () => {
    renderWithProviders(<PopoverHost emptyText="Nothing like that" />);
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'zzz');
    expect(screen.getByText('Nothing like that')).not.toBeNull();
    expect(screen.queryByText(COMMON.no_matches)).toBeNull();
  });

  it('a status shows above the list, outside the listbox, and hides the empty text (D-39: nothing reads "no match" while loading)', () => {
    renderWithProviders(
      <PopoverHost options={[]} status={<p data-testid="popover-status">Loading rows</p>} />,
    );
    expect(screen.getByTestId('popover-status')).toBeTruthy();
    expect(screen.getByRole('listbox').textContent).not.toContain('Loading rows');
    expect(screen.queryByText(COMMON.no_matches)).toBeNull();
  });

  it('placeholder and searchPlaceholder replace "Nothing selected" and "Search…"', () => {
    renderWithProviders(
      <PopoverHost placeholder="Select item" searchPlaceholder="Search by name" />,
    );
    expect(trigger().textContent).toContain('Select item');
    expect(trigger().querySelector('.text-muted-foreground')?.textContent).toBe('Select item');
    expect(screen.getByPlaceholderText('Search by name')).toBeTruthy();
  });

  it('activeValue chooses the highlighted option; onActiveValueChange follows the arrow keys', async () => {
    const onActiveValueChange = vi.fn();
    renderWithProviders(<PopoverHost activeValue="6" onActiveValueChange={onActiveValueChange} />);
    expect(screen.getByRole('option', { name: 'Purchasing' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await userEvent.keyboard('{ArrowDown}');
    expect(onActiveValueChange).toHaveBeenLastCalledWith('7');
  });

  it('onSearchKeyDown sees the key first; preventing Enter keeps the highlighted option unpicked', async () => {
    const onPick = vi.fn();
    const onSearchKeyDown = vi.fn((event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.preventDefault();
    });
    renderWithProviders(<PopoverHost onPick={onPick} onSearchKeyDown={onSearchKeyDown} />);
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), '{Enter}');
    expect(onSearchKeyDown).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('SearchableSelect emptyHint: "none yet, create one" when the list itself is empty', () => {
  const HINT = {
    text: 'No cost centers yet.',
    action: { label: 'Create one in Setup', href: '/setup/cost-centers/new' },
  } as const;

  it('zero options: the hint text and a link to the create page replace "No matches"', async () => {
    renderSelect({ options: [], emptyHint: HINT });
    await open();
    expect(screen.getByText(HINT.text)).not.toBeNull();
    const link = screen.getByRole('link', { name: HINT.action.label });
    expect(link.getAttribute('href')).toBe(HINT.action.href);
    expect(screen.queryByText(COMMON.no_matches)).toBeNull();
    expect(screen.getByRole('listbox').textContent).not.toContain(HINT.text);
  });

  it('zero options and a typed search still read the hint: the list itself is empty', async () => {
    renderSelect({ options: [], emptyHint: HINT });
    await open();
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'zzz');
    expect(screen.getByText(HINT.text)).not.toBeNull();
  });

  it('a search that matches nothing in a non-empty list still says "No matches", never the hint', async () => {
    renderSelect({ emptyHint: HINT });
    await open();
    await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'zzz');
    expect(screen.getByText(COMMON.no_matches)).not.toBeNull();
    expect(screen.queryByText(HINT.text)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a hint without an action is text only', async () => {
    renderSelect({ options: [], emptyHint: { text: HINT.text } });
    await open();
    expect(screen.getByText(HINT.text)).not.toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('Tab from the search box reaches the link (keyboard reachable from the open popover)', async () => {
    renderSelect({ options: [], emptyHint: HINT });
    await open();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(COMMON.search_options));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: HINT.action.label }));
  });

  it('clicking the link closes the popover', async () => {
    renderSelect({ options: [], emptyHint: HINT });
    await open();
    const link = screen.getByRole('link', { name: HINT.action.label });
    // Keep the test page in place: the link's own navigation is next/link's, not the kit's.
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(HINT.text)).toBeNull();
  });

  it('under ar: no physical-direction class in the open hint', async () => {
    renderSelect({ options: [], emptyHint: HINT }, 'ar');
    await open();
    expect(screen.getByText(HINT.text)).not.toBeNull();
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});

describe('SearchPopover emptyHint and status', () => {
  it('while a status shows (loading), the hint does not: nothing reads "none yet" before the answer (D-39)', () => {
    renderWithProviders(
      <PopoverHost
        options={[]}
        emptyHint={{ text: 'No departments yet.' }}
        status={<p data-testid="popover-status">Loading rows</p>}
      />,
    );
    expect(screen.queryByText('No departments yet.')).toBeNull();
  });
});
