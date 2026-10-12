import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type {
  HttpRequest,
  HttpResponse,
  PreviousUpload,
  Upload,
  UploadOptions,
} from 'tus-js-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, markSignedOut, setSession, setSessionRecovery } from '@/lib/auth/session';
import { CLIENT_TIMINGS } from '../client-timings';
import {
  UPLOAD_CHUNK_BYTES,
  UPLOADS_PATH,
  createUpload,
  type UploadEvents,
  type UploadOutcome,
} from '../upload-file';

/**
 * The tus door (P-12, ADR-0041, PATTERNS M9) against a fake `Upload` class that records its options
 * and lets each case drive tus's callbacks, so no byte leaves the test. Plan 03's wire: tus
 * protocol errors are plain text, hook refusals are application/problem+json carrying `code`.
 */
interface Fake {
  readonly file: unknown;
  readonly options: UploadOptions;
  url: string | null;
  started: number;
  resumedFrom: PreviousUpload | null;
  aborted: boolean | undefined;
}

const instances: Fake[] = [];
let previous: PreviousUpload[] = [];
/** How tus's lookup of earlier uploads answers; a case may hold it or make it fail. */
let lookup: () => Promise<PreviousUpload[]> = () => Promise.resolve(previous);

class FakeUpload implements Fake {
  url: string | null = null;
  started = 0;
  resumedFrom: PreviousUpload | null = null;
  aborted: boolean | undefined = undefined;
  constructor(
    readonly file: unknown,
    readonly options: UploadOptions,
  ) {
    instances.push(this);
  }
  findPreviousUploads(): Promise<PreviousUpload[]> {
    return lookup();
  }
  resumeFromPreviousUpload(upload: PreviousUpload): void {
    this.resumedFrom = upload;
  }
  start(): void {
    this.started += 1;
    this.url = `${UPLOADS_PATH}/0123456789abcdef0123456789abcdef`;
  }
  abort(shouldTerminate?: boolean): Promise<void> {
    this.aborted = shouldTerminate;
    return Promise.resolve();
  }
}

const deps = { Upload: FakeUpload as unknown as typeof Upload };
const file = () =>
  new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' });
const events = () => ({
  onProgress: vi.fn<(sent: number, total: number) => void>(),
  onResumeFrom: vi.fn<(offset: number, total: number) => void>(),
});

function response(status: number, headers: Record<string, string> = {}, body = ''): HttpResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    getStatus: () => status,
    getHeader: (name: string) => lower[name.toLowerCase()],
    getBody: () => body,
    getUnderlyingObject: () => null,
  };
}

function request(method = 'POST'): HttpRequest & { readonly headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    getMethod: () => method,
    getURL: () => UPLOADS_PATH,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    getHeader: (name: string) => headers[name],
    setProgressHandler: () => undefined,
    send: () => Promise.reject(new Error('not sent in tests')),
    abort: () => Promise.resolve(),
    getUnderlyingObject: () => null,
  };
}

const problemJson = (status: number, code: string) =>
  response(
    status,
    { 'Content-Type': 'application/problem+json; charset=utf-8' },
    JSON.stringify({ type: 'about:blank', status, title: code, code }),
  );

/** A tus `DetailedError`: an Error with the request and (when one arrived) the response. */
const detailed = (res: HttpResponse | null) =>
  Object.assign(new Error('tus: failed'), { originalRequest: request(), originalResponse: res });

/** Starts an upload and returns the fake once tus's `start()` has been called. */
async function started(e: UploadEvents = events()): Promise<{
  readonly fake: Fake;
  readonly outcome: Promise<UploadOutcome>;
}> {
  const handle = createUpload(
    file(),
    { purpose: 'demo.attachment', meta: { relId: '7' } },
    e,
    deps,
  );
  const outcome = handle.start();
  await vi.waitFor(() => {
    expect(instances.at(-1)?.started).toBe(1);
  });
  const fake = instances.at(-1);
  if (fake === undefined) throw new Error('no upload');
  return { fake, outcome };
}

describe('createUpload (the tus door)', () => {
  beforeEach(() => {
    instances.length = 0;
    previous = [];
    lookup = () => Promise.resolve(previous);
    setSession({ accessToken: 'tok-1', csrfToken: 'csrf' });
  });
  afterEach(() => {
    clearSession();
  });

  it('uploads to /api/v1/uploads in 2 MiB chunks with purpose, file name and meta, the retry delays of CLIENT_TIMINGS, and keeps the fingerprint until success', async () => {
    const { fake } = await started();
    expect(fake.options.endpoint).toBe('/api/v1/uploads');
    expect(fake.options.chunkSize).toBe(2_097_152);
    expect(UPLOAD_CHUNK_BYTES).toBe(2_097_152);
    expect(fake.options.metadata).toEqual({
      purpose: 'demo.attachment',
      filename: 'photo.png',
      relId: '7',
    });
    expect(fake.options.retryDelays).toEqual([...CLIENT_TIMINGS.uploads.retryDelaysMs]);
    expect(fake.options.storeFingerprintForResuming).toBe(true);
    expect(fake.options.removeFingerprintOnSuccess).toBe(true);
  });

  it('meta cannot replace the purpose or the file name', async () => {
    const handle = createUpload(
      file(),
      { purpose: 'demo.attachment', meta: { purpose: 'other', filename: 'x.exe' } },
      events(),
      deps,
    );
    void handle.start();
    await vi.waitFor(() => {
      expect(instances.at(-1)?.started).toBe(1);
    });
    expect(instances.at(-1)?.options.metadata).toEqual({
      purpose: 'demo.attachment',
      filename: 'photo.png',
    });
  });

  it('onBeforeRequest sets Authorization: Bearer <token> on every request, read at that moment (the token rotates)', async () => {
    const { fake } = await started();
    const first = request('POST');
    await fake.options.onBeforeRequest?.(first);
    expect(first.headers.Authorization).toBe('Bearer tok-1');
    setSession({ accessToken: 'tok-2', csrfToken: 'csrf' });
    const second = request('PATCH');
    await fake.options.onBeforeRequest?.(second);
    expect(second.headers.Authorization).toBe('Bearer tok-2');
  });

  it('while the session is pending, onBeforeRequest awaits recoverSession first, then sets the recovered bearer', async () => {
    const { fake } = await started();
    clearSession();
    const recovery = vi.fn(async () => {
      await Promise.resolve();
      setSession({ accessToken: 'recovered', csrfToken: 'csrf' });
    });
    setSessionRecovery(recovery);
    const req = request('PATCH');
    await fake.options.onBeforeRequest?.(req);
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(req.headers.Authorization).toBe('Bearer recovered');
    setSessionRecovery(() => Promise.resolve());
  });

  it('signed out: no bearer is set, and the api answers its honest 401', async () => {
    const { fake } = await started();
    markSignedOut();
    const req = request('PATCH');
    await fake.options.onBeforeRequest?.(req);
    expect(req.headers.Authorization).toBeUndefined();
  });

  it('reports progress as bytes sent of the total', async () => {
    const e = events();
    const { fake } = await started(e);
    fake.options.onProgress?.(1024, 4096);
    expect(e.onProgress).toHaveBeenCalledWith(1024, 4096);
  });

  it('a previous upload of the same file with the same metadata is resumed (the newest), and the HEAD offset is reported', async () => {
    const meta = { purpose: 'demo.attachment', filename: 'photo.png', relId: '7' };
    const older: PreviousUpload = {
      size: 4,
      metadata: meta,
      creationTime: '2026-10-01T10:00:00.000Z',
      urlStorageKey: 'k1',
      uploadUrl: `${UPLOADS_PATH}/aaaa`,
      parallelUploadUrls: null,
    };
    const newer = { ...older, creationTime: '2026-10-02T10:00:00.000Z', urlStorageKey: 'k2' };
    const foreign = {
      ...older,
      metadata: { ...meta, relId: '8' },
      creationTime: '2026-10-02T11:00:00.000Z',
      urlStorageKey: 'k3',
    };
    previous = [older, foreign, newer];
    const e = events();
    const { fake } = await started(e);
    expect(fake.resumedFrom).toBe(newer);
    await fake.options.onAfterResponse?.(request('HEAD'), response(200, { 'Upload-Offset': '2' }));
    expect(e.onResumeFrom).toHaveBeenCalledWith(2, 4);
  });

  it('no previous upload: a fresh one, no resume reported', async () => {
    const e = events();
    const { fake } = await started(e);
    expect(fake.resumedFrom).toBeNull();
    await fake.options.onAfterResponse?.(request('POST'), response(201, { Location: '/x' }));
    expect(e.onResumeFrom).not.toHaveBeenCalled();
  });

  it('success with Erp-Upload-Resource: 42 resolves done with the upload id and the resource id', async () => {
    const { fake, outcome } = await started();
    fake.options.onSuccess?.({ lastResponse: response(204, { 'Erp-Upload-Resource': '42' }) });
    await expect(outcome).resolves.toEqual({
      kind: 'done',
      uploadId: '0123456789abcdef0123456789abcdef',
      resourceId: '42',
    });
  });

  it('success without the header resolves done with a null resource id', async () => {
    const { fake, outcome } = await started();
    fake.options.onSuccess?.({ lastResponse: response(204) });
    await expect(outcome).resolves.toMatchObject({ kind: 'done', resourceId: null });
  });

  it('a 422 problem ERP-FILES-0001 resolves rejected with that code (never attached)', async () => {
    const { fake, outcome } = await started();
    fake.options.onError?.(detailed(problemJson(422, 'ERP-FILES-0001')));
    await expect(outcome).resolves.toEqual({ kind: 'rejected', code: 'ERP-FILES-0001' });
  });

  it('a 413 resolves rejected ERP-FILES-0002, from the problem body or by its status when tus answered plain text', async () => {
    const first = await started();
    first.fake.options.onError?.(detailed(problemJson(413, 'ERP-FILES-0002')));
    await expect(first.outcome).resolves.toEqual({ kind: 'rejected', code: 'ERP-FILES-0002' });
    const second = await started();
    second.fake.options.onError?.(
      detailed(response(413, { 'Content-Type': 'text/plain' }, 'too big')),
    );
    await expect(second.outcome).resolves.toEqual({ kind: 'rejected', code: 'ERP-FILES-0002' });
  });

  it('no response (a dropped connection) resolves failed ERP-NETWORK-0001, retryable', async () => {
    const { fake, outcome } = await started();
    fake.options.onError?.(detailed(null));
    await expect(outcome).resolves.toEqual({
      kind: 'failed',
      code: 'ERP-NETWORK-0001',
      retryable: true,
    });
  });

  it('a 401 problem ERP-AUTH-0004 resolves failed, not retryable', async () => {
    const { fake, outcome } = await started();
    fake.options.onError?.(detailed(problemJson(401, 'ERP-AUTH-0004')));
    await expect(outcome).resolves.toEqual({
      kind: 'failed',
      code: 'ERP-AUTH-0004',
      retryable: false,
    });
  });

  it('a tus plain-text protocol error keeps no code from its body: ERP-HTTP-<status>; a 5xx is retryable', async () => {
    const first = await started();
    first.fake.options.onError?.(
      detailed(response(409, { 'Content-Type': 'text/plain' }, '{"code":"ERP-FILES-0001"}')),
    );
    await expect(first.outcome).resolves.toEqual({
      kind: 'failed',
      code: 'ERP-HTTP-409',
      retryable: false,
    });
    const second = await started();
    second.fake.options.onError?.(detailed(problemJson(503, 'ERP-UPSTREAM-0001')));
    await expect(second.outcome).resolves.toEqual({
      kind: 'failed',
      code: 'ERP-UPSTREAM-0001',
      retryable: true,
    });
  });

  it('a refusal keeps a code only from a problem+json body that has one', async () => {
    const plain = await started();
    plain.fake.options.onError?.(detailed(response(422)));
    await expect(plain.outcome).resolves.toEqual({ kind: 'rejected', code: 'ERP-FILES-0001' });
    const codeless = await started();
    codeless.fake.options.onError?.(
      detailed(response(500, { 'Content-Type': 'application/problem+json' }, '{"status":500}')),
    );
    await expect(codeless.outcome).resolves.toEqual({
      kind: 'failed',
      code: 'ERP-HTTP-500',
      retryable: true,
    });
    const broken = await started();
    broken.fake.options.onError?.(
      detailed(response(502, { 'Content-Type': 'application/problem+json' }, '<html>')),
    );
    await expect(broken.outcome).resolves.toEqual({
      kind: 'failed',
      code: 'ERP-HTTP-502',
      retryable: true,
    });
  });

  it("an error that is not tus's (no request, no response) is a client failure, not retryable", async () => {
    const { fake, outcome } = await started();
    fake.options.onError?.(new Error('tus: no file'));
    await expect(outcome).resolves.toEqual({
      kind: 'failed',
      code: 'ERP-CLIENT-0001',
      retryable: false,
    });
  });

  it('the newest matching upload wins whatever order tus lists them in; a zero offset reports no resume', async () => {
    const meta = { purpose: 'demo.attachment', filename: 'photo.png', relId: '7' };
    const newer: PreviousUpload = {
      size: 4,
      metadata: meta,
      creationTime: '2026-10-02T10:00:00.000Z',
      urlStorageKey: 'k2',
      uploadUrl: `${UPLOADS_PATH}/bbbb`,
      parallelUploadUrls: null,
    };
    previous = [newer, { ...newer, creationTime: '2026-10-01T10:00:00.000Z', urlStorageKey: 'k1' }];
    const e = events();
    const { fake } = await started(e);
    expect(fake.resumedFrom).toBe(newer);
    await fake.options.onAfterResponse?.(request('HEAD'), response(200, { 'Upload-Offset': '0' }));
    expect(e.onResumeFrom).not.toHaveBeenCalled();
  });

  it('an upload without a URL yet answers an empty upload id', async () => {
    const { fake, outcome } = await started();
    fake.url = null;
    fake.options.onSuccess?.({ lastResponse: response(204) });
    await expect(outcome).resolves.toMatchObject({ kind: 'done', uploadId: '' });
  });

  it('a failed lookup of earlier uploads still starts a fresh one', async () => {
    lookup = () => Promise.reject(new Error('storage unavailable'));
    const { fake } = await started();
    expect(fake.resumedFrom).toBeNull();
  });

  it('cancel while tus is still looking up earlier uploads: nothing starts, whatever the lookup answers', async () => {
    for (const answer of [() => Promise.resolve([]), () => Promise.reject(new Error('x'))]) {
      let release: () => void = () => undefined;
      lookup = () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }).then(answer);
      const handle = createUpload(file(), { purpose: 'demo.attachment' }, events(), deps);
      const outcome = handle.start();
      await handle.abort();
      release();
      await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(instances.at(-1)?.started).toBe(0);
    }
  });

  it('a DELETE that fails on cancel is not thrown: the api expires the partial upload', async () => {
    const handle = createUpload(file(), { purpose: 'demo.attachment' }, events(), deps);
    void handle.start();
    await vi.waitFor(() => {
      expect(instances.at(-1)?.started).toBe(1);
    });
    const fake = instances.at(-1) as FakeUpload;
    vi.spyOn(fake, 'abort').mockRejectedValue(new Error('offline'));
    await expect(handle.abort()).resolves.toBeUndefined();
  });

  it('cancel before start does nothing and throws nothing', async () => {
    const handle = createUpload(file(), { purpose: 'demo.attachment' }, events(), deps);
    await expect(handle.abort()).resolves.toBeUndefined();
    expect(instances).toHaveLength(0);
  });

  it('abort terminates the server upload (abort(true), a DELETE) and resolves the start as cancelled', async () => {
    const handle = createUpload(file(), { purpose: 'demo.attachment' }, events(), deps);
    const outcome = handle.start();
    await vi.waitFor(() => {
      expect(instances.at(-1)?.started).toBe(1);
    });
    await handle.abort();
    expect(instances.at(-1)?.aborted).toBe(true);
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
  });
});

/** Every .ts and .tsx file under `dir` (posix, relative to the repo root). */
function sourceFiles(root: string, dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(root, dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(root, relative(root, path)));
    else if (/\.tsx?$/.test(name)) out.push(relative(root, path).split(sep).join('/'));
  }
  return out;
}

describe('the door rule (M9, until plan 23 adds the P_TUS lint entry)', () => {
  it('src/ and app/ import tus-js-client only in src/lib/api/upload-file.ts (tests aside)', () => {
    const root = process.cwd();
    const importers = [...sourceFiles(root, 'src'), ...sourceFiles(root, 'app')]
      .filter((f) => !f.includes('/__tests__/'))
      .filter((f) =>
        /from\s+['"]tus-js-client['"]|import\(\s*['"]tus-js-client['"]\s*\)/.test(
          readFileSync(join(root, f), 'utf8'),
        ),
      );
    expect(importers).toEqual(['src/lib/api/upload-file.ts']);
  });
});
