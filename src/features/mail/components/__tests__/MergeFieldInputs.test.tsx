// @vitest-environment happy-dom
import { useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import {
  MergeFieldInput,
  MergeFieldTextarea,
  type MergeFieldControlProps,
} from '../MergeFieldInputs';

/**
 * The two merge-field controls (04.3 UI-SPEC § Sections 2 to n, § RTL and mobile): each input
 * carries its VERSION's direction and language whatever the interface's, renders its own label on
 * `id` (a `SchemaForm` custom field) and the Insert merge field button at the label row's end.
 * Synthetic tokens only (`staff_name`, `link`).
 */
const FIELDS = [
  { token: 'staff_name', kind: 'text' },
  { token: 'link', kind: 'url' },
] as const;

type Props = Partial<MergeFieldControlProps> & { readonly area?: boolean };

function Harness({ area = false, ...props }: Props): ReactElement {
  const [value, setValue] = useState(props.value ?? '');
  const shared: MergeFieldControlProps = {
    id: 'f-versions.ar.subject',
    label: 'Subject (Arabic)',
    invalid: false,
    disabled: false,
    locale: 'ar',
    fields: FIELDS,
    ...props,
    value,
    onChange: setValue,
  };
  return area ? (
    <MergeFieldTextarea {...shared} helper="Plain text." />
  ) : (
    <MergeFieldInput {...shared} />
  );
}

describe('MergeFieldInput and MergeFieldTextarea', () => {
  it('the Arabic subject is right to left in Arabic inside an English interface', () => {
    renderWithProviders(<Harness />);
    const input = screen.getByRole('textbox', { name: /^Subject \(Arabic\)/ });
    expect(input.getAttribute('dir')).toBe('rtl');
    expect(input.getAttribute('lang')).toBe('ar');
  });

  it('the English message is left to right in English inside an Arabic interface', () => {
    const { container } = renderWithProviders(
      <Harness area id="f-versions.en.message" label="Email message (English)" locale="en" />,
      { locale: 'ar' },
    );
    const area = screen.getByRole('textbox', { name: /^Email message \(English\)/ });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.getAttribute('dir')).toBe('ltr');
    expect(area.getAttribute('lang')).toBe('en');
    expect(physicalClassesIn(container)).toEqual([]);
  });

  it('wires the label to the id, aria-invalid to invalid and aria-describedby to describedBy', () => {
    renderWithProviders(<Harness invalid describedBy="f-error" />);
    const input = screen.getByLabelText(/^Subject \(Arabic\)/);
    expect(input.getAttribute('id')).toBe('f-versions.ar.subject');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('f-error');
  });

  it("the textarea's helper describes it, and it is at least 12 rows high and resizes vertically", () => {
    renderWithProviders(<Harness area id="msg" describedBy="msg-error" />);
    const area = screen.getByRole('textbox', { name: /^Subject \(Arabic\)/ });
    const helper = screen.getByText('Plain text.');
    expect(area.getAttribute('aria-describedby')?.split(' ')).toEqual([helper.id, 'msg-error']);
    expect(area.className).toContain('min-h-64');
    expect(area.className).toContain('resize-y');
  });

  it('the required asterisk shows on an English field and not on an optional one', () => {
    const { unmount } = renderWithProviders(
      <Harness id="en" label="Subject (English)" locale="en" required />,
    );
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
    expect(
      screen.getByRole('textbox', { name: /^Subject \(English\)/ }).getAttribute('aria-required'),
    ).toBe('true');
    unmount();
    renderWithProviders(<Harness />);
    expect(screen.queryByText('*')).toBeNull();
  });

  it('the label row holds Insert merge field for this field, and focus reports the field', async () => {
    let focused = 0;
    renderWithProviders(
      <Harness
        onFocus={() => {
          focused += 1;
        }}
      />,
    );
    const insert = screen.getByRole('button', { name: 'Insert merge field into Subject (Arabic)' });
    expect(insert.isConnected).toBe(true);
    await userEvent.click(screen.getByRole('textbox', { name: /^Subject \(Arabic\)/ }));
    expect(focused).toBe(1);
  });

  it('disabled disables the input and its Insert merge field button', () => {
    renderWithProviders(<Harness disabled />);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: /^Subject \(Arabic\)/ });
    expect(input.disabled).toBe(true);
    const insert = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Insert merge field into Subject (Arabic)',
    });
    expect(insert.disabled).toBe(true);
  });
});
