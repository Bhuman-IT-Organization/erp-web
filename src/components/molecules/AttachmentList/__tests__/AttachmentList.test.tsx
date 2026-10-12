// @vitest-environment happy-dom
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import commonEn from '@/messages/common/en.json';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import {
  physicalClassesIn,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from '@/test/render';
import { AttachmentList, type AttachmentEntry, type AttachmentListProps } from '../AttachmentList';

/** K8's tiles (UI-SPEC § Item page section 3; P-12), over synthetic entries. */
const COMMON = commonEn.common;
const fill = (text: string, values: Readonly<Record<string, string>>) =>
  Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, v), text);

const entry = (over: Partial<AttachmentEntry> & Pick<AttachmentEntry, 'key' | 'state'>) => ({
  name: 'photo.png',
  size: 1536,
  isImage: false,
  ...over,
});
const reasonText = (code: string) =>
  code === 'ERP-FILES-0001' ? COMMON.file_type_not_allowed : COMMON.file_too_large;

function renderList(
  entries: readonly AttachmentEntry[],
  props: Partial<AttachmentListProps> = {},
  locale: 'en' | 'ar' = 'en',
) {
  const handlers = {
    onDownload: vi.fn(),
    onRemove: vi.fn(),
    onUndo: vi.fn(),
    onCancel: vi.fn(),
    onResume: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = renderWithProviders(
    <AttachmentList entries={entries} reasonText={reasonText} {...handlers} {...props} />,
    { locale },
  );
  return { ...handlers, ...view };
}

const tile = (key: string) => screen.getByTestId(`attachment-${key}`);
const button = (name: string) => screen.getByRole('button', { name });

describe('AttachmentList (K8)', () => {
  it('a wrapping grid of 128px columns, 8px apart', () => {
    renderList([entry({ key: 'a', state: 'stored' })]);
    expect(screen.getByRole('list').className.split(' ')).toEqual(
      expect.arrayContaining(['grid', 'grid-cols-[repeat(auto-fill,8rem)]', 'gap-2']),
    );
  });

  it('Stored: an image with a preview has its 96px frame as "Enlarge photo of {name}"; a file shows the paperclip', () => {
    renderList([
      entry({
        key: 'img',
        state: 'stored',
        isImage: true,
        thumbnail: <span data-testid="thumb" />,
        preview: <span data-testid="large" />,
      }),
      entry({ key: 'doc', name: 'manual.pdf', state: 'stored' }),
    ]);
    const frame = within(tile('img')).getByRole('button', {
      name: fill(COMMON.enlarge_photo, { name: 'photo.png' }),
    });
    expect(within(frame).getByTestId('thumb')).toBeTruthy();
    expect(frame.className.split(' ')).toEqual(expect.arrayContaining(['size-24']));
    expect(tile('doc').querySelector('[data-icon-name="paperclip"]')).not.toBeNull();
    expect(within(tile('doc')).queryByRole('button', { name: /^Enlarge/ })).toBeNull();
  });

  it('Unreadable: an image whose bytes the api cannot serve is a download-only file tile, no preview', async () => {
    setSession({ accessToken: 'tok', csrfToken: 'csrf' });
    http.defaults.adapter = fakeAdapter(
      404,
      new Blob([JSON.stringify(problem(404, 'ERP-CORE-0004'))]),
    ).adapter;
    try {
      renderWithProviders(
        <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
          <AttachmentList
            entries={[
              entry({
                key: 'gone',
                state: 'stored',
                isImage: true,
                imagePath: '/api/v1/files/7/content',
                thumbnail: <span data-testid="thumb" />,
                preview: <span data-testid="large" />,
              }),
            ]}
            reasonText={reasonText}
            onDownload={vi.fn()}
            readOnly
          />
        </SWRConfig>,
      );
      await waitFor(() => {
        expect(tile('gone').querySelector('[data-icon-name="paperclip"]')).not.toBeNull();
      });
      expect(within(tile('gone')).queryByRole('button', { name: /^Enlarge/ })).toBeNull();
      expect(within(tile('gone')).queryByTestId('thumb')).toBeNull();
      expect(
        within(tile('gone')).getByRole('button', {
          name: fill(COMMON.download_file, { file: 'photo.png' }),
        }),
      ).toBeTruthy();
    } finally {
      delete http.defaults.adapter;
      clearSession();
    }
  });

  it('Preview: the frame opens a dialog titled with the name, holding the preview and "Close preview"; Esc closes it and focus returns to the frame', async () => {
    const name = '<b>front</b> & back.png';
    const { onDownload } = renderList([
      entry({
        key: 'img',
        name,
        state: 'stored',
        isImage: true,
        thumbnail: <span data-testid="thumb" />,
        preview: <span data-testid="large" />,
      }),
    ]);
    const frame = button(fill(COMMON.enlarge_photo, { name }));
    await userEvent.click(frame);
    const dialog = await screen.findByRole('dialog', { name });
    expect(dialog.querySelector('bdi')?.textContent).toBe(name);
    expect(dialog.querySelector('b')).toBeNull();
    expect(within(dialog).getByTestId('large')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: COMMON.close_preview })).toBeTruthy();
    expect(onDownload).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(frame);
    await userEvent.click(frame);
    await userEvent.click(await screen.findByRole('button', { name: COMMON.close_preview }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('a thumbnail without a preview is not a button; a read-only list keeps the preview', () => {
    renderList(
      [
        entry({ key: 'a', state: 'stored', isImage: true, thumbnail: <span data-testid="a" /> }),
        entry({
          key: 'b',
          name: 'back.png',
          state: 'will-be-removed',
          isImage: true,
          thumbnail: <span data-testid="b" />,
          preview: <span />,
        }),
      ],
      { readOnly: true },
    );
    expect(within(tile('a')).queryByRole('button', { name: /^Enlarge/ })).toBeNull();
    expect(within(tile('a')).getByTestId('a')).toBeTruthy();
    expect(button(fill(COMMON.enlarge_photo, { name: 'back.png' }))).toBeTruthy();
  });

  it('the handlers are the six tile actions: the preview dialog is the kit own, with no callback', () => {
    // A preview callback prop would be a missing key here, so typecheck fails (UAT test 23).
    const handlers: Record<
      Exclude<keyof AttachmentListProps, 'entries' | 'reasonText' | 'readOnly'>,
      true
    > = {
      onDownload: true,
      onRemove: true,
      onUndo: true,
      onCancel: true,
      onResume: true,
      onRetry: true,
    };
    expect(Object.keys(handlers)).toHaveLength(6);
  });

  it('the name is one line with the full name in title, in <bdi>; the size reads in KB or MB', () => {
    renderList([
      entry({ key: 'a', state: 'stored', name: 'a-very-long-file-name.pdf', size: 1536 }),
      entry({ key: 'b', state: 'stored', name: 'big.pdf', size: 2.5 * 1_048_576 }),
    ]);
    const name = within(tile('a')).getByTitle('a-very-long-file-name.pdf');
    expect(name.className.split(' ')).toContain('truncate');
    expect(name.querySelector('bdi')?.textContent).toBe('a-very-long-file-name.pdf');
    expect(tile('a').textContent).toContain('2 KB');
    expect(tile('b').textContent).toContain('2.5 MB');
  });

  it('a stored file has "Download {file}" and "Remove {file}" icon buttons', async () => {
    const { onDownload, onRemove } = renderList([entry({ key: 'a', state: 'stored' })]);
    await userEvent.click(button(fill(COMMON.download_file, { file: 'photo.png' })));
    await userEvent.click(button(fill(COMMON.remove_file, { file: 'photo.png' })));
    expect(onDownload).toHaveBeenCalledWith('a');
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('will-be-removed reads "Will be removed" with "Undo"', async () => {
    const { onUndo } = renderList([entry({ key: 'a', state: 'will-be-removed' })]);
    expect(tile('a').textContent).toContain(COMMON.file_will_be_removed);
    await userEvent.click(within(tile('a')).getByRole('button', { name: COMMON.undo }));
    expect(onUndo).toHaveBeenCalledWith('a');
  });

  it('new reads "New" and can be removed', async () => {
    const { onRemove } = renderList([entry({ key: 'a', state: 'new' })]);
    expect(tile('a').textContent).toContain(COMMON.file_new);
    await userEvent.click(button(fill(COMMON.remove_file, { file: 'photo.png' })));
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('Uploading: "Uploading {file}… 40%" in a polite live line, and "Cancel upload" named for the file', async () => {
    const { onCancel } = renderList([entry({ key: 'a', state: 'uploading', percent: 40 })]);
    const line = within(tile('a')).getByText(
      fill(COMMON.uploading_file, { file: 'photo.png', percent: '40' }),
    );
    expect(line.getAttribute('aria-live')).toBe('polite');
    const cancel = button(fill(COMMON.cancel_upload_named, { file: 'photo.png' }));
    expect(cancel.textContent).toContain(COMMON.cancel_upload);
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledWith('a');
  });

  it('UploadPaused: "Paused, connection lost" and "Resume upload" named for the file', async () => {
    const { onResume } = renderList([entry({ key: 'a', state: 'paused', percent: 40 })]);
    expect(tile('a').textContent).toContain(COMMON.upload_paused);
    const resume = button(fill(COMMON.resume_upload_named, { file: 'photo.png' }));
    expect(resume.textContent).toContain(COMMON.resume_upload);
    await userEvent.click(resume);
    expect(onResume).toHaveBeenCalledWith('a');
  });

  it('UploadResumed: "Resuming from 40%" until new bytes arrive', () => {
    renderList([entry({ key: 'a', state: 'resuming', percent: 40, resumedFrom: 40 })]);
    expect(tile('a').textContent).toContain(fill(COMMON.resuming_from, { percent: '40' }));
  });

  it('UploadCancelled: back to "New" with no percent', () => {
    renderList([entry({ key: 'a', state: 'new', percent: 0 })]);
    expect(tile('a').textContent).toContain(COMMON.file_new);
    expect(tile('a').textContent).not.toContain('%');
  });

  it('UploadRejected: "{file} wasn\'t attached: {reason}" with only "Remove {file}" left', () => {
    renderList([entry({ key: 'a', state: 'rejected', name: 'x.exe', code: 'ERP-FILES-0001' })]);
    expect(tile('a').textContent).toContain(
      fill(COMMON.upload_check_failed, { file: 'x.exe', reason: COMMON.file_type_not_allowed }),
    );
    expect(
      within(tile('a'))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([fill(COMMON.remove_file, { file: 'x.exe' })]);
  });

  it('UploadFailed: "We couldn\'t upload {file}." with a Retry icon button named for the file', async () => {
    const { onRetry } = renderList([
      entry({ key: 'a', state: 'failed', code: 'ERP-NETWORK-0001' }),
    ]);
    expect(tile('a').textContent).toContain(fill(COMMON.upload_failed, { file: 'photo.png' }));
    const retry = button(fill(COMMON.retry_upload, { file: 'photo.png' }));
    expect(retry.querySelector('[data-icon-name="rotate-right"]')).not.toBeNull();
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalledWith('a');
  });

  it('ReadOnly: downloads stay; no remove, undo or cancel', () => {
    renderList(
      [
        entry({ key: 'a', state: 'stored' }),
        entry({ key: 'b', state: 'uploading', percent: 10 }),
        entry({ key: 'c', state: 'will-be-removed' }),
      ],
      { readOnly: true },
    );
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      fill(COMMON.download_file, { file: 'photo.png' }),
    ]);
  });

  it('Mobile: each tile is one 128px column', () => {
    renderList([entry({ key: 'a', state: 'stored' })]);
    expect(tile('a').className.split(' ')).toContain('w-32');
  });

  it('Rtl: no physical-direction class under ar, every state shown', () => {
    const states = [
      'stored',
      'will-be-removed',
      'new',
      'uploading',
      'paused',
      'resuming',
      'rejected',
      'failed',
    ] as const;
    const { container } = renderList(
      states.map((state, i) =>
        entry({ key: String(i), state, percent: 40, code: 'ERP-FILES-0001' }),
      ),
      {},
      'ar',
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
