// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCameraStream } from '../use-camera-stream';

/**
 * The scanner's camera (L-02, T-4.2-50): asked for only while `active` (the dialog opened by a
 * button), the rear camera without audio, and every track stopped when inactive or unmounted.
 */
function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream };
}

function camera(answer: () => Promise<MediaStream>) {
  const getUserMedia = vi.fn(answer);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  return getUserMedia;
}

describe('useCameraStream', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('inactive: idle, and the camera is never asked for', () => {
    const getUserMedia = camera(() => Promise.resolve(fakeStream().stream));
    const { result } = renderHook(() => useCameraStream(false));
    expect(result.current.status).toBe('idle');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('active: asks for the rear camera without audio, starting then streaming', async () => {
    const { stream } = fakeStream();
    const getUserMedia = camera(() => Promise.resolve(stream));
    const { result } = renderHook(() => useCameraStream(true));
    expect(result.current.status).toBe('starting');
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'streaming', stream });
    });
  });

  it('a refusal (or no camera) is unavailable', async () => {
    camera(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const { result } = renderHook(() => useCameraStream(true));
    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('a browser without mediaDevices (an insecure page) is unavailable', async () => {
    const { result } = renderHook(() => useCameraStream(true));
    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('turning inactive stops every track and reads idle', async () => {
    const { stream, tracks } = fakeStream();
    camera(() => Promise.resolve(stream));
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => useCameraStream(on), {
      initialProps: { on: true },
    });
    await waitFor(() => {
      expect(result.current.status).toBe('streaming');
    });
    rerender({ on: false });
    expect(result.current.status).toBe('idle');
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('unmounting stops every track', async () => {
    const { stream, tracks } = fakeStream();
    camera(() => Promise.resolve(stream));
    const { result, unmount } = renderHook(() => useCameraStream(true));
    await waitFor(() => {
      expect(result.current.status).toBe('streaming');
    });
    unmount();
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('a stream that arrives after the dialog closed is stopped at once', async () => {
    const { stream, tracks } = fakeStream();
    let grant: (value: MediaStream) => void = () => undefined;
    camera(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => useCameraStream(on), {
      initialProps: { on: true },
    });
    rerender({ on: false });
    await act(async () => {
      grant(stream);
      await Promise.resolve();
    });
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });
});
