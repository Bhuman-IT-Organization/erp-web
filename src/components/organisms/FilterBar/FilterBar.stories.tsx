import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import { SearchableMultiSelect } from '@/components/molecules/SearchableMultiSelect';
import { SearchableSelect, type ChoiceOption } from '@/components/molecules/SearchableSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { shellViewport } from '@/test/in-shell';
import type { FilterValue } from '@/lib/url/use-query-state';
import { DateFilterInput, FilterBar, type FilterControl } from './FilterBar';

/**
 * The list's filter bar (K2, UI-SPEC § Filter bar): labels arrive translated, as a screen passes
 * them. Neutral fixture options only (FE-05).
 */

const asList = (value: FilterValue | undefined): readonly string[] =>
  value === undefined || typeof value === 'string' ? [] : value;
const asOne = (value: FilterValue | undefined): string | null =>
  typeof value === 'string' ? value : null;

const multi = (key: string, label: string, options: readonly ChoiceOption[], inline: boolean) =>
  ({
    key,
    label,
    inline,
    render: ({ id, value, onChange, triggerText }) => (
      <SearchableMultiSelect
        id={id}
        options={options}
        value={asList(value)}
        onChange={(next) => {
          onChange(next);
        }}
        triggerText={triggerText}
        showChips={false}
      />
    ),
  }) satisfies FilterControl;

const single = (key: string, label: string, options: readonly ChoiceOption[]) =>
  ({
    key,
    label,
    inline: true,
    render: ({ id, value, onChange, triggerText }) => (
      <SearchableSelect
        id={id}
        options={options}
        value={asOne(value)}
        onChange={(next) => {
          onChange(next);
        }}
        triggerText={triggerText}
      />
    ),
  }) satisfies FilterControl;

const CURRENCIES = [
  { value: '1', label: 'US Dollar' },
  { value: '2', label: 'Euro' },
  { value: '3', label: 'UAE Dirham' },
];
const TAGS = [
  { value: '7', label: 'Seasonal' },
  { value: '8', label: 'Fragile' },
];
const ALERTS = [
  { value: 'min', label: 'Under the limit' },
  { value: 'max', label: 'Over the limit' },
  { value: 'out', label: 'No limit set' },
];
const GROUPS = [
  { value: '4', label: 'Sample group A' },
  { value: '5', label: 'Sample group B' },
];
const SUB_GROUPS = [
  { value: '9', label: 'Sample sub group 1' },
  { value: '10', label: 'Sample sub group 2' },
];

const CONTROLS: readonly FilterControl[] = [
  multi('currency[in]', 'Currency', CURRENCIES, true),
  multi('tag[in]', 'Tags', TAGS, true),
  single('alert[eq]', 'Alert', ALERTS),
  multi('group[in]', 'Items Group', GROUPS, true),
  multi('subGroup[in]', 'Sub Groups', SUB_GROUPS, false),
];

const CONTROLS_AR: readonly FilterControl[] = [
  multi('currency[in]', 'العملة', CURRENCIES, true),
  multi('tag[in]', 'الوسوم', TAGS, true),
  single('alert[eq]', 'تنبيه', ALERTS),
  multi('group[in]', 'مجموعة الأصناف', GROUPS, true),
  multi('subGroup[in]', 'المجموعات الفرعية', SUB_GROUPS, false),
];

const meta = {
  title: 'Organisms/FilterBar',
  component: FilterBar,
  args: {
    controls: CONTROLS,
    values: {},
    isDefault: () => true,
    onChange: fn(),
    onClear: fn(),
    total: 12,
  },
  // `isDefault` follows the story's values, as the list template derives it from the URL.
  render: (args) => (
    <div className="p-6">
      <FilterBar {...args} isDefault={(key) => args.values[key] === undefined} />
    </div>
  ),
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing set: four inline triggers reading their labels, "More filters", no "Clear filters". */
export const Default: Story = {};

/** Two filters set: "Currency (2)" and "Alert (1)", and "Clear filters" at the end of the row. */
export const WithValues: Story = {
  args: { values: { 'currency[in]': ['1', '2'], 'alert[eq]': 'min' } },
};

/** A filter behind "More filters" is set, so the second row opens by itself. */
export const MoreFilters: Story = {
  args: { values: { 'subGroup[in]': ['9'] } },
};

/** 375 px: one "Filters (2)" button; the sheet opens from the inline end with every filter stacked. */
const MOBILE_375 = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

export const MobileSheet: Story = {
  ...MOBILE_375,
  args: { values: { 'currency[in]': ['1'], 'tag[in]': ['7'] } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Filters (2)' }));
    const sheet = await screen.findByRole('dialog');
    await expect(
      within(sheet).getByRole('button', { name: 'Show 12 results' }),
    ).toBeInTheDocument();
  },
};

/** Arabic: the row mirrors and the sheet opens from the left, the inline end. */
export const Rtl: Story = {
  args: { controls: CONTROLS_AR, values: { 'currency[in]': ['1', '2'] } },
  globals: { locale: 'ar' },
};

/** A defaulted multi-select the member emptied: it reads its label alone, never "Tags (0)", and "Clear filters" shows. */
export const EmptiedDefault: Story = {
  // The inline row it reads is drawn from md; below md the filters sit behind one button.
  ...shellViewport(1280),
  args: { values: { 'tag[in]': [] } },
  play: async ({ canvasElement }) => {
    const row = within(
      canvasElement.querySelector<HTMLElement>('[data-testid="filter-bar-inline"]') ??
        canvasElement,
    );
    await expect(row.queryByText('(0)', { exact: false })).not.toBeInTheDocument();
    await expect(row.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  },
};

/** A box whose words show beside it, as the item list's variations filter: `fit: 'content'` lets them read whole. */
const LONG_LABEL = 'Include archived and discontinued sample products in the results';
const longCheckbox = {
  key: 'archived[eq]',
  label: LONG_LABEL,
  inline: true,
  fit: 'content',
  render: ({ id, value, onChange, triggerText, layout }) => (
    <span className="flex min-h-8 min-w-0 items-center gap-2">
      <Checkbox
        id={id}
        checked={value === 'all'}
        onCheckedChange={(next) => {
          onChange(next === true ? 'all' : null);
        }}
      />
      {layout === 'inline' ? (
        <span aria-hidden="true" data-testid="long-label" className="text-sm">
          {triggerText}
        </span>
      ) : null}
    </span>
  ),
} satisfies FilterControl;

/** 1280: the long label shows whole (its slot takes the label's width, the row wraps); the others keep 192 px. */
export const LongCheckboxLabel: Story = {
  args: { controls: [...CONTROLS.slice(0, 2), longCheckbox, ...CONTROLS.slice(3)] },
  ...shellViewport(1280),
  play: async ({ canvasElement }) => {
    const words = within(canvasElement).getByTestId('long-label');
    await expect(words).toHaveTextContent(LONG_LABEL);
    await expect(words.scrollWidth).toBeLessThanOrEqual(words.clientWidth);
    const slot = words.closest('[data-filter-slot]');
    await expect(slot?.getBoundingClientRect().width ?? 0).toBeGreaterThan(192);
  },
};

/** A date filter (opt-in DateFilterInput) as a list passes it, its words the slot's label. */
const dateControl = (label: string): FilterControl => ({
  key: 'postedOn[lte]',
  label,
  inline: true,
  fit: 'content',
  render: (props) => <DateFilterInput {...props} />,
});

/**
 * 1280: the date's words sit above its 192 px box (lead 2026-10-07) and the row aligns to the
 * bottom, so the select beside it lines up with the box.
 */
export const DateFilter: Story = {
  ...shellViewport(1280),
  args: {
    controls: [
      CONTROLS[0] ?? multi('currency[in]', 'Currency', [], true),
      dateControl('Posting Date'),
      CONTROLS[2] ?? single('alert[eq]', 'Alert', []),
    ],
  },
  play: async ({ canvasElement }) => {
    const row = within(
      canvasElement.querySelector<HTMLElement>('[data-testid="filter-bar-inline"]') ??
        canvasElement,
    );
    const box = row.getByLabelText('Posting Date', { selector: 'input' }).getBoundingClientRect();
    const words = row.getByText('Posting Date', { selector: 'span' }).getBoundingClientRect();
    await expect(words.bottom).toBeLessThanOrEqual(box.top);
    const select = row.getByRole('combobox', { name: 'Currency' }).getBoundingClientRect();
    await expect(Math.abs(select.bottom - box.bottom)).toBeLessThanOrEqual(1);
  },
};

/** 375: one "Filters (1)" button; in the sheet the date stacks under its visible label like every filter. */
export const DateFilterMobile: Story = {
  ...MOBILE_375,
  args: { ...DateFilter.args, values: { 'postedOn[lte]': '2026-10-05' } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Filters (1)' }));
    const sheet = await screen.findByRole('dialog');
    await expect(within(sheet).getByLabelText('Posting Date')).toHaveAttribute('type', 'date');
  },
};

/** Arabic at 1280: the row mirrors; the date's words still sit above its box, at the inline start. */
export const DateFilterRtl: Story = {
  ...shellViewport(1280),
  args: {
    controls: [
      CONTROLS_AR[0] ?? multi('currency[in]', 'العملة', [], true),
      dateControl('تاريخ الترحيل'),
      CONTROLS_AR[2] ?? single('alert[eq]', 'تنبيه', []),
    ],
  },
  globals: { locale: 'ar' },
};
