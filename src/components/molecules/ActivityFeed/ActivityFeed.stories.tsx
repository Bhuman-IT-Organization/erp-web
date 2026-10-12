import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { ActivityFeed, type ActivityEntry, type ActivityNote } from './ActivityFeed';

// Made-up entries: one Arabic name and one long message with a line break.
const LONG =
  'Checked the expense against the cost center budget; one receipt was missing and was asked for again.\nThe remaining lines are approved after the review.';

const entries = (count: number): ActivityEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    actor: i === 1 ? 'سارة المنصوري' : `Staff member ${String(i + 1)}`,
    message: i === 0 ? LONG : `Record updated (${String(i + 1)})`,
    at: `2026-10-${String(5 - (i % 5)).padStart(2, '0')}T0${String(i % 10)}:15:00Z`,
  }));

// K23 fixtures, made up: a log with a customer line (no actor) and a 500-character entry.
const LONG_500 =
  'The customer called back: the payment is held at the bank while the papers for the two transfers are checked again by the compliance desk. '
    .repeat(4)
    .slice(0, 500);

const customerLog: ActivityEntry[] = [
  { id: 's1', message: 'Invoice sent', at: '2026-10-05T09:15:00Z' },
  {
    id: 's2',
    actor: 'سارة المنصوري',
    message: 'Sent to the customer with the evening post.',
    at: '2026-10-04T16:40:00Z',
    removable: true,
  },
  {
    id: 's3',
    actor: 'Staff member 3',
    message: LONG_500,
    at: '2026-10-04T11:05:00Z',
    removable: true,
  },
  { id: 's4', actor: 'Staff member 4', message: 'Quality Check', at: '2026-10-03T08:30:00Z' },
];

const NOTE_ERROR = "We couldn't add the note. Try again in a moment.";

const NOTE = {
  label: 'Add to the shipping log',
  submitLabel: 'Add note',
  pendingLabel: 'Adding note…',
  onAdd: fn(() => Promise.resolve()),
  errorOf: () => NOTE_ERROR,
} satisfies ActivityNote;

/** Types a note and presses the outline submit (the textarea through `fireEvent`, which reaches React here). */
async function submitNote(canvasElement: HTMLElement, text: string): Promise<void> {
  const canvas = within(canvasElement);
  await fireEvent.change(canvas.getByRole('textbox', { name: NOTE.label }), {
    target: { value: text },
  });
  await userEvent.click(canvas.getByRole('button', { name: NOTE.submitLabel }));
}

/** K19: a record's activity, newest first, ten then "Show {n} more". K23 adds four opt-ins. */
const meta = {
  title: 'Molecules/ActivityFeed',
  component: ActivityFeed,
  args: { entries: entries(4) },
  decorators: [
    (Story) => (
      <div className="max-w-xs p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

/** D-39: three skeleton entries, no empty text. */
export const Loading: Story = { args: { entries: undefined } };

export const Empty: Story = { args: { entries: [] } };

export const Loaded: Story = {};

/** Twelve entries: ten shown, then "Show 2 more". */
export const ShowMore: Story = { args: { entries: entries(12) } };

/** K23: a customer or system line (no actor) shows its message alone. */
export const ActorlessEntries: Story = { args: { entries: customerLog } };

/** K23: the entries the server marks removable carry a red `xmark` at their inline end. */
export const Removable: Story = { args: { entries: customerLog, onRemoveEntry: fn() } };

/** K23: the composer under the list. */
export const WithNote: Story = { args: { entries: customerLog, note: NOTE } };

/** K23: while the add runs the submit shows the pending label, disabled. */
export const NotePending: Story = {
  args: {
    entries: customerLog,
    note: { ...NOTE, onAdd: () => new Promise<void>(() => undefined) },
  },
  play: async ({ canvasElement }) => {
    await submitNote(canvasElement, 'Driver called, arriving at noon.');
    await expect(
      within(canvasElement).getByRole('button', { name: NOTE.pendingLabel }),
    ).toBeDisabled();
  },
};

/** K23: a failed add shows the feature's message under the textarea and keeps the text. */
export const NoteError: Story = {
  args: {
    entries: customerLog,
    note: { ...NOTE, onAdd: () => Promise.reject(new Error('made-up failure')) },
  },
  play: async ({ canvasElement }) => {
    await submitNote(canvasElement, 'Driver called, arriving at noon.');
    await within(canvasElement).findByText(NOTE_ERROR);
  },
};

/** K23: a log with no actors, the newest message at weight 600. */
export const HighlightNewest: Story = {
  args: {
    entries: customerLog.map(({ id, message, at }) => ({ id, message, at })),
    highlightNewest: true,
  },
};

/** Under ar, with the K23 opt-ins: the remove button and the submit sit at the inline end and start. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  args: { entries: customerLog, onRemoveEntry: fn(), note: NOTE },
};
