import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/check-brand.mjs` check 4 (FE-17) against a throwaway tree: the script scans `app/`,
 * `src/` and `public/` beside its own `scripts/` folder, so a copy in a temp dir scans only the
 * fixture — never erp-web's own files, and nothing is written into erp-web.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'check-brand.mjs');
let root: string | undefined;

function checkBrand(files: Readonly<Record<string, string>>): {
  status: number | null;
  out: string;
} {
  root = mkdtempSync(join(tmpdir(), 'check-brand-'));
  for (const dir of ['app', 'src', 'public', 'scripts']) mkdirSync(join(root, dir));
  copyFileSync(SCRIPT, join(root, 'scripts', 'check-brand.mjs'));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'check-brand.mjs')], {
    encoding: 'utf8',
  });
  return { status: result.status, out: result.stdout + result.stderr };
}

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

// The tag is assembled, so this file's own source holds no `<img` for the real check to scan.
const TAG = 'img';
const img = (src: string): string => `export const X = () => <${TAG} ${src} alt="" />;\n`;
const DATA = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

describe('check:brand — a data: URI image in stories and tests only (lead 2026-09-26, D-43)', () => {
  it('passes a data: src in a story and in a test, as a string or a template literal', () => {
    const result = checkBrand({
      'src/components/molecules/X/X.stories.tsx': img(`src="${DATA}"`),
      'src/components/templates/Y/Y.stories.tsx': img(`src={\`${DATA}\`}`),
      'src/components/molecules/X/__tests__/X.test.tsx': img(`src={'${DATA}'}`),
    });
    expect(result.out).not.toMatch(/image-src/);
    expect(result.status).toBe(0);
  });

  it('still refuses an http src and a path src in a story', () => {
    const result = checkBrand({
      'src/components/molecules/X/X.stories.tsx': img('src="https://example.com/logo.png"'),
      'src/components/molecules/Y/Y.stories.tsx': img('src="/logo.png"'),
    });
    expect(result.status).toBe(1);
    expect(result.out).toMatch(
      /image-src: src\/components\/molecules\/X\/X\.stories\.tsx:1: a literal/,
    );
    expect(result.out).toMatch(
      /image-src: src\/components\/molecules\/Y\/Y\.stories\.tsx:1: a literal/,
    );
  });

  it('still refuses a data: src in a component, a feature component and a route', () => {
    const result = checkBrand({
      'src/components/molecules/X/X.tsx': img(`src="${DATA}"`),
      'src/features/staff/components/Z.tsx': img(`src="${DATA}"`),
      'app/page.tsx': img(`src={\`${DATA}\`}`),
    });
    expect(result.status).toBe(1);
    expect(result.out).toMatch(/image-src: src\/components\/molecules\/X\/X\.tsx:1/);
    expect(result.out).toMatch(/image-src: src\/features\/staff\/components\/Z\.tsx:1/);
    expect(result.out).toMatch(/image-src: app\/page\.tsx:1/);
  });
});

describe('check:brand: the two kit items plan 04.2-07 admits, and nothing beside them', () => {
  it('passes the scanner decoder at public/wasm/zxing_reader.wasm (L-02); refuses any other file there', () => {
    const passed = checkBrand({ 'public/wasm/zxing_reader.wasm': '\0asm' });
    expect(passed.out).not.toMatch(/public:/);
    expect(passed.status).toBe(0);
    const refused = checkBrand({
      'public/wasm/other.wasm': '\0asm',
      'public/wasm/zxing_reader.js': 'x',
    });
    expect(refused.status).toBe(1);
    expect(refused.out).toMatch(/public: public\/wasm\/other\.wasm/);
    expect(refused.out).toMatch(/public: public\/wasm\/zxing_reader\.js/);
  });

  it('passes an expression src in ProtectedImage (an object URL, M7); still refuses its literal src and the same element in any other kit file', () => {
    const passed = checkBrand({
      'src/components/molecules/ProtectedImage/ProtectedImage.tsx': img('src={url}'),
    });
    expect(passed.out).not.toMatch(/image-src/);
    expect(passed.status).toBe(0);
    const refused = checkBrand({
      'src/components/molecules/ProtectedImage/Other.tsx': img('src={url}'),
      'src/components/molecules/X/X.tsx': img('src={url}'),
      'src/components/molecules/ProtectedImage/ProtectedImage.tsx': img('src="/logo.png"'),
    });
    expect(refused.status).toBe(1);
    expect(refused.out).toMatch(
      /image-src: src\/components\/molecules\/ProtectedImage\/Other\.tsx:1/,
    );
    expect(refused.out).toMatch(/image-src: src\/components\/molecules\/X\/X\.tsx:1/);
    expect(refused.out).toMatch(
      /image-src: src\/components\/molecules\/ProtectedImage\/ProtectedImage\.tsx:1: a literal/,
    );
  });
});
