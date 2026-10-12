// `next build` with a 4 GB heap for every Node process it starts, on every OS. The flag on `node` reached only the
// parent; Next's type-check worker is a child process and kept Node's default heap (about 2 GB on an 8 GB machine),
// so a cold build died there (plan 04.10-24). NODE_OPTIONS is inherited by every child, and setting it here avoids
// env syntax in the package script, which cmd, PowerShell and POSIX shells write differently.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HEAP = '--max-old-space-size=4096';
const inherited = process.env.NODE_OPTIONS ?? '';
const NODE_OPTIONS = inherited.includes('--max-old-space-size')
  ? inherited
  : `${inherited} ${HEAP}`.trim();
const next = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const result = spawnSync(process.execPath, [next, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS },
});
process.exit(result.status ?? 1);
