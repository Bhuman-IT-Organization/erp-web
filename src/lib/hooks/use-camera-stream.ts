import { useEffect, useState } from 'react';

/**
 * The item list's camera scanner (L-02, UI-SPEC § Item list "Camera scanner"): the rear camera, no
 * audio, asked for only while `active`, which the scanner dialog sets when the member presses "Scan
 * Barcode" (camera access follows an explicit action, never a page load). `starting` until the
 * browser answers, then `streaming` or `unavailable` (refused, no camera, or a page the browser will
 * not give a camera to); the dialog shows a skeleton, the preview or its "We can't use the camera"
 * alert. Every track is stopped when the dialog closes or unmounts, including a stream that arrives
 * after it closed (T-4.2-50).
 */
export type CameraState =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'streaming'; readonly stream: MediaStream }
  | { readonly status: 'unavailable' };

const CONSTRAINTS: MediaStreamConstraints = Object.freeze({
  video: { facingMode: 'environment' },
  audio: false,
});
const IDLE: CameraState = { status: 'idle' };
const STARTING: CameraState = { status: 'starting' };
const UNAVAILABLE: CameraState = { status: 'unavailable' };

function stopAll(stream: MediaStream | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** The browser's answer, or a refusal where it has no camera API (an insecure page, an old browser). */
function askForCamera(): Promise<MediaStream> {
  const devices = (navigator as Partial<Navigator>).mediaDevices;
  return devices === undefined || typeof devices.getUserMedia !== 'function'
    ? Promise.reject(new Error('no camera API'))
    : devices.getUserMedia(CONSTRAINTS);
}

/** The camera while `active`; `idle` otherwise. */
export function useCameraStream(active: boolean): CameraState {
  const [answer, setAnswer] = useState<CameraState>(STARTING);
  // effect: subscribe: the camera stream, stopped when inactive or unmounted
  useEffect(() => {
    if (!active) return undefined;
    let closed = false;
    let stream: MediaStream | undefined;
    askForCamera().then(
      (granted) => {
        if (closed) {
          stopAll(granted);
          return;
        }
        stream = granted;
        setAnswer({ status: 'streaming', stream: granted });
      },
      () => {
        if (!closed) setAnswer(UNAVAILABLE);
      },
    );
    return () => {
      closed = true;
      stopAll(stream);
      setAnswer(STARTING);
    };
  }, [active]);
  return active ? answer : IDLE;
}
