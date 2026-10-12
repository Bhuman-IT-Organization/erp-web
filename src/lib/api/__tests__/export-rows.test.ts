import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, networkFailureAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { resetApiStatus } from '../api-status';
import { readExportRows } from '../export-rows';
import { http } from '../http';

/**
 * The Print read (D-28): `GET <list>/export?format=print` answers JSON display rows
 * `{ exportedAt, headers, rows }`, every cell a string (plan 02's wire). Read through the one axios
 * instance, so the bearer rides a header and never the URL (T-4.1.1-20), and zod-checked because
 * the body is untrusted (T-4.1.1-23).
 */
const PATH = '/api/v1/identity/members/export';
const ROWS = {
  exportedAt: '2026-10-01T08:00:00.000Z',
  headers: ['Full Name', 'Active'],
  rows: [
    ['Jane', 'Yes'],
    ['Omar', 'No'],
  ],
};

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

describe('readExportRows (the print rows through the one axios instance)', () => {
  beforeEach(() => {
    resetApiStatus();
    setSession({ accessToken: 'at', csrfToken: 'ct' });
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
    clearSession();
  });

  it('a 200 JSON body matching the schema is ok with the rows', async () => {
    useNetwork(fakeAdapter(200, ROWS));
    const result = await readExportRows(PATH, { format: 'print' });
    expect(result).toEqual({ ok: true, status: 200, data: ROWS });
  });

  it('a body missing rows is ok: false with ERP-CLIENT-0001', async () => {
    useNetwork(fakeAdapter(200, { exportedAt: ROWS.exportedAt, headers: ROWS.headers }));
    const result = await readExportRows(PATH, { format: 'print' });
    expect(result).toEqual({ ok: false, status: 200, code: 'ERP-CLIENT-0001', retryAfterS: null });
  });

  it('a cell that is not a string is refused the same way (untrusted body)', async () => {
    useNetwork(fakeAdapter(200, { ...ROWS, rows: [[1, 'Yes']] }));
    await expect(readExportRows(PATH, { format: 'print' })).resolves.toMatchObject({
      ok: false,
      code: 'ERP-CLIENT-0001',
    });
  });

  it.each([
    [[{ path: ['font'], message: 'text the PDF font cannot draw' }]],
    [
      [
        {
          path: ['export'],
          message: 'too many rows to export',
          params: { limit: 1000, total: 1240 },
        },
      ],
    ],
  ])('a 400 keeps its issues %j', async (issues) => {
    useNetwork(fakeAdapter(400, { status: 400, code: 'ERP-VALIDATION-0001', issues }));
    const result = await readExportRows(PATH, { format: 'print' });
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: 'ERP-VALIDATION-0001',
      retryAfterS: null,
      issues,
    });
  });

  it('a 403 is its code, and a network failure resolves (it never throws)', async () => {
    useNetwork(fakeAdapter(403, { status: 403, code: 'ERP-AUTH-0005' }));
    await expect(readExportRows(PATH, {})).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'ERP-AUTH-0005',
    });
    useNetwork(networkFailureAdapter());
    await expect(readExportRows(PATH, {})).resolves.toMatchObject({
      ok: false,
      status: 0,
      code: 'ERP-NETWORK-0001',
    });
  });

  it('repeats key, header and blank without brackets, asks for JSON, and carries the bearer as a header only', async () => {
    useNetwork(fakeAdapter(200, ROWS));
    await readExportRows(PATH, {
      format: 'print',
      q: 'a b',
      header: ['Full Name', 'Active'],
      blank: ['', 'Never'],
      key: ['7', '9'],
      title: 'Staff members',
    });
    const url = http.getUri(firstConfig());
    expect(url.startsWith(`${PATH}?`)).toBe(true);
    expect(url).toContain('header=Full+Name&header=Active');
    expect(url).toContain('blank=&blank=Never');
    expect(url).toContain('key=7&key=9');
    expect(url).not.toMatch(/%5B|\[/);
    expect(url).toContain('format=print');
    expect(fake?.calls[0]?.headers.accept).toBe('application/json');
    expect(fake?.calls[0]?.headers.authorization).toBe('Bearer at');
    expect([...new URLSearchParams(url.split('?')[1]).values()]).not.toContain('at');
    expect(url).not.toMatch(/token|bearer|authorization/i);
  });
});
