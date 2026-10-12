import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LegacyLink } from './LegacyLink';

/** K22: a plain link to a Perfex page; a value that is not a same-origin path stays text. */
const meta = {
  title: 'Molecules/LegacyLink',
  component: LegacyLink,
  args: { href: '/admin/purchase/purchase_order/12', children: <bdi>PO-0012</bdi> },
} satisfies Meta<typeof LegacyLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Another host is never a link (T-4.6-29): the text alone. */
export const NotSameOrigin: Story = { args: { href: 'https://elsewhere.example/x' } };

export const Rtl: Story = { globals: { locale: 'ar' } };
