import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { SignaturePad } from './SignaturePad';

/** K18: draw a signature, clear it, or type a name that is drawn on the same canvas. */
const meta = {
  title: 'Molecules/SignaturePad',
  component: SignaturePad,
  args: { id: 'signature', onChange: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SignaturePad>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** A stroke across the pad: the PNG reaches onChange. */
export const Drawn: Story = {
  play: async ({ canvasElement, args }) => {
    const pad = within(canvasElement).getByRole('img', { name: 'Signature' });
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: pad, coords: { x: 40, y: 100 } },
      { target: pad, coords: { x: 120, y: 60 } },
      { target: pad, coords: { x: 200, y: 120 } },
      { target: pad, coords: { x: 320, y: 70 } },
      { keys: '[/MouseLeft]', target: pad, coords: { x: 320, y: 70 } },
    ]);
    // The PNG comes from the canvas's asynchronous toBlob.
    await waitFor(async () => {
      await expect(args.onChange).toHaveBeenCalledWith(expect.any(Blob));
    });
  },
};

/** The keyboard alternative: the typed name is drawn on the canvas. */
export const Typed: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(
      within(canvasElement).getByRole('textbox', { name: 'Type your name to sign' }),
      'Sample Signer',
    );
  },
};

/** Under ar the buttons mirror; the canvas does not, and an Arabic name sits centred. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    await userEvent.type(
      within(canvasElement).getByRole('textbox', { name: 'Type your name to sign' }),
      'سارة المنصوري',
    );
  },
};
