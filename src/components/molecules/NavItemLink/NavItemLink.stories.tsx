import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { NavItem } from '@/config/navigation';
import { NavItemLink } from './NavItemLink';

const NODE_ITEM: NavItem = {
  id: 'staff',
  labelKey: 'shell.als_staff',
  href: '/setup/staff',
};

const LEGACY_ITEM: NavItem = {
  id: 'sales_returns',
  labelKey: 'shell.sales_returns',
  href: '/admin/sales_returns',
  legacy: true,
};

/** A Perfex container: no href, so it discloses children instead of navigating. */
const CONTAINER_ITEM: NavItem = {
  id: 'sales',
  labelKey: 'shell.als_sales',
  icon: 'bolt',
};

const meta = {
  title: 'Molecules/NavItemLink',
  component: NavItemLink,
  args: { item: NODE_ITEM, active: false },
} satisfies Meta<typeof NavItemLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A Node route: rendered through `next/link`. */
export const Node: Story = {};

/** The fill AND weight 600 AND the inline-start marker AND `aria-current` — never brand text. */
export const Active: Story = { args: { active: true } };

/**
 * A plain `<a href>` to Perfex (D-22), identical to `Node` apart from the trailing glyph — no
 * colour change, no opacity change. A member must never read "legacy" as "broken".
 */
export const Legacy: Story = { args: { item: LEGACY_ITEM } };

export const Container: Story = {
  args: { item: CONTAINER_ITEM },
  decorators: [
    function InDetails(Story) {
      return (
        <details open>
          <Story />
        </details>
      );
    },
  ],
};

export const Rtl: Story = { globals: { locale: 'ar' } };
