'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactElement, type SyntheticEvent } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface ImageThumbnailProps {
  /** The record's name: the button's "Enlarge photo of {name}" and the preview's title. */
  readonly name: string;
  /** The feature's lazy thumbnail image element, or `null` when the record has no image. */
  readonly thumbnail: ReactElement | null;
  /** The feature's larger preview image element; `null` means there is nothing to enlarge. */
  readonly preview: ReactElement | null;
  readonly placeholderIcon: 'user' | 'image';
}

// The list row opens its record on click (D-23: "clicking elsewhere on the row opens the record");
// the thumbnail and everything inside its preview are not that click. The dialog is portalled, but
// a React event still bubbles through the React tree to the row, so the content stops it too.
const stop = (event: SyntheticEvent): void => {
  event.stopPropagation();
};

/**
 * An image column's cell (D-23; UI-SPEC § Image column, choice 26).
 *
 * A 40 px frame keeps rows compact. With no image it is a muted placeholder with a centred glyph
 * (`user` for people, `image` otherwise) and is NOT a button. With an image it is a button named
 * "Enlarge photo of {name}" that opens a preview dialog over the list (at most min(90vw, 640px)
 * wide and 80vh tall, `object-contain`, titled with the record's name, a "Close preview" button);
 * Esc, a click outside or that button close it and focus returns to the thumbnail. The row never
 * opens from either.
 *
 * **FE-17: the kit never renders the image element itself.** An api-served image `src` belongs
 * under `src/features/<m>/**` (`check:brand` check 4), so the feature passes both elements in —
 * its thumbnail with `loading="lazy"` and `decoding="async"` and the api's small resized URL, its
 * preview with the api's larger resized URL, never the original upload. The frame sizes and crops
 * whatever it receives.
 *
 * A thumbnail that fails to load (a missing file, a broken image) becomes the placeholder and is no
 * longer a button: there is nothing to enlarge.
 */
export function ImageThumbnail({
  name,
  thumbnail,
  preview,
  placeholderIcon,
}: ImageThumbnailProps): ReactElement {
  const t = useTranslations('common');
  const [failed, setFailed] = useState(false);
  // ponytail: a failed thumbnail stays the placeholder until the cell remounts; key the cell by its URL
  // if a record's photo can change in place.
  const onFailed = (): void => {
    setFailed(true);
  };
  if (thumbnail === null || failed) {
    return (
      <span
        data-testid="thumbnail-placeholder"
        className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md border"
      >
        <Icon name={placeholderIcon} className="text-muted-foreground" />
      </span>
    );
  }
  const frame =
    'block size-10 shrink-0 overflow-hidden rounded-md border [&>*]:size-full [&>*]:object-cover';
  if (preview === null) {
    return (
      <span className={frame} onErrorCapture={onFailed}>
        {thumbnail}
      </span>
    );
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('enlarge_photo', { name })}
          className={`${frame} focus-visible:ring-ring/50 cursor-zoom-in outline-none focus-visible:ring-3`}
          onClick={stop}
          onErrorCapture={onFailed}
        >
          {thumbnail}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-w-[min(90vw,640px)] sm:max-w-[min(90vw,640px)]"
        onClick={stop}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{name}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center [&>*]:max-h-[80vh] [&>*]:max-w-full [&>*]:object-contain">
          {preview}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('close_preview')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
