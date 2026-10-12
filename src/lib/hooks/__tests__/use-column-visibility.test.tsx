// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/auth/use-permissions';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { useColumnVisibility } from '../use-column-visibility';

/**
 * K4 (UI-SPEC § Item list, Columns): a list's hidden columns are remembered per user in
 * `localStorage` (`erp.list.columns.<storageKey>.<staffId>`), never in the URL. The stored value is
 * user-editable, so only an array of strings is read, and a fixed column is never hidden.
 */
let me: Pick<Me, 'staffId'> | undefined;
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({ me }),
}));

const FIXED = ['code', 'name'] as const;
const DEFAULT_HIDDEN = ['tags', 'tax'] as const;

function Probe() {
  const { hidden, setHidden, reset } = useColumnVisibility('items', {
    fixed: FIXED,
    defaultHidden: DEFAULT_HIDDEN,
  });
  return (
    <>
      <output data-testid="hidden">{[...hidden].sort().join(',')}</output>
      <button
        type="button"
        onClick={() => {
          setHidden('sku', true);
        }}
      >
        hide sku
      </button>
      <button
        type="button"
        onClick={() => {
          setHidden('tags', false);
        }}
      >
        show tags
      </button>
      <button
        type="button"
        onClick={() => {
          setHidden('code', true);
        }}
      >
        hide code
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
    </>
  );
}

const shown = () => screen.getByTestId('hidden').textContent;
const KEY = 'erp.list.columns.items.12';

beforeEach(() => {
  localStorage.clear();
  me = { staffId: 12 };
});
afterEach(() => {
  localStorage.clear();
});

describe('useColumnVisibility (K4)', () => {
  it('nothing stored: the default hidden columns', () => {
    renderWithProviders(<Probe />);
    expect(shown()).toBe('tags,tax');
  });

  it('hiding a column persists the hidden ids under erp.list.columns.items.<staffId> and re-renders', async () => {
    renderWithProviders(<Probe />);
    await userEvent.click(screen.getByRole('button', { name: 'hide sku' }));
    expect(shown()).toBe('sku,tags,tax');
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(
      expect.arrayContaining(['sku', 'tags', 'tax']),
    );
  });

  it('showing a default-hidden column removes it from the stored list', async () => {
    renderWithProviders(<Probe />);
    await userEvent.click(screen.getByRole('button', { name: 'show tags' }));
    expect(shown()).toBe('tax');
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(['tax']);
  });

  it('a fixed column cannot be hidden, by the setter or by an edited stored value', async () => {
    localStorage.setItem(KEY, JSON.stringify(['name', 'sku']));
    renderWithProviders(<Probe />);
    expect(shown()).toBe('sku');
    await userEvent.click(screen.getByRole('button', { name: 'hide code' }));
    expect(shown()).toBe('sku');
  });

  it('reset() restores the defaults and forgets the stored choice', async () => {
    localStorage.setItem(KEY, JSON.stringify(['sku']));
    renderWithProviders(<Probe />);
    expect(shown()).toBe('sku');
    await userEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(shown()).toBe('tags,tax');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("another staff member's entry is not read", () => {
    localStorage.setItem('erp.list.columns.items.13', JSON.stringify(['sku']));
    renderWithProviders(<Probe />);
    expect(shown()).toBe('tags,tax');
  });

  it.each([['not json'], ['{"a":1}'], ['[1,2]'], ['"sku"']])(
    'a stored %j that is not an array of ids reads as the defaults (never trusted)',
    (stored) => {
      localStorage.setItem(KEY, stored);
      renderWithProviders(<Probe />);
      expect(shown()).toBe('tags,tax');
    },
  );

  it('while /me is unknown there is no key: the defaults', () => {
    me = undefined;
    localStorage.setItem(KEY, JSON.stringify(['sku']));
    renderWithProviders(<Probe />);
    expect(shown()).toBe('tags,tax');
  });
});
