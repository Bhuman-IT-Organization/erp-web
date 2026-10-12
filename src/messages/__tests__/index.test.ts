import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AbstractIntlMessages } from 'next-intl';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@/i18n/locales';
import { NAMESPACES, messagesFor } from '../index';

// A key is snake_case, optionally with ONE leading underscore. The underscore is not a style
// choice: FE-19 says a legacy key keeps its `_lang.php` name byte-identical, and Perfex really
// does register `_warehouse` (plan 04 recorded it; `src/config/navigation.ts` points at it). The
// alternative was renaming the key, which would have made the menu's `labelKey` no longer the
// legacy name — the one property that makes the mapping checkable. Widened in plan 03.1-06.
const KEY = /^_?[a-z][a-z0-9_]*$/;
const ERROR_KEY = /^ERP-[A-Z]+-\d{4}$|^unknown$/;

/** Every `path → leaf` of a pack, depth first, in source order. */
function leaves(node: AbstractIntlMessages, path: string[] = []): [string[], unknown][] {
  return Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'object' ? leaves(v, [...path, k]) : [[[...path, k], v] as [string[], unknown]],
  );
}

describe('messagesFor', () => {
  it.each(SUPPORTED_LOCALES)(
    '%s: the merged pack has exactly the registered namespaces at the top level',
    (locale) => {
      expect(Object.keys(messagesFor(locale)).sort()).toEqual([...NAMESPACES].sort());
    },
  );

  it.each(SUPPORTED_LOCALES)('%s: every leaf is a non-empty string', (locale) => {
    for (const [path, value] of leaves(messagesFor(locale))) {
      expect(typeof value, path.join('.')).toBe('string');
      expect((value as string).trim(), path.join('.')).not.toBe('');
    }
  });

  it.each(SUPPORTED_LOCALES)(
    '%s: keys are snake_case, or a problem-details code under errors',
    (locale) => {
      for (const [path] of leaves(messagesFor(locale))) {
        const key = path.at(-1) ?? '';
        const underErrors = path.at(-2) === 'errors';
        expect(key, path.join('.')).toMatch(underErrors ? ERROR_KEY : KEY);
      }
    },
  );

  it.each(SUPPORTED_LOCALES)(
    '%s: no error message renders a code or an HTTP status (D-32)',
    (locale) => {
      for (const [path, value] of leaves(messagesFor(locale))) {
        if (path.at(-2) !== 'errors') continue;
        expect(value, path.join('.')).not.toMatch(/\{code\}|\{status\}|ERP-|HTTP/);
      }
    },
  );

  it('every ar key exists in en (ar is an override, never a superset)', () => {
    const enKeys = new Set(leaves(messagesFor('en')).map(([p]) => p.join('.')));
    for (const [path] of leaves(messagesFor('ar'))) expect(enKeys.has(path.join('.'))).toBe(true);
  });

  it('a key present only in en renders the English text under ar (English fallback)', () => {
    const en = messagesFor('en');
    const ar = messagesFor('ar');
    // `scaffold_title` is a product name, identical in every locale — the same string proves the
    // merge picked SOMETHING for the key; the deep-merge case below proves it came from en.
    expect((ar.common as AbstractIntlMessages).scaffold_title).toBe(
      (en.common as AbstractIntlMessages).scaffold_title,
    );
    // Every en leaf resolves under ar to a string: nothing is lost by merging.
    const arLeaves = new Set(leaves(ar).map(([p]) => p.join('.')));
    for (const [path] of leaves(en)) expect(arLeaves.has(path.join('.'))).toBe(true);
  });

  it('does not mutate the imported packs across calls', () => {
    const first = messagesFor('ar');
    const en = messagesFor('en');
    (first.common as AbstractIntlMessages).retry = 'mutated';
    expect((en.common as AbstractIntlMessages).retry).toBe('Retry');
    expect((messagesFor('ar').common as AbstractIntlMessages).retry).not.toBe('mutated');
  });
});

/** U+2014, the em dash; written as an escape so this file holds none itself. */
const EM_DASH = '\u2014';
/** The same character written as a JSX entity. */
const EM_DASH_ENTITY = /&mdash;|&#8212;|&#x2014;/i;

/** Every file under `dirs` (relative to the repository root), with forward slashes. */
function filesUnder(...dirs: string[]): string[] {
  return dirs.flatMap((dir) =>
    readdirSync(join(process.cwd(), dir), { recursive: true, encoding: 'utf8' }).map(
      (file) => `${dir}/${file.replaceAll('\\', '/')}`,
    ),
  );
}

const TEXT_NODES = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

/** `file:line` of every string, template literal or JSX text holding an em dash; comments never. */
function emDashLiterals(file: string): string[] {
  const text = readFileSync(join(process.cwd(), file), 'utf8');
  // A file with neither spelling anywhere cannot hold one in a literal: only the rest is parsed, so
  // the guard stays well inside the suite timeout as src grows.
  if (!text.includes(EM_DASH) && !EM_DASH_ENTITY.test(text)) return [];
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (TEXT_NODES.has(node.kind)) {
      const value = (node as ts.LiteralLikeNode).text;
      const entity = node.kind === ts.SyntaxKind.JsxText && EM_DASH_ENTITY.test(value);
      if (value.includes(EM_DASH) || entity) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        hits.push(`${file}:${String(line + 1)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe('no em dash anywhere (UAT gap 6, lead 2026-09-27)', () => {
  it('no message file in erp-web contains an em dash (U+2014)', () => {
    const packs = filesUnder('src').filter((file) => /(^|\/)messages\/.*\.json$/.test(file));
    expect(packs.length).toBeGreaterThan(0);
    const hits = packs.flatMap((file) =>
      readFileSync(join(process.cwd(), file), 'utf8')
        .split('\n')
        .flatMap((line, index) => (line.includes(EM_DASH) ? [`${file}:${String(index + 1)}`] : [])),
    );
    expect(hits).toEqual([]);
  });

  it('no .ts or .tsx under src/ or app/ outside tests has an em dash in a string, a template literal or JSX text', () => {
    const code = filesUnder('src', 'app').filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !file.endsWith('.d.ts') &&
        !file.includes('/__tests__/') &&
        !/\.test\.tsx?$/.test(file),
    );
    expect(code.length).toBeGreaterThan(0);
    expect(code.flatMap(emDashLiterals)).toEqual([]);
  });
});
