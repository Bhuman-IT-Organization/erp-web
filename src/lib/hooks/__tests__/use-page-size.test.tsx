// @vitest-environment happy-dom
import type { OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/auth/use-permissions';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { usePageSize } from '../use-page-size';

/**
 * D-20 / UI-SPEC choice 23: the page size is remembered per user in the browser, for every list,
 * and a `?limit=` in the URL wins so a shared link reproduces the view. `localStorage` is
 * user-editable, so what comes back is validated against 25/50/100 (T-3.2-51).
 */
let me: Pick<Me, 'staffId'> | undefined;
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({ me }),
}));

function Probe() {
  const [size, setSize] = usePageSize();
  return (
    <>
      <output data-testid="size">{size}</output>
      <button
        type="button"
        onClick={() => {
          setSize(100);
        }}
      >
        set 100
      </button>
    </>
  );
}

const shown = () => screen.getByTestId('size').textContent;

beforeEach(() => {
  localStorage.clear();
  me = { staffId: 12 };
});
afterEach(() => {
  localStorage.clear();
});

describe('usePageSize (D-20, T-3.2-51)', () => {
  it('a URL ?limit=50 wins over the stored size', () => {
    localStorage.setItem('erp.list.pageSize.12', '100');
    renderWithProviders(<Probe />, { searchParams: '?limit=50' });
    expect(shown()).toBe('50');
  });

  it('no URL limit: the size stored for this user (staff 12) → 100', () => {
    localStorage.setItem('erp.list.pageSize.12', '100');
    renderWithProviders(<Probe />);
    expect(shown()).toBe('100');
  });

  it.each([['37'], ['abc'], ['1e2'], [''], ['-25']])(
    'a stored %j is not a page size → 25 (never trusted)',
    (stored) => {
      localStorage.setItem('erp.list.pageSize.12', stored);
      renderWithProviders(<Probe />);
      expect(shown()).toBe('25');
    },
  );

  it("another user's stored size is not read", () => {
    localStorage.setItem('erp.list.pageSize.13', '100');
    renderWithProviders(<Probe />);
    expect(shown()).toBe('25');
  });

  it('while /me is unknown there is no key: 25', () => {
    me = undefined;
    localStorage.setItem('erp.list.pageSize.12', '100');
    renderWithProviders(<Probe />);
    expect(shown()).toBe('25');
  });

  it('setting 100 writes erp.list.pageSize.12 and pushes limit=100 with the cursor cleared', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderWithProviders(<Probe />, { searchParams: '?cursor=abc&sort=-email', onUrlUpdate });
    await userEvent.click(screen.getByRole('button', { name: 'set 100' }));
    expect(localStorage.getItem('erp.list.pageSize.12')).toBe('100');
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledTimes(1);
    });
    const update = onUrlUpdate.mock.lastCall?.[0];
    expect(update?.options.history).toBe('push');
    expect(update?.searchParams.get('limit')).toBe('100');
    expect(update?.searchParams.has('cursor')).toBe(false);
    expect(update?.searchParams.get('sort')).toBe('-email');
  });
});
