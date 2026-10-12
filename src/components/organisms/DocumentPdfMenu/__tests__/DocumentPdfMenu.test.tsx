// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, fetchBlob } from '@/lib/api/download-file';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { DocumentPdfMenu } from '../DocumentPdfMenu';

vi.mock('@/lib/api/download-file', () => ({ fetchBlob: vi.fn(), downloadFile: vi.fn() }));

/**
 * K21 (04.6 UI-SPEC § Kit additions): the PDF is read as a Blob through the one axios door (M7) and
 * opened by object URL only (T-4.6-30); the reads are mocked.
 */
const COMMON = commonEn.common;
const PATH = '/api/v1/demo/documents/7/pdf';
const PDF = new Blob(['%PDF'], { type: 'application/pdf' });

let made: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  made = [];
  revoked.length = 0;
  vi.mocked(fetchBlob).mockReset().mockResolvedValue({ ok: true, status: 200, data: PDF });
  vi.mocked(downloadFile)
    .mockReset()
    .mockResolvedValue({ ok: true, status: 200, data: { filename: 'GR-0007.pdf' } });
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${String(made.length + 1)}`;
    made.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const frame of document.querySelectorAll('iframe')) frame.remove();
});

async function choose(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: COMMON.pdf }));
  const menu = await screen.findByRole('menu');
  await userEvent.click(within(menu).getByRole('menuitem', { name }));
}

const show = (onError = vi.fn(), locale: 'en' | 'ar' = 'en') => ({
  onError,
  ...renderWithProviders(<DocumentPdfMenu path={PATH} fileName="GR-0007.pdf" onError={onError} />, {
    locale,
  }),
});

describe('DocumentPdfMenu', () => {
  it('Open: an outline PDF button opening View PDF, View PDF in New Tab, Download and Print, in order', async () => {
    show();
    const button = screen.getByRole('button', { name: COMMON.pdf });
    expect(button.getAttribute('data-variant')).toBe('outline');
    expect(button.querySelector('[data-icon-name="file-lines"]')).not.toBeNull();
    expect(button.querySelector('[data-icon-name="chevron-down"]')).not.toBeNull();
    await userEvent.click(button);
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([COMMON.view_pdf, COMMON.view_pdf_in_new_window, COMMON.download, COMMON.print]);
  });

  it('Download calls downloadFile with the path and pdf', async () => {
    show();
    await choose(COMMON.download);
    expect(downloadFile).toHaveBeenCalledWith(PATH, {}, undefined, 'pdf');
    expect(fetchBlob).not.toHaveBeenCalled();
  });

  it('View PDF reads the Blob and opens its object URL in this tab', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
    show();
    await choose(COMMON.view_pdf);
    expect(fetchBlob).toHaveBeenCalledWith(PATH);
    expect(assign).toHaveBeenCalledWith('blob:test/1');
  });

  it('View PDF in New Tab opens the object URL in a new tab with the opener cleared', async () => {
    const tab = { opener: window } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(tab);
    show();
    await choose(COMMON.view_pdf_in_new_window);
    expect(open).toHaveBeenCalledWith('blob:test/1', '_blank');
    expect(tab.opener).toBeNull();
  });

  it('Print appends one hidden iframe on the object URL; a second Print replaces it', async () => {
    show();
    await choose(COMMON.print);
    let frames = document.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.getAttribute('src')).toBe('blob:test/1');
    expect(frames[0]?.getAttribute('title')).toBe('GR-0007.pdf');
    expect(frames[0]?.className).toContain('sr-only');
    await choose(COMMON.print);
    frames = document.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
  });

  it('a failed read calls onError(code) and opens nothing', async () => {
    vi.mocked(fetchBlob).mockResolvedValue({
      ok: false,
      status: 403,
      code: 'ERP-AUTH-0005',
      retryAfterS: null,
    });
    const open = vi.spyOn(window, 'open');
    const { onError } = show();
    await choose(COMMON.view_pdf_in_new_window);
    expect(onError).toHaveBeenCalledWith('ERP-AUTH-0005');
    expect(open).not.toHaveBeenCalled();
    expect(made).toHaveLength(0);
    await choose(COMMON.print);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('a failed download calls onError(code)', async () => {
    vi.mocked(downloadFile).mockResolvedValue({
      ok: false,
      status: 404,
      code: 'ERP-CORE-0004',
      retryAfterS: null,
    });
    const { onError } = show();
    await choose(COMMON.download);
    expect(onError).toHaveBeenCalledWith('ERP-CORE-0004');
  });

  it('the button shows its pending state while a read runs', async () => {
    let finish: (value: Awaited<ReturnType<typeof fetchBlob>>) => void = () => undefined;
    vi.mocked(fetchBlob).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.spyOn(window, 'open').mockReturnValue(null);
    show();
    await choose(COMMON.view_pdf_in_new_window);
    const button = screen.getByRole('button', { name: COMMON.loading });
    expect(button).toHaveProperty('disabled', true);
    finish({ ok: true, status: 200, data: PDF });
    expect(await screen.findByRole('button', { name: COMMON.pdf })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('unmount revokes every object URL it made and removes its print frame', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { unmount } = show();
    await choose(COMMON.view_pdf_in_new_window);
    await choose(COMMON.print);
    expect(made).toHaveLength(2);
    unmount();
    expect([...revoked].sort()).toEqual([...made].sort());
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('Rtl: the menu is offered under ar too, with no physical-direction class', () => {
    const { container } = show(vi.fn(), 'ar');
    expect(screen.getByRole('button', { name: COMMON.pdf })).toBeTruthy();
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
