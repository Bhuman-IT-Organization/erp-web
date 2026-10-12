// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { physicalClassesIn, renderWithProviders, screen, waitFor } from '@/test/render';
import { ProtectedImage } from '../ProtectedImage';

/** M7: an image only the api may serve, read with the bearer and shown by object URL. */
const PATH = '/api/v1/files/7/thumbnail';
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

let fake: FakeAdapter | undefined;
function renderImage(path: typeof PATH | null, adapter: FakeAdapter, locale: 'en' | 'ar' = 'en') {
  fake = adapter;
  http.defaults.adapter = adapter.adapter;
  return renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <ProtectedImage path={path} alt="Sample photo" className="size-24" />
    </SWRConfig>,
    { locale },
  );
}

/** An answer that never comes: the bytes are still on their way. */
const pending = (): FakeAdapter => {
  const spy = vi.fn((): Promise<never> => new Promise<never>(() => undefined));
  return { adapter: spy, spy, calls: [] };
};

describe('ProtectedImage (M7)', () => {
  beforeEach(() => {
    setSession({ accessToken: 'tok', csrfToken: 'csrf' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete http.defaults.adapter;
    fake = undefined;
    clearSession();
    vi.restoreAllMocks();
  });

  it('Loading: a skeleton of the image size while the bytes are on their way, and no image', () => {
    renderImage(PATH, pending());
    const skeleton = screen.getByTestId('protected-image-loading');
    expect(skeleton.className.split(' ')).toContain('size-24');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('Loaded: an image element whose src is the object URL, never the api path, read with the bearer', async () => {
    renderImage(PATH, fakeAdapter(200, png()));
    const img = await screen.findByRole('img', { name: 'Sample photo' });
    expect(img.getAttribute('src')).toBe('blob:test/1');
    expect(img.getAttribute('src')).not.toContain('/api/');
    expect(img.className.split(' ')).toEqual(expect.arrayContaining(['size-24', 'object-cover']));
    expect(fake?.calls[0]?.headers.authorization).toBe('Bearer tok');
  });

  it('Missing: a null path is the image glyph placeholder and asks nothing', () => {
    renderImage(null, fakeAdapter(200, png()));
    const placeholder = screen.getByTestId('protected-image-placeholder');
    expect(placeholder.querySelector('[data-icon-name="image"]')).not.toBeNull();
    expect(fake?.calls).toEqual([]);
  });

  it('a failed read is the same placeholder, never an error message', async () => {
    renderImage(PATH, fakeAdapter(404, new Blob([JSON.stringify(problem(404, 'ERP-CORE-0004'))])));
    await waitFor(() => {
      expect(screen.getByTestId('protected-image-placeholder')).toBeTruthy();
    });
    expect(document.body.textContent).not.toContain(commonEn.common.errors.unknown);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Rtl: no physical-direction class under ar', async () => {
    const { container } = renderImage(PATH, fakeAdapter(200, png()), 'ar');
    await screen.findByRole('img');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
