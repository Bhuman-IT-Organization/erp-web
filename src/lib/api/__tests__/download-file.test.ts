import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, networkFailureAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { getApiStatus, resetApiStatus } from '../api-status';
import {
  DEFAULT_DOWNLOAD_NAME,
  DOWNLOAD_FORMATS,
  dispositionFilename,
  downloadFile,
  fetchBlob,
} from '../download-file';
import { http } from '../http';

/**
 * The CSV export download (D-26, D-42; 03.2 RESEARCH Pattern 13, Pitfall 10), against plan 05's
 * written contract: `GET /api/v1/identity/members/export?…&header=<label>&header=<label>`, a
 * `text/csv` body starting with the UTF-8 BOM, `content-disposition: attachment; filename="…"`, and
 * a problem-details JSON body on a refusal, which arrives as a Blob under `responseType: 'blob'`.
 */
const PATH = '/api/v1/identity/members/export';
const BOM = [0xef, 0xbb, 0xbf];
const csvBlob = () =>
  new Blob([new Uint8Array(BOM), 'Name,Email\r\nJane,jane@example.com\r\n'], {
    type: 'text/csv; charset=utf-8',
  });
const jsonBlob = (body: unknown) => new Blob([JSON.stringify(body)], { type: 'application/json' });
const DISPOSITION = 'attachment; filename="staff-members-2026-09-25.csv"';

let fake: FakeAdapter | undefined;
const useNetwork = (adapter: FakeAdapter) => {
  fake = adapter;
  http.defaults.adapter = adapter.adapter;
};
const firstConfig = (): InternalAxiosRequestConfig => {
  const config = fake?.spy.mock.calls[0]?.[0] as InternalAxiosRequestConfig | undefined;
  if (config === undefined) throw new Error('no request');
  return config;
};

describe('downloadFile (the export download through the one axios instance)', () => {
  beforeEach(() => {
    resetApiStatus();
    setSession({ accessToken: 'at', csrfToken: 'ct' });
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
    clearSession();
  });

  it('a 200 text/csv Blob: ok with the Content-Disposition filename, saved once with the bytes (BOM EF BB BF first)', async () => {
    const blob = csvBlob();
    useNetwork(fakeAdapter(200, blob, { 'content-disposition': DISPOSITION }));
    const save = vi.fn();
    const result = await downloadFile(PATH, { q: 'jane' }, { save });
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { filename: 'staff-members-2026-09-25.csv' },
    });
    expect(save).toHaveBeenCalledTimes(1);
    const [saved, filename] = save.mock.calls[0] as [Blob, string];
    expect(filename).toBe('staff-members-2026-09-25.csv');
    expect([...new Uint8Array(await saved.arrayBuffer()).slice(0, 3)]).toEqual(BOM);
  });

  it('repeats header=A&header=B without brackets, asks for text/csv as a blob, and carries the bearer from the http instance', async () => {
    useNetwork(fakeAdapter(200, csvBlob(), { 'content-disposition': DISPOSITION }));
    await downloadFile(
      PATH,
      { q: 'a b', sort: '-email', header: ['Full Name', 'Email'] },
      { save: vi.fn() },
    );
    const config = firstConfig();
    const url = http.getUri(config);
    expect(url).toContain('header=Full+Name&header=Email');
    expect(url).not.toContain('header[');
    expect(url).not.toContain('header%5B');
    expect(url).toContain('sort=-email');
    expect(url.startsWith(`${PATH}?`)).toBe(true);
    expect(config.responseType).toBe('blob');
    expect(fake?.calls[0]?.headers.accept).toBe('text/csv');
    expect(fake?.calls[0]?.headers.authorization).toBe('Bearer at');
    // The token travels in a header only, never in the URL (ADR-0032, T-3.2-53).
    expect([...new URLSearchParams(url.split('?')[1]).values()]).not.toContain('at');
    expect(url).not.toMatch(/token|bearer|authorization/i);
  });

  it('with a body (opt-in, 04.6-15): one POST carrying the JSON body, the file saved', async () => {
    useNetwork(fakeAdapter(200, new Blob(['xlsx']), { 'content-disposition': DISPOSITION }));
    const save = vi.fn();
    const result = await downloadFile(PATH, {}, { save }, 'xlsx', { itemIds: [7], mode: 'add' });
    expect(result.ok).toBe(true);
    expect(firstConfig().method).toBe('post');
    expect(JSON.parse(String(firstConfig().data))).toEqual({ itemIds: [7], mode: 'add' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('without a body: a GET, as every list export', async () => {
    useNetwork(fakeAdapter(200, csvBlob(), { 'content-disposition': DISPOSITION }));
    await downloadFile(PATH, {}, { save: vi.fn() });
    expect(firstConfig().method).toBe('get');
  });

  it('omits an undefined parameter', async () => {
    useNetwork(fakeAdapter(200, csvBlob(), { 'content-disposition': DISPOSITION }));
    await downloadFile(PATH, { q: undefined, sort: 'email' }, { save: vi.fn() });
    expect(http.getUri(firstConfig())).toBe(`${PATH}?sort=email`);
  });

  it('a 403 whose Blob body is {"code":"ERP-AUTH-0005"} is { ok: false, code: ERP-AUTH-0005 }, and nothing is saved', async () => {
    useNetwork(fakeAdapter(403, jsonBlob({ status: 403, code: 'ERP-AUTH-0005' })));
    const save = vi.fn();
    const result = await downloadFile(PATH, {}, { save });
    expect(result).toMatchObject({ ok: false, status: 403, code: 'ERP-AUTH-0005' });
    expect(save).not.toHaveBeenCalled();
  });

  it('a 400 export-cap Blob body is ERP-VALIDATION-0001 with its issues (plan 05: path export)', async () => {
    const issues = [{ path: ['export'], message: 'too many rows to export; narrow the search' }];
    useNetwork(fakeAdapter(400, jsonBlob({ status: 400, code: 'ERP-VALIDATION-0001', issues })));
    const result = await downloadFile(PATH, {}, { save: vi.fn() });
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: 'ERP-VALIDATION-0001',
      retryAfterS: null,
      issues,
    });
  });

  it('a Blob error body that is not JSON (a proxy page) falls back to ERP-HTTP-<status>, and a Retry-After survives', async () => {
    useNetwork(
      fakeAdapter(503, new Blob(['<html>Bad gateway</html>'], { type: 'text/html' }), {
        'retry-after': '7',
      }),
    );
    const result = await downloadFile(PATH, {}, { save: vi.fn() });
    expect(result).toMatchObject({ ok: false, status: 503, code: 'ERP-HTTP-503', retryAfterS: 7 });
    // The instance's reachability side effect still ran, once, the normal way (the banner).
    expect(getApiStatus().reachable).toBe(false);
  });

  it('a network failure is ERP-NETWORK-0001, and the call resolves (it never throws)', async () => {
    useNetwork(networkFailureAdapter());
    await expect(downloadFile(PATH, {}, { save: vi.fn() })).resolves.toMatchObject({
      ok: false,
      status: 0,
      code: 'ERP-NETWORK-0001',
    });
  });

  it('a save that throws is a client error, not a thrown exception', async () => {
    useNetwork(fakeAdapter(200, csvBlob(), { 'content-disposition': DISPOSITION }));
    const save = vi.fn(() => {
      throw new Error('no DOM');
    });
    await expect(downloadFile(PATH, {}, { save })).resolves.toMatchObject({
      ok: false,
      code: 'ERP-CLIENT-0001',
    });
  });

  it.each([
    ['attachment; filename="../x.csv"', '..x.csv'],
    ['attachment; filename="..\\..\\evil.csv"', '....evil.csv'],
    ['attachment; filename=roles-2026-09-25.csv', 'roles-2026-09-25.csv'],
    ['attachment; filename="/"', 'export.csv'],
    ['attachment', 'export.csv'],
  ])('the disposition %j is saved as %j (no slash or backslash survives)', async (header, name) => {
    useNetwork(fakeAdapter(200, csvBlob(), { 'content-disposition': header }));
    const save = vi.fn();
    const result = await downloadFile(PATH, {}, { save });
    expect(result).toMatchObject({ ok: true, data: { filename: name } });
    expect(save.mock.calls[0]?.[1]).toBe(name);
  });

  it('no Content-Disposition header at all → export.csv', async () => {
    useNetwork(fakeAdapter(200, csvBlob()));
    const save = vi.fn();
    await downloadFile(PATH, {}, { save });
    expect(save.mock.calls[0]?.[1]).toBe('export.csv');
  });

  describe('per format (D-07): the media type asked for and the fallback name', () => {
    it.each([
      ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'export.xlsx'],
      ['pdf', 'application/pdf', 'export.pdf'],
      ['csv', 'text/csv', 'export.csv'],
    ] as const)('%s asks for %s and falls back to %s', async (format, accept, fallback) => {
      useNetwork(fakeAdapter(200, new Blob(['bytes'])));
      const save = vi.fn();
      const result = await downloadFile(PATH, { format }, { save }, format);
      expect(fake?.calls[0]?.headers.accept).toBe(accept);
      expect(firstConfig().responseType).toBe('blob');
      expect(result).toMatchObject({ ok: true, data: { filename: fallback } });
      expect(save.mock.calls[0]?.[1]).toBe(fallback);
    });

    it('DOWNLOAD_FORMATS names the three formats, and the default stays CSV', () => {
      expect(Object.keys(DOWNLOAD_FORMATS)).toEqual(['csv', 'xlsx', 'pdf']);
      expect(DEFAULT_DOWNLOAD_NAME).toBe(DOWNLOAD_FORMATS.csv.fallbackName);
      expect(dispositionFilename('attachment', DOWNLOAD_FORMATS.pdf.fallbackName)).toBe(
        'export.pdf',
      );
    });

    it('a PDF refused with a Blob problem body on [font] keeps its issues', async () => {
      const issues = [{ path: ['font'], message: 'text the PDF font cannot draw' }];
      useNetwork(fakeAdapter(400, jsonBlob({ status: 400, code: 'ERP-VALIDATION-0001', issues })));
      const result = await downloadFile(PATH, { format: 'pdf' }, { save: vi.fn() }, 'pdf');
      expect(result).toEqual({
        ok: false,
        status: 400,
        code: 'ERP-VALIDATION-0001',
        retryAfterS: null,
        issues,
      });
    });

    it('a server-sent xlsx name is kept, without its path', async () => {
      useNetwork(
        fakeAdapter(200, new Blob(['x']), {
          'content-disposition': 'attachment; filename="../roles-2026-10-01.xlsx"',
        }),
      );
      const save = vi.fn();
      await downloadFile(PATH, {}, { save }, 'xlsx');
      expect(save.mock.calls[0]?.[1]).toBe('..roles-2026-10-01.xlsx');
    });
  });
});

describe('fetchBlob (the bytes of an api-only file, M7: an image src cannot carry the bearer)', () => {
  const FILE = '/api/v1/files/7/content';
  beforeEach(() => {
    resetApiStatus();
    setSession({ accessToken: 'at', csrfToken: 'ct' });
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
    clearSession();
  });

  it('a 200 answers the Blob as sent, read through the instance with the bearer; nothing is saved', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    useNetwork(fakeAdapter(200, png));
    const result = await fetchBlob(FILE);
    expect(result).toEqual({ ok: true, status: 200, data: png });
    expect(firstConfig().responseType).toBe('blob');
    expect(fake?.calls[0]?.url).toBe(FILE);
    expect(fake?.calls[0]?.headers.authorization).toBe('Bearer at');
  });

  it('a refusal whose Blob body is a problem answers its code', async () => {
    useNetwork(
      fakeAdapter(404, jsonBlob({ type: 'about:blank', status: 404, code: 'ERP-CORE-0004' })),
    );
    const result = await fetchBlob(FILE);
    expect(result).toMatchObject({ ok: false, status: 404, code: 'ERP-CORE-0004' });
  });

  it('with headers (opt-in, 04.7-12): the header rides the read beside the bearer', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    useNetwork(fakeAdapter(200, pdf));
    const token = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const result = await fetchBlob(FILE, { headers: { 'X-Request-Token': token } });
    expect(result).toEqual({ ok: true, status: 200, data: pdf });
    expect(fake?.calls[0]?.url).toBe(FILE);
    expect(fake?.calls[0]?.headers['x-request-token']).toBe(token);
    expect(fake?.calls[0]?.headers.authorization).toMatch(/^Bearer /);
    expect(fake?.calls[0]?.headers.accept).toBe('*/*');
  });

  it('without headers: the request is as before (no extra header)', async () => {
    useNetwork(fakeAdapter(200, new Blob(['x'])));
    await fetchBlob(FILE);
    expect(Object.keys(fake?.calls[0]?.headers ?? {}).sort()).toEqual(['accept', 'authorization']);
  });

  it('a network failure is ERP-NETWORK-0001 and the call resolves', async () => {
    useNetwork(networkFailureAdapter());
    await expect(fetchBlob(FILE)).resolves.toMatchObject({
      ok: false,
      status: 0,
      code: 'ERP-NETWORK-0001',
    });
  });
});
