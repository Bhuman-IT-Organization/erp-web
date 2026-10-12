'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type DragEvent, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { UploadRules } from '@/lib/api/use-upload-rules';
import { useFormat } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';

export interface FileDropzoneProps {
  /** The "Choose files" button's id (a field label may name it); the caption and input derive theirs. */
  readonly id: string;
  /** The purpose's rules from the api; `undefined` while they load (a 128px skeleton block). */
  readonly rules: UploadRules | undefined;
  /** Default true; an import card takes one file. */
  readonly multiple?: boolean;
  /** Files already queued in this save, counted against the rules' files per save. */
  readonly queuedCount: number;
  /** Only the accepted files of a pick. */
  readonly onPick: (files: readonly File[]) => void;
  /** `excel`: "Drop a file here to upload" and "Choose excel file" (the import cards). */
  readonly variant?: 'files' | 'excel';
  readonly disabled?: boolean;
}

type Reason = 'type' | 'size' | 'count';

interface Refusal {
  readonly file: File;
  readonly reason: Reason;
}

const MIB = 1_048_576;
const KIB = 1_024;

/** "{size} MB" from 1 MiB up (one decimal unless whole), else "{size} KB" (never 0), Western digits. */
export function useFileSize(): (bytes: number) => string {
  const t = useTranslations('common');
  const f = useFormat();
  return (bytes) => {
    if (bytes < MIB)
      return t('file_size_kb', { size: f.number(Math.max(1, Math.ceil(bytes / KIB))) });
    const mib = bytes / MIB;
    return t('file_size_mb', { size: f.number(mib, Number.isInteger(mib) ? 0 : 1) });
  };
}

/** The extension, lower case, without the dot; `''` for a name without one. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function refusalOf(
  file: File,
  allowed: ReadonlySet<string>,
  maxBytes: number,
  full: boolean,
): Reason | undefined {
  if (!allowed.has(extensionOf(file.name))) return 'type';
  if (file.size > maxBytes) return 'size';
  return full ? 'count' : undefined;
}

/**
 * The browser's check of a pick, in order: the extension, the size, then the room left in this save.
 *
 * @complexity O(n) over the picked files
 */
function checkPick(
  files: readonly File[],
  rules: UploadRules,
  room: number,
): { readonly accepted: File[]; readonly refused: Refusal[] } {
  const allowed = new Set(rules.extensions.map((extension) => extension.toLowerCase()));
  const accepted: File[] = [];
  const refused: Refusal[] = [];
  for (const file of files) {
    const reason = refusalOf(file, allowed, rules.maxBytes, accepted.length >= room);
    if (reason === undefined) accepted.push(file);
    else refused.push({ file, reason });
  }
  return { accepted, refused };
}

/**
 * K8's dropzone (UI-SPEC § Item page section 3 Attachments, § Imports; D-28, P-11): at least 128px,
 * a dashed border and a centred 16px `upload` icon, then "Choose files", the native file input
 * (`multiple`, `accept` from the rules' extensions). The button is the keyboard path; the zone
 * itself is not focusable, and dragging files over it fills it `muted/50`. Under it the caption
 * "Up to {count} files per save, {size} each. Allowed: {types}." from
 * `GET /api/v1/uploads/rules/:purpose`. A pick is checked BEFORE it reaches the queue: a refused
 * file (type, size, or more than the save has room for) never reaches `onPick` and shows "{file}
 * can't be attached: {reason}" as an alert under the caption, until the next pick. These checks are
 * a convenience; the api checks again (T-4.2-47).
 */
export function FileDropzone({
  id,
  rules,
  multiple = true,
  queuedCount,
  onPick,
  variant = 'files',
  disabled = false,
}: FileDropzoneProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const size = useFileSize();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [refusals, setRefusals] = useState<readonly string[]>([]);
  if (rules === undefined) {
    return <Skeleton data-testid="dropzone-loading" className="min-h-32 w-full" />;
  }
  const excel = variant === 'excel';
  const most = multiple ? rules.maxFiles : 1;
  const reasons: Readonly<Record<Reason, string>> = {
    type: t('file_type_not_allowed'),
    size: t('file_too_large', { size: size(rules.maxBytes) }),
    count: t('too_many_files', { count: most, countN: f.number(most) }),
  };
  const take = (files: readonly File[]): void => {
    if (disabled) return;
    const { accepted, refused } = checkPick(files, rules, most - queuedCount);
    setRefusals(
      refused.map(({ file, reason }) =>
        t('file_rejected', { file: file.name, reason: reasons[reason] }),
      ),
    );
    if (accepted.length > 0) onPick(accepted);
  };
  const onDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!disabled) setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    take(Array.from(event.dataTransfer.files));
  };
  return (
    <div className="flex w-full flex-col gap-1">
      <div
        data-testid="dropzone"
        data-dragging={dragging}
        className={cn(
          'flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center',
          dragging && 'bg-muted/50',
        )}
        onDragEnter={onDragEnter}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <Icon name="upload" className="text-muted-foreground" />
        <p className="text-sm">{excel ? t('drop_file_here') : t('drop_files_here_to_upload')}</p>
        <input
          ref={input}
          id={`${id}-input`}
          data-testid="dropzone-input"
          type="file"
          hidden
          multiple={multiple}
          accept={rules.extensions.map((extension) => `.${extension}`).join(',')}
          disabled={disabled}
          onChange={(event) => {
            take(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-describedby={`${id}-limits`}
          onClick={() => {
            input.current?.click();
          }}
        >
          {excel ? t('choose_excel_file') : t('choose_files')}
        </Button>
      </div>
      <p id={`${id}-limits`} className="text-muted-foreground text-xs">
        {t('upload_limits', {
          count: rules.maxFiles,
          countN: f.number(rules.maxFiles),
          size: size(rules.maxBytes),
          types: rules.extensions.join(', '),
        })}
      </p>
      {refusals.map((text, index) => (
        // Two files of one name refused for one reason read alike; the position tells them apart.
        <p key={`${String(index)}:${text}`} role="alert" className="text-destructive text-sm">
          {text}
        </p>
      ))}
    </div>
  );
}
