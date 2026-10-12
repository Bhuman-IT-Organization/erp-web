// @vitest-environment happy-dom
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import type { FilterValue } from '@/lib/url/use-query-state';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { DateFilterInput, FilterBar, type FilterControl } from '../FilterBar';

/**
 * K2 (UI-SPEC § Filter bar): at `md`+ up to four inline 192px triggers, "More filters" for the
 * rest, "Clear filters" only while a filter is off its default; below `md` one "Filters ({count})"
 * button opening a sheet from the inline end with every filter under its visible label and
 * "Show {total} results", which closes it. happy-dom applies no CSS, so both layouts are in the DOM:
 * the inline row is `hidden md:flex`, the mobile button `md:hidden` (asserted by class).
 */
const COMMON = commonEn.common;
const fill = (text: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), text);

/** A control that shows its trigger text and sets one fixed value, as a filter's picker would. */
const control = (key: string, label: string, next: FilterValue, inline = true): FilterControl => ({
  key,
  label,
  inline,
  render: ({ id, triggerText, onChange, layout }) => (
    <button
      type="button"
      id={id}
      data-layout={layout}
      onClick={() => {
        onChange(next);
      }}
    >
      {triggerText}
    </button>
  ),
});

const CONTROLS: readonly FilterControl[] = [
  control('currency[in]', 'Currency', ['1', '2']),
  control('tag[in]', 'Tags', ['7']),
  control('alert[eq]', 'Alert', 'min'),
  control('group[in]', 'Items Group', ['4']),
  control('subGroup[in]', 'Sub Groups', ['9'], false),
  control('barcode[eq]', 'Filter by barcode', '123', false),
];

function Host({
  initial = {},
  onClear = vi.fn(),
  total = 12,
  controls = CONTROLS,
}: {
  readonly initial?: Readonly<Record<string, FilterValue>>;
  readonly onClear?: () => void;
  readonly total?: number | undefined;
  readonly controls?: readonly FilterControl[];
}): ReactElement {
  const [values, setValues] = useState<Readonly<Record<string, FilterValue>>>(initial);
  return (
    <FilterBar
      controls={controls}
      values={values}
      isDefault={(key) => values[key] === undefined}
      onChange={(key, next) => {
        setValues((current) =>
          next === null
            ? Object.fromEntries(Object.entries(current).filter(([k]) => k !== key))
            : { ...current, [key]: next },
        );
      }}
      onClear={onClear}
      total={total}
    />
  );
}

const inlineRow = () => screen.getByTestId('filter-bar-inline');

describe('FilterBar at md and up (K2)', () => {
  it('shows the four inline controls with layout inline, each named by its label, and More filters for the rest', () => {
    renderWithProviders(<Host />);
    const row = inlineRow();
    expect(row.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'md:flex']));
    for (const label of ['Currency', 'Tags', 'Alert', 'Items Group']) {
      const trigger = within(row).getByRole('button', { name: label });
      expect(trigger.dataset.layout).toBe('inline');
      expect(trigger.closest('[data-filter-slot]')?.className).toContain('w-48');
    }
    expect(within(row).queryByRole('button', { name: 'Sub Groups' })).toBeNull();
    const more = within(row).getByRole('button', { name: COMMON.more_filters });
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('More filters toggles the second row', async () => {
    renderWithProviders(<Host />);
    const more = within(inlineRow()).getByRole('button', { name: COMMON.more_filters });
    await userEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(within(inlineRow()).getByRole('button', { name: 'Sub Groups' })).toBeTruthy();
    await userEvent.click(more);
    expect(within(inlineRow()).queryByRole('button', { name: 'Sub Groups' })).toBeNull();
  });

  it('More filters opens by itself when one of its filters is set', () => {
    renderWithProviders(<Host initial={{ 'barcode[eq]': '123' }} />);
    const more = within(inlineRow()).getByRole('button', { name: COMMON.more_filters });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    // Named by its label; the trigger's text carries the count.
    expect(within(inlineRow()).getByRole('button', { name: 'Filter by barcode' }).textContent).toBe(
      fill(COMMON.filter_count, { label: 'Filter by barcode', count: '1' }),
    );
  });

  it('a set filter reads "{label} ({count})": an array its length, a string 1', async () => {
    renderWithProviders(<Host />);
    await userEvent.click(within(inlineRow()).getByRole('button', { name: 'Currency' }));
    await userEvent.click(within(inlineRow()).getByRole('button', { name: 'Alert' }));
    expect(
      within(inlineRow()).getByText(fill(COMMON.filter_count, { label: 'Currency', count: '2' })),
    ).toBeTruthy();
    expect(
      within(inlineRow()).getByText(fill(COMMON.filter_count, { label: 'Alert', count: '1' })),
    ).toBeTruthy();
  });

  it('Clear filters shows only while a filter is off its default, and calls onClear', async () => {
    const onClear = vi.fn();
    const { unmount } = renderWithProviders(<Host onClear={onClear} />);
    expect(within(inlineRow()).queryByRole('button', { name: COMMON.clear_filters })).toBeNull();
    unmount();
    renderWithProviders(<Host onClear={onClear} initial={{ 'tag[in]': ['7'] }} />);
    await userEvent.click(within(inlineRow()).getByRole('button', { name: COMMON.clear_filters }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe('FilterBar: an emptied filter and the content-width opt-in (UAT 4.2 gap 4)', () => {
  it('a defaulted multi-select emptied to [] reads its label alone, never "(0)", and Clear filters still shows', () => {
    renderWithProviders(<Host initial={{ 'currency[in]': [] }} />);
    const trigger = within(inlineRow()).getByRole('button', { name: 'Currency' });
    expect(trigger.textContent).toBe('Currency');
    expect(within(inlineRow()).queryByText('(0)', { exact: false })).toBeNull();
    expect(within(inlineRow()).getByRole('button', { name: COMMON.clear_filters })).toBeTruthy();
  });

  it('with one value it reads "{label} (1)"', () => {
    renderWithProviders(<Host initial={{ 'tag[in]': ['7'] }} />);
    expect(within(inlineRow()).getByRole('button', { name: 'Tags' }).textContent).toBe(
      fill(COMMON.filter_count, { label: 'Tags', count: '1' }),
    );
  });

  it("a single-value filter set to '' reads its label alone", () => {
    renderWithProviders(<Host initial={{ 'alert[eq]': '' }} />);
    expect(within(inlineRow()).getByRole('button', { name: 'Alert' }).textContent).toBe('Alert');
  });

  it("fit: 'content' gives its inline slot the content's width (w-auto, at least 192px); the others keep w-48", () => {
    const wide: FilterControl = {
      ...control('variations[eq]', 'Search for simple and variation products', '1'),
      fit: 'content',
    };
    renderWithProviders(<Host controls={[wide, ...CONTROLS.slice(0, 2)]} />);
    const slot = (name: string): string[] =>
      within(inlineRow())
        .getByRole('button', { name })
        .closest('[data-filter-slot]')
        ?.className.split(' ') ?? [];
    expect(slot('Search for simple and variation products')).toEqual(
      expect.arrayContaining(['w-auto', 'min-w-48', 'max-w-full']),
    );
    expect(slot('Search for simple and variation products')).not.toContain('w-48');
    expect(slot('Currency')).toContain('w-48');
    expect(slot('Currency')).not.toContain('w-auto');
  });
});

describe('FilterBar below md (K2)', () => {
  const filtersButton = (name: string) => screen.getByRole('button', { name });

  it('one Filters button, md:hidden, reading "Filters (2)" with two filters set', () => {
    renderWithProviders(<Host initial={{ 'currency[in]': ['1'], 'barcode[eq]': '9' }} />);
    const button = filtersButton(fill(COMMON.filters_count, { count: '2' }));
    expect(button.closest('[data-testid="filter-bar-mobile"]')?.className).toContain('md:hidden');
    expect(button.querySelector('[data-icon-name="filter"]')).not.toBeNull();
  });

  it('with nothing set it reads "Filters"', () => {
    renderWithProviders(<Host />);
    expect(filtersButton(COMMON.filters)).toBeTruthy();
  });

  it('opens a sheet from the inline end: every control stacked under its visible label, layout sheet', async () => {
    renderWithProviders(<Host />);
    await userEvent.click(filtersButton(COMMON.filters));
    const sheet = await screen.findByRole('dialog', { name: COMMON.filters });
    expect(sheet.getAttribute('data-side')).toBe('right');
    for (const { label } of CONTROLS) {
      const trigger = within(sheet).getByRole('button', { name: label });
      expect(trigger.dataset.layout).toBe('sheet');
      expect(within(sheet).getByText(label, { selector: 'label' }).className).not.toContain(
        'sr-only',
      );
    }
  });

  it('"Show 12 results" closes the sheet; Clear filters sits above the controls in it', async () => {
    const onClear = vi.fn();
    renderWithProviders(<Host onClear={onClear} initial={{ 'tag[in]': ['7'] }} />);
    await userEvent.click(filtersButton(fill(COMMON.filters_count, { count: '1' })));
    const sheet = await screen.findByRole('dialog');
    const clear = within(sheet).getByRole('button', { name: COMMON.clear_filters });
    const firstControl = within(sheet).getByRole('button', { name: 'Currency' });
    expect(clear.compareDocumentPosition(firstControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await userEvent.click(
      within(sheet).getByRole('button', { name: fill(COMMON.show_results, { total: '12' }) }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('under ar the sheet opens from the left (the inline end) and no physical class is used', async () => {
    const { container } = renderWithProviders(<Host initial={{ 'tag[in]': ['7'] }} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
    // The ar pack carries the English text until the customer's reviewer translates it.
    await userEvent.click(filtersButton(fill(COMMON.filters_count, { count: '1' })));
    const sheet = await screen.findByRole('dialog');
    expect(sheet.getAttribute('data-side')).toBe('left');
    expect(physicalClassesIn(sheet)).toEqual([]);
  });
});

describe('DateFilterInput (opt-in, plan 04.6-06)', () => {
  const DATE: FilterControl = {
    key: 'postedOn[lte]',
    label: 'Posting Date',
    inline: true,
    fit: 'content',
    render: (props) => <DateFilterInput {...props} />,
  };

  it('inline it shows its label above a native date box the label names, and writes the date', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FilterBar
        controls={[DATE]}
        values={{}}
        isDefault={() => true}
        onChange={onChange}
        onClear={vi.fn()}
        total={undefined}
      />,
    );
    const row = inlineRow();
    expect(within(row).getByText('Posting Date', { selector: 'span' })).toBeTruthy();
    const box = within(row).getByLabelText('Posting Date', { selector: 'input' });
    expect(box.getAttribute('type')).toBe('date');
    // Lead 2026-10-07: the words sit on top of the box (a column, words first), never beside it,
    // and the row aligns its items to the bottom so the selects beside line up with the boxes.
    const words = within(row).getByText('Posting Date', { selector: 'span' });
    expect(words.parentElement).toBe(box.parentElement);
    expect(words.parentElement?.className.split(' ')).toContain('flex-col');
    expect(words.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const filterRow = box.closest('[data-filter-slot]')?.parentElement;
    expect(filterRow?.className.split(' ')).toContain('items-end');
    expect(filterRow?.className.split(' ')).not.toContain('items-center');
    await userEvent.type(box, '2026-10-05');
    expect(onChange).toHaveBeenLastCalledWith('postedOn[lte]', '2026-10-05');
  });

  it('with a date set, the words above the box stay the plain label, never "{label} (1)"', () => {
    renderWithProviders(
      <FilterBar
        controls={[DATE]}
        values={{ 'postedOn[lte]': '2026-10-05' }}
        isDefault={() => false}
        onChange={vi.fn()}
        onClear={vi.fn()}
        total={undefined}
      />,
    );
    const row = inlineRow();
    // Lead 2026-10-07: the box already shows the date, so the count only repeats it (display only).
    expect(within(row).getByText('Posting Date', { selector: 'span' })).toBeTruthy();
    expect(
      within(row).queryByText(fill(COMMON.filter_count, { label: 'Posting Date', count: '1' })),
    ).toBeNull();
    expect(within(row).getByLabelText('Posting Date', { selector: 'input' })).toHaveProperty(
      'value',
      '2026-10-05',
    );
  });
});
