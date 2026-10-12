// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettledValue } from '../use-settled-value';

/**
 * D-19: a list's search goes to the api 300 ms after the last keystroke. nuqs debounces only the
 * URL write — the `q` its hook returns changes on every keystroke (plan 13) — so the
 * list keys its request on the SETTLED value instead.
 */
const MS = 300;

function Probe({ initial }: { readonly initial: string }) {
  const [value, setValue] = useState(initial);
  const [settled, settle] = useSettledValue(value, MS);
  return (
    <>
      <input
        aria-label="value"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <button
        type="button"
        onClick={() => {
          settle(value);
        }}
      >
        settle
      </button>
      <button
        type="button"
        onClick={() => {
          setValue('');
          settle('');
        }}
      >
        clear
      </button>
      <output data-testid="settled">{settled}</output>
    </>
  );
}

const shown = () => screen.getByTestId('settled').textContent;
const type = (value: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'value' }), { target: { value } });
};
const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSettledValue (D-19: search reaches the api once the typing stops)', () => {
  it('starts settled on the first value: the first request never waits', () => {
    render(<Probe initial="jan" />);
    expect(shown()).toBe('jan');
  });

  it('follows a change only after it has stayed unchanged for the full delay', () => {
    render(<Probe initial="" />);
    type('j');
    wait(MS - 1);
    type('ja');
    wait(MS - 1);
    type('jan');
    wait(MS - 1);
    expect(shown()).toBe('');
    wait(1);
    expect(shown()).toBe('jan');
  });

  it('settle(next) adopts a value at once (Enter, Clear search), and no stale timer overrides it', () => {
    render(<Probe initial="" />);
    type('jan');
    fireEvent.click(screen.getByRole('button', { name: 'settle' }));
    expect(shown()).toBe('jan');
    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(shown()).toBe('');
    wait(MS * 2);
    expect(shown()).toBe('');
  });

  it('unmount clears the pending timer', () => {
    const { unmount } = render(<Probe initial="" />);
    type('jan');
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
