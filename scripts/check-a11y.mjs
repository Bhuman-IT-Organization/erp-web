// corepack yarn check:a11y (erp-docs 02-coding-rules/06-frontend.md FE-23, FE-25; D-12): every story of storybook-static audited by axe-core in headless Chrome, strict. Run after storybook:build. Prints one line per audit and a total; exit 1 on any failure. --prove plants a known failure and must see it fail.
//
// Each story is opened at 1280 wide; the viewport it declares (`globals.viewport.value`, read from
// Storybook's own preview as `storyGlobals`) decides its widths: `desktop1280` -> 1280 only,
// `mobile375` -> 375 only, `desktop<W>` (1024, 1366, 1920: the page-overflow proofs of a shell page)
// -> that width only, `desktop<W>x<H>` -> that width and height only, none (or a value of another
// shape) -> 1280 and 375. An audit FAILS on any axe violation (the page, not the Storybook wrapper;
// `region` off, a story is not a page), a play error, a console.error or an uncaught exception during
// the render, a render that does not reach `finished`, an empty `#storybook-root` (no element and no
// text: a bare text value is a render) or horizontal overflow. A story that renders nothing by design
// declares `parameters: { a11yRunner: { rendersNothing: true } }`, and its root is asserted empty instead.
// There is no allowlist. `--concurrency <n>` (default 4) audits n stories at a time, one headless
// Chrome each; the output is in index order whatever the timing. Chrome comes from CHROME_PATH or
// the platform's default install; the server and Chrome bind 127.0.0.1 on OS-assigned ports and
// every throwaway Chrome profile is removed at exit. Nothing is written into the repository.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = join(root, 'storybook-static');
const AXE_PATH = join(root, 'node_modules', 'axe-core', 'axe.min.js');
const DESKTOP = 1280;
const MOBILE = 375;
const HEIGHTS = { [DESKTOP]: 800, [MOBILE]: 740, 1024: 768, 1366: 768, 1920: 1080 };
/** A declared viewport audits at its size only: `mobile375`, `desktop1366`, `desktop1366x768`. */
function declaredSize(value) {
  const match = /^(?:desktop|mobile)(\d+)(?:x(\d+))?$/.exec(value ?? '');
  if (match === null) return undefined;
  const width = Number(match[1]);
  return { width, height: match[2] === undefined ? (HEIGHTS[width] ?? 800) : Number(match[2]) };
}
const RENDER_TIMEOUT_MS = 30_000;
const POLL_MS = 100;
// A dialog's 100 ms fade or a Radix menu's mount lands after the render phase says finished.
const SETTLE_MS = 400;
const CHROME_START_MS = 30_000;
const EM_DASH = String.fromCharCode(0x2014);
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const fail = (message) => {
  console.error(`check:a11y: ${message}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const prove = args.includes('--prove');
const concurrencyArg = args.includes('--concurrency')
  ? args[args.indexOf('--concurrency') + 1]
  : '4';
const concurrency = Number(concurrencyArg);
if (!Number.isInteger(concurrency) || concurrency < 1) {
  fail(`--concurrency must be a positive integer, got ${concurrencyArg}`);
}
if (!existsSync(join(STATIC, 'index.json'))) {
  fail('storybook-static not found; run corepack yarn storybook:build first');
}

/** CHROME_PATH when set (never silently replaced), else the platform's default install. */
function findChrome() {
  if (process.env.CHROME_PATH !== undefined) {
    return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  }
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : process.platform === 'win32'
        ? [
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
            join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
          ]
        : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].flatMap(
            (name) => (process.env.PATH ?? '').split(delimiter).map((dir) => join(dir, name)),
          );
  return candidates.find((file) => file !== '' && existsSync(file)) ?? null;
}

const chromePath = findChrome();
if (chromePath === null) fail('Chrome not found; set CHROME_PATH to the browser executable');

const AXE = readFileSync(AXE_PATH, 'utf8');
const INDEX = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'));
const STORIES = Object.values(INDEX.entries)
  .filter((entry) => entry.type === 'story')
  .map((entry) => entry.id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = join(STATIC, path === '/' ? 'index.html' : path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(STATIC + sep) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const CHROME_ARGS = [
  '--headless=new',
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  // A scrollbar would take width from the page and turn a fitting layout into an overflow.
  '--hide-scrollbars',
  'about:blank',
];

// One Chrome per concurrent page, each with its own throwaway profile: pages of one profile share
// cookies, storage and Web Locks, so one story's pending session refresh stalled another's.
const browsers = [];

async function devtoolsUrl(browser) {
  const file = join(browser.profile, 'DevToolsActivePort');
  for (let waited = 0; waited < CHROME_START_MS; waited += POLL_MS) {
    const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
    if (lines[1]) return `ws://127.0.0.1:${lines[0].trim()}${lines[1].trim()}`;
    if (browser.chrome.exitCode !== null) break;
    await sleep(POLL_MS);
  }
  throw new Error('Chrome did not start (no DevToolsActivePort)');
}

function onMessage(browser, event) {
  const msg = JSON.parse(event.data);
  if (msg.id !== undefined && browser.pending.has(msg.id)) {
    const { resolve, reject } = browser.pending.get(msg.id);
    browser.pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`.trim()));
    else resolve(msg.result);
    return;
  }
  const page = browser.page;
  if (page === null || msg.sessionId !== page.sessionId) return;
  if (msg.method === 'Runtime.exceptionThrown') {
    const details = msg.params.exceptionDetails;
    page.errors.push(`exception: ${details.exception?.description ?? details.text}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    page.errors.push(`console.error: ${text}`);
  }
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'check-a11y-'));
  const chrome = spawn(chromePath, [...CHROME_ARGS, `--user-data-dir=${profile}`], {
    stdio: 'ignore',
  });
  const browser = {
    profile,
    chrome,
    exited: new Promise((resolve) => chrome.once('exit', resolve)),
    ws: null,
    seq: 0,
    pending: new Map(),
    page: null,
  };
  browsers.push(browser);
  browser.ws = new WebSocket(await devtoolsUrl(browser));
  browser.ws.addEventListener('message', (event) => onMessage(browser, event));
  await new Promise((resolve, reject) => {
    browser.ws.addEventListener('open', resolve, { once: true });
    browser.ws.addEventListener('error', () => reject(new Error('cannot reach Chrome DevTools')), {
      once: true,
    });
  });
  return browser;
}

function send(browser, method, params = {}, sessionId = undefined) {
  browser.seq += 1;
  const id = browser.seq;
  return new Promise((resolve, reject) => {
    browser.pending.set(id, { resolve, reject });
    browser.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function closeChrome(browser) {
  if (browser.ws !== null && browser.ws.readyState === WebSocket.OPEN) {
    browser.ws.send(JSON.stringify({ id: 0, method: 'Browser.close' }));
  }
  const closed = await Promise.race([browser.exited.then(() => true), sleep(5000)]);
  if (!closed) browser.chrome.kill();
  await Promise.race([browser.exited, sleep(5000)]);
  // Windows keeps the profile busy for a moment after Chrome exits; rmSync retries EBUSY.
  rmSync(browser.profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

async function cleanup() {
  await Promise.all(browsers.map(closeChrome));
  server.close();
}
process.once('SIGINT', () => {
  void cleanup().finally(() => process.exit(130));
});

// Storybook reports a failed play or render on its channel, not always on the console.
const PLAY_ERROR_HOOK = `
  window.__checkA11yPlayErrors = [];
  (function hook() {
    const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
    if (!channel) { setTimeout(hook, 5); return; }
    for (const name of ['playFunctionThrewException', 'storyThrewException', 'storyErrored', 'storyMissing'])
      channel.on(name, (e) => window.__checkA11yPlayErrors.push(name + ': ' + (e && (e.message || e.description || JSON.stringify(e)))));
  })();`;

/** A fresh Chrome with one page target in its own window (a background tab is hidden and never paints). */
async function openPage() {
  const browser = await launchChrome();
  const { targetId } = await send(browser, 'Target.createTarget', {
    url: 'about:blank',
    newWindow: true,
  });
  const { sessionId } = await send(browser, 'Target.attachToTarget', { targetId, flatten: true });
  const page = {
    sessionId,
    errors: [],
    send: (method, params) => send(browser, method, params, sessionId),
    async evaluate(expression) {
      const r = await page.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      }
      return r.result.value;
    },
  };
  browser.page = page;
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  // A headless window is not focused unless emulated: userEvent.type would land nowhere.
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PLAY_ERROR_HOOK });
  return page;
}

const PHASE = `window.__checkA11yStale ? 'stale' : (window.__STORYBOOK_PREVIEW__?.currentRender?.phase ?? 'none')`;
const STATE = `(() => {
  const root = document.querySelector('#storybook-root');
  const story = window.__STORYBOOK_PREVIEW__?.currentRender?.story;
  return {
    playErrors: window.__checkA11yPlayErrors ?? [],
    rootChildren: root?.childElementCount ?? 0,
    rootText: (root?.textContent ?? '').trim().length,
    portalled: document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]').length,
    errorDisplay: document.body.classList.contains('sb-show-errordisplay'),
    scrollWidth: document.documentElement.scrollWidth,
    declared: story?.storyGlobals?.viewport?.value ?? null,
    rendersNothing: story?.parameters?.a11yRunner?.rendersNothing === true,
  };
})()`;

/** Opens one story at one size and waits for its render (and play) to end. */
async function render(page, id, width, height = HEIGHTS[width]) {
  await page.evaluate('window.__checkA11yStale = true').catch(() => undefined);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  page.errors = [];
  await page.send('Page.navigate', { url: `${base}/iframe.html?id=${id}&viewMode=story` });
  let phase = 'none';
  for (let waited = 0; waited < RENDER_TIMEOUT_MS; waited += POLL_MS) {
    await sleep(POLL_MS);
    phase = await page.evaluate(PHASE).catch(() => 'none');
    if (phase === 'finished' || phase === 'errored' || phase === 'aborted') break;
  }
  await sleep(SETTLE_MS);
  const state = await page.evaluate(STATE);
  return { phase, ...state, errors: [...page.errors, ...state.playErrors] };
}

async function axe(page) {
  if ((await page.evaluate('typeof window.axe')) !== 'object') await page.evaluate(`${AXE};0`);
  return page.evaluate(`axe.run({ include: [document.body], exclude: [['.sb-wrapper']] },
      { rules: { region: { enabled: false } } })
    .then((r) => r.violations.map((v) => v.id + ' (' + v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ') + ')'))`);
}

/** The reasons one audit fails; none means it passes. */
async function judge(page, r, width, rendersNothing) {
  const reasons = [];
  if (r.phase !== 'finished') reasons.push(`render phase ${r.phase}, not finished`);
  // One audit is one line: a multi-line error (a Testing Library DOM dump) is folded.
  reasons.push(...r.errors.map((e) => e.replace(/\s+/g, ' ').slice(0, 300)));
  if (r.errorDisplay) reasons.push('Storybook error display shown');
  if (r.scrollWidth > width) reasons.push(`horizontal overflow (scrollWidth ${r.scrollWidth})`);
  if (rendersNothing) {
    if (r.rootChildren > 0 || r.rootText > 0) {
      reasons.push('declares rendersNothing but #storybook-root is not empty');
    }
    return reasons;
  }
  if (r.rootChildren === 0 && r.rootText === 0 && r.portalled === 0)
    reasons.push('empty #storybook-root');
  reasons.push(...(await axe(page)).map((v) => `axe ${v}`));
  return reasons;
}

const line = (id, width, reasons, note) =>
  reasons.length === 0
    ? `PASS ${id}@${width}${note ? `: ${note}` : ''}`
    : `FAIL ${id}@${width}: ${reasons.join('; ')}`;

/** Every audit of one story: the 1280 render tells the declared width and parameters. */
async function auditStory(page, id) {
  const first = await render(page, id, DESKTOP);
  const declared = declaredSize(first.declared);
  const sizes =
    declared === undefined
      ? [DESKTOP, MOBILE].map((width) => ({ width, height: HEIGHTS[width] }))
      : [declared];
  const lines = [];
  for (const { width, height } of sizes) {
    const reuse = width === DESKTOP && height === HEIGHTS[DESKTOP];
    const r = reuse ? first : await render(page, id, width, height);
    const reasons = await judge(page, r, width, first.rendersNothing);
    lines.push(
      line(id, width, reasons, first.rendersNothing ? 'renders nothing (as declared)' : ''),
    );
  }
  return lines;
}

/** The first story at 1280 with an image lacking alt text: the audit must fail with image-alt. */
async function auditPlanted(page, id) {
  const r = await render(page, id, DESKTOP);
  await page.evaluate(
    `document.querySelector('#storybook-root').appendChild(Object.assign(document.createElement('img'), { src: 'data:,' }))`,
  );
  return [line(id, DESKTOP, await judge(page, r, DESKTOP, false), '')];
}

/** At most `size` stories render at once, one page each; results print in index order. */
async function runPool(ids, size, audit) {
  const results = new Array(ids.length);
  let next = 0;
  let printed = 0;
  const flush = () => {
    while (printed < ids.length && results[printed] !== undefined) {
      for (const l of results[printed]) console.log(l.replaceAll(EM_DASH, '-'));
      printed += 1;
    }
  };
  const worker = async (page) => {
    while (next < ids.length) {
      const i = next;
      next += 1;
      results[i] = await audit(page, ids[i]).catch((error) => [
        `FAIL ${ids[i]}: runner error: ${String(error?.message ?? error).slice(0, 300)}`,
      ]);
      flush();
    }
  };
  const opened = await Promise.all(Array.from({ length: Math.min(size, ids.length) }, openPage));
  await Promise.all(opened.map(worker));
  return results.flat();
}

const started = Date.now();
let exitCode = 1;
try {
  if (prove) {
    const [result] = await runPool(STORIES.slice(0, 1), 1, auditPlanted);
    if (result.startsWith('FAIL ') && result.includes('axe image-alt')) {
      console.log('check:a11y --prove: FAIL (as it must): image-alt');
      exitCode = 0;
    } else {
      console.log('check:a11y --prove: PASS (the runner is NOT strict)');
    }
  } else {
    const results = await runPool(STORIES, concurrency, auditStory);
    const failed = results.filter((l) => !l.startsWith('PASS ')).length;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `check:a11y: ${STORIES.length} stories, ${results.length} audits, ${failed} failed (${seconds} s, concurrency ${concurrency})`,
    );
    exitCode = failed === 0 ? 0 : 1;
  }
} catch (error) {
  console.error(`check:a11y: ${error?.message ?? error}`);
} finally {
  await cleanup();
}
process.exit(exitCode);
