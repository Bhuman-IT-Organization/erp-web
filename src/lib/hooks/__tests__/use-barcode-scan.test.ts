// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import {
  SCAN_FORMATS,
  WASM_PATH,
  createBarcodeDetector,
  useBarcodeScan,
  wasmLocation,
} from '../use-barcode-scan';

/**
 * The scanner's decoder (L-02, P-10, RESEARCH Pitfall 5, T-4.2-19): the browser's own
 * `BarcodeDetector` when it reads EAN-13 and Code 128, else the `barcode-detector` ponyfill, loaded
 * only then, whose `.wasm` comes from our own origin (`/wasm/`), never its CDN default.
 */
const ponyfill = vi.hoisted(() => ({
  imported: 0,
  prepare: vi.fn(),
  created: [] as unknown[],
  answers: [] as { rawValue: string }[][],
}));

vi.mock('barcode-detector/ponyfill', () => {
  ponyfill.imported += 1;
  class BarcodeDetector {
    constructor(readonly options: unknown) {
      ponyfill.created.push(options);
    }
    detect(): Promise<{ rawValue: string }[]> {
      return Promise.resolve(ponyfill.answers.shift() ?? []);
    }
  }
  return { BarcodeDetector, prepareZXingModule: ponyfill.prepare };
});

/** A native `BarcodeDetector` on `globalThis` reading `supported`. */
function nativeDetector(supported: readonly string[]) {
  const made: unknown[] = [];
  class NativeDetector {
    static getSupportedFormats(): Promise<readonly string[]> {
      return Promise.resolve(supported);
    }
    constructor(readonly options: unknown) {
      made.push(options);
    }
    detect(): Promise<{ rawValue: string }[]> {
      return Promise.resolve([]);
    }
  }
  Object.defineProperty(globalThis, 'BarcodeDetector', {
    configurable: true,
    value: NativeDetector,
  });
  return { NativeDetector, made };
}

describe('wasmLocation (our origin, never the CDN)', () => {
  it('maps any .wasm to /wasm/<file> and leaves other files at the given prefix', () => {
    expect(wasmLocation('zxing_reader.wasm', 'https://cdn.example/')).toBe(
      '/wasm/zxing_reader.wasm',
    );
    expect(WASM_PATH).toBe('/wasm/');
    expect(wasmLocation('zxing_reader.js', 'https://cdn.example/')).toBe(
      'https://cdn.example/zxing_reader.js',
    );
  });
});

describe('createBarcodeDetector', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'BarcodeDetector');
  });

  it('uses the native detector reading EAN-13 and Code 128, and never loads the ponyfill', async () => {
    const { NativeDetector, made } = nativeDetector(['qr_code', 'ean_13', 'code_128']);
    const detector = await createBarcodeDetector();
    expect(detector).toBeInstanceOf(NativeDetector);
    expect(made).toEqual([{ formats: ['ean_13', 'code_128'] }]);
    expect(ponyfill.imported).toBe(0);
    expect(ponyfill.prepare).not.toHaveBeenCalled();
  });

  it('without a native detector loads the ponyfill, pointed at /wasm/ through locateFile', async () => {
    const detector = await createBarcodeDetector();
    expect(ponyfill.imported).toBe(1);
    expect(ponyfill.prepare).toHaveBeenCalledWith({ overrides: { locateFile: wasmLocation } });
    expect(ponyfill.created.at(-1)).toEqual({ formats: [...SCAN_FORMATS] });
    expect(detector).toBeTruthy();
  });

  it('a native detector without Code 128 is passed over for the ponyfill', async () => {
    const { made } = nativeDetector(['ean_13', 'qr_code']);
    const before = ponyfill.created.length;
    await createBarcodeDetector();
    expect(made).toEqual([]);
    expect(ponyfill.created.length).toBe(before + 1);
  });
});

describe('useBarcodeScan', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ponyfill.answers.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls a frame every 250 ms; the first non-empty code is reported once and polling stops', async () => {
    ponyfill.answers.push([], [{ rawValue: '' }], [{ rawValue: '4006381333931' }]);
    const onCode = vi.fn();
    const video = document.createElement('video');
    const detect = vi.spyOn(
      (await import('barcode-detector/ponyfill')).BarcodeDetector.prototype,
      'detect',
    );
    renderHook(() => {
      useBarcodeScan(video, true, onCode);
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(detect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.scanner.frameIntervalMs);
    expect(detect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.scanner.frameIntervalMs);
    expect(onCode.mock.calls).toEqual([['4006381333931']]);
    await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.scanner.frameIntervalMs * 4);
    expect(detect).toHaveBeenCalledTimes(3);
    expect(onCode).toHaveBeenCalledTimes(1);
  });

  it('inactive or without a video it reads nothing; turning inactive stops the polling', async () => {
    const onCode = vi.fn();
    const video = document.createElement('video');
    const detect = vi.spyOn(
      (await import('barcode-detector/ponyfill')).BarcodeDetector.prototype,
      'detect',
    );
    detect.mockClear();
    const initialProps: { on: boolean; el: HTMLVideoElement | null } = { on: false, el: video };
    const { rerender } = renderHook(
      ({ on, el }: { on: boolean; el: HTMLVideoElement | null }) => {
        useBarcodeScan(el, on, onCode);
      },
      { initialProps },
    );
    rerender({ on: true, el: null });
    await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.scanner.frameIntervalMs * 2);
    expect(detect).not.toHaveBeenCalled();
    rerender({ on: true, el: video });
    await vi.advanceTimersByTimeAsync(0);
    expect(detect).toHaveBeenCalledTimes(1);
    rerender({ on: false, el: video });
    await vi.advanceTimersByTimeAsync(CLIENT_TIMINGS.scanner.frameIntervalMs * 4);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(onCode).not.toHaveBeenCalled();
  });
});

/** Every .ts and .tsx file under `dir` (posix, relative to the repo root). */
function sourceFiles(root: string, dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(root, dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(root, relative(root, path)));
    else if (/\.tsx?$/.test(name)) out.push(relative(root, path).split(sep).join('/'));
  }
  return out;
}

describe('the self-hosted decoder (T-4.2-19)', () => {
  const root = process.cwd();
  const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

  it('public/wasm/zxing_reader.wasm is byte for byte the installed zxing-wasm reader, under 5 MB', () => {
    const served = join(root, 'public', 'wasm', 'zxing_reader.wasm');
    const installed = join(
      root,
      'node_modules',
      'zxing-wasm',
      'dist',
      'reader',
      'zxing_reader.wasm',
    );
    expect(sha256(served)).toBe(sha256(installed));
    expect(statSync(served).size).toBeLessThan(5 * 1024 * 1024);
  });

  it('only src/lib/hooks/use-barcode-scan.ts imports barcode-detector (tests aside)', () => {
    const importers = [...sourceFiles(root, 'src'), ...sourceFiles(root, 'app')]
      .filter((f) => !f.includes('/__tests__/'))
      .filter((f) =>
        /['"]barcode-detector(\/[a-z-]+)?['"]/.test(readFileSync(join(root, f), 'utf8')),
      );
    expect(importers).toEqual(['src/lib/hooks/use-barcode-scan.ts']);
  });

  it('no CDN host is named anywhere in src/ or app/', () => {
    // Assembled, so this file does not name them itself.
    const hosts = [
      ['js', 'delivr'],
      ['un', 'pkg'],
      ['cdn', 'js'],
      ['esm', '.sh'],
      ['sky', 'pack'],
    ].map((parts) => parts.join(''));
    const named = [...sourceFiles(root, 'src'), ...sourceFiles(root, 'app')].filter((f) => {
      const text = readFileSync(join(root, f), 'utf8').toLowerCase();
      return hosts.some((host) => text.includes(host));
    });
    expect(named).toEqual([]);
  });
});
