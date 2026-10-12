// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { CLIENT_TIMINGS } from '@/lib/api/client-timings';
import { useListQueryState } from '@/lib/url/use-query-state';
import { renderWithProviders, screen, userEvent, waitFor } from '../render';

/** A search box on the FE-15 door, as a list screen has one. */
function SearchBox(): ReactElement {
  const [url, actions] = useListQueryState();
  return (
    <input
      aria-label="search"
      value={url.q}
      onChange={(event) => {
        actions.setSearch(event.target.value);
      }}
    />
  );
}

const box = (): HTMLInputElement => screen.getByRole('textbox', { name: 'search' });
/** Past the 300 ms URL debounce and nuqs's flush on the tick after it. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, CLIENT_TIMINGS.list.searchDebounceMs * 2));

describe('renderWithProviders', () => {
  it('hasMemory: the URL remembers its writes, so a screen test can type in a search box (03.2 lead, D-43)', async () => {
    const writes: string[] = [];
    renderWithProviders(<SearchBox />, {
      hasMemory: true,
      onUrlUpdate: ({ queryString }) => writes.push(queryString),
    });
    await userEvent.type(box(), 'jan');
    await settle();
    await waitFor(() => {
      expect(writes).toContain('?q=jan');
    });
    // Without memory the adapter re-reads the unchanged URL after the flush and the box empties.
    expect(box().value).toBe('jan');
  });
});
