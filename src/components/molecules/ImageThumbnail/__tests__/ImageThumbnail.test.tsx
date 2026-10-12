// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { ImageThumbnail } from '../ImageThumbnail';

/**
 * UI-SPEC § Image column (D-23, FE-17). The kit owns the frame, the placeholder, the button and the
 * preview dialog; the FEATURE supplies the image elements (`src/features/<m>/**` renders the `<img>`
 * with the api's URL). These tests pass neutral stand-in elements: `check:brand` refuses an `<img>`
 * element in any code file outside `src/features/**`, tests included.
 */
const COMMON = commonEn.common;
const NAME = 'Jane Doe';
const ENLARGE = COMMON.enlarge_photo.replace('{name}', NAME);
const thumb = <span data-testid="feature-thumbnail" />;
const preview = <span data-testid="feature-preview" role="img" aria-label={NAME} />;

function renderThumbnail(
  props: Partial<Parameters<typeof ImageThumbnail>[0]> = {},
  locale: 'en' | 'ar' = 'en',
) {
  const onRow = vi.fn();
  const view = renderWithProviders(
    <div data-testid="row" onClick={onRow}>
      <ImageThumbnail
        name={NAME}
        thumbnail={thumb}
        preview={preview}
        placeholderIcon="user"
        {...props}
      />
    </div>,
    { locale },
  );
  return { onRow, view };
}

// A real image element, as the feature passes it: a `data:` src written in place is allowed in a
// test (FE-17, check:brand's D-43 exemption). The failure is fired by hand.
const realThumb = (
  // eslint-disable-next-line @next/next/no-img-element -- a test's neutral inline image, as StaffList renders the api's
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" data-testid="thumb-img" />
);

const tokens = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);

describe('ImageThumbnail (D-23, FE-17)', () => {
  it('with no thumbnail: a 40 px muted frame with the user glyph, not a button', () => {
    renderThumbnail({ thumbnail: null, preview: null });
    const frame = screen.getByTestId('thumbnail-placeholder');
    expect(tokens(frame)).toEqual(expect.arrayContaining(['size-10', 'rounded-md', 'bg-muted']));
    expect(frame.querySelector('[data-icon-name="user"]')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the placeholder glyph is image for anything that is not a person', () => {
    renderThumbnail({ thumbnail: null, preview: null, placeholderIcon: 'image' });
    expect(
      screen.getByTestId('thumbnail-placeholder').querySelector('[data-icon-name="image"]'),
    ).not.toBeNull();
  });

  it('with a thumbnail: a 40 px button named "Enlarge photo of Jane Doe" wrapping the feature element', () => {
    renderThumbnail();
    const button = screen.getByRole('button', { name: ENLARGE });
    expect(within(button).getByTestId('feature-thumbnail')).not.toBeNull();
    expect(tokens(button)).toEqual(expect.arrayContaining(['size-10', 'rounded-md', 'border']));
  });

  it('clicking it opens a dialog titled "Jane Doe" with the preview and a "Close preview" button; the row never opens', async () => {
    const { onRow } = renderThumbnail();
    await userEvent.click(screen.getByRole('button', { name: ENLARGE }));
    const dialog = await screen.findByRole('dialog', { name: NAME });
    expect(within(dialog).getByTestId('feature-preview')).not.toBeNull();
    expect(within(dialog).getByRole('heading', { name: NAME })).not.toBeNull();
    const close = within(dialog).getByRole('button', { name: COMMON.close_preview });
    // A click inside the open preview does not reach the row either (the dialog is a React child).
    await userEvent.click(within(dialog).getByTestId('feature-preview'));
    await userEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onRow).not.toHaveBeenCalled();
  });

  it('Esc closes the preview and focus returns to the thumbnail button', async () => {
    renderThumbnail();
    const button = screen.getByRole('button', { name: ENLARGE });
    await userEvent.click(button);
    await screen.findByRole('dialog', { name: NAME });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('the dialog has only the one labelled close button (not the primitive’s English "Close")', async () => {
    renderThumbnail();
    await userEvent.click(screen.getByRole('button', { name: ENLARGE }));
    const dialog = await screen.findByRole('dialog', { name: NAME });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([COMMON.close_preview]);
  });

  it('with a thumbnail but no preview there is nothing to enlarge: the frame, not a button', () => {
    renderThumbnail({ preview: null });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('feature-thumbnail')).not.toBeNull();
  });

  it('ImageThumbnail.tsx renders no img element itself (FE-17: the feature supplies it)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/molecules/ImageThumbnail/ImageThumbnail.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/<img[\s/>]/);
  });

  it('uses no physical-direction class under ar, closed and open', async () => {
    const { view } = renderThumbnail({}, 'ar');
    expect(physicalClassesIn(view.container)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: ENLARGE }));
    expect(physicalClassesIn(await screen.findByRole('dialog'))).toEqual([]);
  });

  it('a thumbnail that fails to load falls back to the placeholder, and there is nothing to enlarge', () => {
    renderThumbnail({ thumbnail: realThumb });
    fireEvent.error(screen.getByTestId('thumb-img'));
    expect(screen.getByTestId('thumbnail-placeholder')).not.toBeNull();
    expect(screen.queryByRole('button', { name: ENLARGE })).toBeNull();
    expect(screen.queryByTestId('thumb-img')).toBeNull();
  });

  it('a thumbnail with no preview that fails to load falls back to the placeholder too', () => {
    renderThumbnail({ thumbnail: realThumb, preview: null });
    fireEvent.error(screen.getByTestId('thumb-img'));
    expect(screen.getByTestId('thumbnail-placeholder')).not.toBeNull();
    expect(screen.queryByTestId('thumb-img')).toBeNull();
  });

  it('a thumbnail that loads stays the button that enlarges it', () => {
    renderThumbnail({ thumbnail: realThumb });
    fireEvent.load(screen.getByTestId('thumb-img'));
    const button = screen.getByRole('button', { name: ENLARGE });
    expect(within(button).getByTestId('thumb-img')).not.toBeNull();
    expect(screen.queryByTestId('thumbnail-placeholder')).toBeNull();
  });
});
