import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { FileDropzone } from './FileDropzone';

/** The rules `GET /api/v1/uploads/rules/:purpose` answers (P-11 defaults); synthetic files only. */
const RULES = {
  purpose: 'demo.attachment',
  maxBytes: 67_108_864,
  maxFiles: 10,
  extensions: ['png', 'jpg', 'pdf'],
};

/**
 * A native drag event carrying synthetic files. Testing Library's `fireEvent` copies `dataTransfer`
 * into a new DataTransfer from its own properties, which a browser's DataTransfer has none of, so
 * the files would be lost; a DragEvent built here keeps them.
 */
function drag(
  target: HTMLElement,
  type: 'dragenter' | 'drop',
  names: readonly string[] = [],
): void {
  const transfer = new DataTransfer();
  for (const name of names) transfer.items.add(new File([new Uint8Array([77, 90])], name));
  target.dispatchEvent(
    new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
  );
}

const meta = {
  title: 'Molecules/FileDropzone',
  component: FileDropzone,
  args: { id: 'story-attachments', rules: RULES, queuedCount: 0, onPick: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileDropzone>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The 128px dashed zone, "Choose files" and the caption from the rules. */
export const Idle: Story = {};

/** The rules have not arrived: a 128px skeleton block, no caption yet (D-39). */
export const Loading: Story = { args: { rules: undefined } };

/** Files dragged over the zone: it fills muted/50. */
export const DragOver: Story = {
  play: async ({ canvasElement }) => {
    const zone = within(canvasElement).getByTestId('dropzone');
    drag(zone, 'dragenter');
    // dragenter renders at continuous priority, a task later.
    await waitFor(async () => {
      await expect(zone).toHaveAttribute('data-dragging', 'true');
    });
  },
};

/** A refused pick never enters the queue: "x.exe can't be attached: This file type isn't allowed." */
export const UploadRejected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    drag(canvas.getByTestId('dropzone'), 'drop', ['x.exe']);
    await expect(await canvas.findByRole('alert')).toBeInTheDocument();
  },
};

/** An import card: one file, "Drop a file here to upload" and "Choose excel file". */
export const Excel: Story = {
  args: {
    id: 'story-import',
    multiple: false,
    variant: 'excel',
    rules: { ...RULES, purpose: 'demo.import', maxFiles: 1, extensions: ['csv', 'xlsx'] },
  },
};

/** 375px: the zone takes the full width. */
export const Mobile: Story = {
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** Arabic: the zone's contents mirror; a refusal reads under the caption. */
export const Rtl: Story = {
  globals: { locale: 'ar' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    drag(canvas.getByTestId('dropzone'), 'drop', ['x.exe']);
    await expect(await canvas.findByRole('alert')).toBeInTheDocument();
  },
};
