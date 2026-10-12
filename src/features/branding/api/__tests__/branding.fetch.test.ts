import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FORMAT_SETTINGS } from '@/lib/i18n/format';
import { brandingSchema, FALLBACK_BRANDING, fetchBranding } from '../branding.fetch';

const GOOD = {
  companyName: 'Example Company',
  logoUrl: '/uploads/company/a.png',
  logoDarkUrl: null,
  theme: {},
};
/** What a payload without `formats` parses to: the Perfex install defaults (deploy-order safe). */
const PARSED = { ...GOOD, formats: DEFAULT_FORMAT_SETTINGS };
const FORMATS = {
  dateFormat: 'd-m-Y',
  timeFormat: '12',
  thousandSeparator: '.',
  decimalSeparator: ',',
  decimalPlaces: 2,
  removeDecimalsOnZero: true,
  timeZone: 'Asia/Dubai',
  currency: {
    code: 'AED',
    symbol: 'AED',
    placement: 'after',
    thousandSeparator: '.',
    decimalSeparator: ',',
  },
} as const;

function fetchReturning(status: number, body: unknown): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

describe('fetchBranding', () => {
  it('appends the constant path to the base URL and parses the payload', async () => {
    const impl = fetchReturning(200, GOOD);
    await expect(fetchBranding('http://nginx/', impl)).resolves.toEqual(PARSED);
    expect(impl).toHaveBeenCalledWith('http://nginx/api/v1/branding', expect.anything());
  });

  it('parses defaultLocale when the api sends it', async () => {
    const impl = fetchReturning(200, { ...GOOD, defaultLocale: 'ar' });
    await expect(fetchBranding('http://nginx', impl)).resolves.toEqual({
      ...PARSED,
      defaultLocale: 'ar',
    });
  });

  it('parses a payload without defaultLocale (an older api) and the fallback says en', async () => {
    const parsed = await fetchBranding('http://nginx', fetchReturning(200, GOOD));
    expect(parsed.defaultLocale).toBeUndefined();
    expect(FALLBACK_BRANDING.defaultLocale).toBe('en');
  });

  it('defaults formats to the Perfex install defaults when the api does not send them (deploy-order safe)', () => {
    expect(brandingSchema.parse(GOOD).formats).toEqual(DEFAULT_FORMAT_SETTINGS);
  });

  it('parses the formats plan 02 sends as given', () => {
    expect(brandingSchema.parse({ ...GOOD, formats: FORMATS }).formats).toEqual(FORMATS);
  });

  it('the fallback carries the default formats', () => {
    expect(FALLBACK_BRANDING.formats).toEqual(DEFAULT_FORMAT_SETTINGS);
  });

  it.each([
    ['non-2xx', fetchReturning(503, GOOD)],
    ['invalid payload', fetchReturning(200, { companyName: '' })],
    ['absolute logo url', fetchReturning(200, { ...GOOD, logoUrl: 'http://evil/x.png' })],
    ['network failure', vi.fn(() => Promise.reject(new Error('boom'))) as unknown as typeof fetch],
  ])('falls back on %s', async (_label, impl) => {
    await expect(fetchBranding('http://nginx', impl)).resolves.toBe(FALLBACK_BRANDING);
  });

  it('aborts after the timeout and falls back', async () => {
    const impl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    ) as unknown as typeof fetch;
    await expect(fetchBranding('http://nginx', impl, 10)).resolves.toBe(FALLBACK_BRANDING);
  });
});
