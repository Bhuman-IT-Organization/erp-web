// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectFitsShell } from '../in-shell';

/**
 * The layout proofs without the shell (4.7 UI-SPEC G3, plan 12): a public page has no sidebar, and
 * a long text may wrap in a box wider than the shell's 320px column, but never past the viewport.
 * happy-dom lays nothing out, so each case stubs the geometry the proof reads: every element draws
 * one box of `boxWidth`, every text one line, and the page's own width.
 */
const VIEWPORT = 1024;
let boxWidth = 200;
let pageWidth = VIEWPORT;

const box = (width: number) => ({
  left: 0,
  right: width,
  top: 0,
  bottom: 20,
  width,
  height: 20,
  x: 0,
  y: 0,
  toJSON: () => ({}),
});

beforeEach(() => {
  boxWidth = 200;
  pageWidth = VIEWPORT;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEWPORT });
  Object.defineProperty(document.documentElement, 'scrollWidth', {
    configurable: true,
    get: () => pageWidth,
  });
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [box(boxWidth)] as unknown as DOMRectList,
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => box(boxWidth));
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(
    () => [box(10)] as unknown as DOMRectList,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function page(html: string): HTMLElement {
  document.body.innerHTML = `<main>${html}</main>`;
  const main = document.body.querySelector('main');
  if (main === null) throw new Error('no page');
  return main;
}

describe('expectFitsShell(canvas, { shell: false })', () => {
  it('passes on a page with no sidebar whose short text keeps one line', async () => {
    await expect(
      expectFitsShell(page('<h1>x</h1>'), { shell: false, short: ['x'] }),
    ).resolves.toBeUndefined();
  });

  it('fails when the page scrolls sideways', async () => {
    pageWidth = VIEWPORT + 40;
    await expect(expectFitsShell(page('<h1>x</h1>'), { shell: false })).rejects.toThrow();
  });

  it('fails when the page draws the shell sidebar it says it has not', async () => {
    const canvas = page('<div data-slot="sidebar">menu</div><h1>x</h1>');
    await expect(expectFitsShell(canvas, { shell: false })).rejects.toThrow();
  });

  it('a long text may wrap wider than 320px inside the viewport (the shell rule caps it)', async () => {
    boxWidth = 600;
    const canvas = page('<p>a long note</p>');
    await expect(
      expectFitsShell(canvas, { shell: false, long: ['a long note'] }),
    ).resolves.toBeUndefined();
    await expect(expectFitsShell(canvas, { long: ['a long note'] })).rejects.toThrow();
  });

  it('a long text wider than the viewport fails', async () => {
    boxWidth = VIEWPORT + 1;
    const canvas = page('<p>a long note</p>');
    await expect(
      expectFitsShell(canvas, { shell: false, long: ['a long note'] }),
    ).rejects.toThrow();
  });
});
