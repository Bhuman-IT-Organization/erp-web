// @vitest-environment happy-dom
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UploadRules } from '@/lib/api/use-upload-rules';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { FileDropzone, type FileDropzoneProps } from '../FileDropzone';

/** K8's dropzone (UI-SPEC § Attachments, § Imports; P-11), with synthetic files only. */
const COMMON = commonEn.common;
const MIB = 1_048_576;
const RULES: UploadRules = {
  purpose: 'demo.attachment',
  maxBytes: 64 * MIB,
  maxFiles: 10,
  extensions: ['png', 'pdf'],
};

/** A file of `size` bytes without allocating them: the size is what the check reads. */
function file(name: string, size = 4): File {
  const made = new File([new Uint8Array(4)], name);
  Object.defineProperty(made, 'size', { value: size });
  return made;
}

function renderZone(props: Partial<FileDropzoneProps> = {}, locale: 'en' | 'ar' = 'en') {
  const onPick = vi.fn();
  const view = renderWithProviders(
    <FileDropzone id="attachments" rules={RULES} queuedCount={0} onPick={onPick} {...props} />,
    { locale },
  );
  return { onPick, ...view };
}

const zone = () => screen.getByTestId('dropzone');
const input = () => screen.getByTestId<HTMLInputElement>('dropzone-input');
const drop = (files: readonly File[]) => {
  fireEvent.drop(zone(), { dataTransfer: { files, types: ['Files'] } });
};
const rejected = (name: string, reason: string) =>
  COMMON.file_rejected.replace('{file}', name).replace('{reason}', reason);

describe('FileDropzone (K8)', () => {
  it('Idle: the drop line, the "Choose files" button and the caption from the rules; the zone itself is not focusable', () => {
    renderZone();
    expect(zone().textContent).toContain(COMMON.drop_files_here_to_upload);
    expect(screen.getByRole('button', { name: COMMON.choose_files })).toBeTruthy();
    expect(zone().hasAttribute('tabindex')).toBe(false);
    expect(
      screen.getByText('Up to 10 files per save, 64 MB each. Allowed: png, pdf.'),
    ).toBeTruthy();
    expect(zone().className.split(' ')).toEqual(
      expect.arrayContaining(['min-h-32', 'border-dashed', 'rounded-md', 'p-6']),
    );
    expect(zone().querySelector('[data-icon-name="upload"]')).not.toBeNull();
  });

  it('the button is the keyboard path: it opens the native multiple input built from the extensions', async () => {
    renderZone();
    expect(input().type).toBe('file');
    expect(input().multiple).toBe(true);
    expect(input().accept).toBe('.png,.pdf');
    const click = vi.spyOn(input(), 'click');
    screen.getByRole('button', { name: COMMON.choose_files }).focus();
    await userEvent.keyboard('{Enter}');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('accepted picks reach onPick, from the input and from a drop', () => {
    const { onPick } = renderZone();
    const a = file('photo.png');
    fireEvent.change(input(), { target: { files: [a] } });
    expect(onPick).toHaveBeenLastCalledWith([a]);
    const b = file('manual.pdf');
    drop([b]);
    expect(onPick).toHaveBeenLastCalledWith([b]);
  });

  it('DragOver: dragging files over the zone fills it muted/50; leaving or dropping clears it', () => {
    renderZone();
    fireEvent.dragEnter(zone(), { dataTransfer: { types: ['Files'] } });
    expect(zone().dataset.dragging).toBe('true');
    expect(zone().className.split(' ')).toContain('bg-muted/50');
    fireEvent.dragLeave(zone(), { relatedTarget: document.body });
    expect(zone().dataset.dragging).toBe('false');
    fireEvent.dragEnter(zone(), { dataTransfer: { types: ['Files'] } });
    drop([file('photo.png')]);
    expect(zone().dataset.dragging).toBe('false');
  });

  it('UploadRejected: a dropped x.exe is refused with role=alert and never reaches onPick', () => {
    const { onPick } = renderZone();
    drop([file('x.exe')]);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(rejected('x.exe', COMMON.file_type_not_allowed));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a file above maxBytes reads "This file is larger than 64 MB."; the rest of the pick still goes through', () => {
    const { onPick } = renderZone();
    const ok = file('small.png', 10);
    drop([file('huge.pdf', 64 * MIB + 1), ok]);
    expect(screen.getByRole('alert').textContent).toBe(
      rejected('huge.pdf', COMMON.file_too_large.replace('{size}', '64 MB')),
    );
    expect(onPick).toHaveBeenCalledWith([ok]);
  });

  it('picking more than maxFiles minus the queued files refuses the extra ones', () => {
    const { onPick } = renderZone({ queuedCount: 9 });
    const first = file('a.png');
    drop([first, file('b.png')]);
    expect(screen.getByRole('alert').textContent).toBe(
      rejected('b.png', 'You can attach up to 10 files at a time.'),
    );
    expect(onPick).toHaveBeenCalledWith([first]);
  });

  it('a later accepted pick clears the earlier refusals', () => {
    renderZone();
    drop([file('x.exe')]);
    drop([file('photo.png')]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Loading: no rules yet is a 128px skeleton block and no caption', () => {
    renderZone({ rules: undefined });
    const skeleton = screen.getByTestId('dropzone-loading');
    expect(skeleton.className.split(' ')).toContain('min-h-32');
    expect(screen.queryByTestId('dropzone')).toBeNull();
    expect(screen.queryByText(/Up to/)).toBeNull();
  });

  it('Excel: one file, "Drop a file here to upload" and "Choose excel file"; a second dropped file is refused', () => {
    const rules = { ...RULES, extensions: ['csv', 'xlsx'] };
    const { onPick } = renderZone({ variant: 'excel', multiple: false, rules });
    expect(zone().textContent).toContain(COMMON.drop_file_here);
    expect(screen.getByRole('button', { name: COMMON.choose_excel_file })).toBeTruthy();
    expect(input().multiple).toBe(false);
    expect(input().accept).toBe('.csv,.xlsx');
    const sheet = file('items.csv');
    drop([sheet, file('more.xlsx')]);
    expect(onPick).toHaveBeenCalledWith([sheet]);
    expect(screen.getByRole('alert').textContent).toBe(
      rejected('more.xlsx', 'You can attach up to 1 file at a time.'),
    );
    expect(
      screen.getByText('Up to 10 files per save, 64 MB each. Allowed: csv, xlsx.'),
    ).toBeTruthy();
  });

  it('disabled: the button is disabled and a drop is ignored', () => {
    const { onPick } = renderZone({ disabled: true });
    expect(screen.getByRole('button', { name: COMMON.choose_files }).hasAttribute('disabled')).toBe(
      true,
    );
    drop([file('photo.png')]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Mobile: the zone takes the full width', () => {
    renderZone();
    expect(zone().className.split(' ')).toContain('w-full');
  });

  it('Rtl: no physical-direction class under ar, with a refusal shown', () => {
    const { container } = renderZone({}, 'ar');
    drop([file('x.exe')]);
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
