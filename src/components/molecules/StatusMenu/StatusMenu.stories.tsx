import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { StatusMenu, type StatusMenuOption } from './StatusMenu';

// Made-up statuses and a made-up document code.
const OPTIONS: readonly StatusMenuOption[] = [
  { value: 'packing', label: 'Waiting to pack' },
  { value: 'ready', label: 'Ready to leave' },
  { value: 'road', label: 'On the road' },
  { value: 'handed', label: 'Handed over' },
  { value: 'refused', label: 'Refused at the door' },
];
const TRIGGER = 'Change status of DN-0042';
const CAPTION = 'The customer is e-mailed about each change.';

async function open(canvasElement: HTMLElement): Promise<void> {
  await userEvent.click(within(canvasElement).getByRole('button', { name: TRIGGER }));
  const menu = await screen.findByRole('menu');
  // The menu fades in: it mounts at opacity 0.
  await waitFor(async () => {
    await expect(menu).toBeVisible();
  });
}

/** K24: a status badge with a "Mark as" menu; without options, the plain badge. */
const meta = {
  title: 'Molecules/StatusMenu',
  component: StatusMenu,
  args: {
    status: 'pending',
    label: 'On the road',
    options: OPTIONS,
    current: 'road',
    onMark: fn(),
    triggerLabel: TRIGGER,
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-72 items-start justify-end p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Without options (a reader, or before the write cutover): exactly the badge. */
export const Plain: Story = {
  render: () => <StatusMenu status="done" label="Handed over" />,
};

export const WithMenu: Story = {};

/** While a mark is saving: the trigger is disabled and named "Changing status…". */
export const Pending: Story = { args: { pending: true } };

/** Opened: the caption row, then one "Mark as" item per status except the current. */
export const Open: Story = {
  args: { caption: CAPTION },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};

/** Under ar: the trigger follows the badge at the inline end; the menu mirrors. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: { caption: CAPTION },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};
