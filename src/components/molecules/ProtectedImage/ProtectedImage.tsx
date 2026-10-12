'use client';

import type { ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileBlob } from '@/lib/api/use-file-blob';
import { useObjectUrl } from '@/lib/hooks/use-object-url';
import { cn } from '@/lib/utils';

/** The api path type, taken from the read door (a component never imports `call-api`, FE-08). */
type ApiPath = NonNullable<Parameters<typeof useFileBlob>[0]>;

export interface ProtectedImageProps {
  /** The api path of the image's bytes; `null` when the record has no image. */
  readonly path: ApiPath | null;
  readonly alt: string;
  /** The frame's size and shape (`size-24`), applied to the image, its skeleton and its placeholder. */
  readonly className?: string;
}

/**
 * An image only the api may serve (PATTERNS M7): an `<img src>` cannot carry the bearer, so the
 * bytes are read through the one axios instance (`useFileBlob`, which waits for the session and
 * sends the bearer) and shown by an object URL (`useObjectUrl`, revoked when the image changes or
 * unmounts, T-4.2-48). A skeleton of the same size while the bytes are on their way; the `image`
 * glyph when there is no image or it could not be read, never an error message (a thumbnail that
 * failed is not worth an alert). The one kit `<img>`: `check:brand` admits this file because its
 * `src` is always an object URL, never a path (FE-17).
 */
export function ProtectedImage({ path, alt, className }: ProtectedImageProps): ReactElement {
  const { blob, isLoading } = useFileBlob(path);
  const url = useObjectUrl(blob);
  if (isLoading || (blob !== undefined && url === undefined)) {
    return (
      <Skeleton data-testid="protected-image-loading" className={cn('rounded-md', className)} />
    );
  }
  if (url === undefined) {
    return (
      <span
        data-testid="protected-image-placeholder"
        {...(alt === '' ? { 'aria-hidden': true } : { role: 'img', 'aria-label': alt })}
        className={cn('bg-muted flex items-center justify-center rounded-md', className)}
      >
        <Icon name="image" className="text-muted-foreground" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- api-served user data (FE-17), shown by object URL (M7)
    <img src={url} alt={alt} className={cn('object-cover', className)} />
  );
}
