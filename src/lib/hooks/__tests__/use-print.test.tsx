// @vitest-environment happy-dom
import { configure } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { usePrint } from '../use-print';

function Probe({
  active,
  onDone,
  print,
}: {
  readonly active: boolean;
  readonly onDone: () => void;
  readonly print: () => void;
}): ReactElement | null {
  usePrint(active, onDone, print);
  return null;
}

const afterPrint = (): void => {
  window.dispatchEvent(new Event('afterprint'));
};

afterEach(() => {
  configure({ reactStrictMode: false });
});

describe('usePrint (the one print effect, D-08)', () => {
  it('active: prints once after mount, and afterprint calls onDone', () => {
    const print = vi.fn();
    const onDone = vi.fn();
    renderWithProviders(<Probe active onDone={onDone} print={print} />);
    expect(print).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    afterPrint();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('under StrictMode (the double effect) it still prints once', () => {
    configure({ reactStrictMode: true });
    const print = vi.fn();
    const onDone = vi.fn();
    renderWithProviders(<Probe active onDone={onDone} print={print} />);
    expect(print).toHaveBeenCalledTimes(1);
    afterPrint();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('the afterprint listener is removed on unmount', () => {
    const onDone = vi.fn();
    const { unmount } = renderWithProviders(<Probe active onDone={onDone} print={vi.fn()} />);
    unmount();
    afterPrint();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('inactive never prints and never listens', () => {
    const print = vi.fn();
    const onDone = vi.fn();
    renderWithProviders(<Probe active={false} onDone={onDone} print={print} />);
    afterPrint();
    expect(print).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('the print seam defaults to window.print (a spy stands in, never the real dialog)', () => {
    // happy-dom has no window.print; a spy is installed for this one test and removed after it.
    const spy = vi.fn();
    Object.defineProperty(window, 'print', { value: spy, configurable: true, writable: true });
    function DefaultProbe(): null {
      usePrint(true, () => undefined);
      return null;
    }
    try {
      renderWithProviders(<DefaultProbe />);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(window, 'print');
    }
  });
});
