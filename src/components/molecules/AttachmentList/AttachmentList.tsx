'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { useFileSize } from '@/components/molecules/FileDropzone';
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
import { useFileBlob } from '@/lib/api/use-file-blob';
import { useFormat } from '@/lib/i18n/format';
import type { UploadItemStatus } from '@/lib/hooks/use-upload-queue';
import { cn } from '@/lib/utils';

/** One tile: a stored file (perhaps marked for removal) or a queued one in its upload state. */
export interface AttachmentEntry {
  readonly key: string;
  readonly name: string;
  readonly size: number | null;
  readonly isImage: boolean;
  readonly state: 'stored' | 'will-be-removed' | UploadItemStatus;
  readonly percent?: number;
  readonly resumedFrom?: number | null;
  readonly code?: string | null;
  /** A `<ProtectedImage>` for a stored image; nothing for other files. */
  readonly thumbnail?: ReactNode;
  /**
   * Opt-in (4.2 gap round 2): the larger image the thumbnail opens. With both `thumbnail` and
   * `preview`, the 96 px frame is a button named "Enlarge photo of {name}" that opens the kit's
   * preview dialog: the file name as its title, the image shown whole at most min(90vw, 640px) wide
   * and 80vh tall, and "Close preview"; Esc, a click outside or that button close it and focus
   * returns to the frame. Without `preview` the frame is not a button. Read-only lists keep it.
   */
  readonly preview?: ReactNode;
  /**
   * Opt-in: the api path the thumbnail reads. When that read fails (the server does not hold the
   * bytes, e.g. a Perfex file whose folder lost it), the tile is a plain file tile: the paperclip,
   * no thumbnail and no preview, Download only. One SWR read serves this and the thumbnail.
   */
  readonly imagePath?: Parameters<typeof useFileBlob>[0];
}

export interface AttachmentListProps {
  readonly entries: readonly AttachmentEntry[];
  /** The plain reason for a refusal code (ERP-FILES-0001, -0002 to the `common` reasons). */
  readonly reasonText: (code: string) => string;
  readonly onDownload?: (key: string) => void;
  readonly onRemove?: (key: string) => void;
  readonly onUndo?: (key: string) => void;
  readonly onCancel?: (key: string) => void;
  readonly onResume?: (key: string) => void;
  readonly onRetry?: (key: string) => void;
  /** No remove, undo or cancel; downloads stay. */
  readonly readOnly?: boolean;
}

type Handlers = Omit<AttachmentListProps, 'entries' | 'reasonText' | 'readOnly'>;
type Translate = ReturnType<typeof useTranslations<'common'>>;

const FRAME = 'flex size-24 items-center justify-center overflow-hidden rounded-md border bg-muted';
const FILLED = '[&>*]:size-full [&>*]:object-cover';
const DESTRUCTIVE_STATES: ReadonlySet<AttachmentEntry['state']> = new Set<AttachmentEntry['state']>(
  ['rejected', 'failed'],
);

/** The 96px frame: a thumbnail (a button opening the preview), else the image or paperclip glyph. */
function Frame({ entry }: { readonly entry: AttachmentEntry }): ReactElement {
  const t = useTranslations('common');
  const unreadable = useFileBlob(entry.imagePath ?? null).error !== undefined;
  if (unreadable) {
    return (
      <span className={FRAME}>
        <Icon name="paperclip" className="text-muted-foreground" />
      </span>
    );
  }
  if (entry.thumbnail === undefined || entry.thumbnail === null) {
    return (
      <span className={FRAME}>
        <Icon name={entry.isImage ? 'image' : 'paperclip'} className="text-muted-foreground" />
      </span>
    );
  }
  if (entry.preview === undefined || entry.preview === null) {
    return <span className={cn(FRAME, FILLED)}>{entry.thumbnail}</span>;
  }
  // ponytail: same dialog as ImageThumbnail; extract an ImagePreview molecule (and its template copy)
  // when a third caller needs it.
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('enlarge_photo', { name: entry.name })}
          className={cn(
            FRAME,
            FILLED,
            'focus-visible:ring-ring/50 cursor-zoom-in outline-none focus-visible:ring-3',
          )}
        >
          {entry.thumbnail}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-w-[min(90vw,640px)] sm:max-w-[min(90vw,640px)]"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold break-words">
            <bdi>{entry.name}</bdi>
          </DialogTitle>
        </DialogHeader>
        {/* min-w-0: the grid cell may shrink, so a wide preview never pushes the dialog past its width. */}
        <div className="flex min-w-0 justify-center [&>*]:max-h-[80vh] [&>*]:max-w-full [&>*]:object-contain">
          {entry.preview}
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

/** What a status line needs: the entry, the messages, Western-digit percents and refusal reasons. */
interface StatusInput {
  readonly entry: AttachmentEntry;
  readonly t: Translate;
  readonly percent: (value: number) => string;
  readonly reasonText: (code: string) => string;
}

/** Each state's status line: what is happening to the file, read out as it changes. */
const STATUS: Readonly<Record<AttachmentEntry['state'], (input: StatusInput) => string>> = {
  stored: () => '',
  done: () => '',
  new: ({ t }) => t('file_new'),
  'will-be-removed': ({ t }) => t('file_will_be_removed'),
  uploading: ({ entry, t, percent }) =>
    t('uploading_file', { file: entry.name, percent: percent(entry.percent ?? 0) }),
  paused: ({ t }) => t('upload_paused'),
  resuming: ({ entry, t, percent }) =>
    t('resuming_from', { percent: percent(entry.resumedFrom ?? entry.percent ?? 0) }),
  rejected: ({ entry, t, reasonText }) =>
    t('upload_check_failed', { file: entry.name, reason: reasonText(entry.code ?? '') }),
  failed: ({ entry, t }) => t('upload_failed', { file: entry.name }),
};

type ActionKind = 'download' | 'retry' | 'cancel' | 'resume' | 'undo' | 'remove';

/** The buttons each state offers, in order. */
const ACTIONS: Readonly<Record<AttachmentEntry['state'], readonly ActionKind[]>> = {
  stored: ['download', 'remove'],
  'will-be-removed': ['undo'],
  new: ['remove'],
  uploading: ['cancel'],
  resuming: ['cancel'],
  paused: ['resume'],
  rejected: ['remove'],
  failed: ['retry', 'remove'],
  done: [],
};

/** Each button: its handler, its look, and its text or icon; the name always says which file. */
const ACTION_SPECS: Readonly<
  Record<
    ActionKind,
    {
      readonly handler: keyof Handlers;
      readonly variant: 'ghost' | 'outline' | 'link';
      readonly icon?: IconName;
      readonly text?: 'cancel_upload' | 'resume_upload' | 'undo';
      readonly name?: (t: Translate, file: string) => string;
      readonly className?: string;
    }
  >
> = {
  download: {
    handler: 'onDownload',
    variant: 'ghost',
    icon: 'download',
    name: (t, file) => t('download_file', { file }),
  },
  retry: {
    handler: 'onRetry',
    variant: 'ghost',
    icon: 'rotate-right',
    name: (t, file) => t('retry_upload', { file }),
  },
  cancel: {
    handler: 'onCancel',
    variant: 'ghost',
    icon: 'xmark',
    text: 'cancel_upload',
    name: (t, file) => t('cancel_upload_named', { file }),
  },
  resume: {
    handler: 'onResume',
    variant: 'outline',
    text: 'resume_upload',
    name: (t, file) => t('resume_upload_named', { file }),
  },
  undo: { handler: 'onUndo', variant: 'link', text: 'undo', className: 'h-auto p-0' },
  remove: {
    handler: 'onRemove',
    variant: 'ghost',
    icon: 'trash-can',
    name: (t, file) => t('remove_file', { file }),
    className: 'text-destructive',
  },
};

/** The tile's buttons for its state; read-only leaves only Download. */
function Actions({
  entry,
  readOnly,
  handlers,
}: {
  readonly entry: AttachmentEntry;
  readonly readOnly: boolean;
  readonly handlers: Handlers;
}): ReactElement {
  const t = useTranslations('common');
  const kinds = ACTIONS[entry.state].filter((kind) => !readOnly || kind === 'download');
  return (
    <div className="flex flex-wrap items-center gap-1">
      {kinds.map((kind) => {
        const spec = ACTION_SPECS[kind];
        const handler = handlers[spec.handler];
        if (handler === undefined) return null;
        return (
          <Button
            key={kind}
            type="button"
            variant={spec.variant}
            {...(spec.text === undefined ? { size: 'icon' as const } : {})}
            {...(spec.name === undefined ? {} : { 'aria-label': spec.name(t, entry.name) })}
            className={spec.className}
            onClick={() => {
              handler(entry.key);
            }}
          >
            {spec.icon === undefined ? null : <Icon name={spec.icon} />}
            {spec.text === undefined ? null : t(spec.text)}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * K8's tiles (UI-SPEC § Item page section 3 Attachments; D-28, P-12): a wrapping grid of 128px
 * columns, 8px apart (two to a row at 375px). Each tile: the 96px frame (a stored image's thumbnail;
 * with the entry's opt-in `preview` it opens the kit's preview dialog, never a download; any other
 * file shows the `paperclip` glyph), the name on one line with the full
 * name in `title` (in `<bdi>`), the size in KB or MB, a status line read out politely as it changes
 * ("New", "Will be removed", "Uploading {file}… {percent}%", "Paused, connection lost", "Resuming
 * from {percent}%", "{file} wasn't attached: {reason}", "We couldn't upload {file}."), and the
 * buttons of that state, each named for its file: Download and Remove (stored), Undo (marked for
 * removal), Cancel upload (uploading, resuming), Resume upload (paused), Retry (failed), and Remove
 * for a new, refused or failed file. A refused file never reads as attached (T-4.2-47). Every name
 * is React text (T-4.2-49).
 */
export function AttachmentList({
  entries,
  reasonText,
  readOnly = false,
  ...handlers
}: AttachmentListProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const size = useFileSize();
  const percent = (value: number): string => f.number(value);
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,8rem)] gap-2">
      {entries.map((entry) => (
        <li
          key={entry.key}
          data-testid={`attachment-${entry.key}`}
          className="flex w-32 flex-col gap-1"
        >
          <Frame entry={entry} />
          <p className="truncate text-sm" title={entry.name}>
            <bdi>{entry.name}</bdi>
          </p>
          {entry.size === null ? null : (
            <p className="text-muted-foreground text-xs">{size(entry.size)}</p>
          )}
          <p
            aria-live="polite"
            className={cn(
              'text-xs',
              DESTRUCTIVE_STATES.has(entry.state) ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {STATUS[entry.state]({ entry, t, percent, reasonText })}
          </p>
          <Actions entry={entry} readOnly={readOnly} handlers={handlers} />
        </li>
      ))}
    </ul>
  );
}
