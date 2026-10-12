import { useEffect, useEffectEvent, useReducer, useRef } from 'react';
import {
  createUpload,
  type UploadDeps,
  type UploadHandle,
  type UploadOutcome,
  type UploadTarget,
} from '@/lib/api/upload-file';

/**
 * The files of one save on their way to the api (P-12, UI-SPEC § Item page section 3 and § Imports).
 * Each picked file is an item: `new` until the save uploads it, then `uploading` with its percent,
 * and in the end `done` (with the stored resource's id), `rejected` (the api's check refused it:
 * shown with its code, never as attached) or `failed`. A failure that may pass later (a dropped
 * connection) is `paused` instead, and resumes by itself when the browser's `online` event fires; a
 * resumed item reads `resuming` from its percent until new bytes pass it. `cancel` terminates the
 * server's partial upload and puts the item back to `new` at 0%.
 *
 * The state is a pure reducer (`uploadQueueReducer`); the tus work goes through the one door,
 * `createUpload`, one handle per item (kept for resume and retry).
 */
export type UploadItemStatus =
  'new' | 'uploading' | 'paused' | 'resuming' | 'done' | 'rejected' | 'failed';

/** One picked file in the queue. */
export interface UploadItem {
  readonly key: string;
  readonly file: File;
  readonly status: UploadItemStatus;
  readonly percent: number;
  /** The percent a resume started from (the server's offset), while `resuming`. */
  readonly resumedFrom: number | null;
  readonly code: string | null;
  readonly resourceId: string | null;
}

/** What changes an item: added, removed, started, progress, the resume offset, the end, a reset. */
export type UploadQueueAction =
  | { readonly type: 'add'; readonly items: readonly UploadItem[] }
  | { readonly type: 'remove'; readonly key: string }
  | { readonly type: 'started'; readonly key: string; readonly resuming: boolean }
  | { readonly type: 'progress'; readonly key: string; readonly percent: number }
  | { readonly type: 'resumeFrom'; readonly key: string; readonly percent: number }
  | { readonly type: 'settled'; readonly key: string; readonly outcome: UploadOutcome }
  | { readonly type: 'reset'; readonly key: string };

type ItemAction = Exclude<UploadQueueAction, { readonly type: 'add' | 'remove' }>;

const REMOVABLE: ReadonlySet<UploadItemStatus> = new Set<UploadItemStatus>([
  'new',
  'rejected',
  'failed',
]);
const WHOLE = 100;

const fresh = (item: UploadItem): UploadItem => ({
  ...item,
  status: 'new',
  percent: 0,
  resumedFrom: null,
  code: null,
});

function settled(item: UploadItem, outcome: UploadOutcome): UploadItem {
  switch (outcome.kind) {
    case 'done':
      return {
        ...item,
        status: 'done',
        percent: WHOLE,
        resumedFrom: null,
        code: null,
        resourceId: outcome.resourceId,
      };
    case 'rejected':
      return { ...item, status: 'rejected', resumedFrom: null, code: outcome.code };
    case 'failed':
      return {
        ...item,
        status: outcome.retryable ? 'paused' : 'failed',
        resumedFrom: null,
        code: outcome.code,
      };
    case 'cancelled':
      return fresh(item);
  }
}

function changed(item: UploadItem, action: ItemAction): UploadItem {
  switch (action.type) {
    case 'started':
      return action.resuming
        ? { ...item, status: 'resuming', resumedFrom: item.percent, code: null }
        : { ...item, status: 'uploading', resumedFrom: null, code: null };
    case 'progress': {
      const stillResuming = item.status === 'resuming' && action.percent <= (item.resumedFrom ?? 0);
      return { ...item, percent: action.percent, status: stillResuming ? 'resuming' : 'uploading' };
    }
    case 'resumeFrom':
      return { ...item, status: 'resuming', resumedFrom: action.percent, percent: action.percent };
    case 'settled':
      return settled(item, action.outcome);
    case 'reset':
      return fresh(item);
  }
}

/** Pure: the queue after one action; `remove` leaves an item that is uploading, paused or done. */
export function uploadQueueReducer(
  items: readonly UploadItem[],
  action: UploadQueueAction,
): readonly UploadItem[] {
  if (action.type === 'add') return [...items, ...action.items];
  if (action.type === 'remove') {
    return items.filter((item) => item.key !== action.key || !REMOVABLE.has(item.status));
  }
  return items.map((item) => (item.key === action.key ? changed(item, action) : item));
}

const percentOf = (sent: number, total: number): number =>
  total <= 0 ? WHOLE : Math.floor((sent / total) * WHOLE);

const EMPTY: readonly UploadItem[] = [];

/** The queue of one form or import card, uploading to `target.purpose`. */
export function useUploadQueue(
  target: UploadTarget,
  deps?: UploadDeps,
): {
  readonly items: readonly UploadItem[];
  readonly add: (files: readonly File[]) => void;
  readonly remove: (key: string) => void;
  /** Uploads the waiting files; `resourceIds` names what each upload made (an import card starts its run with it). */
  readonly startAll: (meta?: Readonly<Record<string, string>>) => Promise<{
    readonly done: number;
    readonly notDone: number;
    readonly resourceIds: readonly string[];
  }>;
  /**
   * Opt-in (04.6-14): adds the files and uploads them at once with `meta`, one after another, for a
   * screen with no save bar (a record's Attachments tab); the same summary as `startAll`.
   */
  readonly uploadNow: (
    files: readonly File[],
    meta: Readonly<Record<string, string>>,
  ) => Promise<{
    readonly done: number;
    readonly notDone: number;
    readonly resourceIds: readonly string[];
  }>;
  readonly resume: (key: string) => void;
  readonly cancel: (key: string) => Promise<void>;
  readonly retry: (key: string) => void;
} {
  const [items, dispatch] = useReducer(uploadQueueReducer, EMPTY);
  const handles = useRef(new Map<string, UploadHandle>());
  const nextKey = useRef(0);
  /** Items removed since they were queued: a run already going skips them. */
  const removed = useRef(new Set<string>());

  /** The item's handle: made at its first start with that start's meta, kept for resume and retry. */
  const handleFor = (item: UploadItem, meta?: Readonly<Record<string, string>>): UploadHandle => {
    const known = handles.current.get(item.key);
    if (known !== undefined) return known;
    const handle = createUpload(
      item.file,
      { purpose: target.purpose, ...(meta === undefined ? {} : { meta }) },
      {
        onProgress: (sent, total) => {
          dispatch({ type: 'progress', key: item.key, percent: percentOf(sent, total) });
        },
        onResumeFrom: (offset, total) => {
          dispatch({ type: 'resumeFrom', key: item.key, percent: percentOf(offset, total) });
        },
      },
      deps,
    );
    handles.current.set(item.key, handle);
    return handle;
  };

  const run = async (
    item: UploadItem,
    resuming: boolean,
    meta?: Readonly<Record<string, string>>,
  ) => {
    const handle = handleFor(item, meta);
    dispatch({ type: 'started', key: item.key, resuming });
    const outcome = await handle.start();
    dispatch({ type: 'settled', key: item.key, outcome });
    return outcome;
  };

  /** A paused or failed item starts again; tus resumes from what the server already holds. */
  const restart = (key: string, resuming: boolean): void => {
    const item = items.find((candidate) => candidate.key === key);
    if (item?.status !== 'paused' && item?.status !== 'failed') return;
    void run(item, resuming);
  };

  const resumePaused = useEffectEvent(() => {
    for (const item of items) if (item.status === 'paused') restart(item.key, true);
  });
  // effect: subscribe: resume paused uploads when the browser comes back online
  useEffect(() => {
    const onOnline = (): void => {
      resumePaused();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, []);

  /** New items for the files, each with its own key. */
  const itemsOf = (files: readonly File[]): UploadItem[] =>
    files.map((file): UploadItem => {
      nextKey.current += 1;
      return {
        key: `upload-${String(nextKey.current)}`,
        file,
        status: 'new',
        percent: 0,
        resumedFrom: null,
        code: null,
        resourceId: null,
      };
    });

  /** Runs the items one after another, skipping one removed meanwhile; the summary of the run. */
  const runAll = async (
    waiting: readonly UploadItem[],
    meta?: Readonly<Record<string, string>>,
  ) => {
    const outcomes = await waiting.reduce<Promise<UploadOutcome[]>>(async (before, item) => {
      const sofar = await before;
      return removed.current.has(item.key) ? sofar : [...sofar, await run(item, false, meta)];
    }, Promise.resolve([]));
    const finished = outcomes.flatMap((outcome) => (outcome.kind === 'done' ? [outcome] : []));
    const resourceIds = finished.flatMap((outcome) =>
      outcome.resourceId === null ? [] : [outcome.resourceId],
    );
    return { done: finished.length, notDone: outcomes.length - finished.length, resourceIds };
  };

  return {
    items,
    add: (files) => {
      dispatch({ type: 'add', items: itemsOf(files) });
    },
    remove: (key) => {
      const item = items.find((candidate) => candidate.key === key);
      if (item !== undefined && REMOVABLE.has(item.status)) {
        handles.current.delete(key);
        removed.current.add(key);
      }
      dispatch({ type: 'remove', key });
    },
    // One file after another, on purpose: a phone's upload bandwidth is shared, not multiplied.
    startAll: (meta) =>
      runAll(
        items.filter((item) => item.status === 'new' || item.status === 'failed'),
        meta,
      ),
    uploadNow: (files, meta) => {
      const added = itemsOf(files);
      dispatch({ type: 'add', items: added });
      return runAll(added, meta);
    },
    resume: (key) => {
      restart(key, true);
    },
    cancel: async (key) => {
      const handle = handles.current.get(key);
      handles.current.delete(key);
      await handle?.abort();
      dispatch({ type: 'reset', key });
    },
    retry: (key) => {
      restart(key, false);
    },
  };
}
