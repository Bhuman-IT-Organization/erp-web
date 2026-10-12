// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { RecordSummary, type RecordSummaryRow } from '../RecordSummary';

/** K16 (UI-SPEC § Detail tab, § Spacing Scale "Record summary"), over made-up rows. */
const NONE = commonEn.common.none;

const ROWS: readonly RecordSummaryRow[] = [
  { term: 'Reference number', value: <bdi>DN-1001</bdi> },
  { term: 'Posting Date', value: '2026-10-05' },
  { term: 'Vendor Name', value: '' },
  { term: 'Note', value: 'Two pallets, one crate.', full: true },
];

describe('RecordSummary', () => {
  it('Loaded: the rows are dt and dd pairs in order', () => {
    const { container } = renderWithProviders(<RecordSummary rows={ROWS} />);
    const terms = [...container.querySelectorAll('dt')].map((el) => el.textContent);
    expect(terms).toEqual(['Reference number', 'Posting Date', 'Vendor Name', 'Note']);
    const values = [...container.querySelectorAll('dd')].map((el) => el.textContent);
    expect(values).toEqual(['DN-1001', '2026-10-05', NONE, 'Two pallets, one crate.']);
    expect(screen.getByText('Reference number').className).toContain('font-semibold');
  });

  it('WithEmptyValues: an empty value reads "None"', () => {
    renderWithProviders(<RecordSummary rows={[{ term: 'Invoice number', value: '' }]} />);
    expect(screen.getByText(NONE)).toBeTruthy();
  });

  it('two columns from md, one below; a full row spans both', () => {
    const { container } = renderWithProviders(<RecordSummary rows={ROWS} />);
    const list = container.querySelector('dl');
    expect(list?.className).toContain('md:grid-cols-2');
    const note = screen.getByText('Note').parentElement;
    expect(note?.className).toContain('md:col-span-2');
    const vendor = screen.getByText('Vendor Name').parentElement;
    expect(vendor?.className).not.toContain('col-span-2');
    // The label's 160px track at md+.
    expect(vendor?.className).toContain('md:grid-cols-[10rem_minmax(0,1fr)]');
  });

  it('Loading: rows undefined draws 8 skeleton pairs and no text', () => {
    const { container } = renderWithProviders(<RecordSummary rows={undefined} />);
    const loading = screen.getByTestId('record-summary-loading');
    expect(loading.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(16);
    expect(container.textContent).toBe('');
    expect(container.querySelector('dl')).toBeNull();
  });

  it('skeletonRows sets the number of pairs', () => {
    renderWithProviders(<RecordSummary rows={undefined} skeletonRows={3} />);
    expect(
      screen.getByTestId('record-summary-loading').querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(6);
  });

  it('a value with markup renders as text, never HTML (T-4.6-28)', () => {
    const { container } = renderWithProviders(
      <RecordSummary rows={[{ term: 'Note', value: '<b>bold</b>' }]} />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>bold</b>')).toBeTruthy();
  });

  it('Rtl: no physical-direction class under ar, loaded and loading', () => {
    const loaded = renderWithProviders(<RecordSummary rows={ROWS} />, { locale: 'ar' });
    expect(physicalClassesIn(loaded.container)).toEqual([]);
    loaded.unmount();
    const { container } = renderWithProviders(<RecordSummary rows={undefined} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
