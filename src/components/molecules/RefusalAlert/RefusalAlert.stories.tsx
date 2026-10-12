import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RefusalAlert, type RefusalLine } from './RefusalAlert';

// Made-up refusals: item names, codes and quantities are invented, never a client value.
const MESSAGE = 'Some lines credit more than was invoiced.';
const HINT = 'Lower these quantities, or choose another invoice.';

function line(n: number, item: string, max: number): RefusalLine {
  return {
    id: String(n),
    content: (
      <>
        Line <bdi>{n}</bdi>, {item}: <bdi>{max}</bdi> at most.
      </>
    ),
  };
}

const LINES: readonly RefusalLine[] = [
  line(2, 'Hex bolt M8', 4),
  line(5, 'Copper pipe 15 mm', 12),
  line(7, 'Wall plug, pack of 50', 1),
];

const ITEMS = ['Hex bolt M8', 'Copper pipe 15 mm', 'Wall plug, pack of 50', 'Cable tie 200 mm'];
const MANY: readonly RefusalLine[] = Array.from({ length: 40 }, (_, index) =>
  line(index + 1, ITEMS[index % ITEMS.length] ?? 'Hex bolt M8', (index % 9) + 1),
);

// The feature's Arabic copy (made up here): codes, numbers and Latin item names in <bdi>.
function arabicLine(n: number, item: string, max: number): RefusalLine {
  return {
    id: String(n),
    content: (
      <>
        البند <bdi>{n}</bdi>، <bdi>{item}</bdi>: <bdi>{max}</bdi> كحد أقصى.
      </>
    ),
  };
}

const ARABIC_LINES: readonly RefusalLine[] = [
  arabicLine(2, 'برغي سداسي', 4),
  arabicLine(5, 'Copper pipe 15 mm', 12),
  arabicLine(7, 'Wall plug, pack of 50', 1),
];

const ARABIC_ACTION = (
  <Button asChild variant="outline" size="sm">
    <a href="#credit-note-7">
      فتح إشعار دائن <bdi>CN-0007</bdi>
    </a>
  </Button>
);

const ACTION = (
  <Button asChild variant="outline" size="sm">
    <a href="#credit-note-7">
      Open credit note <bdi>CN-0007</bdi>
    </a>
  </Button>
);

/** K25: a server refusal as one destructive alert, with its refused lines, a hint and one action. */
const meta = {
  title: 'Molecules/RefusalAlert',
  component: RefusalAlert,
  args: { message: MESSAGE },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RefusalAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The message alone: no list, no focusable region, no action. */
export const MessageOnly: Story = {
  args: { message: 'This cost center is no longer active. Choose another one.' },
};

/** Three refused lines in a list named "Lines refused", focusable for the keyboard. */
export const WithLines: Story = {
  args: { lines: LINES },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Lines refused' });
    await expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    await expect(list.tabIndex).toBe(0);
  },
};

/** Lines, the hint after them and one outline action on its own row. */
export const WithAction: Story = {
  args: { lines: LINES, hint: HINT, action: ACTION },
};

/** Forty lines scroll inside the alert (240px at most); the hint and the action stay in view. */
export const ManyLinesScroll: Story = {
  args: { lines: MANY, hint: HINT, action: ACTION },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Lines refused' });
    await expect(list.clientHeight).toBeLessThanOrEqual(240);
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    await expect(
      within(canvasElement).getByRole('link', { name: 'Open credit note CN-0007' }),
    ).toBeInTheDocument();
  },
};

/** Inside a 512px dialog of at most 85dvh: the alert above the footer, the footer's order unchanged. */
export const InDialog: Story = {
  render: (args) => (
    <Dialog open>
      <DialogContent showCloseButton={false} className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create refund</DialogTitle>
          <DialogDescription>The refund takes every line of this credit note.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <RefusalAlert {...args} />
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline">Back to credit note</Button>
          <Button>Create refund</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  args: {
    message: 'Some lines are over budget in the chosen cost center.',
    lines: MANY.slice(0, 12),
    hint: 'Choose another cost center for these lines, or raise its budget first.',
  },
};

/** Under ar: the icon, the bullets and the action at the inline start; no physical side class. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: {
    message: 'بعض البنود تُرجع أكثر مما تم استلامه.',
    lines: ARABIC_LINES,
    hint: 'خفّض هذه الكميات، أو اختر إيصال استلام آخر.',
    action: ARABIC_ACTION,
  },
};
