// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { HttpResponse, PreviousUpload, Upload, UploadOptions } from 'tus-js-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '@/lib/auth/session';
import { uploadQueueReducer, useUploadQueue, type UploadItem } from '../use-upload-queue';

/**
 * The upload queue (P-12, UI-SPEC § Attachments) over a fake tus `Upload` the cases drive: each
 * instance records its options; a case calls `onProgress`, `onSuccess` or `onError` on it.
 */
class FakeUpload {
  url: string | null = null;
  aborted: boolean | undefined = undefined;
  constructor(
    readonly file: File,
    readonly options: UploadOptions,
  ) {
    uploads.push(this);
  }
  findPreviousUploads(): Promise<PreviousUpload[]> {
    return Promise.resolve([]);
  }
  resumeFromPreviousUpload(): void {
    // the fake keeps no storage
  }
  start(): void {
    this.url = '/api/v1/uploads/0123456789abcdef0123456789abcdef';
  }
  abort(shouldTerminate?: boolean): Promise<void> {
    this.aborted = shouldTerminate;
    return Promise.resolve();
  }
}
const uploads: FakeUpload[] = [];
const deps = { Upload: FakeUpload as unknown as typeof Upload };
const TARGET = { purpose: 'demo.attachment' };

const res = (status: number, headers: Record<string, string> = {}, body = ''): HttpResponse => ({
  getStatus: () => status,
  getHeader: (name: string) => headers[name],
  getBody: () => body,
  getUnderlyingObject: () => null,
});
const networkDrop = () =>
  Object.assign(new Error('tus: failed'), { originalRequest: {}, originalResponse: null });
const refused = (status: number, code: string) =>
  Object.assign(new Error('tus: failed'), {
    originalRequest: {},
    originalResponse: res(
      status,
      { 'Content-Type': 'application/problem+json' },
      JSON.stringify({ code }),
    ),
  });

const photo = (name: string) => new File([new Uint8Array([1, 2, 3, 4])], name);

/** The fake for the `n`th upload created, once the queue has started it. */
async function upload(n: number): Promise<FakeUpload> {
  await waitFor(() => {
    expect(uploads[n]?.url).not.toBeNull();
  });
  const fake = uploads[n];
  if (fake === undefined) throw new Error(`no upload ${String(n)}`);
  return fake;
}

const statuses = (items: readonly UploadItem[]) =>
  items.map((i) => `${i.status}:${String(i.percent)}`);

interface Summary {
  readonly done: number;
  readonly notDone: number;
  readonly resourceIds: readonly string[];
}
type Queue = ReturnType<typeof useUploadQueue>;

/** Renders the hook with `files` added. */
function queueWith(...names: string[]): { readonly result: { readonly current: Queue } } {
  const { result } = renderHook(() => useUploadQueue(TARGET, deps));
  act(() => {
    result.current.add(names.map(photo));
  });
  return { result };
}

/** Starts the queue inside a synchronous act; the uploads then run as the case drives them. */
function begin(queue: Queue, meta?: Readonly<Record<string, string>>): Promise<Summary> {
  let run: Promise<Summary> = Promise.resolve({ done: 0, notDone: 0, resourceIds: [] });
  act(() => {
    run = queue.startAll(meta);
  });
  return run;
}

/** Awaits the queue's end inside an act, so its last updates are flushed. */
async function finished(run: Promise<Summary>): Promise<Summary> {
  let summary: Summary = { done: -1, notDone: -1, resourceIds: [] };
  await act(async () => {
    summary = await run;
  });
  return summary;
}

describe('useUploadQueue', () => {
  beforeEach(() => {
    uploads.length = 0;
    setSession({ accessToken: 'tok', csrfToken: 'csrf' });
  });
  afterEach(() => {
    clearSession();
  });

  it('add gives each file a new item at 0%', () => {
    const { result } = queueWith('a.png', 'b.png');
    expect(statuses(result.current.items)).toEqual(['new:0', 'new:0']);
    expect(result.current.items.map((i) => i.file.name)).toEqual(['a.png', 'b.png']);
    expect(new Set(result.current.items.map((i) => i.key)).size).toBe(2);
  });

  it('startAll uploads the files one after another with the meta, each uploading with its percent, then done', async () => {
    const { result } = queueWith('a.png', 'b.png');
    const run = begin(result.current, { relId: '7' });
    const first = await upload(0);
    expect(first.options.metadata).toEqual({
      purpose: 'demo.attachment',
      filename: 'a.png',
      relId: '7',
    });
    expect(uploads).toHaveLength(1);
    act(() => {
      first.options.onProgress?.(2, 4);
    });
    expect(statuses(result.current.items)).toEqual(['uploading:50', 'new:0']);
    act(() => {
      first.options.onSuccess?.({ lastResponse: res(204, { 'Erp-Upload-Resource': '11' }) });
    });
    const second = await upload(1);
    act(() => {
      second.options.onSuccess?.({ lastResponse: res(204, { 'Erp-Upload-Resource': '12' }) });
    });
    expect(await finished(run)).toEqual({ done: 2, notDone: 0, resourceIds: ['11', '12'] });
    expect(statuses(result.current.items)).toEqual(['done:100', 'done:100']);
    expect(result.current.items.map((i) => i.resourceId)).toEqual(['11', '12']);
  });

  it('uploadNow (opt-in, 04.6-14) adds the files and uploads them at once with the meta', async () => {
    const { result } = renderHook(() => useUploadQueue(TARGET, deps));
    let run: Promise<Summary> = Promise.resolve({ done: 0, notDone: 0, resourceIds: [] });
    act(() => {
      run = result.current.uploadNow([photo('c.pdf')], { relId: '9' });
    });
    const first = await upload(0);
    expect(first.options.metadata).toMatchObject({ filename: 'c.pdf', relId: '9' });
    act(() => {
      first.options.onSuccess?.({ lastResponse: res(204, { 'Erp-Upload-Resource': '21' }) });
    });
    expect(await finished(run)).toEqual({ done: 1, notDone: 0, resourceIds: ['21'] });
    expect(statuses(result.current.items)).toEqual(['done:100']);
  });

  it('a dropped connection pauses the item; the browser coming back online resumes it from its percent, then done', async () => {
    const { result } = queueWith('a.png');
    const run = begin(result.current);
    const first = await upload(0);
    act(() => {
      first.options.onProgress?.(1, 4);
      first.options.onError?.(networkDrop());
    });
    expect(await finished(run)).toEqual({ done: 0, notDone: 1, resourceIds: [] });
    expect(statuses(result.current.items)).toEqual(['paused:25']);
    expect(result.current.items[0]?.code).toBe('ERP-NETWORK-0001');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    const resumed = await upload(1);
    expect(result.current.items[0]?.status).toBe('resuming');
    expect(result.current.items[0]?.resumedFrom).toBe(25);
    act(() => {
      resumed.options.onProgress?.(3, 4);
    });
    expect(statuses(result.current.items)).toEqual(['uploading:75']);
    act(() => {
      resumed.options.onSuccess?.({ lastResponse: res(204) });
    });
    await waitFor(() => {
      expect(statuses(result.current.items)).toEqual(['done:100']);
    });
  });

  it('resume on a paused item starts it again with the same metadata, reading "resuming"', async () => {
    const { result } = queueWith('a.png');
    const run = begin(result.current, { relId: '7' });
    const first = await upload(0);
    act(() => {
      first.options.onError?.(networkDrop());
    });
    await finished(run);
    act(() => {
      result.current.resume(result.current.items[0]?.key ?? '');
    });
    const again = await upload(1);
    expect(again.options.metadata).toEqual(first.options.metadata);
    expect(result.current.items[0]?.status).toBe('resuming');
  });

  it('cancel aborts with termination and returns the item to new at 0%', async () => {
    const { result } = queueWith('a.png');
    const run = begin(result.current);
    const first = await upload(0);
    act(() => {
      first.options.onProgress?.(2, 4);
    });
    const key = result.current.items[0]?.key ?? '';
    await act(async () => {
      await result.current.cancel(key);
    });
    expect(first.aborted).toBe(true);
    expect(await finished(run)).toEqual({ done: 0, notDone: 1, resourceIds: [] });
    expect(statuses(result.current.items)).toEqual(['new:0']);
  });

  it('a refused file is rejected with its code; startAll counts it as not done', async () => {
    const { result } = queueWith('a.png', 'x.exe');
    const run = begin(result.current);
    const first = await upload(0);
    act(() => {
      first.options.onSuccess?.({ lastResponse: res(204) });
    });
    const second = await upload(1);
    act(() => {
      second.options.onError?.(refused(422, 'ERP-FILES-0001'));
    });
    expect(await finished(run)).toEqual({ done: 1, notDone: 1, resourceIds: [] });
    expect(result.current.items.map((i) => [i.status, i.code])).toEqual([
      ['done', null],
      ['rejected', 'ERP-FILES-0001'],
    ]);
  });

  it('a failure that cannot be retried is failed; retry starts it again', async () => {
    const { result } = queueWith('a.png');
    const run = begin(result.current);
    const first = await upload(0);
    act(() => {
      first.options.onError?.(refused(401, 'ERP-AUTH-0004'));
    });
    await finished(run);
    expect(result.current.items.map((i) => [i.status, i.code])).toEqual([
      ['failed', 'ERP-AUTH-0004'],
    ]);
    act(() => {
      result.current.retry(result.current.items[0]?.key ?? '');
    });
    await upload(1);
    expect(result.current.items[0]?.status).toBe('uploading');
  });

  it('remove takes a new, rejected or failed item out, and refuses one that is uploading', async () => {
    const { result } = queueWith('a.png', 'b.png');
    const run = begin(result.current);
    const first = await upload(0);
    const [uploading, waiting] = result.current.items;
    act(() => {
      result.current.remove(uploading?.key ?? '');
      result.current.remove(waiting?.key ?? '');
    });
    expect(result.current.items.map((i) => i.file.name)).toEqual(['a.png']);
    act(() => {
      first.options.onSuccess?.({ lastResponse: res(204) });
    });
    // The removed file is not uploaded by the run that was already going.
    expect(await finished(run)).toEqual({ done: 1, notDone: 0, resourceIds: [] });
    expect(uploads).toHaveLength(1);
  });
});

describe('uploadQueueReducer (pure)', () => {
  const item = (status: UploadItem['status']): UploadItem => ({
    key: 'k',
    file: photo('a.png'),
    status,
    percent: 40,
    resumedFrom: null,
    code: null,
    resourceId: null,
  });

  it('returns a new array and leaves its input untouched', () => {
    const before = [item('new')];
    const after = uploadQueueReducer(before, { type: 'progress', key: 'k', percent: 10 });
    expect(after).not.toBe(before);
    expect(before[0]?.percent).toBe(40);
  });

  it('a resumed item reads "resuming" until bytes pass where it resumed from', () => {
    const resuming = uploadQueueReducer([item('paused')], {
      type: 'started',
      key: 'k',
      resuming: true,
    });
    expect(resuming[0]).toMatchObject({ status: 'resuming', resumedFrom: 40 });
    expect(
      uploadQueueReducer(resuming, { type: 'progress', key: 'k', percent: 40 })[0]?.status,
    ).toBe('resuming');
    expect(
      uploadQueueReducer(resuming, { type: 'progress', key: 'k', percent: 41 })[0]?.status,
    ).toBe('uploading');
  });

  it('remove refuses uploading, paused, resuming and done items', () => {
    for (const status of ['uploading', 'paused', 'resuming', 'done'] as const) {
      expect(uploadQueueReducer([item(status)], { type: 'remove', key: 'k' })).toHaveLength(1);
    }
    for (const status of ['new', 'rejected', 'failed'] as const) {
      expect(uploadQueueReducer([item(status)], { type: 'remove', key: 'k' })).toHaveLength(0);
    }
  });
});
