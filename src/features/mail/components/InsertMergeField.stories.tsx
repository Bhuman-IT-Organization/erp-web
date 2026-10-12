import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { InsertMergeField } from './InsertMergeField';
import { MergeFieldInput, MergeFieldTextarea } from './MergeFieldInputs';

// Synthetic merge fields only (W0-05): the timesheets tokens, never a value from a database.
const FIELDS = [
  { token: 'staff_name', kind: 'text' },
  { token: 'date_time', kind: 'text' },
  { token: 'link', kind: 'url' },
] as const;

/** The picker inside its real field: the subject of one version, in that version's direction. */
function SubjectField({
  locale,
  initial,
}: {
  readonly locale: string;
  readonly initial: string;
}): ReactElement {
  const t = useTranslations('mail');
  const [value, setValue] = useState(initial);
  return (
    <div className="max-w-xl">
      <MergeFieldInput
        id={`story-versions.${locale}.subject`}
        label={t('label_in_language', {
          label: t('template_subject'),
          language: t('locale_label', { locale }),
        })}
        invalid={false}
        disabled={false}
        locale={locale}
        fields={FIELDS}
        value={value}
        onChange={setValue}
        required={locale === 'en'}
      />
    </div>
  );
}

/** The picker on a version's message: the textarea with its helper, in that version's direction. */
function MessageField({ locale }: { readonly locale: string }): ReactElement {
  const t = useTranslations('mail');
  const [value, setValue] = useState('');
  return (
    <div className="max-w-xl">
      <MergeFieldTextarea
        id={`story-versions.${locale}.message`}
        label={t('label_in_language', {
          label: t('email_template_email_message'),
          language: t('locale_label', { locale }),
        })}
        helper={t('message_helper')}
        invalid={false}
        disabled={false}
        locale={locale}
        fields={FIELDS}
        value={value}
        onChange={setValue}
      />
    </div>
  );
}

const meta = {
  title: 'Features/Mail/InsertMergeField',
  component: InsertMergeField,
  args: {
    fieldLabel: 'Subject (English)',
    fields: FIELDS,
    target: () => null,
    onInsert: () => undefined,
    disabled: false,
  },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InsertMergeField>;

export default meta;
type Story = StoryObj<typeof meta>;

const openList = async (canvasElement: HTMLElement): Promise<HTMLElement> => {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: /^Insert merge field into/ }),
  );
  return screen.findByRole('listbox', { name: 'Available merge fields' });
};

/** The outline 32px button with its `plus`, at the end of the field's label row. */
export const Closed: Story = {
  render: () => <SubjectField locale="en" initial="Hello " />,
};

/** Open: the search box and this template's fields, each its name over its token. */
export const Open: Story = {
  render: () => <SubjectField locale="en" initial="Hello " />,
  play: async ({ canvasElement }) => {
    const list = await openList(canvasElement);
    await expect(within(list).getAllByRole('option')).toHaveLength(3);
  },
};

/** A search matching nothing names the query. */
export const NoMatch: Story = {
  render: () => <SubjectField locale="en" initial="" />,
  play: async ({ canvasElement }) => {
    await openList(canvasElement);
    await userEvent.type(screen.getByPlaceholderText('Search merge fields'), 'zz');
    await expect(await screen.findByText('No merge fields match “zz”')).toBeInTheDocument();
  },
};

/** Picked: the token at the caret, focus back in the field with the caret after it. */
export const Inserted: Story = {
  render: () => <SubjectField locale="en" initial="Hello " />,
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole<HTMLInputElement>('textbox');
    input.focus();
    input.setSelectionRange(6, 6);
    const list = await openList(canvasElement);
    await userEvent.click(within(list).getByRole('option', { name: /Staff name/ }));
    await waitFor(async () => {
      await expect(input).toHaveFocus();
    });
    await expect(input).toHaveValue('Hello {staff_name}');
    await expect(input.selectionStart).toBe(18);
  },
};

/** Arabic interface: the label row and the popover mirror; the Arabic message reads right to left. */
export const Rtl: Story = {
  render: () => <MessageField locale="ar" />,
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    const list = await openList(canvasElement);
    await expect(within(list).getAllByRole('option')).toHaveLength(3);
  },
};
