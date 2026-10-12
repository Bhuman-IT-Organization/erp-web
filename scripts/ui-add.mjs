// `corepack yarn ui:add <name…>` — the ONLY way a shadcn primitive enters or changes src/components/ui/
// (ADR-0002: generated, never edited). Runs the pinned shadcn CLI through Yarn, then rewrites
// src/components/ui/.manifest.json = { "<file>.tsx": "<sha256 hex>" } (sorted, LF). The feature-shape
// spec compares every primitive against the manifest, so a hand edit fails `check`.
// `--manifest-only` rewrites the manifest without adding anything (used once to seed it). Every
// OTHER `--flag` is forwarded to the shadcn CLI unchanged, in the order it was given: re-adding an
// existing primitive (the `rtl: true` regeneration of plan 03.1-04) needs `--overwrite --yes`, and
// the CLI's overwrite prompt has no answer in a non-interactive run. Flags are forwarded, never
// invented here: this script adds no default, so `corepack yarn ui:add button` still asks.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHADCN = 'shadcn@4.21.0';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = join(root, 'src', 'components', 'ui');
const manifestPath = join(uiDir, '.manifest.json');

const args = process.argv.slice(2);
const manifestOnly = args.includes('--manifest-only');
const names = args.filter((a) => !a.startsWith('--'));
const flags = args.filter((a) => a.startsWith('--') && a !== '--manifest-only');

if (!manifestOnly && names.length === 0) {
  console.error('usage: corepack yarn ui:add <name…>   |   corepack yarn ui:add --manifest-only');
  process.exit(2);
}

if (!manifestOnly) {
  const result = spawnSync('corepack', ['yarn', 'dlx', SHADCN, 'add', ...names, ...flags], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`shadcn add failed (exit ${result.status ?? 'signal'}); manifest left unchanged`);
    process.exit(result.status ?? 1);
  }
}

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const files = readdirSync(uiDir)
  .filter((f) => f.endsWith('.tsx'))
  .sort();
const manifest = Object.fromEntries(files.map((f) => [f, sha256(readFileSync(join(uiDir, f)))]));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`ui manifest: ${files.length} primitive(s) → src/components/ui/.manifest.json`);
