import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent } from 'storybook/test';
import { AttachmentList, type AttachmentEntry } from './AttachmentList';

// Synthetic entries only. A story may not render an image element of its own (`check:brand`,
// FE-17): a neutral grey block stands in for a stored image's thumbnail, as in ImageThumbnail's,
// and a wider 3:2 block for its preview (wider than the dialog, so the preview shows it whole).
const thumbnail = <span aria-hidden="true" className="bg-muted-foreground/40 block size-full" />;
const preview = (
  <span aria-hidden="true" className="bg-muted-foreground/40 block aspect-[3/2] w-[720px]" />
);
const MIB = 1_048_576;

const STORED: readonly AttachmentEntry[] = [
  {
    key: 's1',
    name: 'photo.png',
    size: 240 * 1024,
    isImage: true,
    state: 'stored',
    thumbnail,
    preview,
  },
  {
    key: 's2',
    name: 'datasheet-with-a-long-name.pdf',
    size: 2.5 * MIB,
    isImage: false,
    state: 'stored',
  },
];

const REASONS: Readonly<Record<string, string>> = {
  'ERP-FILES-0001': "This file type isn't allowed.",
  'ERP-FILES-0002': 'This file is larger than 64 MB.',
};

const meta = {
  title: 'Molecules/AttachmentList',
  component: AttachmentList,
  args: {
    entries: STORED,
    reasonText: (code: string) => REASONS[code] ?? '',
    onDownload: fn(),
    onRemove: fn(),
    onUndo: fn(),
    onCancel: fn(),
    onResume: fn(),
    onRetry: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AttachmentList>;

export default meta;
type Story = StoryObj<typeof meta>;

const queued = (over: Partial<AttachmentEntry>): AttachmentEntry => ({
  key: 'q1',
  name: 'manual.pdf',
  size: 6 * MIB,
  isImage: false,
  state: 'new',
  ...over,
});

/** Stored files: an image thumbnail that opens the preview, a file with the paperclip; one marked for removal. */
export const Stored: Story = {
  args: {
    entries: [
      ...STORED,
      {
        key: 's3',
        name: 'old-label.pdf',
        size: 80 * 1024,
        isImage: false,
        state: 'will-be-removed',
      },
    ],
  },
};

/** The thumbnail opens the kit's preview dialog: the file name, the image whole, "Close preview". */
export const PreviewOpen: Story = {
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Enlarge photo of photo.png' }),
    );
    await expect(await screen.findByRole('dialog', { name: 'photo.png' })).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Close preview' })).toBeInTheDocument();
  },
};

/** After Save: "Uploading manual.pdf… 40%" read out politely, with "Cancel upload". */
export const Uploading: Story = {
  args: { entries: [...STORED, queued({ state: 'uploading', percent: 40 })] },
};

/** The connection dropped: "Paused, connection lost" with "Resume upload". */
export const UploadPaused: Story = {
  args: { entries: [...STORED, queued({ state: 'paused', percent: 40 })] },
};

/** The connection came back: "Resuming from 40%" until new bytes arrive. */
export const UploadResumed: Story = {
  args: { entries: [...STORED, queued({ state: 'resuming', percent: 40, resumedFrom: 40 })] },
};

/** "Cancel upload" discarded the partial upload: the tile is "New" again. */
export const UploadCancelled: Story = {
  args: { entries: [...STORED, queued({ state: 'new', percent: 0 })] },
};

/** The api's check refused the file: "x.exe wasn't attached: …" with only Remove left. */
export const UploadRejected: Story = {
  args: {
    entries: [
      ...STORED,
      queued({ name: 'x.exe', size: 1024, state: 'rejected', code: 'ERP-FILES-0001' }),
    ],
  },
};

/** Another failure: "We couldn't upload manual.pdf." with a Retry icon button. */
export const UploadFailed: Story = {
  args: { entries: [...STORED, queued({ state: 'failed', code: 'ERP-NETWORK-0001' })] },
};

/** A member who may only view: downloads stay; nothing can be removed. */
export const ReadOnly: Story = { args: { readOnly: true } };

/** 375px: two tiles to a row. */
export const Mobile: Story = {
  args: {
    entries: [
      ...STORED,
      queued({ state: 'uploading', percent: 40 }),
      queued({ key: 'q2', state: 'paused' }),
    ],
  },
  parameters: {
    viewport: {
      options: {
        mobile375: { name: 'Mobile 375', styles: { width: '375px', height: '740px' } },
      },
    },
  },
  globals: { viewport: { value: 'mobile375', isRotated: false } },
};

/** Arabic: the tiles and their buttons mirror; file names keep their own direction; the image opens its preview. */
export const Rtl: Story = {
  args: {
    entries: [
      ...STORED,
      queued({ name: 'كتالوج.pdf', state: 'uploading', percent: 40 }),
      queued({ key: 'q2', name: 'x.exe', state: 'rejected', code: 'ERP-FILES-0001' }),
    ],
  },
  globals: { locale: 'ar' },
};
