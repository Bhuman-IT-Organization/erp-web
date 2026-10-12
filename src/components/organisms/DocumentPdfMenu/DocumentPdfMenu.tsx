'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadFile, fetchBlob } from '@/lib/api/download-file';

/** The api path of the document's PDF, as the read door takes it. */
type ApiPath = Parameters<typeof fetchBlob>[0];

export interface DocumentPdfMenuProps {
  /** `GET` answers the document's PDF (the bearer rides the read). */
  readonly path: ApiPath;
  /** The document's file name: the print frame's accessible title. */
  readonly fileName: string;
  /** A refused or failed read: the feature shows its message for the code. */
  readonly onError?: (code: string) => void;
}

type Opening = 'view' | 'tab' | 'print';
type Choice = Opening | 'download';

/** Perfex's order: View PDF, View PDF in New Tab, Download, Print. */
const CHOICES: readonly {
  readonly choice: Choice;
  readonly label: 'view_pdf' | 'view_pdf_in_new_window' | 'download' | 'print';
}[] = [
  { choice: 'view', label: 'view_pdf' },
  { choice: 'tab', label: 'view_pdf_in_new_window' },
  { choice: 'download', label: 'download' },
  { choice: 'print', label: 'print' },
];

/**
 * K21 (04.6 UI-SPEC § Kit additions, D-28): an outline "PDF" button
 * (`file-lines`, `chevron-down`) opening View PDF, View PDF in New Tab, Download and Print over one
 * api PDF. Never a link to the api URL (the bearer lives in memory, ADR-0032; T-4.6-30): View, New
 * Tab and Print read the PDF as a Blob through `fetchBlob` (the one axios door, M7) and open its
 * object URL: this tab, a new tab with the opener cleared, or a hidden same-origin `<iframe>` whose
 * load calls `print()`. Download goes through `downloadFile(..., 'pdf')`, so erp-api's
 * `replyExport` keeps `Content-Disposition: attachment` (planner decision 2).
 *
 * A failed read calls `onError(code)` and opens nothing. The button is disabled with "Loading…"
 * while a read runs. Every object URL it made is revoked and its print frame removed when the menu
 * unmounts (use-object-url's rule), through a ref callback's cleanup, not an effect (FE-04). Shown
 * under every locale: the PDF itself is the deployment's language (4.1.1). An organism (FE-06).
 * `modal={false}` like every kit menu (axe `aria-hidden-focus`).
 */
export function DocumentPdfMenu({ path, fileName, onError }: DocumentPdfMenuProps): ReactElement {
  const t = useTranslations('common');
  const [pending, setPending] = useState(false);
  const urls = useRef<string[]>([]);
  const frame = useRef<HTMLIFrameElement | null>(null);

  // Runs once on mount (a stable callback) and its cleanup once on unmount.
  const track = useCallback((element: HTMLElement | null) => {
    if (element === null) return undefined;
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
      frame.current?.remove();
      frame.current = null;
    };
  }, []);

  function print(url: string): void {
    frame.current?.remove();
    const element = document.createElement('iframe');
    element.className = 'sr-only';
    element.title = fileName;
    element.addEventListener('load', () => {
      element.contentWindow?.print();
    });
    element.src = url;
    document.body.append(element);
    frame.current = element;
  }

  async function open(how: Opening): Promise<void> {
    setPending(true);
    const read = await fetchBlob(path);
    setPending(false);
    if (!read.ok) {
      onError?.(read.code);
      return;
    }
    const url = URL.createObjectURL(read.data);
    urls.current.push(url);
    if (how === 'view') {
      window.location.assign(url);
    } else if (how === 'tab') {
      const tab = window.open(url, '_blank');
      if (tab !== null) tab.opener = null;
    } else {
      print(url);
    }
  }

  async function download(): Promise<void> {
    setPending(true);
    const result = await downloadFile(path, {}, undefined, 'pdf');
    setPending(false);
    if (!result.ok) onError?.(result.code);
  }

  async function choose(choice: Choice): Promise<void> {
    await (choice === 'download' ? download() : open(choice));
  }

  return (
    <div ref={track} className="contents">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="lg" disabled={pending} aria-busy={pending}>
            <Icon name="file-lines" />
            {pending ? t('loading') : t('pdf')}
            <Icon name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {CHOICES.map(({ choice, label }) => (
            <DropdownMenuItem
              key={choice}
              onSelect={() => {
                void choose(choice);
              }}
            >
              {t(label)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
