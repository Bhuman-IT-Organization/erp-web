import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldGrid, fieldSpan } from './FieldGrid';

function text(id: string, label: string): ReactNode {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} autoComplete="off" />
    </Field>
  );
}

/** Neutral fixture fields: two short pairs, then a full-width textarea (FE-05). */
const MIXED = [
  { key: 'first', span: fieldSpan('text'), node: text('grid-first', 'First Name') },
  { key: 'last', span: fieldSpan('text'), node: text('grid-last', 'Last Name') },
  { key: 'email', span: fieldSpan('email'), node: text('grid-email', 'Email') },
  { key: 'phone', span: fieldSpan('tel'), node: text('grid-phone', 'Phone') },
  {
    key: 'notes',
    span: fieldSpan('textarea'),
    node: (
      <Field>
        <FieldLabel htmlFor="grid-notes">Notes</FieldLabel>
        <Textarea id="grid-notes" />
      </Field>
    ),
  },
];

/** Short fields two to a row from `md`, full-width fields across both columns (D-01). */
const meta = {
  title: 'Molecules/FieldGrid',
  component: FieldGrid,
  args: { items: MIXED },
} satisfies Meta<typeof FieldGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {};

export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    items: [
      { key: 'first', span: 'short', node: text('grid-first-ar', 'الاسم الأول') },
      { key: 'last', span: 'short', node: text('grid-last-ar', 'اسم العائلة') },
      {
        key: 'notes',
        span: 'full',
        node: (
          <Field>
            <FieldLabel htmlFor="grid-notes-ar">ملاحظات</FieldLabel>
            <Textarea id="grid-notes-ar" />
          </Field>
        ),
      },
    ],
  },
};

/** Opt-in (lead 2026-10-07): a row's fields align to its bottom, so inputs line up under labels of different lengths. */
export const AlignInputs: Story = { args: { alignInputs: true } };
