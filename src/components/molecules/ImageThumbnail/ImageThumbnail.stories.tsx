import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ImageThumbnail } from './ImageThumbnail';

/**
 * An image column's cell (D-23). In a screen the FEATURE passes its own lazy image elements with the
 * api's resized URLs (FE-17). A story may not: `check:brand` refuses an image element in any code
 * file outside `src/features/**`, stories included, so these stories pass neutral grey blocks of the
 * same role — no customer asset, no URL — and the kit frames and crops them as it would a photo.
 */
const photo = (
  <span aria-hidden="true" className="bg-muted-foreground/40 block size-full" data-testid="photo" />
);
const largePhoto = (
  <span
    role="img"
    aria-label="Jane Doe"
    className="bg-muted-foreground/40 block aspect-[4/5] w-80"
    data-testid="photo-preview"
  />
);

const meta = {
  title: 'Molecules/ImageThumbnail',
  component: ImageThumbnail,
  args: { name: 'Jane Doe', thumbnail: photo, preview: largePhoto, placeholderIcon: 'user' },
} satisfies Meta<typeof ImageThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A record with a photo: the thumbnail is a button that enlarges it. */
export const WithImage: Story = {};

/** No photo: the muted frame with the person glyph; not a button. */
export const Placeholder: Story = { args: { thumbnail: null, preview: null } };

/** The preview over the list, opened by clicking the thumbnail. */
export const PreviewOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Enlarge photo of Jane Doe' }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(body.getByRole('dialog', { name: 'Jane Doe' })).toBeVisible();
    });
  },
};

export const Rtl: Story = { args: { name: 'جين دو' }, globals: { locale: 'ar' } };

/**
 * A photo whose file cannot be loaded (a 404 or a broken file): the placeholder, not a button. The
 * `data:` URI written in place cannot be decoded, so the browser fails it the way it fails a 404.
 */
export const BrokenImage: Story = {
  args: {
    thumbnail: (
      // eslint-disable-next-line @next/next/no-img-element -- a story's neutral inline image, as StaffList renders the api's
      <img src="data:image/png;base64,AAAA" alt="" />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByTestId('thumbnail-placeholder')).toBeVisible();
    });
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};
