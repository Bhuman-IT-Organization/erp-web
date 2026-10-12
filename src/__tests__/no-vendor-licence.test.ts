import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No vendor licence check exists in erp-web, and none can arrive unnoticed (ADR-0042 point 5,
 * P-01, T-4.2-14, T-4.2-15). Every file git knows under `src/`, `app/`, `public/`, `proxy.ts` and
 * `next.config.ts` (tracked, or new and not ignored), except this test, is matched
 * case-insensitively against the patterns below: no licence server call, licence key variable,
 * `LB-*` header or `vendorLicence` breaker. The failure message lists each offending `file:line`.
 * The patterns live in a `String.raw` literal, so no backslash is doubled. erp-api holds the twin,
 * `src/__tests__/no-vendor-licence.spec.ts`.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const SELF = 'src/__tests__/no-vendor-licence.test.ts';
const SCANNED = ['src', 'app', 'public', 'proxy.ts', 'next.config.ts'];
const LICENCE = new RegExp(
  String.raw`verify_license|verify-license|licensebox|lb-api-key|lb-url|lb-ip|vendorlicen[cs]e|licen[cs]e_api|licen[cs]e_key|api/verify_license|\.lic['"` +
    '`]',
  'i',
);

const sourceFiles = (): string[] =>
  execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...SCANNED],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((file) => file !== '' && file !== SELF);

describe('no vendor licence check (ADR-0042, T-4.2-14)', () => {
  it('names no licence server, licence key, LB-* header or vendorLicence breaker anywhere', () => {
    const offending: string[] = [];
    for (const file of sourceFiles()) {
      let text: string;
      try {
        text = readFileSync(join(ROOT, file), 'utf8');
      } catch {
        continue; // listed by git but deleted in the working tree
      }
      text.split('\n').forEach((line, index) => {
        if (LICENCE.test(line)) offending.push(`${file}:${String(index + 1)}`);
      });
    }
    expect(offending, offending.join('\n')).toEqual([]);
  });
});
