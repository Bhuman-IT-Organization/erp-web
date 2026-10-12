import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Icon, ICON_NAMES } from './Icon';

/**
 * The whole registry on one page: a reviewer can see every Perfex glyph beside the lucide icon it
 * became, which is the only practical way to catch a wrong mapping. The `Rtl` story renders the same
 * grid under `ar` (FE-20) — the icons must not mirror, only the layout.
 */
const meta = {
  title: 'Atoms/Icon',
  component: Icon,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { name: 'user' } };

const Grid = (): React.ReactElement => (
  // Three columns below `sm` and names that may break anywhere: at 375 px the six-column grid
  // overhung the viewport by 2 px under `ar` (plan 03.2-14's audit).
  <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
    {ICON_NAMES.map((name) => (
      <li key={name} className="flex min-w-0 flex-col items-center gap-1 text-xs">
        <Icon name={name} className="size-5" />
        <code className="text-muted-foreground text-center break-all">{name}</code>
      </li>
    ))}
  </ul>
);

export const Registry: Story = {
  args: { name: 'user' },
  render: () => <Grid />,
};

export const Rtl: Story = {
  args: { name: 'user' },
  globals: { locale: 'ar' },
  render: () => <Grid />,
};
