// `corepack yarn check:brand` — the W0-05 CI grep: one build serves every customer, so nothing
// customer-specific may live in app/, src/ or public/. Structural checks always run; the customer
// NAMES come from the caller (`--names a,b` or `ERP_CUSTOMER_NAMES`) because the list belongs to
// erp-infra (customers/<name>/customer.yml), never to this repository. Prints one line per finding,
// `names: none supplied` when no list was given, exit 1 on any finding.
//
//   1. no image asset anywhere under app/ or src/ (logo, favicon, icon — brand comes from /api/v1/branding)
//   2. public/ holds only .gitkeep, fonts/ (font files only) and public/wasm/zxing_reader.wasm
//   3. the `uploads/company` legacy path only inside src/features/branding/** (code files; prose may name the rule)
//   4. images in code (code files, non-comment lines): `next/image` only inside
//      src/features/branding/**; every `<img>` element is scanned as an ELEMENT (prettier splits
//      attributes across lines) and outside branding it must carry an EXPRESSION src (`src={…}`)
//      and live in the feature that owns the data (src/features/<m>/**), or be ProtectedImage's
//      object-URL image (PATTERNS M7). FE-17's carve-out: a
//      user-data or customer-data image the api names (`profileImageUrl`, `logoUrl`) is data, not
//      a build asset. A literal src, an src this check cannot read, a shared component and a
//      route file are all refused — as are `public/` images (check 2) and `uploads/company` (3).
//      One exemption (lead 2026-09-26, D-43): a story or a test may render an `<img>` whose src is
//      a `data:` URI written in place — a neutral fixture drawn inline, never a file. Any other src
//      there is refused as it is anywhere else, and a `data:` src outside stories and tests too
//   5. a hex colour only in app/globals.css and src/components/ui/**, unless the same or the previous
//      line carries an `eslint-disable` for `no-restricted-syntax` (the justified 1:1 legacy colours);
//      the same scope as the S_HEX lint: code lines of source files — not comments, not markdown, not
//      tests/stories (branding's theme-grammar fixtures use `#abc`)
//   6. every supplied customer name, case-insensitive — as a word, inside an identifier, in a file name
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['app', 'src', 'public'];
const IMAGE = /\.(png|jpe?g|gif|svg|ico|webp|avif|bmp|tiff?)$/i;
const FONT = /\.(woff2|woff|ttf|otf)$/i;
const TEXT = /\.(ts|tsx|mts|js|mjs|cjs|json|css|md|mdx|txt|html|yml|yaml)$/i;
const BRANDING = 'src/features/branding/';
const HEX_HOMES = ['app/globals.css', 'src/components/ui/'];
const HEX = /#[0-9a-fA-F]{3,8}(?=[\s;,'"`)\]]|$)/g;
const DISABLED = /eslint-disable[^\n]*no-restricted-syntax/;
const UPLOADS = /uploads\/company/;
const NEXT_IMAGE = /from\s+['"]next\/image['"]/;
const IMG_START = /<img[\s/>]/g;
const IMG_SRC_LITERAL = /\bsrc\s*=\s*["'`]/;
const IMG_SRC_EXPRESSION = /\bsrc\s*=\s*\{/;
/** A `data:` URI written in place: `src="data:…"`, `src={'data:…'}` or ``src={`data:…`}``. */
const IMG_SRC_DATA = /\bsrc\s*=\s*(?:\{\s*)?["'`]data:/;
const FEATURE_FILE = /^src\/features\/[^/]+\//;
// The two kit items plan 04.2-07 admits, each one exact path (L-02, PATTERNS M7):
// - the camera scanner's decoder, served from our own origin and never a CDN (T-4.2-19): the same
//   bytes for every customer, pinned by sha-256 to the installed zxing-wasm in its hook's test;
// - ProtectedImage's <img>, whose src is always an object URL made from bytes the api served with
//   the bearer (an <img src> cannot carry it), never a path or a build asset.
const SCANNER_WASM = 'public/wasm/zxing_reader.wasm';
const OBJECT_URL_IMAGE = 'src/components/molecules/ProtectedImage/ProtectedImage.tsx';

const CODE = /\.(ts|tsx|mts|js|mjs|cjs|json|css)$/i;
const TEST_SCOPED = /(^|\/)__tests__\/|\.test\.tsx?$|^src\/test\/|\.stories\.tsx$/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

const posix = (p) => p.split(sep).join('/');

/**
 * The `<img …>` element starting at `start`: up to the first `>` that is not inside JSX braces, so an
 * attribute value containing `>` (`src={a > b ? x : y}`) cannot end the element early. Capped, so a
 * missing `>` cannot walk the whole file.
 */
const ELEMENT_MAX = 1000;
function imgElement(source, start) {
  let depth = 0;
  const end = Math.min(source.length, start + ELEMENT_MAX);
  for (let i = start; i < end; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start, end);
}
const files = SCANNED.flatMap((top) =>
  readdirSync(join(root, top), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => posix(relative(root, join(e.parentPath, e.name))))
    .sort(),
);

const argNames = (() => {
  const i = process.argv.indexOf('--names');
  if (i !== -1) return process.argv[i + 1] ?? '';
  const inline = process.argv.find((a) => a.startsWith('--names='));
  return inline === undefined
    ? (process.env.ERP_CUSTOMER_NAMES ?? '')
    : inline.slice('--names='.length);
})();
const names = argNames
  .split(',')
  .map((n) => n.trim())
  .filter((n) => n !== '');

const findings = [];
const report = (check, file, detail, line) =>
  findings.push(`${check}: ${file}${line === undefined ? '' : `:${line}`}: ${detail}`);

for (const file of files) {
  const inBranding = file.startsWith(BRANDING);
  // 1 + 2: assets
  if ((file.startsWith('app/') || file.startsWith('src/')) && IMAGE.test(file)) {
    report(
      'image-asset',
      file,
      'no image under app/ or src/ — brand assets come from /api/v1/branding',
    );
  }
  if (file.startsWith('public/')) {
    const ok =
      file === 'public/.gitkeep' ||
      (file.startsWith('public/fonts/') && FONT.test(file)) ||
      file === SCANNER_WASM;
    if (!ok) {
      report(
        'public',
        file,
        'public/ holds .gitkeep, fonts/ (font files) and the scanner decoder only',
      );
    }
  }
  // 6: names in file names
  for (const name of names) {
    if (file.toLowerCase().includes(name.toLowerCase())) {
      report('customer-name', file, `file name contains "${name}"`);
    }
  }
  if (!TEXT.test(file)) continue;
  const source = readFileSync(join(root, file), 'utf8');
  const lines = source.split('\n');
  // 4: every <img> element (see the header). Element-scanned, not line-scanned; a comment line is out
  // of scope, exactly as it is for the hex check — prose may name the construct it describes.
  if (CODE.test(file) && !inBranding) {
    for (const match of source.matchAll(IMG_START)) {
      const line = source.slice(0, match.index).split('\n').length;
      if (COMMENT_LINE.test(lines[line - 1] ?? '')) continue;
      const element = imgElement(source, match.index);
      if (TEST_SCOPED.test(file) && IMG_SRC_DATA.test(element)) continue;
      if (IMG_SRC_LITERAL.test(element)) {
        report(
          'image-src',
          file,
          'a literal <img src="…"> is a build asset or a hardcoded file name; a brand or customer file comes from the api (FE-17)',
          line,
        );
      } else if (!IMG_SRC_EXPRESSION.test(element)) {
        report(
          'image-src',
          file,
          'an <img> whose src this check cannot read (spread or computed attribute) — write src={…} from api data (FE-17)',
          line,
        );
      } else if (!FEATURE_FILE.test(file) && file !== OBJECT_URL_IMAGE) {
        report(
          'image-src',
          file,
          'an api-served user-data image belongs to the feature that owns that data (src/features/<m>/**), not to a shared component or a route (FE-17)',
          line,
        );
      }
    }
  }
  lines.forEach((text, i) => {
    const line = i + 1;
    // 3 + 4: legacy upload path and literal image sources (code files only)
    const code = CODE.test(file);
    if (code && !inBranding && UPLOADS.test(text)) {
      report('uploads-path', file, "the uploads/company path is branding's concern (FE-17)", line);
    }
    if (code && !inBranding && NEXT_IMAGE.test(text)) {
      report(
        'next-image',
        file,
        'next/image belongs to branding only: it optimises build assets, and an api-served file is not one (FE-17)',
        line,
      );
    }
    // 5: hex colours
    const hexScoped =
      code &&
      !TEST_SCOPED.test(file) &&
      !COMMENT_LINE.test(text) &&
      !HEX_HOMES.some((home) => file.startsWith(home) || file === home);
    if (hexScoped && HEX.test(text)) {
      const justified = DISABLED.test(text) || (i > 0 && DISABLED.test(lines[i - 1]));
      if (!justified) {
        report(
          'hex-colour',
          file,
          `${text.trim()} — theme tokens come from /api/v1/branding; a 1:1 legacy colour needs a justified eslint-disable (FE-17)`,
          line,
        );
      }
    }
    HEX.lastIndex = 0;
    // 6: names in content (whole word or inside an identifier, case-insensitive)
    const lower = text.toLowerCase();
    for (const name of names) {
      if (lower.includes(name.toLowerCase())) {
        report('customer-name', file, `contains "${name}"`, line);
      }
    }
  });
}

if (names.length === 0) console.log('names: none supplied (structural checks only)');
for (const finding of findings) console.log(finding);
if (findings.length > 0) {
  console.error(`check:brand — ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(
  `check:brand — ${files.length} files clean${names.length > 0 ? ` (names: ${names.join(', ')})` : ''}`,
);
