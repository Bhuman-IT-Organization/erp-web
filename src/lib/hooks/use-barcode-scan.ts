// zxing-wasm's types name the global EmscriptenModule from its own dependency @types/emscripten,
// which TypeScript 6 no longer includes by itself (`types` defaults to []).
/// <reference types="emscripten" />
import { useEffect, useEffectEvent } from 'react';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';

/**
 * Reading a barcode from the camera (L-02, P-10, RESEARCH R1 and Pitfall 5): the browser's own
 * `BarcodeDetector` when it reads both formats the item master stores (EAN-13, and Code 128 for a
 * stored non-EAN value, P-04), else the `barcode-detector` ponyfill over zxing-wasm, imported only
 * then (it is the only file that imports it). The ponyfill fetches its `.wasm` from a public CDN
 * by default; `locateFile` points every `.wasm` at `/wasm/` on our own origin instead (a CDN
 * request would leak to a third party and break the CSP, T-4.2-19). erp-web serves the file from
 * `public/wasm/`, the same bytes as the installed zxing-wasm (the test pins the sha-256); through
 * Nginx it needs the `/wasm/` location plan 04.2-10 adds.
 */
export const SCAN_FORMATS = ['ean_13', 'code_128'] as const;
/** Where the decoder's `.wasm` is served: our origin, `public/wasm/`. */
export const WASM_PATH = '/wasm/';

interface ScanDetector {
  detect(source: ImageBitmapSource): Promise<readonly { readonly rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { readonly formats: string[] }): ScanDetector;
  getSupportedFormats(): Promise<readonly string[]>;
}

/** zxing's `locateFile`: any `.wasm` from our origin, anything else where zxing would look. */
export function wasmLocation(path: string, prefix: string): string {
  return path.endsWith('.wasm') ? `${WASM_PATH}${path}` : `${prefix}${path}`;
}

/** The browser's detector when it reads both formats; `undefined` otherwise. */
async function nativeDetector(): Promise<ScanDetector | undefined> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native === undefined) return undefined;
  const supported = await Native.getSupportedFormats();
  return SCAN_FORMATS.every((format) => supported.includes(format))
    ? new Native({ formats: [...SCAN_FORMATS] })
    : undefined;
}

/** A detector for EAN-13 and Code 128: native first, else the lazily loaded, self-hosted ponyfill. */
export async function createBarcodeDetector(): Promise<ScanDetector> {
  const native = await nativeDetector();
  if (native !== undefined) return native;
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({ overrides: { locateFile: wasmLocation } });
  return new BarcodeDetector({ formats: [...SCAN_FORMATS] });
}

/** The first non-empty code in one frame's answer. */
function firstCode(found: readonly { readonly rawValue: string }[]): string | undefined {
  return found.find((barcode) => barcode.rawValue !== '')?.rawValue;
}

/**
 * Reads `video` every `CLIENT_TIMINGS.scanner.frameIntervalMs` while `active`; the first code calls
 * `onCode` once and the reading stops (the dialog then fills the filter and closes).
 */
export function useBarcodeScan(
  video: HTMLVideoElement | null,
  active: boolean,
  onCode: (code: string) => void,
): void {
  const report = useEffectEvent(onCode);
  // effect: subscribe: poll frames until the first code
  useEffect(() => {
    if (!active || video === null) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (detector: ScanDetector): Promise<void> => {
      // A frame the camera has not painted yet reads as nothing; the next one is tried.
      const code = firstCode(await detector.detect(video).catch(() => []));
      if (stopped) return;
      if (code !== undefined) {
        stopped = true;
        report(code);
        return;
      }
      timer = setTimeout(() => {
        void poll(detector);
      }, CLIENT_TIMINGS.scanner.frameIntervalMs);
    };
    createBarcodeDetector().then(
      (detector) => {
        if (!stopped) void poll(detector);
      },
      () => undefined,
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [video, active]);
}
