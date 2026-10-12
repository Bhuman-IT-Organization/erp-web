// @vitest-environment happy-dom
import { useRef, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { useClearOnEscape } from '../use-clear-on-escape';

function Box(): ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  useClearOnEscape(ref, () => {
    setValue('');
  });
  return (
    <input
      ref={ref}
      aria-label="box"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
    />
  );
}

const box = (): HTMLInputElement => screen.getByRole('textbox', { name: 'box' });

/** Stands in for Radix's dismiss: a document listener in the capture phase, which runs before React. */
const dismissed = vi.fn();
const onDocumentKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') dismissed(event.defaultPrevented);
};
beforeEach(() => {
  dismissed.mockClear();
  document.addEventListener('keydown', onDocumentKey, { capture: true });
});
afterEach(() => {
  document.removeEventListener('keydown', onDocumentKey, { capture: true });
});

describe('useClearOnEscape', () => {
  it('Esc in a non-empty box clears it and is claimed before a document capture listener (the Radix dismiss)', async () => {
    renderWithProviders(<Box />);
    await userEvent.type(box(), 'abc');
    await userEvent.keyboard('{Escape}');
    expect(box().value).toBe('');
    expect(dismissed).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('Esc in an empty box is left alone, so the dialog around it may close', async () => {
    renderWithProviders(<Box />);
    await userEvent.click(box());
    await userEvent.keyboard('{Escape}');
    expect(dismissed).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('unmount removes the window listener', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderWithProviders(<Box />);
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
    remove.mockRestore();
  });
});
