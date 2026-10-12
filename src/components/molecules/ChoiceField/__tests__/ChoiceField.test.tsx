// @vitest-environment happy-dom
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import {
  CHOICE_SEARCH_THRESHOLD,
  ChoiceField,
  choiceSpan,
  type ChoiceFieldProps,
  type ChoiceOption,
} from '../ChoiceField';

const COMMON = commonEn.common;
const ID = 'field';
const LABEL = 'Department';

function optionsOf(
  count: number,
  label = (n: number): string => `Option ${String(n)}`,
): ChoiceOption[] {
  return Array.from({ length: count }, (_, index) => ({
    value: String(index + 1),
    label: label(index + 1),
  }));
}

function single(
  options: readonly ChoiceOption[] | undefined,
  extra: Partial<Extract<ChoiceFieldProps, { multiple: false }>> = {},
): ChoiceFieldProps {
  return {
    id: ID,
    label: LABEL,
    options,
    multiple: false,
    value: null,
    onChange: vi.fn(),
    ...extra,
  };
}

function multiple(
  options: readonly ChoiceOption[] | undefined,
  extra: Partial<Extract<ChoiceFieldProps, { multiple: true }>> = {},
): ChoiceFieldProps {
  return { id: ID, label: LABEL, options, multiple: true, value: [], onChange: vi.fn(), ...extra };
}

/** The options arrive later, as a feature's SWR read does: `undefined` until "load" is clicked. */
function Arriving({ later }: { readonly later: readonly ChoiceOption[] }): ReactElement {
  const [options, setOptions] = useState<readonly ChoiceOption[] | undefined>(undefined);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOptions(later);
        }}
      >
        load
      </button>
      <ChoiceField {...single(options)} />
    </>
  );
}

describe('ChoiceField (D-24: the kit picks the control from the option count)', () => {
  it('the threshold is 6 inclusive (UI-SPEC choice 18)', () => {
    expect(CHOICE_SEARCH_THRESHOLD).toBe(6);
  });

  it('single, 3 options with short labels → a radiogroup laid out in one row', () => {
    renderWithProviders(<ChoiceField {...single(optionsOf(3))} />);
    const group = screen.getByRole('radiogroup', { name: LABEL });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(group.className.split(' ')).toContain('flex-row');
  });

  it('single, 3 options with a 17-character label → stacked', () => {
    const labels = ['Short', 'Seventeen chars!!', 'Also short'];
    expect(labels[1]).toHaveLength(17);
    renderWithProviders(<ChoiceField {...single(optionsOf(3, (n) => labels[n - 1] ?? ''))} />);
    const group = screen.getByRole('radiogroup', { name: LABEL });
    expect(group.className.split(' ')).toContain('flex-col');
    expect(group.className.split(' ')).not.toContain('flex-row');
  });

  it('single, 4 options → stacked radios', () => {
    renderWithProviders(<ChoiceField {...single(optionsOf(4))} />);
    expect(screen.getByRole('radiogroup').className.split(' ')).toContain('flex-col');
  });

  it('zero options with an emptyHint → a searchable select whose open list reads the hint and its link, single or multiple', async () => {
    const emptyHint = {
      text: 'No cost centers yet.',
      action: { label: 'Create one in Setup', href: '/setup/cost-centers/new' },
    };
    for (const props of [single([], { emptyHint }), multiple([], { emptyHint })]) {
      const { unmount } = renderWithProviders(<ChoiceField {...props} />);
      expect(screen.queryByRole('radiogroup')).toBeNull();
      await userEvent.click(screen.getByRole('combobox', { name: LABEL }));
      expect(screen.getByText(emptyHint.text)).toBeTruthy();
      expect(screen.getByRole('link', { name: emptyHint.action.label }).getAttribute('href')).toBe(
        emptyHint.action.href,
      );
      unmount();
    }
  });

  it('single, 6 options → a radiogroup of 6 radios and no combobox', () => {
    renderWithProviders(<ChoiceField {...single(optionsOf(6))} />);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('single, 7 options → a SearchableSelect (a combobox named by the label), no radio', () => {
    renderWithProviders(<ChoiceField {...single(optionsOf(7))} />);
    expect(screen.getByRole('combobox', { name: LABEL })).not.toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('multiple, 6 options → a fieldset with a legend and 6 checkboxes', () => {
    renderWithProviders(<ChoiceField {...multiple(optionsOf(6))} />);
    const group = screen.getByRole('group', { name: LABEL });
    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('legend')?.textContent).toBe(LABEL);
    expect(within(group).getAllByRole('checkbox')).toHaveLength(6);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('multiple, 7 options → a SearchableMultiSelect (combobox with chips), no checkbox', () => {
    renderWithProviders(<ChoiceField {...multiple(optionsOf(7), { value: ['2'] })} />);
    expect(screen.getByRole('combobox', { name: LABEL })).not.toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: COMMON.remove_item.replace('{label}', 'Option 2') }),
    ).not.toBeNull();
  });

  it('options undefined → one labelled field-block skeleton under role status, and no radio, checkbox or combobox (D-39)', () => {
    renderWithProviders(<ChoiceField {...single(undefined)} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(within(status).getAllByTestId('skeleton-field')).toHaveLength(1);
    expect(within(status).getByTestId('skeleton-field-label')).not.toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('when 7+ options arrive the select renders, and no radio was ever in the document (never flips)', async () => {
    const seenRadio: boolean[] = [];
    const observer = new MutationObserver(() => {
      seenRadio.push(document.querySelector('[role="radio"]') !== null);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    renderWithProviders(<Arriving later={optionsOf(21)} />);
    expect(screen.getByRole('status')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'load' }));
    observer.disconnect();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('combobox', { name: LABEL })).not.toBeNull();
    expect(seenRadio.some(Boolean)).toBe(false);
  });

  it('when 6 or fewer options arrive the radios render in place of the skeleton', async () => {
    renderWithProviders(<Arriving later={optionsOf(5)} />);
    expect(screen.getByRole('status')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'load' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('a radio change calls onChange with the value', async () => {
    const onChange = vi.fn();
    renderWithProviders(<ChoiceField {...single(optionsOf(3), { onChange })} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Option 2' }));
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('the checked radio follows value', () => {
    renderWithProviders(<ChoiceField {...single(optionsOf(3), { value: '3' })} />);
    expect(screen.getByRole('radio', { name: 'Option 3' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('the checkbox group toggles membership', async () => {
    const onChange = vi.fn();
    renderWithProviders(<ChoiceField {...multiple(optionsOf(4), { value: ['1'], onChange })} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Option 3' }));
    expect(onChange).toHaveBeenLastCalledWith(['1', '3']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Option 1' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('required → aria-required on the radiogroup and on the combobox, and an aria-hidden red asterisk after the label', () => {
    const { unmount } = renderWithProviders(
      <ChoiceField {...single(optionsOf(3), { required: true })} />,
    );
    expect(screen.getByRole('radiogroup', { name: LABEL }).getAttribute('aria-required')).toBe(
      'true',
    );
    const mark = document.querySelector('legend [aria-hidden="true"]');
    expect(mark?.textContent).toBe('*');
    expect(mark?.className.split(' ')).toContain('text-destructive');
    unmount();
    renderWithProviders(<ChoiceField {...single(optionsOf(8), { required: true })} />);
    expect(screen.getByRole('combobox', { name: LABEL }).getAttribute('aria-required')).toBe(
      'true',
    );
    expect(document.querySelector('label [aria-hidden="true"]')?.textContent).toBe('*');
  });

  it('required checkbox group → a screen reader hears "required" in the group name (ARIA forbids aria-required on a group; lead 2026-09-26)', () => {
    renderWithProviders(<ChoiceField {...multiple(optionsOf(3), { required: true })} />);
    const group = screen.getByRole('group', { name: `${LABEL} ${COMMON.required_hidden}` });
    expect(group.hasAttribute('aria-required')).toBe(false);
    expect(within(group).getByText(COMMON.required_hidden).className.split(' ')).toContain(
      'sr-only',
    );
  });

  it('the hidden "required" is the checkbox group only: not on an optional group, not on a radiogroup (it has aria-required)', () => {
    const { unmount } = renderWithProviders(<ChoiceField {...multiple(optionsOf(3))} />);
    expect(screen.getByRole('group', { name: LABEL })).toBeDefined();
    unmount();
    renderWithProviders(<ChoiceField {...single(optionsOf(3), { required: true })} />);
    expect(screen.queryByText(COMMON.required_hidden)).toBeNull();
  });

  it('not required → no asterisk and no aria-required', () => {
    renderWithProviders(<ChoiceField {...single(optionsOf(3))} />);
    expect(document.querySelector('[aria-hidden="true"].text-destructive')).toBeNull();
    expect(screen.getByRole('radiogroup').getAttribute('aria-required')).not.toBe('true');
  });

  it('invalid → aria-invalid, and describedBy → aria-describedby, on the radiogroup, the checkbox group and the combobox', () => {
    const extra = { invalid: true, describedBy: 'field-error' } as const;
    const { unmount } = renderWithProviders(<ChoiceField {...single(optionsOf(3), extra)} />);
    const radios = screen.getByRole('radiogroup');
    expect(radios.getAttribute('aria-invalid')).toBe('true');
    expect(radios.getAttribute('aria-describedby')).toBe('field-error');
    unmount();
    const second = renderWithProviders(<ChoiceField {...multiple(optionsOf(3), extra)} />);
    const boxes = screen.getByRole('group', { name: LABEL });
    expect(boxes.getAttribute('aria-invalid')).toBe('true');
    expect(boxes.getAttribute('aria-describedby')).toBe('field-error');
    second.unmount();
    renderWithProviders(<ChoiceField {...multiple(optionsOf(9), extra)} />);
    const combobox = screen.getByRole('combobox', { name: LABEL });
    expect(combobox.getAttribute('aria-invalid')).toBe('true');
    expect(combobox.getAttribute('aria-describedby')).toBe('field-error');
  });

  it('disabled reaches every control', () => {
    renderWithProviders(<ChoiceField {...multiple(optionsOf(3), { disabled: true })} />);
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box.hasAttribute('disabled')).toBe(true);
    }
  });

  it('choiceSpan: 3 single → short; 5 single → full; 21 single → short; any multiple → full; undefined options → full (lead 2026-09-26: reserve the loaded width, no reflow)', () => {
    expect(choiceSpan(optionsOf(3), false)).toBe('short');
    expect(choiceSpan(optionsOf(4), false)).toBe('full');
    expect(choiceSpan(optionsOf(5), false)).toBe('full');
    expect(choiceSpan(optionsOf(6), false)).toBe('full');
    expect(choiceSpan(optionsOf(7), false)).toBe('short');
    expect(choiceSpan(optionsOf(21), false)).toBe('short');
    expect(choiceSpan(optionsOf(2), true)).toBe('full');
    expect(choiceSpan(optionsOf(21), true)).toBe('full');
    expect(choiceSpan(undefined, true)).toBe('full');
    expect(choiceSpan(undefined, false)).toBe('full');
  });

  it('under ar: no physical-direction class in any branch', () => {
    const cases: ChoiceFieldProps[] = [
      single(undefined),
      single(optionsOf(3)),
      single(optionsOf(6)),
      single(optionsOf(7)),
      multiple(optionsOf(6), { value: ['1'] }),
      multiple(optionsOf(7), { value: ['1', '2'] }),
    ];
    for (const props of cases) {
      const { container, unmount } = renderWithProviders(<ChoiceField {...props} />, {
        locale: 'ar',
      });
      expect(physicalClassesIn(container)).toEqual([]);
      unmount();
    }
  });
});
