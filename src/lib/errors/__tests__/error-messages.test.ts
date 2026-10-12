import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import {
  COMMON_ERROR_CODES,
  errorMessageRef,
  isRetryableCode,
  RETRYABLE_CODES,
} from '../error-messages';

describe('errorMessageRef', () => {
  it('maps a shared code to common.errors.<code> with seconds "none" when there is no Retry-After', () => {
    expect(errorMessageRef('ERP-NETWORK-0001', null)).toEqual({
      namespace: 'common',
      key: 'errors.ERP-NETWORK-0001',
      values: { seconds: 'none' },
    });
  });

  it("maps a feature's own code to that feature's namespace first", () => {
    expect(
      errorMessageRef('ERP-IDENTITY-0006', null, {
        namespace: 'staff',
        codes: ['ERP-IDENTITY-0006'],
      }),
    ).toEqual({ namespace: 'staff', key: 'errors.ERP-IDENTITY-0006', values: { seconds: 'none' } });
  });

  it('maps an unknown code to common.errors.unknown and never passes the code on', () => {
    expect(errorMessageRef('ERP-WHATEVER-9999', 3)).toEqual({
      namespace: 'common',
      key: 'errors.unknown',
      values: { seconds: '3' },
    });
  });
});

describe('isRetryableCode', () => {
  it('is true for the three transport codes and nothing else', () => {
    expect([...RETRYABLE_CODES]).toEqual([
      'ERP-UPSTREAM-0001',
      'ERP-NETWORK-0001',
      'ERP-TIMEOUT-0001',
    ]);
    expect(isRetryableCode('ERP-TIMEOUT-0001')).toBe(true);
    expect(isRetryableCode('ERP-AUTH-0005')).toBe(false);
  });
});

describe('common.errors', () => {
  it('holds exactly the shared codes and unknown, each in plain language (D-32)', () => {
    const errors = commonEn.common.errors as Record<string, string>;
    expect(Object.keys(errors).sort()).toEqual([...COMMON_ERROR_CODES, 'unknown'].sort());
    for (const text of Object.values(errors)) expect(text).not.toMatch(/\{code\}|ERP-|HTTP/);
  });
});
