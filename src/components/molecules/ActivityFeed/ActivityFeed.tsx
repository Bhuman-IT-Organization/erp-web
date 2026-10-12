'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/lib/i18n/format';

/** One entry of a record's activity log, its words already resolved by the feature. */
export interface ActivityEntry {
  readonly id: string;
  /** The staff member's name; absent for a customer or system line, which shows its message alone (K23). */
  readonly actor?: string;
  /** Plain text; line breaks are kept, markup is shown as text. */
  readonly message: string;
  /** An ISO date-time; `''` when the row has none (a Perfex log line with a NULL date): no time shows. */
  readonly at: string;
  /** K23: shows the remove button when the feed has `onRemoveEntry`. */
  readonly removable?: boolean;
}

/** K23: the note composer under the list, its words translated by the feature (the submit falls back to common). */
export interface ActivityNote {
  /** Translated: the textarea's visible label ("Add to the shipping log"). */
  readonly label: string;
  readonly placeholder?: string;
  /** Translated: the submit; common's "Add note" (`add_note`) when absent. */
  readonly submitLabel?: string;
  /** Translated: the submit while adding; common's "Adding note…" (`adding_note`) when absent. */
  readonly pendingLabel?: string;
  /** Resolves when added (the textarea clears); rejects to show `errorOf(error)` under it, the text kept. */
  readonly onAdd: (text: string) => Promise<void>;
  /** Translated message for a failed add (the feature maps the problem code to its copy). */
  readonly errorOf: (error: unknown) => string;
}

export interface ActivityFeedProps {
  /** Newest first, as given; `undefined` while the log loads (D-39). */
  readonly entries: readonly ActivityEntry[] | undefined;
  /** How many entries show before "Show {n} more"; 10 by default. */
  readonly pageSize?: number;
  /** K23: called with the entry id after the feature's own confirm; the kit renders the button only. */
  readonly onRemoveEntry?: (id: string) => void;
  /** K23: the composer under the list; absent means no composer. */
  readonly note?: ActivityNote;
  /** K23: the first (newest) entry's message at weight 600 (Perfex's highlight). */
  readonly highlightNewest?: boolean;
  /** Opt-in (plan 04.7-23): the empty line's words ("No notes yet"); "No activity yet" when absent. */
  readonly emptyText?: string;
}

const DEFAULT_PAGE = 10;
const SKELETON_ENTRIES = 3;

/**
 * K19 (04.6 UI-SPEC § Kit additions, § Detail tab "Activity log"): a record's activity, newest
 * first as the feature orders it. Each entry: the actor (14/600), the message (14/400, as text with
 * its line breaks, never HTML: T-4.6-28), then the time at caption size through `useFormat`'s
 * `dateTime`. The first `pageSize` entries, then a ghost "Show {n} more" that shows the rest. Three
 * skeleton entries while loading, never the empty text (D-39); "No activity yet" in muted text for
 * none. A molecule (FE-06): it imports only `ui/`, `atoms/` and `lib/`.
 *
 * K23 (04.7 UI-SPEC § Kit additions), four opt-ins that leave every other use as it was: an entry without `actor` (a customer or system line) shows its message alone; with
 * `onRemoveEntry`, an entry marked `removable` gets a 32px ghost `xmark` button in destructive text
 * at its inline end, named "Remove entry from {dateTime}" (the confirm lives in the feature, the
 * kit only calls back); `note` renders a labelled textarea and an outline submit ("Add note" unless the feature names it) under the list
 * (local state: empty input shows "Enter a note.", the pending label while adding, the feature's
 * translated error on a failed add with the text kept); `highlightNewest` sets the first entry's
 * message at weight 600. Messages stay plain text everywhere, stored
 * markup included (T-4.7-07).
 */
export function ActivityFeed({
  entries,
  pageSize = DEFAULT_PAGE,
  onRemoveEntry,
  note,
  highlightNewest = false,
  emptyText,
}: ActivityFeedProps): ReactElement {
  const t = useTranslations('common');
  const f = useFormat();
  const [all, setAll] = useState(false);
  if (entries === undefined) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: SKELETON_ENTRIES }, (_, index) => (
          <div key={index} data-testid="activity-loading" className="flex flex-col gap-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }
  const composer = note === undefined ? null : <NoteComposer note={note} />;
  if (entries.length === 0) {
    const empty = <EmptyLine text={emptyText} />;
    return composer === null ? (
      empty
    ) : (
      <div className="flex flex-col gap-4">
        {empty}
        {composer}
      </div>
    );
  }
  const shown = all ? entries : entries.slice(0, pageSize);
  const rest = entries.length - shown.length;
  const list = (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {shown.map((entry, index) => {
          const when = entry.at === '' ? '' : f.dateTime(entry.at);
          const body = (
            <>
              {entry.actor === undefined ? null : (
                <span className="font-semibold">{entry.actor}</span>
              )}
              <span
                className={
                  highlightNewest && index === 0
                    ? 'font-semibold whitespace-pre-line wrap-anywhere'
                    : 'whitespace-pre-line wrap-anywhere'
                }
              >
                {entry.message}
              </span>
              {entry.at === '' ? null : (
                <time dateTime={entry.at} className="text-muted-foreground text-xs tabular-nums">
                  <bdi>{when}</bdi>
                </time>
              )}
            </>
          );
          if (onRemoveEntry === undefined || entry.removable !== true) {
            return (
              <li key={entry.id} className="flex flex-col text-sm">
                {body}
              </li>
            );
          }
          return (
            <li key={entry.id} className="flex items-start gap-2 text-sm">
              <div className="flex min-w-0 flex-1 flex-col">{body}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive size-8"
                aria-label={t('remove_entry_named', { dateTime: when })}
                onClick={() => {
                  onRemoveEntry(entry.id);
                }}
              >
                <Icon name="xmark" className="size-4" />
              </Button>
            </li>
          );
        })}
      </ol>
      {rest > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            setAll(true);
          }}
        >
          {t('show_more_count', { count: rest, n: f.number(rest) })}
        </Button>
      ) : null}
    </div>
  );
  return composer === null ? (
    list
  ) : (
    <div className="flex flex-col gap-4">
      {list}
      {composer}
    </div>
  );
}

/** The empty line: the feature's words (opt-in, plan 04.7-23), else "No activity yet". */
function EmptyLine({ text }: { readonly text: string | undefined }): ReactElement {
  const t = useTranslations('common');
  return <p className="text-muted-foreground text-sm">{text ?? t('activity_empty')}</p>;
}

/** K23's composer: Enter makes a line break (a textarea), the outline button submits. */
function NoteComposer({ note }: { readonly note: ActivityNote }): ReactElement {
  const t = useTranslations('common');
  const id = useId();
  const errorId = `${id}-error`;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const submit = async (): Promise<void> => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setError(t('note_required'));
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await note.onAdd(trimmed);
      setText('');
    } catch (failure: unknown) {
      setError(note.errorOf(failure));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{note.label}</Label>
      <Textarea
        id={id}
        value={text}
        placeholder={note.placeholder}
        readOnly={pending}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={pending}
        onClick={() => {
          void submit();
        }}
      >
        {pending ? (note.pendingLabel ?? t('adding_note')) : (note.submitLabel ?? t('add_note'))}
      </Button>
    </div>
  );
}
