// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { physicalClassesIn, renderWithProviders, screen, within } from '@/test/render';
import { ApprovalPanel, type ApprovalPanelProps, type ApprovalStep } from '../ApprovalPanel';

// The image is read through the api in the real molecule; here it shows the path it was given.
vi.mock('@/components/molecules/ProtectedImage', () => ({
  ProtectedImage: ({ path }: { readonly path: string | null }) => (
    <span data-testid="signature-image" data-path={path ?? ''} />
  ),
}));

const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const ISOLATES = new RegExp(`[${FSI}${PDI}]`, 'g');

/** K17 (04.6 UI-SPEC § Approvals) over made-up steps. */
const nth = (list: readonly HTMLElement[], index: number): HTMLElement => {
  const item = list[index];
  if (item === undefined) throw new Error(`no entry ${String(index)}`);
  return item;
};

const REJECTED: ApprovalStep = {
  key: '2',
  order: 2,
  approverName: 'Sample Approver',
  action: 'approve',
  status: 'rejected',
  decidedAt: '2026-10-05T10:00:00Z',
  note: '<b>Wrong count</b>',
  signaturePath: null,
};

const STEPS: readonly ApprovalStep[] = [
  {
    key: '1',
    order: 1,
    approverName: 'Sample Signer',
    action: 'sign',
    status: 'approved',
    decidedAt: '2026-10-04T08:00:00Z',
    note: null,
    signaturePath: '/api/v1/demo/documents/7/signature/1',
  },
  REJECTED,
  {
    key: '3',
    order: 3,
    approverName: 'Third Person',
    action: 'approve',
    status: 'pending',
    decidedAt: null,
    note: null,
    signaturePath: null,
  },
];

const BASE: ApprovalPanelProps = {
  heading: 'Approval information',
  listHeading: 'Approver list',
  steps: STEPS,
  statusLabels: { approved: 'Approved', pending: 'Not yet approved', rejected: 'Rejected' },
  signedCaption: '(Sign, full name)',
  reasonLabel: 'Reason',
};
const NOT_SENT = 'Not sent for approval yet.';

const show = (props: Partial<ApprovalPanelProps> = {}, locale: 'en' | 'ar' = 'en') =>
  renderWithProviders(<ApprovalPanel {...BASE} {...props} />, { locale });

describe('ApprovalPanel', () => {
  it('Loading: steps undefined shows a skeleton and no empty text (D-39)', () => {
    show({ steps: undefined });
    expect(screen.getByTestId('approval-panel-loading')).toBeTruthy();
    expect(screen.queryByText(NOT_SENT)).toBeNull();
    expect(screen.getByRole('heading', { name: BASE.heading })).toBeTruthy();
  });

  it('Empty: [] reads "Not sent for approval yet." (the approvers resolve at Send), never "no approver is set" (UAT 4.6)', () => {
    show({ steps: [] });
    expect(screen.getByText(NOT_SENT)).toBeTruthy();
    expect(screen.queryByText(/no approver/i)).toBeNull();
  });

  it('Loaded: the approver list "{order}: {name}" with each badge from statusLabels', () => {
    show();
    const list = screen.getByRole('list', { name: BASE.listHeading });
    const rows = within(list).getAllByRole('listitem');
    const plain = (text: string | null | undefined) => (text ?? '').replace(ISOLATES, '');
    expect(rows.map((row) => plain(row.querySelector('[data-step-name]')?.textContent))).toEqual([
      '1: Sample Signer',
      '2: Sample Approver',
      '3: Third Person',
    ]);
    expect(
      rows.map((row) => row.querySelector('[data-status]')?.getAttribute('data-status')),
    ).toEqual(['done', 'rejected', 'pending']);
    expect(within(list).getByText('Not yet approved')).toBeTruthy();
    // The number and the name are ONE isolate taking the name's direction (bdi, dir auto), with no
    // inner isolate hiding the name from it: "1: Thazin Oo" on an Arabic page, not "Thazin Oo :1".
    const step = rows[1]?.querySelector('[data-step-name]');
    expect(step?.tagName).toBe('BDI');
    expect(step?.textContent).toBe('2: Sample Approver');
  });

  it('Trail: a decided sign step shows its signature image and the signed caption; an approve step its glyph; the note after the reason label as text', () => {
    show();
    const trail = screen.getByTestId('approval-trail');
    const entries = within(trail).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(within(nth(entries, 0)).getByTestId('signature-image').dataset.path).toBe(
      '/api/v1/demo/documents/7/signature/1',
    );
    expect(within(nth(entries, 0)).getByText(BASE.signedCaption)).toBeTruthy();
    const second = nth(entries, 1);
    expect(second.querySelector('[data-icon-name="circle-xmark"]')).not.toBeNull();
    expect(within(second).queryByTestId('signature-image')).toBeNull();
    expect(within(second).getByText(BASE.reasonLabel)).toBeTruthy();
    expect(within(second).getByText('<b>Wrong count</b>')).toBeTruthy();
    expect(second.querySelector('b')).toBeNull();
    expect(second.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-05T10:00:00Z');
  });

  it('an approved approve step shows the circle-check glyph', () => {
    show({ steps: [{ ...REJECTED, status: 'approved', note: null }] });
    expect(
      screen.getByTestId('approval-trail').querySelector('[data-icon-name="circle-check"]'),
    ).not.toBeNull();
  });

  it('WithAction: the action renders once, last; no action renders no button', () => {
    const view = show({ action: <button type="button">Approve</button> });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    const panel = view.container.firstElementChild as HTMLElement;
    expect(panel.lastElementChild?.textContent).toBe('Approve');
    view.unmount();
    show();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('Rtl: no physical-direction class under ar, loaded and loading', () => {
    const loaded = show({}, 'ar');
    expect(physicalClassesIn(loaded.container)).toEqual([]);
    loaded.unmount();
    const { container } = show({ steps: undefined }, 'ar');
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
