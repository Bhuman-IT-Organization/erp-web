// @vitest-environment happy-dom
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { SearchableMultiSelect, type SearchableMultiSelectProps } from '../SearchableMultiSelect';

const COMMON = commonEn.common;
const ID = 'departments';
const LABEL = 'Departments';

const OPTIONS = [
  { value: '1', label: 'Warehouse' },
  { value: '2', label: 'Accounts' },
  { value: '3', label: 'المُوظف' },
  { value: '4', label: 'Sales (East)' },
  { value: '5', label: 'Stores [B]' },
  { value: '6', label: 'Purchasing' },
  { value: '7', label: 'Reception' },
] as const;

/** A controlled host, as the form's Controller is: onChange writes the value back. */
function Host({
  initial = [],
  spy,
  ...rest
}: Partial<SearchableMultiSelectProps> & {
  readonly initial?: readonly string[];
  readonly spy: (value: string[]) => void;
}): ReactElement {
  const [value, setValue] = useState<readonly string[]>(initial);
  return (
    <>
      <label htmlFor={ID}>{LABEL}</label>
      <SearchableMultiSelect
        id={ID}
        options={OPTIONS}
        {...rest}
        value={value}
        onChange={(next) => {
          spy(next);
          setValue(next);
        }}
      />
    </>
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('combobox', { name: LABEL });
}

describe('SearchableMultiSelect', () => {
  it('with nothing chosen the trigger reads "Nothing selected" and there are no chips', () => {
    renderWithProviders(<Host spy={vi.fn()} />);
    expect(trigger().textContent).toContain(COMMON.dropdown_non_selected_tex);
    expect(screen.queryAllByRole('button', { name: /Remove/ })).toHaveLength(0);
  });

  it('choosing two options keeps the popover open and calls onChange with both; the trigger reads "2 selected"', async () => {
    const spy = vi.fn();
    renderWithProviders(<Host spy={spy} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('option', { name: 'Warehouse' }));
    expect(screen.getByRole('listbox')).not.toBeNull();
    await userEvent.click(screen.getByRole('option', { name: 'Accounts' }));
    expect(screen.getByRole('listbox')).not.toBeNull();
    expect(spy.mock.calls).toEqual([[['1']], [['1', '2']]]);
    expect(trigger().textContent).toContain(COMMON.selected_count.replace('{count}', '2'));
  });

  it('marks every chosen option with a check; choosing a chosen one removes it', async () => {
    const spy = vi.fn();
    renderWithProviders(<Host spy={spy} initial={['1', '2']} />);
    await userEvent.click(trigger());
    const checked = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-checked') === 'true')
      .map((o) => o.textContent);
    expect(checked).toEqual(['Warehouse', 'Accounts']);
    await userEvent.click(screen.getByRole('option', { name: 'Warehouse' }));
    expect(spy).toHaveBeenLastCalledWith(['2']);
  });

  it('each chip has a button "Remove <label>" that removes only that value', async () => {
    const spy = vi.fn();
    renderWithProviders(<Host spy={spy} initial={['1', '2', '3']} />);
    const remove = screen.getByRole('button', {
      name: COMMON.remove_item.replace('{label}', 'Accounts'),
    });
    await userEvent.click(remove);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(['1', '3']);
    expect(screen.queryByRole('button', { name: /Accounts/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: COMMON.remove_item.replace('{label}', 'Warehouse') }),
    ).not.toBeNull();
  });

  it('filters with the diacritic-insensitive matcher, and "(" or "[" match literally', async () => {
    renderWithProviders(<Host spy={vi.fn()} />);
    await userEvent.click(trigger());
    const box = screen.getByPlaceholderText(COMMON.search_options);
    await userEvent.type(box, 'لموظف');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['المُوظف']);
    await userEvent.clear(box);
    await userEvent.type(box, '(');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sales (East)']);
    await userEvent.clear(box);
    await userEvent.type(box, '[[');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Stores [B]']);
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getByText(COMMON.no_matches)).not.toBeNull();
  });

  it('showChips={false} renders no chip list; the trigger still reads the count', () => {
    renderWithProviders(<Host spy={vi.fn()} initial={['1', '2']} showChips={false} />);
    expect(screen.queryAllByRole('button', { name: /Remove/ })).toHaveLength(0);
    expect(screen.queryByRole('list')).toBeNull();
    expect(trigger().textContent).toContain(COMMON.selected_count.replace('{count}', '2'));
  });

  it('triggerText replaces the "{count} selected" text', () => {
    renderWithProviders(
      <Host spy={vi.fn()} initial={['1', '2']} showChips={false} triggerText="Departments (2)" />,
    );
    expect(trigger().textContent).toContain('Departments (2)');
    expect(trigger().textContent).not.toContain(COMMON.selected_count.replace('{count}', '2'));
  });

  it('shows the chips by default', () => {
    renderWithProviders(<Host spy={vi.fn()} initial={['1']} />);
    expect(screen.getByRole('list')).toBeTruthy();
  });

  it('forwards aria-required, aria-invalid and aria-describedby to the combobox', () => {
    renderWithProviders(<Host spy={vi.fn()} required invalid describedBy="departments-error" />);
    expect(trigger().getAttribute('aria-required')).toBe('true');
    expect(trigger().getAttribute('aria-invalid')).toBe('true');
    expect(trigger().getAttribute('aria-describedby')).toBe('departments-error');
  });

  it('disabled: the trigger and every chip button are disabled', () => {
    renderWithProviders(<Host spy={vi.fn()} initial={['1']} disabled />);
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen
        .getByRole('button', {
          name: COMMON.remove_item.replace('{label}', 'Warehouse'),
        })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  describe('creatable (K9): "Add “{query}”" when the typed text matches no option', () => {
    const COLOURS = [
      { value: 'red', label: 'Red' },
      { value: 'green', label: 'Green' },
    ];
    const addLabel = (query: string) => COMMON.add_option.replace('{query}', query);

    it('Creatable: typing "Blue" offers "Add “Blue”" as the last option; Enter calls onCreate("Blue") once and clears the box', async () => {
      const onCreate = vi.fn();
      renderWithProviders(<Host spy={vi.fn()} options={COLOURS} creatable={{ onCreate }} />);
      await userEvent.click(trigger());
      const box = screen.getByPlaceholderText<HTMLInputElement>(COMMON.search_options);
      await userEvent.type(box, 'Blue');
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([addLabel('Blue')]);
      await userEvent.keyboard('{Enter}');
      expect(onCreate.mock.calls).toEqual([['Blue']]);
      expect(box.value).toBe('');
    });

    it('the Add option comes after the options the text matches', async () => {
      renderWithProviders(
        <Host spy={vi.fn()} options={COLOURS} creatable={{ onCreate: vi.fn() }} />,
      );
      await userEvent.click(trigger());
      await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'Re');
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Red',
        'Green',
        addLabel('Re'),
      ]);
    });

    it('typing "red" or "réd" offers no Add option: the match ignores case and diacritics', async () => {
      renderWithProviders(
        <Host spy={vi.fn()} options={COLOURS} creatable={{ onCreate: vi.fn() }} />,
      );
      await userEvent.click(trigger());
      const box = screen.getByPlaceholderText(COMMON.search_options);
      for (const typed of ['red', 'réd', ' RED ']) {
        await userEvent.clear(box);
        await userEvent.type(box, typed);
        expect(screen.queryByRole('option', { name: addLabel(typed.trim()) })).toBeNull();
      }
    });

    it('an empty box with no options reads "Type an option and press Enter to add it."', async () => {
      renderWithProviders(<Host spy={vi.fn()} options={[]} creatable={{ onCreate: vi.fn() }} />);
      await userEvent.click(trigger());
      expect(screen.getByText(COMMON.add_option_hint)).toBeTruthy();
      expect(screen.queryByText(COMMON.no_matches)).toBeNull();
    });

    it('without creatable nothing is offered and "No matches" shows as before', async () => {
      renderWithProviders(<Host spy={vi.fn()} options={COLOURS} />);
      await userEvent.click(trigger());
      await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'Blue');
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(screen.getByText(COMMON.no_matches)).toBeTruthy();
    });

    it('CreatableRtl: no physical-direction class under ar with the Add option shown', async () => {
      renderWithProviders(
        <Host spy={vi.fn()} options={COLOURS} creatable={{ onCreate: vi.fn() }} />,
        { locale: 'ar' },
      );
      await userEvent.click(trigger());
      await userEvent.type(screen.getByPlaceholderText(COMMON.search_options), 'أزرق');
      expect(screen.getAllByRole('option')).toHaveLength(1);
      expect(physicalClassesIn(document.body)).toEqual([]);
    });
  });

  it('under ar: no physical-direction class, with chips and open', async () => {
    const { container } = renderWithProviders(<Host spy={vi.fn()} initial={['3', '1']} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
    await userEvent.click(trigger());
    expect(physicalClassesIn(document.body)).toEqual([]);
  });
});

describe('SearchableMultiSelect emptyHint', () => {
  const HINT = {
    text: 'No cost centers yet.',
    action: { label: 'Create one in Cost Centers', href: '/setup/cost-centers/new' },
  } as const;

  it('zero options: the hint and its link replace "No matches"; the link closes the popover', async () => {
    renderWithProviders(<Host spy={vi.fn()} options={[]} emptyHint={HINT} />);
    await userEvent.click(trigger());
    expect(screen.getByText(HINT.text)).not.toBeNull();
    expect(screen.queryByText(COMMON.no_matches)).toBeNull();
    const link = screen.getByRole('link', { name: HINT.action.label });
    expect(link.getAttribute('href')).toBe(HINT.action.href);
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('a search that matches nothing in a non-empty list still says "No matches"', async () => {
    renderWithProviders(<Host spy={vi.fn()} emptyHint={HINT} />);
    await userEvent.click(trigger());
    await userEvent.keyboard('zzz');
    expect(screen.getByText(COMMON.no_matches)).not.toBeNull();
    expect(screen.queryByText(HINT.text)).toBeNull();
  });
});
