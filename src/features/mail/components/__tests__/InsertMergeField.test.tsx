// @vitest-environment happy-dom
import { useRef, useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/test/render';
import { InsertMergeField } from '../InsertMergeField';

/**
 * Insert merge field (04.3 UI-SPEC § Insert merge field): this template's fields only, searchable
 * without a RegExp from the input, inserted at the caret of the field the button belongs to,
 * replacing a selection, focus back on the field with the caret after the token; Esc returns focus
 * to the button. Synthetic tokens only.
 */
const FIELDS = [
  { token: 'staff_name', kind: 'text' },
  { token: 'link', kind: 'url' },
] as const;

function Harness({
  initial,
  select,
  disabled = false,
}: {
  readonly initial: string;
  readonly select?: readonly [number, number];
  readonly disabled?: boolean;
}): ReactElement {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <input
        ref={ref}
        aria-label="Subject"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onFocus={(event) => {
          if (select !== undefined) event.target.setSelectionRange(select[0], select[1]);
        }}
      />
      <InsertMergeField
        fieldLabel="Subject (English)"
        fields={FIELDS}
        target={() => ref.current}
        onInsert={setValue}
        disabled={disabled}
      />
    </div>
  );
}

const subject = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>('textbox', { name: 'Subject' });
const trigger = (): HTMLElement =>
  screen.getByRole('button', { name: 'Insert merge field into Subject (English)' });

async function open(): Promise<HTMLElement> {
  await userEvent.click(trigger());
  return screen.findByRole('listbox', { name: 'Available merge fields' });
}

describe('InsertMergeField', () => {
  it('Closed: the outline button named for its field, its visible text "Insert merge field"', () => {
    renderWithProviders(<Harness initial="" />);
    expect(trigger().textContent).toContain('Insert merge field');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Open: lists only the given fields, each with its name and its token', async () => {
    renderWithProviders(<Harness initial="" />);
    const list = await open();
    const options = within(list).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Staff name{staff_name}',
      'Link{link}',
    ]);
    expect(screen.getByPlaceholderText('Search merge fields').isConnected).toBe(true);
  });

  it('inserts at the caret: "Hello |" gives "Hello {staff_name}", focus and caret after the token', async () => {
    renderWithProviders(<Harness initial="Hello " />);
    subject().focus();
    subject().setSelectionRange(6, 6);
    const list = await open();
    await userEvent.click(within(list).getByRole('option', { name: /Staff name/ }));
    expect(subject().value).toBe('Hello {staff_name}');
    await waitFor(() => {
      expect(document.activeElement).toBe(subject());
    });
    expect(subject().selectionStart).toBe(18);
    expect(subject().selectionEnd).toBe(18);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('replaces a selection: "Hello world" with "world" selected', async () => {
    renderWithProviders(<Harness initial="Hello world" />);
    subject().focus();
    subject().setSelectionRange(6, 11);
    const list = await open();
    await userEvent.click(within(list).getByRole('option', { name: /Link/ }));
    expect(subject().value).toBe('Hello {link}');
    await waitFor(() => {
      expect(subject().selectionStart).toBe(12);
    });
  });

  it('search: typing "link" leaves the link field, and Enter inserts it', async () => {
    renderWithProviders(<Harness initial="" />);
    const list = await open();
    await userEvent.type(screen.getByPlaceholderText('Search merge fields'), 'link');
    await waitFor(() => {
      expect(within(list).getAllByRole('option')).toHaveLength(1);
    });
    await userEvent.keyboard('{Enter}');
    expect(subject().value).toBe('{link}');
  });

  it('NoMatch: a query with regex characters does not throw and names the query', async () => {
    renderWithProviders(<Harness initial="" />);
    await open();
    await userEvent.type(screen.getByPlaceholderText('Search merge fields'), '(');
    expect((await screen.findByText('No merge fields match “(”')).isConnected).toBe(true);
  });

  it('Esc closes the list and returns focus to the button, inserting nothing', async () => {
    renderWithProviders(<Harness initial="Hi" />);
    await open();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger());
    });
    expect(subject().value).toBe('Hi');
  });

  it('disabled: the button is disabled', () => {
    renderWithProviders(<Harness initial="" disabled />);
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
  });
});
