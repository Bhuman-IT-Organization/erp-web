import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import { MergeFieldInput, MergeFieldTextarea } from './MergeFieldInputs';

// Synthetic merge fields and wording only (W0-05).
const FIELDS = [
  { token: 'staff_name', kind: 'text' },
  { token: 'link', kind: 'url' },
] as const;

interface VersionProps {
  readonly locale: string;
  readonly subject?: string;
  readonly message?: string;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
}

/** One version's subject and message, as the editor shows them. */
function Version({
  locale,
  subject = '',
  message = '',
  invalid = false,
  disabled = false,
}: VersionProps): ReactElement {
  const t = useTranslations('mail');
  const [values, setValues] = useState({ subject, message });
  const language = t('locale_label', { locale });
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <MergeFieldInput
        id={`story-versions.${locale}.subject`}
        label={t('label_in_language', { label: t('template_subject'), language })}
        invalid={invalid}
        disabled={disabled}
        locale={locale}
        fields={FIELDS}
        value={values.subject}
        onChange={(next) => {
          setValues({ ...values, subject: next });
        }}
        required={locale === 'en'}
      />
      <MergeFieldTextarea
        id={`story-versions.${locale}.message`}
        label={t('label_in_language', { label: t('email_template_email_message'), language })}
        helper={t('message_helper')}
        invalid={invalid}
        disabled={disabled}
        locale={locale}
        fields={FIELDS}
        value={values.message}
        onChange={(next) => {
          setValues({ ...values, message: next });
        }}
        required={locale === 'en'}
      />
    </div>
  );
}

const meta = {
  title: 'Features/Mail/MergeFieldInputs',
  component: Version,
  args: { locale: 'en', subject: 'Template 1 for {staff_name}', message: 'Hello {staff_name}' },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Version>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The English version: both fields required, left to right. */
export const English: Story = {};

/** The Arabic version inside an English interface: its inputs read right to left. */
export const ArabicVersionInEnglish: Story = {
  args: { locale: 'ar', subject: '', message: '' },
  play: async ({ canvasElement }) => {
    const [subject] = within(canvasElement).getAllByRole('textbox');
    await expect(subject?.getAttribute('dir')).toBe('rtl');
  },
};

/** Field errors: the controls carry `aria-invalid`. */
export const Invalid: Story = { args: { invalid: true, subject: '', message: '' } };

/** A member without the edit code: every control and Insert merge field disabled. */
export const Disabled: Story = { args: { disabled: true } };

/** The Arabic interface, the English version: the labels mirror, the inputs stay left to right. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    const [subject] = within(canvasElement).getAllByRole('textbox');
    await expect(subject?.getAttribute('dir')).toBe('ltr');
  },
};
